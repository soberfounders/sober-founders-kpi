# Repository + Database Simplification Audit

- generated_at: 2026-03-10T02:45:18.294Z
- head_commit: 3be2fe2
- origin_main_commit: 3be2fe2
- db_project_ref: ldnucnghzpkuixmnfjbs
- local_migrations: 40
- remote_applied_migrations: 37
- db_objects: tables=48, views=18, functions=13, policies=82, indexes=141

## 1) Unused or Deprecated Database Components

### High-confidence legacy candidates
- In live DB, not created by current migration set, and not referenced in app/query code.
- function: apply_fb_funnel_rules(p_start date, p_end date)
- function: ensure_week(p_week_start date)
- function: ingest_attendance_from_calls(p_week_start date)
- function: ingest_attendance_from_calls(p_week_start date, p_title_ilike text, p_day_key text)
- function: recompute_all(p_week_start date)
- function: recompute_week(p_week_start date)
- function: set_week_start_from_occurred_at()
- function: upsert_intro_meetings_hs(p_week_start date)
- function: week_start_est(ts timestamp with time zone)
- table: audit_log
- table: dim_funnel
- table: dim_kpi
- table: dim_week
- table: fact_attendance_event
- table: fact_kpi_weekly
- table: fact_kpi_weekly_overrides
- table: fact_kpi_weekly_versions
- table: funnel_rules
- table: manual_money_event
- table: raw_hubspot_call_logs
- table: raw_hubspot_meetings
- table: raw_hubspot_meetings_v3
- table: raw_social_weekly
- view: v_kpi_weekly_final

### Potentially unused (manual verification required)
- In live DB and not referenced by app/query code, but migration-created.
- function: hubspot_guard_stale_update()
- function: hubspot_touch_updated_at()
- function: set_updated_at()
- table: manual_donation_entries
- view: hubspot_call_contact_rows_v1
- view: hubspot_contact_identity_emails_v1
- view: vw_hubspot_contacts_est
- view: vw_hubspot_deals_est
- view: vw_hubspot_meeting_activities_est
- view: vw_hubspot_sync_health
- view: vw_seo_ai_traffic_estimate
- view: vw_seo_channel_daily
- view: vw_seo_search_performance
- view: zoom_meeting_attendee_rows_v1

### Duplicate migration definitions
- Same object created in multiple migrations (cleanup and consolidate).
- table: recovery_events -> 20260305080649_add_recovery_events_table.sql, 20260305170000_add_recovery_events_table.sql
- view: donation_transactions_unified -> 20260226194000_add_donations_module.sql, 20260302184500_expand_donations_for_zeffy_exports.sql
- view: vw_noshow_candidates -> 20260305080708_add_noshow_candidates_view.sql, 20260305170100_add_noshow_candidates_view.sql
- view: vw_seo_ai_traffic_estimate -> 20260222200000_seo_views.sql, 20260222223936_seo_views.sql
- view: vw_seo_channel_daily -> 20260222200000_seo_views.sql, 20260222223936_seo_views.sql
- view: vw_seo_opportunity_pages -> 20260222200000_seo_views.sql, 20260222223936_seo_views.sql
- view: vw_seo_organic_zoom_attendees -> 20260222200000_seo_views.sql, 20260222223936_seo_views.sql
- view: vw_seo_ranking_drops -> 20260222200000_seo_views.sql, 20260222223936_seo_views.sql
- view: vw_seo_search_performance -> 20260222200000_seo_views.sql, 20260222223936_seo_views.sql

## 2) Recommended Deletions

### Safety-first quarantine approach (no data drop on first pass)
1. Move high-confidence legacy objects from `public` to `archive` schema.
2. Run dashboard/integrity checks for at least 7 days.
3. If no regressions, permanently drop archived objects.

Exact SQL plan: `docs/data-integrity/proposed-db-cleanup.sql`

## 3) Schema Simplification Recommendations

- Promote `raw_hubspot_contacts`, `raw_hubspot_meeting_activities`, `hubspot_activity_contact_associations`, and `raw_fb_ads_insights_daily` as the only core KPI ingest tables.
- Move high-confidence legacy objects to `archive` schema first; avoid immediate drops.
- Keep qualification logic in one canonical module (`dashboard/src/lib/leadsQualificationRules.js`) and reference it from all KPI snapshots.
- Publish a single `north_star_kpi_snapshot` contract document and reject undocumented metric formulas.
- Consolidate duplicate object-creation migrations into one canonical migration per object.

## 4) Migration Cleanup Actions

- Create a consolidation migration that supersedes duplicate object definitions and marks legacy files as archived (do not delete applied history).
- Apply missing local migrations in staging, run integrity checks, then apply to production after PASS.
- Add CI check to fail when local migration versions diverge from expected production snapshot.
- Pending local migrations not applied remotely: 20260307010000, 20260308090000, 20260308101500.

## 5) Environment Configuration Issues

- warning: 10 edge functions have verify_jwt=false; validate each endpoint against explicit secret/header guards.
- warning: supabase/config.toml enables db.seed but supabase/seed.sql is missing.

## 6) Final Proposed Clean Architecture

- Layer 1 (Ingest): HubSpot/Meta raw tables with source IDs + sync timestamps + idempotency keys.
- Layer 2 (Canonical): deterministic SQL views/materialized views for leads, attendance, and spend.
- Layer 3 (Contract): dashboard reads from versioned KPI snapshot helpers with explicit date-window and timezone policy.
- Layer 4 (Integrity): scheduled reconciliation (`npm run integrity:check:strict`) with alerts on mismatch or stale sync.
- Environment split: separate secrets and project refs for local/staging/prod; no shared production credentials in local files.

## Verification Commands

```bash
npm run integrity:check
npm run integrity:check:strict
npm --prefix dashboard run test:e2e -- leads --reporter=line
npm --prefix dashboard run test:e2e -- perf-load-smoke.spec.js --reporter=line
npm --prefix dashboard run build
```

## Notes

- This audit did not execute destructive SQL against production.
- Candidate deletions require explicit approval and a rollback window.
