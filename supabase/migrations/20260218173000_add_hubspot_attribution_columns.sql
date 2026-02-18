-- Add additional HubSpot attribution fields for lead-source analysis.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'raw_hubspot_contacts'
  ) THEN
    ALTER TABLE public.raw_hubspot_contacts
      ADD COLUMN IF NOT EXISTS hs_latest_source text,
      ADD COLUMN IF NOT EXISTS hs_latest_source_data_1 text,
      ADD COLUMN IF NOT EXISTS hs_latest_source_data_2 text,
      ADD COLUMN IF NOT EXISTS first_conversion_event_name text,
      ADD COLUMN IF NOT EXISTS recent_conversion_event_name text,
      ADD COLUMN IF NOT EXISTS engagements_last_meeting_booked_campaign text,
      ADD COLUMN IF NOT EXISTS engagements_last_meeting_booked_medium text,
      ADD COLUMN IF NOT EXISTS engagements_last_meeting_booked_source text,
      ADD COLUMN IF NOT EXISTS num_conversion_events integer,
      ADD COLUMN IF NOT EXISTS num_unique_conversion_events integer;
  END IF;
END $$;
