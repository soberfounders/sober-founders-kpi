/* ============================================================
   Reply Analysis & Outreach Suppression

   1. Add reply tracking columns to recovery_events
   2. contact_outreach_suppression table — blocks all future outreach
      for contacts who responded negatively
   3. vw_noshow_followup_candidates — feeds the day-before at-risk nudge
      for people who got a no-show email ≤8 days ago and haven't replied
      negatively
   4. Rebuild all outreach views to exclude suppressed contacts
   5. Cron schedule for reply-analyzer (daily 9AM ET)
   ============================================================ */

-- ============================================================
-- 1. Reply tracking columns on recovery_events
-- ============================================================
ALTER TABLE public.recovery_events
  ADD COLUMN IF NOT EXISTS reply_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_sentiment    TEXT,  -- 'positive' | 'negative' | 'neutral' | 'question'
  ADD COLUMN IF NOT EXISTS reply_summary      TEXT;  -- AI one-line summary of the reply

CREATE INDEX IF NOT EXISTS idx_recovery_events_reply
  ON public.recovery_events (attendee_email, reply_sentiment)
  WHERE reply_sentiment IS NOT NULL;

-- ============================================================
-- 2. contact_outreach_suppression
--    Single record per email. Any agent must check this before
--    adding a contact to its send list.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_outreach_suppression (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_email    TEXT        NOT NULL,
  reason           TEXT        NOT NULL DEFAULT 'negative_reply',
                               -- 'negative_reply' | 'unsubscribe' | 'manual'
  sentiment_summary TEXT,      -- AI summary of why they're suppressed
  source_event_id  UUID        REFERENCES public.recovery_events(id),
  suppressed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_suppression_email UNIQUE (contact_email)
);

ALTER TABLE public.contact_outreach_suppression ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppression_select" ON public.contact_outreach_suppression FOR SELECT USING (true);
CREATE POLICY "suppression_insert" ON public.contact_outreach_suppression FOR INSERT WITH CHECK (true);
CREATE POLICY "suppression_update" ON public.contact_outreach_suppression FOR UPDATE USING (true);

CREATE INDEX IF NOT EXISTS idx_suppression_email
  ON public.contact_outreach_suppression (lower(contact_email));

-- ============================================================
-- 3. vw_noshow_followup_candidates
--    People who got a no-show recovery email in the last 8 days,
--    haven't replied negatively, and haven't been nudged yet.
--    Fed into at-risk-retention-agent for the day-before nudge.
-- ============================================================
CREATE OR REPLACE VIEW public.vw_noshow_followup_candidates AS
SELECT
  r.attendee_email                        AS email,
  c.firstname,
  c.lastname,
  r.meeting_date                          AS last_missed_meeting,
  r.delivered_at                          AS no_show_email_sent_at,
  r.reply_sentiment,
  (now()::DATE - r.meeting_date)          AS days_since_missed,
  nudge.delivered_at                      AS last_nudge_sent
FROM public.recovery_events r
LEFT JOIN public.raw_hubspot_contacts c
  ON lower(c.email) = lower(r.attendee_email)
-- Exclude contacts who replied negatively or are suppressed
LEFT JOIN public.contact_outreach_suppression s
  ON lower(s.contact_email) = lower(r.attendee_email)
-- Exclude contacts already nudged in the at-risk retention cycle
LEFT JOIN public.recovery_events nudge
  ON lower(nudge.attendee_email) = lower(r.attendee_email)
  AND nudge.event_type = 'at_risk_nudge'
  AND nudge.delivered_at >= now() - INTERVAL '8 days'
WHERE r.event_type = 'no_show_followup'
  AND r.delivered_at >= now() - INTERVAL '8 days'
  AND r.delivered_at IS NOT NULL
  AND COALESCE(r.reply_sentiment, 'none') != 'negative'
  AND s.contact_email IS NULL
  AND nudge.attendee_email IS NULL;

-- ============================================================
-- 4. Rebuild all outreach views to exclude suppressed contacts
-- ============================================================

-- vw_noshow_candidates
CREATE OR REPLACE VIEW public.vw_noshow_candidates AS
WITH luma_regs AS (
  SELECT
    guest_email                  AS email,
    guest_name                   AS name,
    event_start_at::DATE         AS meeting_date,
    is_thursday,
    zoom_meeting_id
  FROM public.raw_luma_registrations
  WHERE guest_email IS NOT NULL
    AND event_start_at IS NOT NULL
    AND event_start_at < now()
    AND event_start_at >= now() - INTERVAL '14 days'
    AND event_start_at::DATE >= '2026-03-18'
),
hubspot_attendees AS (
  SELECT DISTINCT
    lower(a.contact_email)       AS email,
    act.hs_timestamp::DATE       AS activity_date
  FROM public.hubspot_activity_contact_associations a
  JOIN public.raw_hubspot_meeting_activities act
    ON a.hubspot_activity_id = act.hubspot_activity_id
    AND a.activity_type = act.activity_type
  WHERE a.contact_email IS NOT NULL
    AND act.hs_timestamp IS NOT NULL
),
prior_counts AS (
  SELECT
    lower(l.email)               AS email,
    l.meeting_date,
    COUNT(DISTINCT h.activity_date) AS prior_meeting_count
  FROM luma_regs l
  LEFT JOIN hubspot_attendees h
    ON lower(h.email) = lower(l.email)
    AND h.activity_date < l.meeting_date
  GROUP BY lower(l.email), l.meeting_date
)
SELECT
  l.email,
  l.name,
  l.meeting_date,
  l.is_thursday,
  CASE
    WHEN h.email IS NOT NULL THEN 'attended'
    ELSE 'no_show'
  END                            AS attendance_status,
  COALESCE(p.prior_meeting_count, 0) AS prior_meeting_count,
  r.delivered_at                 AS last_recovery_sent
