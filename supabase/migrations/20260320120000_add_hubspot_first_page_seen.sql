-- Add HubSpot "First Page Seen" and "First Referring Site" columns
-- for blog-to-attendee attribution tracking.
-- These fields are auto-populated by HubSpot's tracking code when a
-- contact first visits the website, giving us the exact landing page URL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'raw_hubspot_contacts'
  ) THEN
    ALTER TABLE public.raw_hubspot_contacts
      ADD COLUMN IF NOT EXISTS hs_analytics_first_url text,
      ADD COLUMN IF NOT EXISTS hs_analytics_last_url text,
      ADD COLUMN IF NOT EXISTS hs_analytics_first_referrer text,
      ADD COLUMN IF NOT EXISTS hs_analytics_last_referrer text,
      ADD COLUMN IF NOT EXISTS hs_analytics_first_visit_timestamp timestamptz,
      ADD COLUMN IF NOT EXISTS hs_analytics_num_page_views integer;
  END IF;
END $$;
