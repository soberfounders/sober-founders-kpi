-- =============================================================================
-- SEO Expert Dashboard Views
-- =============================================================================
-- What this file does: Creates 6 read-only SQL views that power the SEO Expert
-- dashboard module. All views are additive — no existing tables or views are
-- modified. Every view degrades gracefully with zeros if data is missing.
--
-- Data source: kpi_metrics table (google_analytics + google_search_console slugs)
--              zoom_attendee_hubspot_mappings (for organic Zoom attendee panel)
--              raw_hubspot_contacts (for traffic source attribution)
--
-- What the user sees: Six dashboard panels answering:
--   1. Is traffic growing and why?
--   2. What is the one thing to fix this week?
--   3. Are AI platforms sending people to the site?
-- =============================================================================


-- =============================================================================
-- VIEW 1: vw_seo_channel_daily
-- =============================================================================
-- What it does: Returns daily session counts split by traffic channel (Organic,
-- Paid, Direct, Referral, Social, Email, Other) along with week-over-week change.
-- Used by: Panel 1 (top metrics), Panel 2 (channel breakdown chart + table).
-- SEO logic: Knowing which channel is growing or shrinking tells the user
-- exactly where to focus attention. A shrinking Organic channel means Google
-- is sending fewer people — an urgent signal to check rankings.
-- =============================================================================
CREATE OR REPLACE VIEW public.vw_seo_channel_daily AS
WITH daily_channels AS (
  SELECT
    metric_date,
    SUM(CASE WHEN metric_name = 'GA Sessions'           THEN metric_value ELSE 0 END) AS total_sessions,
    SUM(CASE WHEN metric_name = 'GA Sessions - Organic'  THEN metric_value ELSE 0 END) AS organic,
    SUM(CASE WHEN metric_name = 'GA Sessions - Paid'     THEN metric_value ELSE 0 END) AS paid,
    SUM(CASE WHEN metric_name = 'GA Sessions - Direct'   THEN metric_value ELSE 0 END) AS direct,
    SUM(CASE WHEN metric_name = 'GA Sessions - Referral' THEN metric_value ELSE 0 END) AS referral,
    SUM(CASE WHEN metric_name = 'GA Sessions - Social'   THEN metric_value ELSE 0 END) AS social,
    SUM(CASE WHEN metric_name = 'GA Sessions - Email'    THEN metric_value ELSE 0 END) AS email,
    SUM(CASE WHEN metric_name = 'GA Sessions - Other'    THEN metric_value ELSE 0 END) AS other,
    SUM(CASE WHEN metric_name = 'GA Engaged Sessions'    THEN metric_value ELSE 0 END) AS engaged_sessions,
    AVG(CASE WHEN metric_name = 'GA Engagement Rate'     THEN metric_value ELSE NULL END) AS avg_engagement_rate
  FROM public.kpi_metrics
  WHERE source_slug = 'google_analytics'
    AND metric_name IN (
      'GA Sessions', 'GA Sessions - Organic', 'GA Sessions - Paid',
      'GA Sessions - Direct', 'GA Sessions - Referral', 'GA Sessions - Social',
      'GA Sessions - Email', 'GA Sessions - Other', 'GA Engaged Sessions',
      'GA Engagement Rate'
    )
  GROUP BY metric_date
),
-- Compute 7-day lag for week-over-week comparison
lagged AS (
  SELECT
    metric_date,
    total_sessions,
    organic,
    paid,
    direct,
    referral,
    social,
    email,
    other,
    engaged_sessions,
    avg_engagement_rate,
    LAG(total_sessions, 7) OVER (ORDER BY metric_date) AS prev_total_sessions,
    LAG(organic, 7)        OVER (ORDER BY metric_date) AS prev_organic,
    LAG(paid, 7)           OVER (ORDER BY metric_date) AS prev_paid,
    LAG(direct, 7)         OVER (ORDER BY metric_date) AS prev_direct,
    LAG(referral, 7)       OVER (ORDER BY metric_date) AS prev_referral
  FROM daily_channels
)
SELECT
  metric_date,
  COALESCE(total_sessions, 0)      AS total_sessions,
  COALESCE(organic, 0)             AS organic,
  COALESCE(paid, 0)                AS paid,
  COALESCE(direct, 0)              AS direct,
  COALESCE(referral, 0)            AS referral,
  COALESCE(social, 0)              AS social,
  COALESCE(email, 0)               AS email,
  COALESCE(other, 0)               AS other,
  COALESCE(engaged_sessions, 0)    AS engaged_sessions,
  COALESCE(avg_engagement_rate, 0) AS avg_engagement_rate,
  -- WoW deltas (NULL when prior week has no data — treated as 0 change in UI)
  COALESCE(prev_total_sessions, 0) AS prev_total_sessions,
  COALESCE(prev_organic, 0)        AS prev_organic,
  COALESCE(prev_paid, 0)           AS prev_paid,
  COALESCE(prev_direct, 0)         AS prev_direct,
  COALESCE(prev_referral, 0)       AS prev_referral,
  -- WoW pct change (NULL-safe, capped at ±500% for display reasonableness)
  CASE
    WHEN COALESCE(prev_total_sessions, 0) = 0 THEN NULL
    ELSE LEAST(5.0, GREATEST(-5.0,
      (COALESCE(total_sessions,0) - COALESCE(prev_total_sessions,0))
      / COALESCE(prev_total_sessions,0)::numeric
    ))
  END AS wow_total_pct,
  CASE
    WHEN COALESCE(prev_organic, 0) = 0 THEN NULL
    ELSE LEAST(5.0, GREATEST(-5.0,
      (COALESCE(organic,0) - COALESCE(prev_organic,0))
      / COALESCE(prev_organic,0)::numeric
    ))
  END AS wow_organic_pct
