-- Add HubSpot fields needed for cross-email matching and sobriety enrichment.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'raw_hubspot_contacts'
  ) THEN
    ALTER TABLE public.raw_hubspot_contacts
      ADD COLUMN IF NOT EXISTS hs_additional_emails text,
      ADD COLUMN IF NOT EXISTS sobriety_date text,
      ADD COLUMN IF NOT EXISTS annual_revenue_in_dollars__official_ numeric;
  END IF;
END $$;
