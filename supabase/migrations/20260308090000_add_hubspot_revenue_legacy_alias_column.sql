-- Backward-compatible alias for older dashboard bundles that still select
-- annual_revenue_in_usd_official from raw_hubspot_contacts.
-- Canonical source-of-truth remains annual_revenue_in_dollars__official_.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'raw_hubspot_contacts'
  ) THEN
    ALTER TABLE public.raw_hubspot_contacts
      ADD COLUMN IF NOT EXISTS annual_revenue_in_usd_official numeric;

    UPDATE public.raw_hubspot_contacts
    SET annual_revenue_in_usd_official = annual_revenue_in_dollars__official_
    WHERE annual_revenue_in_usd_official IS NULL;

    CREATE OR REPLACE FUNCTION public.sync_hubspot_revenue_legacy_alias()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.annual_revenue_in_usd_official := NEW.annual_revenue_in_dollars__official_;
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_sync_hubspot_revenue_legacy_alias ON public.raw_hubspot_contacts;
    CREATE TRIGGER trg_sync_hubspot_revenue_legacy_alias
    BEFORE INSERT OR UPDATE OF annual_revenue_in_dollars__official_
    ON public.raw_hubspot_contacts
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_hubspot_revenue_legacy_alias();
  END IF;
END
$$;
