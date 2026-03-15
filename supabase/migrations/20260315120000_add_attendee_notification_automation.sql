/* ============================================================
   Attendee Notification Automation

   Adds:
   1. vw_at_risk_attendees — people whose attendance is declining
   2. vw_winback_candidates — attended once, never returned
   3. outreach_experiments — A/B experiment definitions
   4. vw_outreach_conversions — measures outreach → return rates
   5. vw_baseline_retention — pre-experiment baseline metrics
   6. Index on recovery_events for dedup queries
   7. pg_cron schedules for all three campaigns
   ============================================================ */

-- ============================================================
-- 1. Index for recovery_events dedup lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_recovery_events_email_type
  ON public.recovery_events (attendee_email, event_type);

CREATE INDEX IF NOT EXISTS idx_recovery_events_delivered
  ON public.recovery_events (delivered_at DESC);

-- ============================================================
-- 2. Experiment tracking table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.outreach_experiments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_name TEXT        NOT NULL UNIQUE,
  campaign_type   TEXT        NOT NULL,  -- 'no_show_recovery', 'at_risk_nudge', 'winback'
  started_at      DATE        NOT NULL DEFAULT CURRENT_DATE,
  ends_at         DATE        NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '28 days'),
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'completed', 'paused')),
  baseline_snapshot JSONB     DEFAULT '{}'::jsonb,
  metadata        JSONB       DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "experiments_select" ON public.outreach_experiments FOR SELECT USING (true);
CREATE POLICY "experiments_insert" ON public.outreach_experiments FOR INSERT WITH CHECK (true);
CREATE POLICY "experiments_update" ON public.outreach_experiments FOR UPDATE USING (true);

-- ============================================================
-- 3. vw_baseline_retention — historical repeat rates
--    Measures: of people who attended at least once, what %
--    came back within 14/30/60 days? Grouped by month.
-- ============================================================
CREATE OR REPLACE VIEW public.vw_baseline_retention AS
WITH first_attendance AS (
  SELECT
    a.contact_email                         AS email,
    MIN(act.hs_timestamp::DATE)             AS first_meeting_date
  FROM public.hubspot_activity_contact_associations a
  JOIN public.raw_hubspot_meeting_activities act
    ON a.hubspot_activity_id = act.hubspot_activity_id
    AND a.activity_type = act.activity_type
  WHERE a.contact_email IS NOT NULL
    AND act.hs_timestamp IS NOT NULL
  GROUP BY a.contact_email
),
all_attendance AS (
  SELECT
    a.contact_email                         AS email,
    act.hs_timestamp::DATE                  AS meeting_date
  FROM public.hubspot_activity_contact_associations a
  JOIN public.raw_hubspot_meeting_activities act
    ON a.hubspot_activity_id = act.hubspot_activity_id
    AND a.activity_type = act.activity_type
  WHERE a.contact_email IS NOT NULL
    AND act.hs_timestamp IS NOT NULL
),
repeat_check AS (
  SELECT
    f.email,
    f.first_meeting_date,
    date_trunc('month', f.first_meeting_date)::DATE AS cohort_month,
    EXISTS (
      SELECT 1 FROM all_attendance aa
      WHERE aa.email = f.email
        AND aa.meeting_date > f.first_meeting_date
        AND aa.meeting_date <= f.first_meeting_date + 14
    ) AS returned_14d,
    EXISTS (
      SELECT 1 FROM all_attendance aa
      WHERE aa.email = f.email
        AND aa.meeting_date > f.first_meeting_date
        AND aa.meeting_date <= f.first_meeting_date + 30
    ) AS returned_30d,
    EXISTS (
      SELECT 1 FROM all_attendance aa
      WHERE aa.email = f.email
        AND aa.meeting_date > f.first_meeting_date
        AND aa.meeting_date <= f.first_meeting_date + 60
    ) AS returned_60d,
    (SELECT COUNT(DISTINCT aa.meeting_date) FROM all_attendance aa
     WHERE aa.email = f.email) AS total_meetings_attended
  FROM first_attendance f
)
SELECT
  cohort_month,
  COUNT(*)                                              AS cohort_size,
  COUNT(*) FILTER (WHERE returned_14d)                  AS returned_14d,
  COUNT(*) FILTER (WHERE returned_30d)                  AS returned_30d,
  COUNT(*) FILTER (WHERE returned_60d)                  AS returned_60d,
  ROUND(100.0 * COUNT(*) FILTER (WHERE returned_14d) / NULLIF(COUNT(*), 0), 1) AS pct_returned_14d,
  ROUND(100.0 * COUNT(*) FILTER (WHERE returned_30d) / NULLIF(COUNT(*), 0), 1) AS pct_returned_30d,
  ROUND(100.0 * COUNT(*) FILTER (WHERE returned_60d) / NULLIF(COUNT(*), 0), 1) AS pct_returned_60d,
  ROUND(AVG(total_meetings_attended), 1)                AS avg_total_meetings
