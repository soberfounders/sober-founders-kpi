-- Fix security warnings for views and tables created after the
-- 20260304 hardening migration ran.
--
-- Issues resolved:
--   1. Eight views missing security_invoker = true (flagged as SECURITY DEFINER
--      by Supabase linter because Postgres default is security definer for views
--      created by a superuser/postgres role).
--   2. raw_hubspot_deals table has no RLS enabled (created in 20260306 migration,
--      which post-dates the hardening migration that covered other tables).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Set security_invoker on views created after the hardening migration ────
--
-- security_invoker = true means the view executes with the permissions of the
-- calling user, so RLS on the underlying tables is respected. This is the same
-- pattern applied to all other views in the 20260304 hardening migration.

ALTER VIEW IF EXISTS public.vw_kpi_trend                        SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_donor_health                     SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_noshow_candidates                SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_hubspot_deals_est                SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_hubspot_contacts_est             SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_hubspot_meeting_activities_est   SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_hubspot_sync_health              SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_hubspot_sync_health_observability SET (security_invoker = true);

-- ── 2. Enable RLS on raw_hubspot_deals and add matching policies ──────────────
--
-- Mirrors the pattern from 20260304 hardening: anon/authenticated get read-only
-- access; service_role gets full write access for the sync pipeline.

ALTER TABLE IF EXISTS public.raw_hubspot_deals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'raw_hubspot_deals'
      AND policyname  = 'Public read raw_hubspot_deals'
  ) THEN
    CREATE POLICY "Public read raw_hubspot_deals"
      ON public.raw_hubspot_deals
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'raw_hubspot_deals'
      AND policyname  = 'Service role write raw_hubspot_deals'
  ) THEN
    CREATE POLICY "Service role write raw_hubspot_deals"
      ON public.raw_hubspot_deals
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
