
/* ============================================================
   vw_noshow_candidates
   
   Cross-references Luma registrations against HubSpot activity 
   contact associations to find people who registered but never
   appeared in a meeting activity association for that date window.
   ============================================================ */
CREATE OR REPLACE VIEW public.vw_noshow_candidates AS
WITH luma_regs AS (
  SELECT
    guest_email  AS email,
    guest_name   AS name,
    event_start_at::DATE AS meeting_date,
    is_thursday,
    zoom_meeting_id
  FROM public.raw_luma_registrations
  WHERE guest_email IS NOT NULL
    AND event_start_at IS NOT NULL
    AND event_start_at < now()
    AND event_start_at >= now() - INTERVAL '14 days'
),
hubspot_attendees AS (
  -- People who appeared in HubSpot activity associations
  -- around the same date window, indicating they actually attended.
  SELECT DISTINCT
    lower(a.contact_email) AS email,
    act.hs_timestamp::DATE AS activity_date
  FROM public.hubspot_activity_contact_associations a
  JOIN public.raw_hubspot_meeting_activities act
    ON a.hubspot_activity_id = act.hubspot_activity_id
    AND a.activity_type = act.activity_type
  WHERE a.contact_email IS NOT NULL
    AND act.hs_timestamp IS NOT NULL
)
SELECT
  l.email,
  l.name,
  l.meeting_date,
  l.is_thursday,
  CASE
    WHEN h.email IS NOT NULL THEN 'attended'
    ELSE 'no_show'
  END AS attendance_status,
  r.delivered_at AS last_recovery_sent
FROM luma_regs l
LEFT JOIN hubspot_attendees h
  ON lower(h.email) = lower(l.email)
  AND h.activity_date BETWEEN l.meeting_date - 1 AND l.meeting_date + 1
LEFT JOIN public.recovery_events r
  ON lower(r.attendee_email) = lower(l.email)
  AND r.meeting_date = l.meeting_date;
;
