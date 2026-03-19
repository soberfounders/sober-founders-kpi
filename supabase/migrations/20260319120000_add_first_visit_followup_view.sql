/* ============================================================
   First-Visit Follow-up View

   Identifies people whose FIRST group meeting attendance was
   within the last 14 days. Used to send a "hope to see you
   again" email after their first session.

   Excludes:
   - Tiger 21 members
   - Suppressed contacts
   - Already sent first_visit_followup
   ============================================================ */

CREATE OR REPLACE VIEW public.vw_first_visit_followup AS
WITH first_visits AS (
  SELECT
    lower(gma.email) AS email,
    MIN(gma.meeting_date) AS first_meeting_date,
    (array_agg(gma.group_type ORDER BY gma.meeting_date, gma.hs_timestamp))[1] AS first_group_type
  FROM public.vw_group_meeting_attendance gma
  GROUP BY lower(gma.email)
),
-- Count total meetings so we can show "attended X times" context
meeting_counts AS (
  SELECT
    lower(email) AS email,
    COUNT(DISTINCT meeting_date) AS total_meetings
  FROM public.vw_group_meeting_attendance
  GROUP BY lower(email)
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
LEFT JOIN public.raw_hubspot_contacts c
  ON lower(c.email) = fv.email
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

-- Grant read access (matches existing view security pattern)
GRANT SELECT ON public.vw_first_visit_followup TO authenticated, anon;
