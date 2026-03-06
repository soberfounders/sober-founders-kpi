-- Compatibility view for legacy SQL that expects public.ads_spend_daily.
-- Primary source is raw_fb_ads_insights_daily when available.
-- If the source table has not been created yet, expose an empty typed view
-- so dependent queries fail gracefully with empty results rather than relation-not-found.

DO $$
BEGIN
  IF to_regclass('public.raw_fb_ads_insights_daily') IS NOT NULL THEN
    EXECUTE $view$
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
      GROUP BY 1, 2, 3
    $view$;
  ELSE
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.ads_spend_daily AS
      SELECT
        NULL::date AS metric_date,
        NULL::text AS funnel_key,
        NULL::text AS campaign_name,
        NULL::numeric AS spend,
        NULL::numeric AS leads,
        NULL::numeric AS clicks,
        NULL::numeric AS impressions
      WHERE false
    $view$;
  END IF;
END
$$;

GRANT SELECT ON public.ads_spend_daily TO anon, authenticated;
