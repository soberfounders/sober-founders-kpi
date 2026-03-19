/* ============================================================
   Unified Metrics Layer - Phase 1
   ============================================================
   Creates the centralized metric computation infrastructure:
   1. Extends dim_kpi with metadata columns
   2. Creates fact_kpi_daily for daily metric snapshots
   3. Creates initiatives table for strategic decision tracking
   4. Creates vw_kpi_latest and vw_metric_catalog views
   5. Seeds dim_kpi with canonical metric definitions
   6. Updates kpi_goals to match canonical keys
   ============================================================ */

-- ============================================================
-- 1. Extend dim_kpi with metadata columns
-- ============================================================
-- dim_kpi exists in production (created outside migrations).
-- Known columns: kpi_key (PK), name.
-- We add columns safely with IF NOT EXISTS.

ALTER TABLE public.dim_kpi
  ADD COLUMN IF NOT EXISTS unit              text,
  ADD COLUMN IF NOT EXISTS domain            text,
  ADD COLUMN IF NOT EXISTS granularity       text DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS higher_is_better  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS description       text,
  ADD COLUMN IF NOT EXISTS source_tables     text[],
  ADD COLUMN IF NOT EXISTS computation       text DEFAULT 'edge_function',
  ADD COLUMN IF NOT EXISTS created_at        timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

-- ============================================================
-- 2. Create fact_kpi_daily
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fact_kpi_daily (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metric_date         date         NOT NULL,
  kpi_key             text         NOT NULL,
  funnel_key          text         NOT NULL DEFAULT 'all',
  value               numeric,
  computed_at         timestamptz  NOT NULL DEFAULT now(),
  computation_source  text         NOT NULL DEFAULT 'compute-metrics',
  metadata            jsonb,

  CONSTRAINT fact_kpi_daily_unique UNIQUE (metric_date, kpi_key, funnel_key)
);

ALTER TABLE public.fact_kpi_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fact_kpi_daily_select_all"
  ON public.fact_kpi_daily FOR SELECT USING (true);
CREATE POLICY "fact_kpi_daily_service_insert"
  ON public.fact_kpi_daily FOR INSERT
  TO service_role WITH CHECK (true);
CREATE POLICY "fact_kpi_daily_service_update"
  ON public.fact_kpi_daily FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "fact_kpi_daily_service_delete"
  ON public.fact_kpi_daily FOR DELETE
  TO service_role USING (true);

CREATE INDEX IF NOT EXISTS idx_fkd_date_key
  ON public.fact_kpi_daily (metric_date DESC, kpi_key);
CREATE INDEX IF NOT EXISTS idx_fkd_key_funnel
  ON public.fact_kpi_daily (kpi_key, funnel_key, metric_date DESC);

-- ============================================================
-- 3. Create initiatives table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.initiatives (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  initiative_name       text         NOT NULL,
  description           text,
  source                text         NOT NULL DEFAULT 'slack',
  source_ref            jsonb,
  status                text         NOT NULL DEFAULT 'proposed',
  owner                 text,
  domain                text,
  expected_impact       jsonb,
  linked_metrics        text[],
  linked_experiment_id  bigint,
  started_at            timestamptz,
  target_date           date,
  completed_at          timestamptz,
  outcome_notes         text,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  created_by            text         NOT NULL DEFAULT 'system'
);

ALTER TABLE public.initiatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "initiatives_select_all"
  ON public.initiatives FOR SELECT USING (true);
CREATE POLICY "initiatives_service_insert"
  ON public.initiatives FOR INSERT
  TO service_role WITH CHECK (true);
CREATE POLICY "initiatives_service_update"
  ON public.initiatives FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "initiatives_service_delete"
  ON public.initiatives FOR DELETE
  TO service_role USING (true);

-- Also allow anon/authenticated to insert (Slack bot uses anon key)
CREATE POLICY "initiatives_anon_insert"
  ON public.initiatives FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "initiatives_anon_update"
  ON public.initiatives FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_init_status
  ON public.initiatives (status) WHERE status IN ('proposed', 'approved', 'active');
CREATE INDEX IF NOT EXISTS idx_init_domain
  ON public.initiatives (domain);

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS initiatives_set_updated_at ON public.initiatives;
CREATE TRIGGER initiatives_set_updated_at
  BEFORE UPDATE ON public.initiatives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. Seed dim_kpi with canonical metric definitions
-- ============================================================
-- Uses ON CONFLICT to safely upsert: update metadata if key exists,
-- insert if it doesn't. This preserves existing FK references from kpi_goals.