FROM luma_regs l
LEFT JOIN hubspot_attendees h
  ON lower(h.email) = lower(l.email)
  AND h.activity_date BETWEEN l.meeting_date - 1 AND l.meeting_date + 1
LEFT JOIN prior_counts p
  ON lower(p.email) = lower(l.email)
  AND p.meeting_date = l.meeting_date
LEFT JOIN public.recovery_events r
  ON lower(r.attendee_email) = lower(l.email)
  AND r.meeting_date = l.meeting_date
-- Exclude suppressed contacts
LEFT JOIN public.contact_outreach_suppression s
  ON lower(s.contact_email) = lower(l.email)
WHERE s.contact_email IS NULL;

-- vw_at_risk_attendees
CREATE OR REPLACE VIEW public.vw_at_risk_attendees AS
WITH recent_window AS (
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
  AND r.delivered_at >= now() - INTERVAL '14 days'
-- Exclude suppressed contacts
LEFT JOIN public.contact_outreach_suppression s
  ON lower(s.contact_email) = lower(c.email)
WHERE s.contact_email IS NULL;

-- vw_winback_candidates
CREATE OR REPLACE VIEW public.vw_winback_candidates AS
WITH attendance_counts AS (
  SELECT
    a.contact_email                         AS email,
    MIN(c.firstname)                        AS firstname,
    MIN(c.lastname)                         AS lastname,
    COUNT(DISTINCT act.hs_timestamp::DATE)  AS total_meetings,
    MAX(act.hs_timestamp::DATE)             AS last_attended,
    MIN(act.hs_timestamp::DATE)             AS first_attended,
    (EXTRACT(DOW FROM MAX(act.hs_timestamp) AT TIME ZONE 'America/New_York') = 4)
                                            AS is_thursday_attendee
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
  ac.is_thursday_attendee,
  r.delivered_at AS last_winback_sent
FROM attendance_counts ac
LEFT JOIN public.recovery_events r
  ON lower(r.attendee_email) = lower(ac.email)
  AND r.event_type = 'winback'
LEFT JOIN public.contact_outreach_suppression s
  ON lower(s.contact_email) = lower(ac.email)
WHERE ac.total_meetings = 1
  AND ac.last_attended >= now()::DATE - 180
  AND ac.last_attended <= now()::DATE - 30
  AND s.contact_email IS NULL;

-- vw_streak_break_candidates
CREATE OR REPLACE VIEW public.vw_streak_break_candidates AS
WITH all_attendance AS (
  SELECT
    a.contact_email                          AS email,
    MIN(c.firstname)                         AS firstname,
    MIN(c.lastname)                          AS lastname,
    COUNT(DISTINCT act.hs_timestamp::DATE)   AS total_meetings,
    MAX(act.hs_timestamp::DATE)              AS last_attended,
    (EXTRACT(DOW FROM MAX(act.hs_timestamp) AT TIME ZONE 'America/New_York') = 4)
                                             AS last_was_thursday
  FROM public.hubspot_activity_contact_associations a
  JOIN public.raw_hubspot_meeting_activities act
    ON a.hubspot_activity_id = act.hubspot_activity_id
    AND a.activity_type = act.activity_type
  LEFT JOIN public.raw_hubspot_contacts c
    ON lower(c.email) = lower(a.contact_email)
  WHERE a.contact_email IS NOT NULL
    AND act.hs_timestamp IS NOT NULL
  GROUP BY a.contact_email
),
streak_breakers AS (
  SELECT
    email, firstname, lastname, total_meetings,
    last_attended, last_was_thursday,
    (now()::DATE - last_attended) AS days_since_last
  FROM all_attendance
  WHERE total_meetings >= 3
    AND (now()::DATE - last_attended) BETWEEN 14 AND 56
)
SELECT
  s.email, s.firstname, s.lastname, s.total_meetings,
  s.last_attended, s.days_since_last, s.last_was_thursday,
  sb.delivered_at AS last_streak_break_sent,
  ar.delivered_at AS last_at_risk_nudge_sent
FROM streak_breakers s
LEFT JOIN public.recovery_events sb
  ON lower(sb.attendee_email) = lower(s.email)
  AND sb.event_type = 'streak_break'
  AND sb.delivered_at >= now() - INTERVAL '28 days'
LEFT JOIN public.recovery_events ar
  ON lower(ar.attendee_email) = lower(s.email)
  AND ar.event_type = 'at_risk_nudge'
  AND ar.delivered_at >= now() - INTERVAL '14 days'
LEFT JOIN public.contact_outreach_suppression sup
  ON lower(sup.contact_email) = lower(s.email)
WHERE sup.contact_email IS NULL;

-- ============================================================
-- 5. Reply-analyzer cron — daily 9AM ET (14:00 UTC)
-- ============================================================
SELECT cron.schedule(
  'reply-analyzer-daily-0900-est',
  '0 14 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/reply-analyzer',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);
