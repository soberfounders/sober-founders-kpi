-- Security hardening migration:
-- 1) Remove permissive dev-only write policies.
-- 2) Enable RLS on newly introduced donations tables.
-- 3) Replace broad write access with service_role-only write policies.
-- 4) Ensure analytics/ops views run as SECURITY INVOKER.

-- ---------------------------------------------------------------------------
-- Drop permissive dev policies that granted ALL access to public/anon roles.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname = 'allow_all_dev_policy'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'allow_all_dev_policy',
      policy_row.tablename
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Anon write zoom_identities" ON public.zoom_identities;
DROP POLICY IF EXISTS "Anon write zoom_attendance" ON public.zoom_attendance;
DROP POLICY IF EXISTS "Anon write zoom_merge_log" ON public.zoom_merge_log;
DROP POLICY IF EXISTS "Anon write zoom_pending_review" ON public.zoom_pending_review;
DROP POLICY IF EXISTS "Anon write zoom_notetaker_blocklist" ON public.zoom_notetaker_blocklist;

DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.attendee_aliases;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.attendee_aliases;

-- ---------------------------------------------------------------------------
-- Enable RLS on donations tables that were still publicly exposed without RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.raw_zeffy_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.manual_donation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.raw_zeffy_supporter_profiles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Add explicit read-only policies for dashboard-accessed analytics tables.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  read_tables text[] := ARRAY[
    'audit_log',
    'dim_funnel',
    'dim_kpi',
    'dim_week',
    'fact_attendance_event',
    'fact_kpi_weekly',
    'fact_kpi_weekly_overrides',
    'fact_kpi_weekly_versions',
    'fb_funnel_rules',
    'funnel_rules',
    'manual_money_event',
    'profiles',
    'raw_fb_ads_insights_daily',
    'raw_hubspot_call_logs',
    'raw_hubspot_contacts',
    'raw_hubspot_meetings',
    'raw_hubspot_meetings_v3',
    'raw_social_weekly',
    'raw_zeffy_donations',
    'manual_donation_entries',
    'raw_zeffy_supporter_profiles',
    'ai_briefings'
  ];
BEGIN
  FOREACH tbl IN ARRAY read_tables
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = tbl
          AND policyname = format('Public read %s', tbl)
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
          format('Public read %s', tbl),
          tbl
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Add service_role write policies so ingestion/sync functions retain access.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  write_tables text[] := ARRAY[
    'attendee_aliases',
    'zoom_identities',
    'zoom_attendance',
    'zoom_merge_log',
    'zoom_pending_review',
    'zoom_notetaker_blocklist',
    'audit_log',
    'dim_funnel',
    'dim_kpi',
    'dim_week',
    'fact_attendance_event',
    'fact_kpi_weekly',
    'fact_kpi_weekly_overrides',
    'fact_kpi_weekly_versions',
    'fb_funnel_rules',
    'funnel_rules',
    'manual_money_event',
    'profiles',
    'raw_fb_ads_insights_daily',
    'raw_hubspot_call_logs',
    'raw_hubspot_contacts',
    'raw_hubspot_meetings',
    'raw_hubspot_meetings_v3',
    'raw_social_weekly',
    'raw_zeffy_donations',
    'manual_donation_entries',
    'raw_zeffy_supporter_profiles',
    'ai_briefings'
  ];
BEGIN
  FOREACH tbl IN ARRAY write_tables
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = tbl
          AND policyname = format('Service role write %s', tbl)
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
          format('Service role write %s', tbl),
          tbl
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Force sensitive views to run as SECURITY INVOKER.
-- This prevents bypassing caller RLS context via SECURITY DEFINER behavior.
-- ---------------------------------------------------------------------------
ALTER VIEW IF EXISTS public.vw_seo_channel_daily SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_seo_ai_traffic_estimate SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_seo_search_performance SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_seo_ranking_drops SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_seo_opportunity_pages SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vw_seo_organic_zoom_attendees SET (security_invoker = true);
ALTER VIEW IF EXISTS public.hubspot_contact_identity_emails_v1 SET (security_invoker = true);
ALTER VIEW IF EXISTS public.zoom_meeting_attendee_rows_v1 SET (security_invoker = true);
ALTER VIEW IF EXISTS public.hubspot_call_contact_rows_v1 SET (security_invoker = true);
ALTER VIEW IF EXISTS public.donation_transactions_unified SET (security_invoker = true);
