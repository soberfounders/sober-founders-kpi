-- ============================================================
-- Leads Funnel Unification Helper Views (Additive / Non-Breaking)
-- ============================================================
--
-- Business context (kept inline on purpose for future maintainers):
-- 1) Meta lead forms auto-create HubSpot contacts.
-- 2) Lu.ma registrations auto-create HubSpot contacts via Zapier.
-- 3) If the same person uses a different email later (Meta vs Lu.ma), HubSpot
--    merges are common. The absorbed contact email is typically preserved in
--    hs_additional_emails on the surviving contact.
-- 4) Therefore matching must check BOTH the primary email and any emails in
--    hs_additional_emails before falling back to name-based matching.
-- 5) Zoom attendance may also be logged in HubSpot as a Call record linked to
--    contacts. That is the highest-confidence attendee->HubSpot mapping signal
--    when present, but it can be delayed or incomplete.

-- ------------------------------------------------------------
-- 1) HubSpot contact emails exploded to one row per email
--    (primary + hs_additional_emails)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.hubspot_contact_identity_emails_v1 AS
SELECT
  c.hubspot_contact_id,
  c.createdate,
  c.firstname,
  c.lastname,
  c.email AS primary_email,
  LOWER(BTRIM(c.email)) AS email_match_key,
  'primary'::text AS email_kind,
  c.hs_additional_emails,
  c.hs_analytics_source,
  c.hs_analytics_source_data_1,
  c.hs_analytics_source_data_2
FROM public.raw_hubspot_contacts c
WHERE c.email IS NOT NULL AND BTRIM(c.email) <> ''

UNION ALL

SELECT
  c.hubspot_contact_id,
  c.createdate,
  c.firstname,
  c.lastname,
  c.email AS primary_email,
  LOWER(BTRIM(extra.email_value)) AS email_match_key,
  'secondary'::text AS email_kind,
  c.hs_additional_emails,
  c.hs_analytics_source,
  c.hs_analytics_source_data_1,
  c.hs_analytics_source_data_2
FROM public.raw_hubspot_contacts c
CROSS JOIN LATERAL regexp_split_to_table(COALESCE(c.hs_additional_emails, ''), '\s*,\s*') AS extra(email_value)
WHERE BTRIM(COALESCE(extra.email_value, '')) <> '';

COMMENT ON VIEW public.hubspot_contact_identity_emails_v1 IS
  'Explodes HubSpot primary and hs_additional_emails into one email-match row per contact. Use this before any name-based fallback.';

-- ------------------------------------------------------------
-- 2) Zoom attendee rows expanded from kpi_metrics metadata.attendees
--    (raw names only; email may not exist for repeat attendees)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.zoom_meeting_attendee_rows_v1 AS
SELECT
  km.metric_date,
  COALESCE(
    NULLIF(km.metadata->>'start_time', '')::timestamptz,
    (km.metric_date::text || 'T00:00:00Z')::timestamptz
  ) AS zoom_start_time_utc,
  km.metadata->>'meeting_id' AS meeting_id,
  km.metadata->>'meeting_topic' AS meeting_topic,
  km.metadata->>'group_name' AS group_name,
  attendee.attendee_name AS attendee_name_raw,
  LOWER(
    regexp_replace(
      regexp_replace(COALESCE(attendee.attendee_name, ''), '[^a-zA-Z0-9\s]+', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    )
  ) AS attendee_name_match_key
FROM public.kpi_metrics km
CROSS JOIN LATERAL (
  SELECT jsonb_array_elements_text(COALESCE(km.metadata->'attendees', '[]'::jsonb)) AS attendee_name
) attendee
WHERE km.metric_name = 'Zoom Meeting Attendees';

COMMENT ON VIEW public.zoom_meeting_attendee_rows_v1 IS
  'Expanded Zoom attendee names from kpi_metrics metadata.attendees for attendee-level auditing and matching.';

-- ------------------------------------------------------------
-- 3) HubSpot Call records with associated contacts (highest-confidence
--    Zoom attendee mapping signal when available)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.hubspot_call_contact_rows_v1 AS
SELECT
  a.hubspot_activity_id,
  a.activity_type,
  a.hs_timestamp,
  (a.hs_timestamp AT TIME ZONE 'UTC')::date AS activity_date_utc,
  a.created_at_hubspot,
  a.title,
  assoc.hubspot_contact_id,
  assoc.association_type,
  assoc.contact_email,
  LOWER(BTRIM(assoc.contact_email)) AS contact_email_match_key,
  assoc.contact_firstname,
  assoc.contact_lastname,
  BTRIM(COALESCE(assoc.contact_firstname, '') || ' ' || COALESCE(assoc.contact_lastname, '')) AS contact_name,
  LOWER(
    regexp_replace(
      regexp_replace(BTRIM(COALESCE(assoc.contact_firstname, '') || ' ' || COALESCE(assoc.contact_lastname, '')), '[^a-zA-Z0-9\s]+', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    )
  ) AS contact_name_match_key
FROM public.raw_hubspot_meeting_activities a
JOIN public.hubspot_activity_contact_associations assoc
  ON assoc.hubspot_activity_id = a.hubspot_activity_id
 AND LOWER(COALESCE(assoc.activity_type, '')) = LOWER(COALESCE(a.activity_type, ''))
WHERE LOWER(COALESCE(a.activity_type, '')) = 'call';

COMMENT ON VIEW public.hubspot_call_contact_rows_v1 IS
  'HubSpot Call records joined to associated contacts. Use as highest-confidence attendee->HubSpot evidence before name-only fallbacks.';

