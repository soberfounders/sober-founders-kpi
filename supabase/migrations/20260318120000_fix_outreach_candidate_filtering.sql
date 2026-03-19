/* ============================================================
   Fix Outreach Candidate Filtering

   Problems fixed:
   1. Personal 1:1 meetings with Andrew counted as group attendance
      - Now filters to group meetings only (title patterns + day/time)
   2. Tiger 21 members (non-members) appeared in candidate lists
      - Excluded via membership_s filter
   3. No qualification gate on sobriety or revenue
      - Require sobriety_date > 6 months ago AND annual_revenue > $100k
   4. Streak Break was just "3+ total meetings" not consecutive
      - Now requires 3+ consecutive weekly sessions then a miss
   ============================================================ */

-- ============================================================
-- 1. Helper view: group-only meeting attendance
--    Filters raw_hubspot_meeting_activities to only include
--    Sober Founders group sessions (Tuesday + Thursday).
--    Uses title matching first, then day-of-week + time fallback.
-- ============================================================
CREATE OR REPLACE VIEW public.vw_group_meeting_attendance AS
WITH classified AS (
  SELECT
    act.hubspot_activity_id,
    act.activity_type,
    act.hs_timestamp,
    act.hs_timestamp::DATE AS meeting_date,
    act.title,
    EXTRACT(DOW FROM act.hs_timestamp AT TIME ZONE 'America/New_York') AS dow_et,
    EXTRACT(HOUR FROM act.hs_timestamp AT TIME ZONE 'America/New_York') * 60
      + EXTRACT(MINUTE FROM act.hs_timestamp AT TIME ZONE 'America/New_York') AS minute_of_day_et,
    CASE
      WHEN lower(act.title) LIKE '%tactic tuesday%' THEN 'Tuesday'
      WHEN lower(act.title) LIKE '%mastermind on zoom%'
        OR lower(act.title) LIKE '%all are welcome%'
        OR lower(act.title) LIKE '%entrepreneur''s big book%'
        OR lower(act.title) LIKE '%big book%' THEN 'Thursday'
      ELSE NULL
    END AS title_group_type
  FROM public.raw_hubspot_meeting_activities act
  WHERE act.hs_timestamp IS NOT NULL
),
group_meetings AS (
  SELECT
    hubspot_activity_id,
    activity_type,
    hs_timestamp,
    meeting_date,
    COALESCE(
      title_group_type,
      CASE
        -- Tuesday meetings: DOW=2, roughly 10 AM - 2 PM ET (600-840 minutes)
        WHEN dow_et = 2 AND minute_of_day_et BETWEEN 600 AND 840 THEN 'Tuesday'
        -- Thursday meetings: DOW=4, roughly 9 AM - 1 PM ET (540-780 minutes)
        WHEN dow_et = 4 AND minute_of_day_et BETWEEN 540 AND 780 THEN 'Thursday'
        ELSE NULL
      END
    ) AS group_type
  FROM classified
)
SELECT
  a.contact_email                AS email,
  gm.meeting_date,
  gm.hs_timestamp,
  gm.group_type,
  gm.hubspot_activity_id,
  gm.activity_type
FROM group_meetings gm
JOIN public.hubspot_activity_contact_associations a
  ON a.hubspot_activity_id = gm.hubspot_activity_id
  AND a.activity_type = gm.activity_type
WHERE gm.group_type IS NOT NULL
  AND a.contact_email IS NOT NULL;