FROM lagged
ORDER BY metric_date;
-- =============================================================================
-- VIEW 2: vw_seo_ai_traffic_estimate
-- =============================================================================
-- What it does: Provides a best-effort estimate of AI-platform-referred traffic.
-- Because the GA4 sync does not store raw referrer domains (only pre-bucketed
-- channel groups like "Referral"), we cannot confirm which specific AI platform
-- sent a visitor. Instead this view returns:
--   confirmed_referral: sessions in the GA4 "Referral" bucket (includes AI)
--   possible_ai_dark:   a statistical heuristic — 5% of Direct sessions on days
--                       where Referral traffic also exists, representing visits
--                       that may have come from AI tools but arrived with no
--                       referrer header (common with ChatGPT and similar tools).
-- SEO logic: AI platforms frequently generate "dark traffic" — visits that look
-- like direct traffic because the referrer header is stripped. This is especially
-- common when users copy-paste links from AI chat interfaces. Flagging these
-- helps the user understand their true AI-visible footprint.
-- NOTE: For true per-platform AI attribution (ChatGPT vs Perplexity etc.),
-- the sync_google_analytics function would need to add a sessionSource dimension
-- query filtered to known AI domains. This view documents that limitation.
-- =============================================================================
CREATE OR REPLACE VIEW public.vw_seo_ai_traffic_estimate AS
WITH daily AS (
  SELECT
    metric_date,
    SUM(CASE WHEN metric_name = 'GA Sessions - Referral' THEN metric_value ELSE 0 END) AS referral_sessions,
    SUM(CASE WHEN metric_name = 'GA Sessions - Direct'   THEN metric_value ELSE 0 END) AS direct_sessions
  FROM public.kpi_metrics
  WHERE source_slug = 'google_analytics'
    AND metric_name IN ('GA Sessions - Referral', 'GA Sessions - Direct')
  GROUP BY metric_date
),
with_dark AS (
  SELECT
    metric_date,
    COALESCE(referral_sessions, 0) AS confirmed_referral,
    -- Dark traffic heuristic: only applied on days where referral > 0
    CASE
      WHEN COALESCE(referral_sessions, 0) > 0
        THEN ROUND(COALESCE(direct_sessions, 0) * 0.05)
      ELSE 0
    END AS possible_ai_dark,
    COALESCE(direct_sessions, 0) AS direct_sessions,
    -- 7-day WoW for referral trend
    LAG(COALESCE(referral_sessions, 0), 7) OVER (ORDER BY metric_date) AS prev_referral
  FROM daily
)
SELECT
  metric_date,
  confirmed_referral,
  possible_ai_dark,
  direct_sessions,
  COALESCE(confirmed_referral + possible_ai_dark, 0) AS total_estimated_ai,
  COALESCE(prev_referral, 0) AS prev_referral,
  CASE
    WHEN COALESCE(prev_referral, 0) = 0 THEN NULL
    ELSE LEAST(5.0, GREATEST(-5.0,
      (confirmed_referral - COALESCE(prev_referral, 0))
      / COALESCE(prev_referral, 0)::numeric
    ))
  END AS wow_referral_pct
