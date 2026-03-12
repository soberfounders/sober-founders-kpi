-- Fix donor name population from Zapier-mapped first/last name fields.
--
-- Problem: Zapier inserts donor_first_name, donor_last_name, donor_company_name
-- into raw_zeffy_donations but donor_name is left null because Zapier wasn't
-- mapping a combined full-name field. This migration:
--   1. Backfills donor_name on existing rows where it is null
--   2. Adds a BEFORE INSERT/UPDATE trigger to auto-compose donor_name
--   3. Adds an AFTER INSERT/UPDATE trigger to upsert raw_zeffy_supporter_profiles
--   4. Recreates donation_transactions_unified to expose donor_company_name
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Backfill existing rows ─────────────────────────────────────────────────
UPDATE public.raw_zeffy_donations
SET donor_name = TRIM(COALESCE(donor_first_name, '') || ' ' || COALESCE(donor_last_name, ''))
WHERE (donor_name IS NULL OR donor_name = '')
  AND (donor_first_name IS NOT NULL OR donor_last_name IS NOT NULL);

-- ── 2. Trigger function: compose donor_name before insert/update ──────────────
CREATE OR REPLACE FUNCTION public.tgf_compose_donor_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only fill donor_name when it is missing but first/last parts are present
  IF (NEW.donor_name IS NULL OR NEW.donor_name = '') THEN
    IF (NEW.donor_first_name IS NOT NULL AND NEW.donor_first_name <> '')
       OR (NEW.donor_last_name IS NOT NULL AND NEW.donor_last_name <> '') THEN
      NEW.donor_name := TRIM(
        COALESCE(NEW.donor_first_name, '') || ' ' || COALESCE(NEW.donor_last_name, '')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compose_donor_name ON public.raw_zeffy_donations;
CREATE TRIGGER trg_compose_donor_name
  BEFORE INSERT OR UPDATE ON public.raw_zeffy_donations
  FOR EACH ROW EXECUTE FUNCTION public.tgf_compose_donor_name();

-- ── 3. Trigger function: upsert supporter profile on every ingest ─────────────
CREATE OR REPLACE FUNCTION public.tgf_upsert_supporter_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only upsert when we have an email to key on
  IF NEW.donor_email IS NOT NULL AND NEW.donor_email <> '' THEN
    INSERT INTO public.raw_zeffy_supporter_profiles (
      donor_email,
      donor_name,
      donor_first_name,
      donor_last_name,
      donor_company_name,
      donor_language,
      donor_city,
      donor_region,
      donor_postal_code,
      donor_country,
      last_payment_at,
      imported_at,
      updated_at
    )
    VALUES (
      NEW.donor_email,
      COALESCE(NULLIF(NEW.donor_name, ''), NULL),
      COALESCE(NULLIF(NEW.donor_first_name, ''), NULL),
      COALESCE(NULLIF(NEW.donor_last_name, ''), NULL),
      COALESCE(NULLIF(NEW.donor_company_name, ''), NULL),
      COALESCE(NULLIF(NEW.donor_language, ''), NULL),
      COALESCE(NULLIF(NEW.donor_city, ''), NULL),
      COALESCE(NULLIF(NEW.donor_region, ''), NULL),
      COALESCE(NULLIF(NEW.donor_postal_code, ''), NULL),
      COALESCE(NULLIF(NEW.donor_country, ''), NULL),
      NEW.donated_at,
      NOW(),
      NOW()
    )
    ON CONFLICT (donor_email) DO UPDATE SET
      donor_name        = COALESCE(EXCLUDED.donor_name,        raw_zeffy_supporter_profiles.donor_name),
      donor_first_name  = COALESCE(EXCLUDED.donor_first_name,  raw_zeffy_supporter_profiles.donor_first_name),
      donor_last_name   = COALESCE(EXCLUDED.donor_last_name,   raw_zeffy_supporter_profiles.donor_last_name),
      donor_company_name= COALESCE(EXCLUDED.donor_company_name,raw_zeffy_supporter_profiles.donor_company_name),
      donor_language    = COALESCE(EXCLUDED.donor_language,    raw_zeffy_supporter_profiles.donor_language),
      donor_city        = COALESCE(EXCLUDED.donor_city,        raw_zeffy_supporter_profiles.donor_city),
      donor_region      = COALESCE(EXCLUDED.donor_region,      raw_zeffy_supporter_profiles.donor_region),
      donor_postal_code = COALESCE(EXCLUDED.donor_postal_code, raw_zeffy_supporter_profiles.donor_postal_code),
      donor_country     = COALESCE(EXCLUDED.donor_country,     raw_zeffy_supporter_profiles.donor_country),
      last_payment_at   = GREATEST(EXCLUDED.last_payment_at,   raw_zeffy_supporter_profiles.last_payment_at),
      updated_at        = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upsert_supporter_profile ON public.raw_zeffy_donations;
CREATE TRIGGER trg_upsert_supporter_profile
  AFTER INSERT OR UPDATE ON public.raw_zeffy_donations
  FOR EACH ROW EXECUTE FUNCTION public.tgf_upsert_supporter_profile();

-- ── 4. Recreate donation_transactions_unified to expose donor_company_name ────
DROP VIEW IF EXISTS public.donation_transactions_unified;

CREATE OR REPLACE VIEW public.donation_transactions_unified AS
SELECT
  'zeffy'::text               AS source_system,
  z.id::text                  AS row_id,
  z.source_event_id,
  z.donor_name,
  z.donor_first_name,
  z.donor_last_name,
  z.donor_company_name,
  z.donor_email,
  z.amount,
  z.currency,
  z.fee_amount,
  z.tip_amount,
  z.net_amount,
  z.eligible_amount,
  z.donated_at,
  z.status,
  z.is_recurring,
  COALESCE(z.campaign_name, z.form_name) AS campaign_name,
  NULL::text                  AS designation,
  z.payment_method,
  z.receipt_url,
  z.donor_city,
  z.donor_region,
  z.donor_country,
  z.source_file,
  NULL::text                  AS note,
  z.ingested_at               AS created_at,
  z.updated_at,
  z.payload
FROM public.raw_zeffy_donations z
UNION ALL
SELECT
  'manual'::text              AS source_system,
  m.id::text                  AS row_id,
  NULL::text                  AS source_event_id,
  m.donor_name,
  NULL::text                  AS donor_first_name,
  NULL::text                  AS donor_last_name,
  NULL::text                  AS donor_company_name,
  m.donor_email,
  m.amount,
  m.currency,
  NULL::numeric               AS fee_amount,
  NULL::numeric               AS tip_amount,
  NULL::numeric               AS net_amount,
  NULL::numeric               AS eligible_amount,
  m.donated_at,
  'posted'::text              AS status,
  m.is_recurring,
  m.campaign_name,
  m.designation,
  NULL::text                  AS payment_method,
  NULL::text                  AS receipt_url,
  NULL::text                  AS donor_city,
  NULL::text                  AS donor_region,
  NULL::text                  AS donor_country,
  NULL::text                  AS source_file,
  m.note,
  m.created_at,
  m.updated_at,
  m.metadata                  AS payload
FROM public.manual_donation_entries m;

-- Grant read access consistent with existing RLS posture
GRANT SELECT ON public.donation_transactions_unified TO authenticated, anon;

-- Restore security_invoker setting applied by the RLS hardening migration
-- (DROP VIEW loses view options; must be re-applied after CREATE VIEW)
ALTER VIEW IF EXISTS public.donation_transactions_unified SET (security_invoker = true);