INSERT INTO public.dim_kpi (kpi_key, name, unit, domain, granularity, higher_is_better, description, source_tables, computation)
VALUES
  -- === LEADS DOMAIN ===
  ('leads_created',              'Leads Created',              'count', 'leads',      'daily', true,  'New HubSpot contacts created (non-deleted, non-merged)',                         ARRAY['raw_hubspot_contacts'], 'edge_function'),
  ('qualified_leads_created',    'Qualified Leads ($250k+)',   'count', 'leads',      'daily', true,  'Leads with revenue >= $250k AND sobriety > 1 year',                             ARRAY['raw_hubspot_contacts'], 'edge_function'),
  ('phoenix_qualified_leads',    'Phoenix Qualified ($1M+)',   'count', 'leads',      'daily', true,  'Leads with revenue >= $1M AND sobriety > 1 year',                               ARRAY['raw_hubspot_contacts'], 'edge_function'),
  ('interviews_completed',       'Interviews Completed',       'count', 'leads',      'daily', true,  'HubSpot meeting activities matching interview title patterns',                   ARRAY['raw_hubspot_meeting_activities', 'hubspot_activity_contact_associations'], 'edge_function'),
  ('phoenix_paid_members',       'Phoenix Paid Members',       'count', 'leads',      'daily', true,  'Active contacts with membership_s ILIKE Paid Groups (all-time snapshot)',        ARRAY['raw_hubspot_contacts'], 'edge_function'),
  ('ad_spend',                   'Ad Spend',                   'usd',   'leads',      'daily', false, 'Total Meta/Facebook ad spend',                                                  ARRAY['raw_fb_ads_insights_daily'], 'edge_function'),
  ('cpl',                        'Cost Per Lead',              'usd',   'leads',      'daily', false, 'Ad spend / leads created',                                                      ARRAY['raw_fb_ads_insights_daily', 'raw_hubspot_contacts'], 'composite'),
  ('cpql',                       'Cost Per Qualified Lead',    'usd',   'leads',      'daily', false, 'Ad spend / qualified leads created',                                            ARRAY['raw_fb_ads_insights_daily', 'raw_hubspot_contacts'], 'composite'),
  ('cpgl',                       'Cost Per Good Lead ($1M+)',  'usd',   'leads',      'daily', false, 'Ad spend / Phoenix-qualified leads',                                            ARRAY['raw_fb_ads_insights_daily', 'raw_hubspot_contacts'], 'composite'),

  -- === ATTENDANCE DOMAIN ===
  ('attendance_sessions',        'Attendance Sessions',         'count', 'attendance', 'daily', true,  'Total attendee-session records across Tuesday + Thursday group calls',           ARRAY['raw_hubspot_meeting_activities', 'hubspot_activity_contact_associations'], 'edge_function'),
  ('unique_attendees',           'Unique Attendees',            'count', 'attendance', 'daily', true,  'Deduplicated unique people attending group sessions',                            ARRAY['raw_hubspot_meeting_activities', 'hubspot_activity_contact_associations'], 'edge_function'),
  ('new_attendees',              'New Attendees',               'count', 'attendance', 'daily', true,  'First-time group meeting attendees',                                            ARRAY['raw_hubspot_meeting_activities', 'hubspot_activity_contact_associations'], 'edge_function'),
  ('repeat_rate_tuesday',        'Tuesday Repeat Rate',         'ratio', 'attendance', 'daily', true,  'Ratio of Tuesday attendees who attended 2+ sessions in window',                  ARRAY['raw_hubspot_meeting_activities', 'hubspot_activity_contact_associations'], 'edge_function'),
  ('repeat_rate_thursday',       'Thursday Repeat Rate',        'ratio', 'attendance', 'daily', true,  'Ratio of Thursday attendees who attended 2+ sessions in window',                 ARRAY['raw_hubspot_meeting_activities', 'hubspot_activity_contact_associations'], 'edge_function'),
  ('retention_14d',              '14-Day Return Rate',          'ratio', 'attendance', 'daily', true,  'Pct of first-time attendees who returned within 14 days',                       ARRAY['vw_baseline_retention'], 'sql_view'),
  ('retention_30d',              '30-Day Return Rate',          'ratio', 'attendance', 'daily', true,  'Pct of first-time attendees who returned within 30 days',                       ARRAY['vw_baseline_retention'], 'sql_view'),

  -- === DONATIONS DOMAIN ===
  ('donations_total',            'Donations Total',             'usd',   'donations',  'daily', true,  'Sum of donation_transactions_unified amounts',                                  ARRAY['donation_transactions_unified'], 'edge_function'),
  ('active_donors',              'Active Donors',               'count', 'donations',  'daily', true,  'Unique donors with transactions in window',                                     ARRAY['donation_transactions_unified'], 'edge_function'),
  ('recurring_revenue',          'Recurring Donation Revenue',  'usd',   'donations',  'daily', true,  'Sum of recurring donation amounts in window',                                   ARRAY['donation_transactions_unified'], 'edge_function'),

  -- === EMAIL DOMAIN ===
  ('email_open_rate',            'Email Open Rate',             'ratio', 'email',      'daily', true,  'Average Mailchimp campaign human_open_rate',                                    ARRAY['mailchimp_campaigns'], 'edge_function'),
  ('email_click_rate',           'Email Click Rate',            'ratio', 'email',      'daily', true,  'Average Mailchimp campaign click-through rate',                                 ARRAY['mailchimp_campaigns'], 'edge_function'),

  -- === SEO DOMAIN ===
  ('seo_organic_sessions',       'Organic Sessions',            'count', 'seo',        'daily', true,  'Total organic search sessions from GA4',                                        ARRAY['vw_seo_channel_daily'], 'edge_function'),

  -- === OPERATIONS DOMAIN ===
  ('sync_errors',                'Sync Errors',                 'count', 'operations', 'daily', false, 'Count of HubSpot sync error records',                                          ARRAY['hubspot_sync_errors'], 'edge_function'),
  ('sync_freshness_minutes',     'Sync Freshness',              'minutes','operations', 'daily', false, 'Minutes since last successful HubSpot sync',                                   ARRAY['vw_hubspot_sync_health_observability'], 'edge_function'),

  -- === OUTREACH DOMAIN ===
  ('outreach_sent',              'Outreach Emails Sent',        'count', 'outreach',   'daily', true,  'Recovery/retention outreach emails delivered',                                  ARRAY['recovery_events'], 'edge_function'),
  ('outreach_conversion_rate',   'Outreach Conversion Rate',    'ratio', 'outreach',   'daily', true,  'Pct of outreach recipients who returned to a session',                          ARRAY['vw_outreach_conversions'], 'edge_function'),

  -- === LEGACY KEYS (preserve for existing kpi_goals FK references) ===
  ('showup_tue_total',           'Tuesday Headcount',           'count', 'attendance', 'weekly', true,  'Tuesday meeting weekly headcount (legacy key)',                                 ARRAY['raw_hubspot_meeting_activities'], 'edge_function'),
  ('showup_thu_total',           'Thursday Headcount',          'count', 'attendance', 'weekly', true,  'Thursday meeting weekly headcount (legacy key)',                                ARRAY['raw_hubspot_meeting_activities'], 'edge_function'),
  ('new_tue',                    'New Tuesday Attendees',       'count', 'attendance', 'weekly', true,  'First-time Tuesday attendees per week (legacy key)',                            ARRAY['raw_hubspot_meeting_activities'], 'edge_function'),
  ('new_thu',                    'New Thursday Attendees',      'count', 'attendance', 'weekly', true,  'First-time Thursday attendees per week (legacy key)',                           ARRAY['raw_hubspot_meeting_activities'], 'edge_function'),
  ('total_new_show_calculated',  'Total New Attendees',         'count', 'attendance', 'weekly', true,  'Total new attendees across both meetings (legacy key)',                         ARRAY['raw_hubspot_meeting_activities'], 'edge_function'),
  ('hs_contacts_created',        'HubSpot Contacts Created',   'count', 'leads',      'weekly', true,  'New HubSpot contacts per week (legacy key)',                                   ARRAY['raw_hubspot_contacts'], 'edge_function'),
  ('hs_contacts_qualified_created','Qualified Contacts Created','count', 'leads',      'weekly', true,  'Contacts >$250k revenue per week (legacy key)',                                ARRAY['raw_hubspot_contacts'], 'edge_function'),
  ('paid_leads_free',            'Paid Leads (Free)',           'count', 'leads',      'weekly', true,  'Paid leads from free funnel per week (legacy key)',                             ARRAY['raw_hubspot_contacts', 'raw_fb_ads_insights_daily'], 'edge_function'),
  ('paid_qualified_leads_free',  'Paid Qualified (Free)',       'count', 'leads',      'weekly', true,  'Paid qualified leads from free funnel (legacy key)',                            ARRAY['raw_hubspot_contacts', 'raw_fb_ads_insights_daily'], 'edge_function'),
  ('paid_leads_phoenix',         'Paid Leads (Phoenix)',        'count', 'leads',      'weekly', true,  'Paid leads from Phoenix funnel per week (legacy key)',                          ARRAY['raw_hubspot_contacts', 'raw_fb_ads_insights_daily'], 'edge_function'),
  ('paid_qualified_leads_phoenix','Paid Qualified (Phoenix)',   'count', 'leads',      'weekly', true,  'Paid qualified leads from Phoenix funnel (legacy key)',                         ARRAY['raw_hubspot_contacts', 'raw_fb_ads_insights_daily'], 'edge_function'),
  ('leads_great_>=1m',           'Great Leads ($1M+)',          'count', 'leads',      'weekly', true,  'New $1M+ revenue leads per week (legacy key)',                                 ARRAY['raw_hubspot_contacts'], 'edge_function'),
  ('leads_good_250k_1m',         'Good Leads ($250k-$1M)',     'count', 'leads',      'weekly', true,  'New $250k-$1M revenue leads per week (legacy key)',                            ARRAY['raw_hubspot_contacts'], 'edge_function'),
  ('phoenix_calls_booked',       'Phoenix Calls Booked',       'count', 'leads',      'weekly', true,  'Discovery calls booked per week (legacy key)',                                  ARRAY['raw_hubspot_meeting_activities'], 'edge_function'),
  ('phoenix_interviews_booked',  'Phoenix Interviews Booked',  'count', 'leads',      'weekly', true,  'Phoenix interviews booked per week (legacy key)',                               ARRAY['raw_hubspot_meeting_activities'], 'edge_function'),
  ('phoenix_new_members',        'Phoenix New Members',        'count', 'leads',      'weekly', true,  'New paying Phoenix members per week (legacy key)',                              ARRAY['raw_hubspot_contacts'], 'edge_function'),
  ('intro_meetings_hs',          'Intro Meetings',             'count', 'leads',      'weekly', true,  'HubSpot-logged intro meetings per week (legacy key)',                           ARRAY['raw_hubspot_meeting_activities'], 'edge_function'),
  ('ad_cost_per_paid_lead',      'CPL (Ad)',                   'usd',   'leads',      'weekly', false, 'Target CPL for ad-attributed leads (legacy key)',                               ARRAY['raw_fb_ads_insights_daily', 'raw_hubspot_contacts'], 'composite'),
  ('ad_cost_per_qualified_lead', 'CPQL (Ad)',                  'usd',   'leads',      'weekly', false, 'Target CPQL for ad-attributed leads (legacy key)',                              ARRAY['raw_fb_ads_insights_daily', 'raw_hubspot_contacts'], 'composite'),
  ('ad_cost_per_new_showup_free','Cost Per New Show-up',       'usd',   'leads',      'weekly', false, 'Cost per new free show-up (legacy key)',                                        ARRAY['raw_fb_ads_insights_daily', 'raw_hubspot_meeting_activities'], 'composite')