FROM with_dark
ORDER BY metric_date;
-- =============================================================================
-- VIEW 3: vw_seo_search_performance
-- =============================================================================
-- What it does: Pulls Google Search Console keyword and page performance data.
-- Returns one row per query/page combination with clicks, impressions, CTR,
-- and average position. Includes a derived "opportunity_type" classification.
-- Used by: Panel 4 (top searches + quick wins tables).
-- SEO logic: Clicks show real traffic. Impressions show visibility potential.
-- CTR is the leverage point — a page with 1,000 impressions and 1% CTR is
-- leaving 20–30 additional clicks on the table if the title/description is fixed.
-- Position shows where Google ranks the page — spots 1–10 are page 1 of results.
-- =============================================================================
CREATE OR REPLACE VIEW public.vw_seo_search_performance AS
WITH keyword_snapshot AS (
  -- GSC keyword rows are stored as range aggregates (not daily), all at the
  -- same metric_date (the sync end date). We take the most recent snapshot.
  SELECT
    MAX(metric_date) AS snapshot_date
  FROM public.kpi_metrics
  WHERE source_slug = 'google_search_console'
    AND metric_name = 'GSC Keyword Clicks'
),
keywords AS (
  SELECT
    m.metadata->>'query'  AS query,
    m.metadata->>'page'   AS page,
    MAX(CASE WHEN m.metric_name = 'GSC Keyword Clicks'       THEN m.metric_value ELSE 0 END) AS clicks,
    MAX(CASE WHEN m.metric_name = 'GSC Keyword Impressions'  THEN m.metric_value ELSE 0 END) AS impressions,
    MAX(CASE WHEN m.metric_name = 'GSC Keyword CTR'          THEN m.metric_value ELSE 0 END) AS ctr,
    MAX(CASE WHEN m.metric_name = 'GSC Keyword Position'     THEN m.metric_value ELSE 0 END) AS avg_position
  FROM public.kpi_metrics m
  INNER JOIN keyword_snapshot ks ON m.metric_date = ks.snapshot_date
  WHERE m.source_slug = 'google_search_console'
    AND m.metric_name IN (
      'GSC Keyword Clicks', 'GSC Keyword Impressions',
      'GSC Keyword CTR', 'GSC Keyword Position'
    )
    AND m.metadata->>'query' IS NOT NULL
    AND m.metadata->>'query' <> ''
  GROUP BY m.metadata->>'query', m.metadata->>'page'
)
SELECT
  query,
  page,
  COALESCE(clicks, 0)       AS clicks,
  COALESCE(impressions, 0)  AS impressions,
  COALESCE(ctr, 0)          AS ctr,
  COALESCE(avg_position, 0) AS avg_position,
  -- opportunity_type: plain-English classification of where the SEO opportunity lies
  CASE
    WHEN COALESCE(impressions, 0) >= 300 AND COALESCE(ctr, 0) < 0.03
      THEN 'high_impressions_low_ctr'
    WHEN COALESCE(avg_position, 0) BETWEEN 5 AND 20
      THEN 'page_two_potential'
    WHEN COALESCE(avg_position, 0) BETWEEN 1 AND 4 AND COALESCE(impressions, 0) > 100
      THEN 'top_performer'
    ELSE 'other'
  END AS opportunity_type,
  -- Human-readable one-line action for the dashboard
  CASE
    WHEN COALESCE(impressions, 0) >= 300 AND COALESCE(ctr, 0) < 0.03
      THEN 'Your site appears often but few people click. Try rewriting the page title to be more specific and compelling.'
    WHEN COALESCE(avg_position, 0) BETWEEN 5 AND 20
      THEN 'You almost rank on page 1. Improving or expanding this page content could push it into the top results.'
    WHEN COALESCE(avg_position, 0) BETWEEN 1 AND 4 AND COALESCE(impressions, 0) > 100
      THEN 'This is performing well. Keep this page updated and consider writing related content nearby.'
    ELSE 'Monitor this query for trend changes.'
  END AS recommended_action,
  -- impact score: used for sorting in the action plan (higher = do first)
  CASE
    WHEN COALESCE(impressions, 0) >= 300 AND COALESCE(ctr, 0) < 0.03
      THEN ROUND(COALESCE(impressions, 0) * (0.05 - COALESCE(ctr, 0)))
    WHEN COALESCE(avg_position, 0) BETWEEN 5 AND 15
      THEN ROUND(COALESCE(impressions, 0) / GREATEST(COALESCE(avg_position, 1), 1))
    ELSE 0
  END AS impact_score,
  -- impact label for display
  CASE
    WHEN COALESCE(impressions, 0) >= 300 AND COALESCE(ctr, 0) < 0.03 THEN 'High'
    WHEN COALESCE(avg_position, 0) BETWEEN 5 AND 15               THEN 'High'
    WHEN COALESCE(avg_position, 0) BETWEEN 15 AND 20              THEN 'Medium'
    ELSE 'Low'
  END AS impact_label,
  -- title_tag and meta_description: left NULL — no crawl data available yet
  NULL::text AS title_tag,
  NULL::text AS meta_description
