-- Backfill donor_first_name, donor_last_name, donor_name, and donor_company_name
-- from the stored payload JSON for rows where Zapier sent donor_first_name / donor_last_name
-- but the ingest function didn't recognise those keys (only checked first_name / last_name).

-- 1. Backfill donor_first_name from payload
UPDATE public.raw_zeffy_donations
SET donor_first_name = TRIM(payload->>'donor_first_name')
WHERE (donor_first_name IS NULL OR donor_first_name = '')
  AND payload->>'donor_first_name' IS NOT NULL
  AND TRIM(payload->>'donor_first_name') <> '';

-- 2. Backfill donor_last_name from payload
UPDATE public.raw_zeffy_donations
SET donor_last_name = TRIM(payload->>'donor_last_name')
WHERE (donor_last_name IS NULL OR donor_last_name = '')
  AND payload->>'donor_last_name' IS NOT NULL
  AND TRIM(payload->>'donor_last_name') <> '';

-- 3. Backfill donor_company_name from payload
UPDATE public.raw_zeffy_donations
SET donor_company_name = TRIM(payload->>'donor_company_name')
WHERE (donor_company_name IS NULL OR donor_company_name = '')
  AND payload->>'donor_company_name' IS NOT NULL
  AND TRIM(payload->>'donor_company_name') <> '';

-- 4. Recompose donor_name for any row that now has first/last but still no donor_name
--    (This duplicates the existing trigger logic for rows that predate the trigger)
UPDATE public.raw_zeffy_donations
SET donor_name = TRIM(COALESCE(donor_first_name, '') || ' ' || COALESCE(donor_last_name, ''))
WHERE (donor_name IS NULL OR donor_name = '')
  AND (donor_first_name IS NOT NULL OR donor_last_name IS NOT NULL);
