/* ============================================================
   No-Show Lead Qualification

   1. Adds lead_qualification_overrides table for manual tagging
   2. Rebuilds vw_noshow_candidates with HubSpot contact data
      (revenue, sobriety, firstname, lastname, hubspot_contact_id)
      and a computed lead_qualification column
   ============================================================ */

-- 1. Manual lead qualification overrides
CREATE TABLE IF NOT EXISTS public.lead_qualification_overrides (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT NOT NULL,
  qualification TEXT NOT NULL CHECK (qualification IN (
    'phoenix_qualified', 'qualified', 'not_qualified', 'unknown'
  )),
  tagged_by     TEXT DEFAULT 'dashboard',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- One active override per email (email stored lowercase from app layer)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_qual_email
  ON public.lead_qualification_overrides (email);

ALTER TABLE public.lead_qualification_overrides ENABLE ROW LEVEL SECURITY;

-- 2. Rebuild vw_noshow_candidates with qualification data
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
    AND event_start_at::DATE >= '2026-03-18'
),
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
  END                                       AS attendance_status,
  COALESCE(p.prior_meeting_count, 0)        AS prior_meeting_count,
  r.delivered_at                            AS last_recovery_sent,
  -- HubSpot contact data for qualification
  c.hubspot_contact_id,
  c.firstname,
  c.lastname,
  COALESCE(c.annual_revenue_in_dollars__official_, 0) AS annual_revenue,
  c.sobriety_date,
  -- Computed lead qualification
  COALESCE(
    lqo.qualification,
    CASE
      WHEN c.email IS NULL THEN 'unknown'
      WHEN c.sobriety_date IS NULL THEN 'unknown'
      WHEN c.sobriety_date::DATE > now()::DATE - INTERVAL '1 year' THEN 'not_qualified'
      WHEN COALESCE(c.annual_revenue_in_dollars__official_, 0) >= 1000000 THEN 'phoenix_qualified'
      WHEN COALESCE(c.annual_revenue_in_dollars__official_, 0) >= 250000  THEN 'qualified'
      WHEN COALESCE(c.annual_revenue_in_dollars__official_, 0) > 0        THEN 'not_qualified'
      ELSE 'unknown'
    END
  )                                         AS lead_qualification
FROM luma_regs l
LEFT JOIN group_attendees h
  ON lower(h.email) = lower(l.email)
  AND h.activity_date BETWEEN l.meeting_date - 1 AND l.meeting_date + 1
LEFT JOIN prior_counts p
  ON lower(p.email) = lower(l.email)
  AND p.meeting_date = l.meeting_date
LEFT JOIN public.recovery_events r
  ON lower(r.attendee_email) = lower(l.email)
  AND r.meeting_date = l.meeting_date
LEFT JOIN public.raw_hubspot_contacts c
  ON lower(c.email) = lower(l.email)
LEFT JOIN public.lead_qualification_overrides lqo
  ON lower(lqo.email) = lower(l.email);