FROM repeat_check
GROUP BY cohort_month
ORDER BY cohort_month DESC;

-- ============================================================
-- 4. vw_at_risk_attendees — attended 2+ times in 60d but
--    missed the most recent meeting window (last 7 days)
-- ============================================================
CREATE OR REPLACE VIEW public.vw_at_risk_attendees AS
WITH recent_window AS (
  -- All attendance in last 60 days
  SELECT
    a.contact_email                         AS email,
    c.firstname,
    c.lastname,
    act.hs_timestamp::DATE                  AS meeting_date,
    COUNT(*) OVER (PARTITION BY a.contact_email) AS meetings_60d,
    MAX(act.hs_timestamp::DATE) OVER (PARTITION BY a.contact_email) AS last_attended
  FROM public.hubspot_activity_contact_associations a
  JOIN public.raw_hubspot_meeting_activities act
    ON a.hubspot_activity_id = act.hubspot_activity_id
    AND a.activity_type = act.activity_type
  LEFT JOIN public.raw_hubspot_contacts c
    ON lower(c.email) = lower(a.contact_email)
  WHERE a.contact_email IS NOT NULL
    AND act.hs_timestamp IS NOT NULL
    AND act.hs_timestamp >= now() - INTERVAL '60 days'
),
candidates AS (
  SELECT DISTINCT ON (email)
    email,
    firstname,
    lastname,
    meetings_60d,
    last_attended,
    (now()::DATE - last_attended) AS days_since_last
  FROM recent_window
  WHERE meetings_60d >= 2
    AND last_attended < now()::DATE - INTERVAL '7 days'
  ORDER BY email, last_attended DESC
)
SELECT
  c.email,
  c.firstname,
  c.lastname,
  c.meetings_60d,
  c.last_attended,
  c.days_since_last,
  r.delivered_at AS last_nudge_sent
FROM candidates c
LEFT JOIN public.recovery_events r
  ON lower(r.attendee_email) = lower(c.email)
  AND r.event_type = 'at_risk_nudge'
  AND r.delivered_at >= now() - INTERVAL '14 days';

-- ============================================================
-- 5. vw_winback_candidates — attended exactly once,
--    30–180 days ago, never came back
-- ============================================================
CREATE OR REPLACE VIEW public.vw_winback_candidates AS
WITH attendance_counts AS (
  SELECT
    a.contact_email                         AS email,
    MIN(c.firstname)                        AS firstname,
    MIN(c.lastname)                         AS lastname,
    COUNT(DISTINCT act.hs_timestamp::DATE)  AS total_meetings,
    MAX(act.hs_timestamp::DATE)             AS last_attended,
    MIN(act.hs_timestamp::DATE)             AS first_attended
  FROM public.hubspot_activity_contact_associations a
  JOIN public.raw_hubspot_meeting_activities act
    ON a.hubspot_activity_id = act.hubspot_activity_id
    AND a.activity_type = act.activity_type
  LEFT JOIN public.raw_hubspot_contacts c
    ON lower(c.email) = lower(a.contact_email)
  WHERE a.contact_email IS NOT NULL
    AND act.hs_timestamp IS NOT NULL
  GROUP BY a.contact_email
)
SELECT
  ac.email,
  ac.firstname,
  ac.lastname,
  ac.first_attended,
  ac.last_attended,
  (now()::DATE - ac.last_attended) AS days_since_last,
  ac.total_meetings,
  r.delivered_at AS last_winback_sent
FROM attendance_counts ac
LEFT JOIN public.recovery_events r
  ON lower(r.attendee_email) = lower(ac.email)
  AND r.event_type = 'winback'
WHERE ac.total_meetings = 1
  AND ac.last_attended >= now()::DATE - 180
  AND ac.last_attended <= now()::DATE - 30;