-- ============================================================
-- 2. Rebuild vw_at_risk_attendees
--    - Uses group meetings only
--    - Excludes Tiger 21 members (always)
--    - 3+ group meetings all-time = trusted, skip sobriety/revenue
--    - Under 3 group meetings = require sobriety > 6mo + revenue > $100k
-- ============================================================
DROP VIEW IF EXISTS public.vw_at_risk_attendees;
CREATE VIEW public.vw_at_risk_attendees AS
WITH all_time_group_counts AS (
  -- Total group meetings ever per contact (for the 3+ trust threshold)
  SELECT
    lower(email) AS email,
    COUNT(DISTINCT meeting_date) AS lifetime_group_meetings
  FROM public.vw_group_meeting_attendance
  GROUP BY lower(email)
),
-- Primary group per contact (most frequent group type in last 60d)
primary_groups AS (
  SELECT
    lower(gma.email) AS email,
    gma.group_type,
    COUNT(*) AS cnt,
    ROW_NUMBER() OVER (PARTITION BY lower(gma.email) ORDER BY COUNT(*) DESC) AS rn
  FROM public.vw_group_meeting_attendance gma
  WHERE gma.hs_timestamp >= now() - INTERVAL '60 days'
  GROUP BY lower(gma.email), gma.group_type
),
recent_window AS (
  SELECT
    lower(gma.email)                              AS email,
    c.firstname,
    c.lastname,
    gma.meeting_date,
    COUNT(*) OVER (PARTITION BY lower(gma.email)) AS meetings_60d,
    MAX(gma.meeting_date) OVER (PARTITION BY lower(gma.email)) AS last_attended,
    atg.lifetime_group_meetings
  FROM public.vw_group_meeting_attendance gma
  LEFT JOIN public.raw_hubspot_contacts c
    ON lower(c.email) = lower(gma.email)
  LEFT JOIN all_time_group_counts atg
    ON atg.email = lower(gma.email)
  WHERE gma.hs_timestamp >= now() - INTERVAL '60 days'
    -- Always exclude Tiger 21 members
    AND (c.membership_s IS NULL OR c.membership_s NOT ILIKE '%Tiger 21%')
    -- 3+ group meetings all-time = trusted member, skip sobriety/revenue
    -- Under 3 = require sobriety date > 6 months AND revenue > $100k
    AND (
      COALESCE(atg.lifetime_group_meetings, 0) >= 3
      OR (
        c.sobriety_date IS NOT NULL
        AND c.sobriety_date::DATE <= now()::DATE - INTERVAL '6 months'
        AND COALESCE(c.annual_revenue_in_dollars__official_, 0) >= 100000
      )
    )
),
candidates AS (
  SELECT DISTINCT ON (rw.email)
    rw.email,
    rw.firstname,
    rw.lastname,
    rw.meetings_60d,
    rw.last_attended,
    pg.group_type AS primary_group,
    (now()::DATE - rw.last_attended) AS days_since_last
  FROM recent_window rw
  LEFT JOIN primary_groups pg ON pg.email = rw.email AND pg.rn = 1
  WHERE rw.meetings_60d >= 2
    AND rw.last_attended < now()::DATE - INTERVAL '7 days'
  ORDER BY rw.email, rw.last_attended DESC
)
SELECT
  c.email,
  c.firstname,
  c.lastname,
  c.meetings_60d,
  c.last_attended,
  c.days_since_last,
  c.primary_group,
  r.delivered_at AS last_nudge_sent
FROM candidates c
LEFT JOIN public.recovery_events r
  ON lower(r.attendee_email) = lower(c.email)
  AND r.event_type = 'at_risk_nudge'
  AND r.delivered_at >= now() - INTERVAL '14 days';

-- ============================================================
-- 3. Rebuild vw_streak_break_candidates
--    - Uses group meetings only
--    - Requires 3+ CONSECUTIVE weekly sessions then a miss
--    - Excludes Tiger 21
--    - No sobriety/revenue gate: 3+ consecutive = trusted member
-- ============================================================
DROP VIEW IF EXISTS public.vw_streak_break_candidates;
CREATE VIEW public.vw_streak_break_candidates AS
WITH group_sessions AS (
  -- All unique group meeting dates, numbered per group type
  SELECT DISTINCT
    meeting_date,
    group_type,
    ROW_NUMBER() OVER (PARTITION BY group_type ORDER BY meeting_date) AS session_num
  FROM public.vw_group_meeting_attendance
),
contact_attendance AS (
  -- Each contact's attendance at numbered group sessions
  SELECT
    lower(gma.email)        AS email,
    gma.meeting_date,
    gma.group_type,
    gs.session_num
  FROM public.vw_group_meeting_attendance gma
  JOIN group_sessions gs
    ON gma.meeting_date = gs.meeting_date
    AND gma.group_type = gs.group_type
),
-- Gaps-and-islands: detect consecutive runs per contact per group
streaks AS (
  SELECT
    email,
    group_type,
    meeting_date,
    session_num,
    session_num - ROW_NUMBER() OVER (
      PARTITION BY email, group_type ORDER BY session_num
    ) AS streak_group
  FROM contact_attendance
),
streak_lengths AS (
  SELECT
    email,
    group_type,
    streak_group,
    COUNT(*)                AS consecutive_sessions,
    MIN(meeting_date)       AS streak_start,
    MAX(meeting_date)       AS streak_end,
    MAX(session_num)        AS last_session_num
  FROM streaks
  GROUP BY email, group_type, streak_group
),
-- Get the most recent streak per contact (the one that just ended)
latest_streaks AS (
  SELECT DISTINCT ON (email)
    sl.email,
    sl.group_type,
    sl.consecutive_sessions,
    sl.streak_start,
    sl.streak_end,
    (now()::DATE - sl.streak_end) AS days_since_last,
    -- Check if there was a session after their streak ended that they missed
    EXISTS (
      SELECT 1 FROM group_sessions gs
      WHERE gs.group_type = sl.group_type
        AND gs.session_num > sl.last_session_num
    ) AS missed_after_streak
  FROM streak_lengths sl
  WHERE sl.consecutive_sessions >= 3
  ORDER BY email, sl.streak_end DESC
),
qualified AS (
  SELECT
    ls.email,
    c.firstname,
    c.lastname,
    ls.group_type,
    ls.consecutive_sessions AS total_meetings,
    ls.streak_end           AS last_attended,
    ls.days_since_last,
    (ls.group_type = 'Thursday') AS last_was_thursday
  FROM latest_streaks ls
  LEFT JOIN public.raw_hubspot_contacts c
    ON lower(c.email) = lower(ls.email)
  WHERE ls.missed_after_streak = true
    AND ls.days_since_last BETWEEN 14 AND 56
    -- Exclude Tiger 21
    AND (c.membership_s IS NULL OR c.membership_s NOT ILIKE '%Tiger 21%')
    -- No sobriety/revenue gate: 3+ consecutive sessions = trusted member
)
SELECT
  q.email,
  q.firstname,
  q.lastname,
  q.total_meetings,
  q.last_attended,
  q.days_since_last,
  q.last_was_thursday,
  sb.delivered_at   AS last_streak_break_sent,
  ar.delivered_at   AS last_at_risk_nudge_sent
