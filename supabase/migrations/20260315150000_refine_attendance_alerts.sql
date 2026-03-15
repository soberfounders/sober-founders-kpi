/* ============================================================
   Refine Attendance Alert System

   1. Rebuild vw_noshow_candidates with prior_meeting_count
      and effective date guard (no retroactive outreach before 2026-03-18)
   2. Create vw_streak_break_candidates (3+ meetings, gone quiet 14–56d)
   3. Update vw_winback_candidates to add is_thursday_attendee
   4. Reschedule all crons with dry_run:true for first manual approval round
   5. Add streak-break cron schedules
   ============================================================ */

-- ============================================================
-- 1. Rebuild vw_noshow_candidates
--    Adds: prior_meeting_count, effective date guard
-- ============================================================
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
    AND event_start_at::DATE >= '2026-03-18'  -- no retroactive outreach
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
  -- Count HubSpot-confirmed attendance BEFORE each luma registration date
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
  AND r.meeting_date = l.meeting_date;

-- ============================================================
-- 2. vw_streak_break_candidates
--    Attended 3+ meetings, last seen 14–56 days ago.
--    Excludes anyone nudged via at_risk_nudge in the last 14d
--    (they already got a day-before reminder).
-- ============================================================
CREATE OR REPLACE VIEW public.vw_streak_break_candidates AS
WITH all_attendance AS (
  SELECT
    a.contact_email                          AS email,
    MIN(c.firstname)                         AS firstname,
    MIN(c.lastname)                          AS lastname,
    COUNT(DISTINCT act.hs_timestamp::DATE)   AS total_meetings,
    MAX(act.hs_timestamp::DATE)              AS last_attended,
    -- Determine which session they last attended for calendar link
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
    email,
    firstname,
    lastname,
    total_meetings,
    last_attended,
    last_was_thursday,
    (now()::DATE - last_attended) AS days_since_last
  FROM all_attendance
  WHERE total_meetings >= 3
    AND (now()::DATE - last_attended) BETWEEN 14 AND 56
)
SELECT
  s.email,
  s.firstname,
  s.lastname,
  s.total_meetings,
  s.last_attended,
  s.days_since_last,
  s.last_was_thursday,
  sb.delivered_at   AS last_streak_break_sent,
  ar.delivered_at   AS last_at_risk_nudge_sent
FROM streak_breakers s
-- Dedup: don't re-contact within 28 days
LEFT JOIN public.recovery_events sb
  ON lower(sb.attendee_email) = lower(s.email)
  AND sb.event_type = 'streak_break'
  AND sb.delivered_at >= now() - INTERVAL '28 days'
-- Exclude: already got a day-before at-risk nudge in the last 14 days
LEFT JOIN public.recovery_events ar
  ON lower(ar.attendee_email) = lower(s.email)
  AND ar.event_type = 'at_risk_nudge'
  AND ar.delivered_at >= now() - INTERVAL '14 days';

-- ============================================================
-- 3. Update vw_winback_candidates to add is_thursday_attendee
--    (based on day-of-week of last_attended, for calendar link)
-- ============================================================
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
WHERE ac.total_meetings = 1
  AND ac.last_attended >= now()::DATE - 180
  AND ac.last_attended <= now()::DATE - 30;

-- ============================================================
-- 4. Reschedule all crons with dry_run:true
--    First round requires manual review via Slack preview.
--    To go live: update each cron body to dry_run:false.
-- ============================================================

-- Remove existing schedules safely
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname IN (
   'noshow-recovery-tue-1615-est',
   'noshow-recovery-thu-1515-est',
   'at-risk-nudge-mon-1000-est',
   'at-risk-nudge-wed-1000-est',
   'winback-campaign-mon-1100-est'
 );

-- No-show recovery — 3h after each meeting, dry_run:true
SELECT cron.schedule(
  'noshow-recovery-tue-1615-est',
  '15 21 * * 2',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/no-show-recovery-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"dry_run": true}'::jsonb
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
    body := '{"dry_run": true}'::jsonb
  )$$
);

-- At-risk nudge — day before each meeting, dry_run:true
SELECT cron.schedule(
  'at-risk-nudge-mon-1000-est',
  '0 15 * * 1',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/at-risk-retention-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"dry_run": true}'::jsonb
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
    body := '{"dry_run": true}'::jsonb
  )$$
);

-- Winback — weekly Monday 11 AM ET, dry_run:true
SELECT cron.schedule(
  'winback-campaign-mon-1100-est',
  '0 16 * * 1',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/winback-campaign-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"batch_size": 10, "dry_run": true}'::jsonb
  )$$
);

-- ============================================================
-- 5. New streak-break cron jobs — same post-meeting window
--    as no-show recovery (3h after each meeting), dry_run:true
-- ============================================================
SELECT cron.schedule(
  'streak-break-check-tue-1615-est',
  '30 21 * * 2',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/streak-break-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"dry_run": true}'::jsonb
  )$$
);

SELECT cron.schedule(
  'streak-break-check-thu-1530-est',
  '30 20 * * 4',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/streak-break-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"dry_run": true}'::jsonb
  )$$
);
