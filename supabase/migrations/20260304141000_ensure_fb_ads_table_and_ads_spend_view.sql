-- Ensure Meta ads raw table exists and provide legacy compatibility view.
-- This migration is defensive and idempotent.

CREATE TABLE IF NOT EXISTS public.raw_fb_ads_insights_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id text NOT NULL,
  date_day date NOT NULL,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text NOT NULL,
  ad_name text,
  funnel_key text NOT NULL DEFAULT 'unknown',
  spend numeric NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  leads bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.raw_fb_ads_insights_daily
  ADD COLUMN IF NOT EXISTS campaign_id text,
  ADD COLUMN IF NOT EXISTS campaign_name text,
  ADD COLUMN IF NOT EXISTS adset_id text,
  ADD COLUMN IF NOT EXISTS adset_name text,
  ADD COLUMN IF NOT EXISTS ad_name text,
  ADD COLUMN IF NOT EXISTS funnel_key text,
  ADD COLUMN IF NOT EXISTS spend numeric,
  ADD COLUMN IF NOT EXISTS impressions bigint,
  ADD COLUMN IF NOT EXISTS clicks bigint,
  ADD COLUMN IF NOT EXISTS leads bigint,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.raw_fb_ads_insights_daily
  ALTER COLUMN funnel_key SET DEFAULT 'unknown';
ALTER TABLE public.raw_fb_ads_insights_daily
  ALTER COLUMN spend SET DEFAULT 0;
ALTER TABLE public.raw_fb_ads_insights_daily
  ALTER COLUMN impressions SET DEFAULT 0;
ALTER TABLE public.raw_fb_ads_insights_daily
  ALTER COLUMN clicks SET DEFAULT 0;
ALTER TABLE public.raw_fb_ads_insights_daily
  ALTER COLUMN leads SET DEFAULT 0;
ALTER TABLE public.raw_fb_ads_insights_daily
  ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.raw_fb_ads_insights_daily
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.raw_fb_ads_insights_daily
SET
  funnel_key = COALESCE(funnel_key, 'unknown'),
  spend = COALESCE(spend, 0),
  impressions = COALESCE(impressions, 0),
  clicks = COALESCE(clicks, 0),
  leads = COALESCE(leads, 0),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now())
WHERE
  funnel_key IS NULL
  OR spend IS NULL
  OR impressions IS NULL
  OR clicks IS NULL
  OR leads IS NULL
  OR created_at IS NULL
  OR updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'raw_fb_ads_insights_daily_unique_key'
      AND conrelid = 'public.raw_fb_ads_insights_daily'::regclass
  ) THEN
    ALTER TABLE public.raw_fb_ads_insights_daily
      ADD CONSTRAINT raw_fb_ads_insights_daily_unique_key
      UNIQUE (ad_account_id, date_day, ad_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_raw_fb_ads_insights_daily_date_day
  ON public.raw_fb_ads_insights_daily (date_day DESC);
CREATE INDEX IF NOT EXISTS idx_raw_fb_ads_insights_daily_funnel_key
  ON public.raw_fb_ads_insights_daily (funnel_key);
CREATE INDEX IF NOT EXISTS idx_raw_fb_ads_insights_daily_campaign_name
  ON public.raw_fb_ads_insights_daily (campaign_name);

ALTER TABLE public.raw_fb_ads_insights_daily ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'raw_fb_ads_insights_daily'
      AND policyname = 'Public read raw_fb_ads_insights_daily'
  ) THEN
    CREATE POLICY "Public read raw_fb_ads_insights_daily"
      ON public.raw_fb_ads_insights_daily
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END
$$;

CREATE OR REPLACE VIEW public.ads_spend_daily AS
SELECT
  date_day::date AS metric_date,
  COALESCE(NULLIF(trim(funnel_key), ''), 'unknown') AS funnel_key,
  COALESCE(NULLIF(trim(campaign_name), ''), 'Unattributed') AS campaign_name,
  SUM(COALESCE(spend, 0))::numeric AS spend,
  SUM(COALESCE(leads, 0))::numeric AS leads,
  SUM(COALESCE(clicks, 0))::numeric AS clicks,
  SUM(COALESCE(impressions, 0))::numeric AS impressions
FROM public.raw_fb_ads_insights_daily
GROUP BY 1, 2, 3;

GRANT SELECT ON public.ads_spend_daily TO anon, authenticated;