FROM qualified q
-- Dedup: don't re-contact within 28 days
LEFT JOIN public.recovery_events sb
  ON lower(sb.attendee_email) = lower(q.email)
  AND sb.event_type = 'streak_break'
  AND sb.delivered_at >= now() - INTERVAL '28 days'
-- Exclude: already got a day-before at-risk nudge in the last 14 days
LEFT JOIN public.recovery_events ar
  ON lower(ar.attendee_email) = lower(q.email)
  AND ar.event_type = 'at_risk_nudge'
  AND ar.delivered_at >= now() - INTERVAL '14 days';

-- ============================================================
-- 4. Rebuild vw_winback_candidates
--    - Uses group meetings only
--    - Excludes Tiger 21
--    - Winback = 1 meeting, so sobriety/revenue still required
--      (they haven't proven commitment via repeat attendance)
-- ============================================================
DROP VIEW IF EXISTS public.vw_winback_candidates;
CREATE VIEW public.vw_winback_candidates AS
WITH attendance_counts AS (
  SELECT
    lower(gma.email)                              AS email,
    MIN(c.firstname)                              AS firstname,
    MIN(c.lastname)                               AS lastname,
    COUNT(DISTINCT gma.meeting_date)              AS total_meetings,
    MAX(gma.meeting_date)                         AS last_attended,
    MIN(gma.meeting_date)                         AS first_attended,
    -- Determine which group they attended
    MODE() WITHIN GROUP (ORDER BY gma.group_type) AS primary_group,
    (MODE() WITHIN GROUP (ORDER BY gma.group_type) = 'Thursday')
                                                  AS is_thursday_attendee
  FROM public.vw_group_meeting_attendance gma
  LEFT JOIN public.raw_hubspot_contacts c
    ON lower(c.email) = lower(gma.email)
  WHERE
    -- Exclude Tiger 21
    (c.membership_s IS NULL OR c.membership_s NOT ILIKE '%Tiger 21%')
    -- Winback = 1-time attendees, require sobriety + revenue qualification
    AND c.sobriety_date IS NOT NULL
    AND c.sobriety_date::DATE <= now()::DATE - INTERVAL '6 months'
    AND COALESCE(c.annual_revenue_in_dollars__official_, 0) >= 100000
  GROUP BY lower(gma.email)
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
  ac.primary_group,
  r.delivered_at AS last_winback_sent
FROM attendance_counts ac
LEFT JOIN public.recovery_events r
  ON lower(r.attendee_email) = lower(ac.email)
  AND r.event_type = 'winback'
WHERE ac.total_meetings = 1
  AND ac.last_attended >= now()::DATE - 180
  AND ac.last_attended <= now()::DATE - 30;

-- ============================================================
-- 5. Rebuild vw_noshow_candidates to also use group meeting
--    filter for prior_meeting_count (so personal meetings
--    don't inflate the count)
-- ============================================================
DROP VIEW IF EXISTS public.vw_noshow_candidates;
CREATE VIEW public.vw_noshow_candidates AS
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
-- Use group meetings only for attendance check
group_attendees AS (
  SELECT DISTINCT
    lower(email)             AS email,
    meeting_date             AS activity_date
  FROM public.vw_group_meeting_attendance
),
prior_counts AS (
  SELECT
    lower(l.email)               AS email,
    l.meeting_date,
    COUNT(DISTINCT h.activity_date) AS prior_meeting_count
  FROM luma_regs l
  LEFT JOIN group_attendees h
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
LEFT JOIN group_attendees h
  ON lower(h.email) = lower(l.email)
  AND h.activity_date BETWEEN l.meeting_date - 1 AND l.meeting_date + 1
LEFT JOIN prior_counts p
  ON lower(p.email) = lower(l.email)
  AND p.meeting_date = l.meeting_date
LEFT JOIN public.recovery_events r
  ON lower(r.attendee_email) = lower(l.email)
  AND r.meeting_date = l.meeting_date;