FROM keywords
WHERE COALESCE(impressions, 0) > 0
ORDER BY clicks DESC, impressions DESC;
-- =============================================================================
-- VIEW 4: vw_seo_opportunity_pages
-- =============================================================================
-- What it does: Filters vw_seo_search_performance to the highest-leverage rows:
-- pages where a small improvement in CTR or ranking would produce meaningful
-- traffic gains. The threshold logic:
--   - impressions > 300 AND CTR < 3%: You're visible but not compelling enough
--   - position between 5 and 20: You're close to page 1 — a content refresh
--     could push you over
-- Used by: Panel 4 Quick Wins, Panel 6 Action Plan.
-- SEO logic: These are the easiest wins in SEO. Pages already indexed and
-- receiving impressions just need better copy or slightly more content to
-- dramatically increase traffic without building new links.
-- =============================================================================
CREATE OR REPLACE VIEW public.vw_seo_opportunity_pages AS
SELECT
  query,
  page,
  clicks,
  impressions,
  ctr,
  avg_position,
  recommended_action,
  impact_score,
  impact_label,
  title_tag,
  meta_description
FROM public.vw_seo_search_performance
WHERE
  (impressions >= 300 AND ctr < 0.03)
  OR (avg_position BETWEEN 5 AND 20 AND impressions >= 80)
