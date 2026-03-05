-- Optimize hot analytics query paths with minimal-risk btree indexes.
-- Based on observed dashboard/function filters and advisor findings.

CREATE INDEX IF NOT EXISTS idx_kpi_metrics_source_metric_date
  ON public.kpi_metrics (source_slug, metric_name, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_kpi_metrics_user_id
  ON public.kpi_metrics (user_id);

CREATE INDEX IF NOT EXISTS idx_raw_hs_activities_type_timestamp
  ON public.raw_hubspot_meeting_activities (activity_type, hs_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_raw_hubspot_meeting_activities_created_at
  ON public.raw_hubspot_meeting_activities (created_at_hubspot DESC)
  WHERE created_at_hubspot IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_briefings_created_at
  ON public.ai_briefings (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_raw_fb_ads_funnel_key_date
  ON public.raw_fb_ads_insights_daily (funnel_key, date_day DESC);

CREATE INDEX IF NOT EXISTS idx_fb_funnel_rules_funnel_key
  ON public.fb_funnel_rules (funnel_key);

CREATE INDEX IF NOT EXISTS idx_funnel_rules_funnel_key
  ON public.funnel_rules (funnel_key);
