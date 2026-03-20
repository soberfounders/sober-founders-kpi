# Unified Metrics Layer - Architecture Reference

## Status: Phase 4 Complete (Schema + Seeds + Compute Engine + Slack Bot + Dashboard)

## Problem

Dashboard and Slack bot both compute metrics independently from raw tables.
This creates inconsistent numbers, duplicated logic, and no shared strategic context.

## Solution: 4-Layer Architecture

```
Layer 1: Raw Ingestion (existing, unchanged)
  raw_hubspot_contacts, raw_fb_ads_insights_daily, etc.

Layer 2: Identity & Enrichment (existing, unchanged)
  zoom_identities, attendee_aliases, lead_qualification_overrides, etc.

Layer 3: Metric Computation (NEW)
  compute-metrics edge function -> fact_kpi_daily -> views
  initiatives table for strategic decisions

Layer 4: Consumption (dashboard + Slack bot read from views)
  vw_kpi_latest, vw_kpi_trend, vw_metric_catalog
```

## Key Tables

| Table | Purpose | Status |
|-------|---------|--------|
| `dim_kpi` | Metric registry (extended with unit, domain, source_tables, etc.) | Extended |
| `fact_kpi_daily` | Daily metric values written by compute-metrics | Created |
| `initiatives` | Strategic decisions captured from Slack | Created |
| `kpi_goals` | Target values per metric | Existing |

## Key Views

| View | Purpose | Status |
|------|---------|--------|
| `vw_kpi_latest` | Most recent value per metric + funnel | Created |
| `vw_metric_catalog` | Self-documenting metric catalog | Created |
| `vw_kpi_trend` | Rolling 8-week stats, WoW, goal status | Existing (reads from fact_kpi_weekly) |

## Canonical Metric Keys

### Leads Domain
- `leads_created` - New HubSpot contacts (non-deleted, non-merged)
- `qualified_leads_created` - Revenue >= $250k AND sobriety > 1 year
- `phoenix_qualified_leads` - Revenue >= $1M AND sobriety > 1 year
- `interviews_completed` - HubSpot meetings matching interview patterns
- `phoenix_paid_members` - Active contacts with Paid Groups membership
- `great_leads` - Revenue >= $1M (no sobriety gate)
- `ad_spend` - Total Meta ad spend
- `ad_leads` - Meta ad lead-form submissions
- `cpl` - Ad spend / leads (composite)
- `cpql` - Ad spend / qualified leads (composite, per funnel)
- `cpgl` - Ad spend / great leads (composite, per funnel)

### Attendance Domain
- `attendance_sessions` - Total attendee-session records
- `unique_attendees` - Deduplicated unique people
- `new_attendees` - First-time attendees
- `attendance_total` - Total per day type (tuesday/thursday funnel_key)
- `attendance_new` - New attendees per day type
- `attendance_repeat` - Repeat attendees per day type
- `repeat_rate_tuesday` - Tuesday repeat attendance ratio
- `repeat_rate_thursday` - Thursday repeat attendance ratio
- `retention_14d` / `retention_30d` - Cohort return rates

### Donations Domain
- `donations_total` - Sum of donation amounts
- `donations_count` - Number of donation transactions
- `active_donors` - Unique donors in window
- `recurring_revenue` - Recurring donation amount

### Email Domain
- `email_open_rate` - Mailchimp human_open_rate average
- `email_click_rate` - Mailchimp CTR average

### SEO Domain
- `seo_organic_sessions` - GA4 organic sessions

### Operations Domain
- `sync_errors` - HubSpot sync error count
- `sync_freshness_minutes` - Minutes since last sync
- `completed_items` - Notion tasks completed in window

### Outreach Domain
- `outreach_sent` - Recovery emails delivered
- `outreach_conversion_rate` - Outreach return rate

## Funnel Keys

Each metric can be split by funnel:
- `all` - Combined across all funnels (default)
- `free` - Free group funnel
- `phoenix` - Phoenix Forum funnel
- `tuesday` / `thursday` - Day-specific attendance

## Initiatives Lifecycle

```
proposed -> approved -> active -> completed | cancelled
```

Fields: initiative_name, source, source_ref (Slack thread), status,
owner, domain, expected_impact, linked_metrics, target_date, outcome_notes.

## Migration Plan

- Phase 1: Schema + seeds (this migration) - DONE
- Phase 2: compute-metrics edge function (backfill + daily cron) - DONE
- Phase 3: Slack bot reads from views (replace trends.ts aggregates) - DONE
- Phase 4: Dashboard KPI cards read from fact_kpi_daily - DONE
- Phase 5: Cleanup dead calculation code from raw-table pipeline
- Phase 6: Add experiment/initiative-linked metrics

## Qualification Rules (for compute-metrics)

Three independent systems - all must be implemented:

1. Revenue Tier (sobriety irrelevant):
   - Bad: < $100k, OK: $100k-$249k, Good: $250k-$999k, Great: >= $1M

2. $250k Qualified (binary):
   - Revenue >= $250k AND sobriety strictly > 1 year

3. Phoenix Qualified (binary):
   - Revenue >= $1M AND sobriety strictly > 1 year

Canonical source: dashboard/src/lib/leadsQualificationRules.js