ORDER BY impact_score DESC, impressions DESC;
-- =============================================================================
-- VIEW 5: vw_seo_ranking_drops
-- =============================================================================
-- What it does: Identifies queries where Google rankings have declined. Because
-- GSC keyword data is stored as a single rolling-period snapshot (not daily),
-- we use a high-position proxy: any query with avg_position > 15 AND impressions
-- > 200 is a concern — it means Google sees the page as relevant (high
-- impressions) but isn't ranking it well (position > 15 = page 2+).
-- Over time, as multiple snapshots accumulate, this view can be extended to
-- compare position drift across snapshot dates.
-- Used by: Panel 5 (Urgent Issues).
-- SEO logic: A page dropping from position 6 to position 14 typically loses
-- 60–70% of its traffic because most Google users never scroll past the first
-- few results. Flagging drops early lets the user take corrective action before
-- the traffic loss becomes severe.
-- =============================================================================
CREATE OR REPLACE VIEW public.vw_seo_ranking_drops AS
SELECT
  query,
  page,
  clicks,
  impressions,
  ctr,
  avg_position,
  -- Urgency classification
  CASE
    WHEN avg_position > 20 AND impressions > 300 THEN 'critical'
    WHEN avg_position > 15 AND impressions > 200 THEN 'warning'
    ELSE 'monitor'
  END AS urgency,
  -- Plain-English explanation for non-technical users
  CASE
    WHEN avg_position > 20 AND impressions > 300
      THEN 'This search term shows your site to many people, but your page is ranked on page 3 or beyond — almost no one will see it. This page needs attention urgently.'
    WHEN avg_position > 15 AND impressions > 200
      THEN 'Your site appears in searches for this term, but it ranks on page 2. Improving the page content could move it to page 1 and significantly increase traffic.'
    ELSE 'Monitor this term for further changes.'
  END AS plain_english_explanation
FROM public.vw_seo_search_performance
WHERE
  (avg_position > 15 AND impressions > 200)
  OR (avg_position > 20 AND impressions > 100)
ORDER BY impressions DESC, avg_position DESC;
-- =============================================================================
-- VIEW 6: vw_seo_organic_zoom_attendees
-- =============================================================================
-- What it does: Identifies Zoom meeting attendees whose HubSpot contact record
-- shows they originally found Sober Founders through organic search (Google).
-- Joins zoom_attendee_hubspot_mappings → raw_hubspot_contacts and filters
-- for organic traffic source fields.
-- Used by: The "Organic Traffic → Zoom Attendees" bonus panel in the SEO tab.
-- SEO logic: This closes the loop between SEO investment and real business
-- outcomes. When a Zoom attendee can be traced back to Google organic search,
-- it proves that SEO is directly driving community engagement and potential
-- revenue — the most important metric the user cares about.
-- =============================================================================
CREATE OR REPLACE VIEW public.vw_seo_organic_zoom_attendees AS
SELECT
  m.zoom_attendee_canonical_name    AS attendee_name,
  m.hubspot_email                   AS email,
  m.session_date,
  m.group_name                      AS meeting_name,
  m.zoom_session_key,
  -- Traffic source details from HubSpot contact record
  c.hs_analytics_source             AS hs_analytics_source,
  c.original_traffic_source         AS original_traffic_source,
  c.campaign                        AS campaign,
  c.campaign_source                 AS campaign_source,
  -- Derive a simple label for display
  CASE
    WHEN LOWER(COALESCE(c.original_traffic_source, '')) LIKE '%organic%'
      THEN 'Organic Search'
    WHEN LOWER(COALESCE(c.hs_analytics_source, '')) LIKE '%organic%'
      THEN 'Organic Search'
    WHEN LOWER(COALESCE(c.original_traffic_source, '')) LIKE '%social%'
      THEN 'Social Media'
    ELSE COALESCE(c.hs_analytics_source, c.original_traffic_source, 'Unknown')
  END AS traffic_source_label,
  m.hubspot_contact_id,
  m.mapping_confidence
FROM public.zoom_attendee_hubspot_mappings m
LEFT JOIN LATERAL (
  -- Get the most recently ingested record for this contact
  SELECT
    hs_analytics_source,
    original_traffic_source,
    campaign,
    campaign_source
  FROM public.raw_hubspot_contacts
  WHERE hubspot_contact_id = m.hubspot_contact_id
  ORDER BY ingested_at DESC
  LIMIT 1
) c ON TRUE
WHERE
  m.hubspot_contact_id IS NOT NULL
  AND (
    LOWER(COALESCE(c.original_traffic_source, '')) LIKE '%organic%'
    OR LOWER(COALESCE(c.hs_analytics_source, '')) LIKE '%organic%'
    OR LOWER(COALESCE(c.hs_analytics_source, '')) LIKE '%google%'
  )
ORDER BY m.session_date DESC, m.zoom_attendee_canonical_name;
