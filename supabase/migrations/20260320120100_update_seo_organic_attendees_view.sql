-- Update vw_seo_organic_zoom_attendees to include first/last page seen
-- and first referrer from HubSpot. This enables blog-to-attendee attribution:
-- we can now see which specific page an organic visitor landed on before
-- they registered for a session.
--
-- Must DROP + CREATE (not CREATE OR REPLACE) because new columns are inserted
-- in the middle of the SELECT list, changing existing column positions.
DROP VIEW IF EXISTS public.vw_seo_organic_zoom_attendees;
CREATE VIEW public.vw_seo_organic_zoom_attendees AS
SELECT
  m.zoom_attendee_canonical_name    AS attendee_name,
  m.hubspot_email                   AS email,
  m.session_date,
  m.group_name                      AS meeting_name,
  m.zoom_session_key,
  -- Traffic source details from HubSpot contact record
  c.hs_analytics_source             AS hs_analytics_source,
  c.original_traffic_source         AS original_traffic_source,
  c.campaign                        AS campaign,
  c.campaign_source                 AS campaign_source,
  -- First/last page seen (new: enables blog attribution)
  c.hs_analytics_first_url          AS first_page_seen,
  c.hs_analytics_last_url           AS last_page_seen,
  c.hs_analytics_first_referrer     AS first_referrer,
  c.hs_analytics_first_visit_timestamp AS first_visit_at,
  c.hs_analytics_num_page_views     AS total_page_views,
  -- Derive a simple label for display
  CASE
    WHEN LOWER(COALESCE(c.original_traffic_source, '')) LIKE '%organic%'
      THEN 'Organic Search'
    WHEN LOWER(COALESCE(c.hs_analytics_source, '')) LIKE '%organic%'
      THEN 'Organic Search'
    WHEN LOWER(COALESCE(c.original_traffic_source, '')) LIKE '%social%'
      THEN 'Social Media'
    ELSE COALESCE(c.hs_analytics_source, c.original_traffic_source, 'Unknown')
  END AS traffic_source_label,
  -- Derive whether they landed on a blog post
  CASE
    WHEN LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%/blog%'
      OR LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%sober-ceo%'
      OR LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%entrepreneur%'
      OR LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%mastermind%'
      OR LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%vistage%'
      OR LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%ypo%'
      OR LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%tiger-21%'
      OR LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%networking%'
      OR LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%alcoholic%'
      OR LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%addiction%'
      OR LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%sobriety%'
      OR LOWER(COALESCE(c.hs_analytics_first_url, '')) LIKE '%recovery%'
      THEN true
    ELSE false
  END AS landed_on_blog,
  m.hubspot_contact_id,
  m.mapping_confidence
FROM public.zoom_attendee_hubspot_mappings m
LEFT JOIN LATERAL (
  -- Get the most recently ingested record for this contact
  SELECT
    hs_analytics_source,
    original_traffic_source,
    campaign,
    campaign_source,
    hs_analytics_first_url,
    hs_analytics_last_url,
    hs_analytics_first_referrer,
    hs_analytics_first_visit_timestamp,
    hs_analytics_num_page_views
  FROM public.raw_hubspot_contacts
  WHERE hubspot_contact_id = m.hubspot_contact_id
  ORDER BY ingested_at DESC
  LIMIT 1
) c ON TRUE
WHERE
  m.hubspot_contact_id IS NOT NULL
  AND (
    LOWER(COALESCE(c.original_traffic_source, '')) LIKE '%organic%'
    OR LOWER(COALESCE(c.hs_analytics_source, '')) LIKE '%organic%'
    OR LOWER(COALESCE(c.hs_analytics_source, '')) LIKE '%google%'
  )
ORDER BY m.session_date DESC, m.zoom_attendee_canonical_name;
