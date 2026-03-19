/* ============================================================
   Fix 1:1 meetings leaking into group attendance view

   Problem: vw_group_meeting_attendance day/time fallback catches
   1:1 meetings (intro calls, HubSpot booking links, Phoenix Forum
   interviews) that happen to fall in the Tuesday/Thursday window.

   Example: "John Boggs Sober Founders Intro Meeting" on Thursday
   at 1 PM ET matched the fallback and was counted as a group
   meeting.

   Fix:
   1. Add negative title patterns to exclude known 1:1 formats
      from the day/time fallback
   2. Add "Sober Founders Business Mastermind" as a positive
      title match (91 activities were only caught by fallback)
   3. Fix vw_first_visit_followup duplicate rows from contacts
      table having duplicate email rows

   IMPORTANT — Title patterns here MUST match the JS single source
   of truth: dashboard/src/lib/groupMeetingClassification.js
   (GROUP_TITLE_SIGNALS + ONE_ON_ONE_TITLE_SIGNALS).
   If you change patterns in one place, update the other.
   ============================================================ */

-- ============================================================
-- 1. Rebuild vw_group_meeting_attendance with 1:1 exclusions
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
    -- Positive title matches: definitely a group meeting
    CASE
      WHEN lower(act.title) LIKE '%tactic tuesday%' THEN 'Tuesday'
      WHEN lower(act.title) LIKE '%mastermind on zoom%'
        OR lower(act.title) LIKE '%all are welcome%'
        OR lower(act.title) LIKE '%entrepreneur''s big book%'
        OR lower(act.title) LIKE '%big book%'
        OR lower(act.title) LIKE '%business mastermind%' THEN 'Thursday'
      ELSE NULL
    END AS title_group_type,
    -- Negative title matches: definitely NOT a group meeting
    -- Must stay in sync with ONE_ON_ONE_TITLE_SIGNALS in
    -- dashboard/src/lib/groupMeetingClassification.js
    CASE WHEN
         lower(act.title) LIKE '%intro meeting%'
      OR lower(act.title) LIKE '%meeting with%'
      OR lower(act.title) LIKE '%andrew lassise -%'
      OR lower(act.title) LIKE 'not canceled: meeting%'
      OR lower(act.title) LIKE '%phoenix forum%'
      OR lower(act.title) LIKE '%sober founder interview%'
      OR lower(act.title) LIKE 'canceled:%'
      OR lower(act.title) LIKE '1 hr online meeting%'
      OR lower(act.title) LIKE '%lunch%'
      THEN TRUE ELSE FALSE
    END AS is_known_1on1
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
        -- Only use day/time fallback if NOT a known 1:1 title
        WHEN is_known_1on1 THEN NULL
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
-- 2. Rebuild vw_first_visit_followup with contact dedup
--    Some emails have duplicate rows in raw_hubspot_contacts
--    (pre-merge HubSpot records). Use DISTINCT ON to pick one.
-- ============================================================
CREATE OR REPLACE VIEW public.vw_first_visit_followup AS
WITH first_visits AS (
  SELECT
    lower(gma.email) AS email,
    MIN(gma.meeting_date) AS first_meeting_date,
    (array_agg(gma.group_type ORDER BY gma.meeting_date, gma.hs_timestamp))[1] AS first_group_type
  FROM public.vw_group_meeting_attendance gma
  GROUP BY lower(gma.email)
),
meeting_counts AS (
  SELECT
    lower(email) AS email,
    COUNT(DISTINCT meeting_date) AS total_meetings
  FROM public.vw_group_meeting_attendance
  GROUP BY lower(email)
),
deduped_contacts AS (
  SELECT DISTINCT ON (lower(email))
    lower(email) AS email,
    firstname,
    lastname,
    membership_s
  FROM public.raw_hubspot_contacts
  WHERE email IS NOT NULL
  ORDER BY lower(email), createdate DESC
)
SELECT
  fv.email,
  fv.first_meeting_date   AS meeting_date,
  fv.first_group_type     AS group_type,
  mc.total_meetings,
  COALESCE(c.firstname, split_part(fv.email, '@', 1)) AS firstname,
  c.lastname,
  re.delivered_at          AS last_followup_sent
FROM first_visits fv
JOIN meeting_counts mc
  ON mc.email = fv.email
LEFT JOIN deduped_contacts c
  ON c.email = fv.email
LEFT JOIN public.contact_outreach_suppression s
  ON lower(s.contact_email) = fv.email
LEFT JOIN LATERAL (
  SELECT re2.delivered_at
  FROM public.recovery_events re2
  WHERE lower(re2.attendee_email) = fv.email
    AND re2.event_type = 'first_visit_followup'
  ORDER BY re2.delivered_at DESC
  LIMIT 1
) re ON true
WHERE fv.first_meeting_date >= CURRENT_DATE - INTERVAL '14 days'
  AND s.contact_email IS NULL
  AND (c.membership_s IS DISTINCT FROM 'Tiger 21 Member');