ON CONFLICT (kpi_key) DO UPDATE SET
  name            = EXCLUDED.name,
  unit            = EXCLUDED.unit,
  domain          = EXCLUDED.domain,
  granularity     = EXCLUDED.granularity,
  higher_is_better = EXCLUDED.higher_is_better,
  description     = EXCLUDED.description,
  source_tables   = EXCLUDED.source_tables,
  computation     = EXCLUDED.computation,
  updated_at      = now();

-- ============================================================
-- 5. Create vw_kpi_latest view
-- ============================================================
-- Returns the most recent value for each metric + funnel combination.
-- Both dashboard KPI cards and Slack bot snapshots read from this.

CREATE OR REPLACE VIEW public.vw_kpi_latest AS
SELECT DISTINCT ON (f.kpi_key, f.funnel_key)
  f.kpi_key,
  f.funnel_key,
  d.name            AS kpi_name,
  d.unit,
  d.domain,
  d.higher_is_better,
  d.description,
  f.metric_date,
  f.value,
  f.computed_at,
  f.computation_source,
  f.metadata
FROM public.fact_kpi_daily f
JOIN public.dim_kpi d ON d.kpi_key = f.kpi_key
ORDER BY f.kpi_key, f.funnel_key, f.metric_date DESC;

-- ============================================================
-- 6. Create vw_metric_catalog view
-- ============================================================
-- Self-documenting catalog of every available metric.
-- Slack bot list_metrics reads from this instead of hardcoded arrays.

CREATE OR REPLACE VIEW public.vw_metric_catalog AS
SELECT
  d.kpi_key,
  d.name,
  d.description,
  d.unit,
  d.domain,
  d.granularity,
  d.higher_is_better,
  d.source_tables,
  d.computation,
  latest.value         AS latest_value,
  latest.metric_date   AS latest_date,
  latest.computed_at   AS latest_computed_at,
  g.target_value       AS goal_value,
  g.notes              AS goal_notes
FROM public.dim_kpi d
LEFT JOIN public.vw_kpi_latest latest
  ON  latest.kpi_key    = d.kpi_key
  AND latest.funnel_key = 'all'
LEFT JOIN public.kpi_goals g
  ON  g.kpi_key    = d.kpi_key
  AND g.funnel_key = 'all'
WHERE d.granularity = 'daily'
ORDER BY d.domain, d.name;
