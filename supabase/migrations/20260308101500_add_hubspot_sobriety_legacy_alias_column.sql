-- Backward-compatible alias for older dashboard bundles that still select
-- sobriety_date__official_ from raw_hubspot_contacts.
-- Canonical source-of-truth remains sobriety_date.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'raw_hubspot_contacts'
  ) THEN
    ALTER TABLE public.raw_hubspot_contacts
      ADD COLUMN IF NOT EXISTS sobriety_date__official_ text;

    UPDATE public.raw_hubspot_contacts
    SET sobriety_date__official_ = sobriety_date
    WHERE sobriety_date__official_ IS NULL;

    CREATE OR REPLACE FUNCTION public.sync_hubspot_sobriety_legacy_alias()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.sobriety_date__official_ := NEW.sobriety_date;
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_sync_hubspot_sobriety_legacy_alias ON public.raw_hubspot_contacts;
    CREATE TRIGGER trg_sync_hubspot_sobriety_legacy_alias
    BEFORE INSERT OR UPDATE OF sobriety_date
    ON public.raw_hubspot_contacts
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_hubspot_sobriety_legacy_alias();
  END IF;
END
$$;