-- ============================================================
-- 6. vw_outreach_conversions — did outreach lead to return?
--    Joins recovery_events against subsequent attendance.
-- ============================================================
CREATE OR REPLACE VIEW public.vw_outreach_conversions AS
WITH outreach AS (
  SELECT
    id AS outreach_id,
    attendee_email,
    event_type,
    meeting_date AS missed_meeting_date,
    delivered_at,
    metadata
  FROM public.recovery_events
),
subsequent_attendance AS (
  SELECT
    a.contact_email                         AS email,
    act.hs_timestamp::DATE                  AS attended_date
  FROM public.hubspot_activity_contact_associations a
  JOIN public.raw_hubspot_meeting_activities act
    ON a.hubspot_activity_id = act.hubspot_activity_id
    AND a.activity_type = act.activity_type
  WHERE a.contact_email IS NOT NULL
    AND act.hs_timestamp IS NOT NULL
)
SELECT
  o.outreach_id,
  o.attendee_email,
  o.event_type,
  o.missed_meeting_date,
  o.delivered_at,
  o.metadata->>'campaign_type' AS campaign_type,
  MIN(sa.attended_date) AS first_return_date,
  CASE
    WHEN MIN(sa.attended_date) IS NOT NULL THEN true
    ELSE false
  END AS converted,
  MIN(sa.attended_date) - o.delivered_at::DATE AS days_to_return
FROM outreach o
LEFT JOIN subsequent_attendance sa
  ON lower(sa.email) = lower(o.attendee_email)
  AND sa.attended_date > o.delivered_at::DATE
  AND sa.attended_date <= o.delivered_at::DATE + 28
GROUP BY o.outreach_id, o.attendee_email, o.event_type,
         o.missed_meeting_date, o.delivered_at, o.metadata;

-- ============================================================
-- 7. vw_experiment_results — aggregate conversion by campaign
-- ============================================================
CREATE OR REPLACE VIEW public.vw_experiment_results AS
SELECT
  event_type,
  COUNT(*) AS total_sent,
  COUNT(*) FILTER (WHERE converted) AS total_converted,
  ROUND(100.0 * COUNT(*) FILTER (WHERE converted) / NULLIF(COUNT(*), 0), 1) AS conversion_rate_pct,
  ROUND(AVG(days_to_return) FILTER (WHERE converted), 1) AS avg_days_to_return,
  MIN(delivered_at) AS first_sent,
  MAX(delivered_at) AS last_sent,
  date_trunc('week', delivered_at)::DATE AS week_cohort
FROM public.vw_outreach_conversions
GROUP BY event_type, date_trunc('week', delivered_at)::DATE
ORDER BY event_type, week_cohort DESC;

-- ============================================================
-- 8. pg_cron schedules
-- ============================================================

-- No-show recovery: ~3 hours after each meeting
-- Tuesday meeting ends ~1 PM ET → run at 4:15 PM ET (21:15 UTC)
-- Thursday meeting ends ~12 PM ET → run at 3:15 PM ET (20:15 UTC)
SELECT cron.schedule(
  'noshow-recovery-tue-1615-est',
  '15 21 * * 2',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/no-show-recovery-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"campaign": "no_show_recovery"}'::jsonb
  )$$
);

SELECT cron.schedule(
  'noshow-recovery-thu-1515-est',
  '15 20 * * 4',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/no-show-recovery-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"campaign": "no_show_recovery"}'::jsonb
  )$$
);

-- At-risk retention: day before each meeting, 10 AM ET
-- Monday 10 AM ET (15:00 UTC) for Tuesday meeting
-- Wednesday 10 AM ET (15:00 UTC) for Thursday meeting
SELECT cron.schedule(
  'at-risk-nudge-mon-1000-est',
  '0 15 * * 1',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/at-risk-retention-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"campaign": "at_risk_nudge"}'::jsonb
  )$$
);

SELECT cron.schedule(
  'at-risk-nudge-wed-1000-est',
  '0 15 * * 3',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/at-risk-retention-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"campaign": "at_risk_nudge"}'::jsonb
  )$$
);

-- Winback: weekly Monday 11 AM ET (16:00 UTC), 10 per batch
SELECT cron.schedule(
  'winback-campaign-mon-1100-est',
  '0 16 * * 1',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/winback-campaign-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"campaign": "winback", "batch_size": 10}'::jsonb
  )$$
);
