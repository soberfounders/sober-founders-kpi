# KPI Data Integrity Contract

## Objective
Ensure HubSpot -> Supabase -> KPI Dashboard numbers are reproducible, auditable, and decision-safe.

## Canonical Business Rules
1. Qualified Lead = revenue >= $250,000 AND sobriety > 1 year.
2. Official revenue is primary source-of-truth.
3. Fallback revenue is allowed only when official revenue is missing and still requires >= $250,000.
4. Good = $250k-$999k, Great = $1m+ (revenue-only tiers).
5. Qualified and revenue tiers are separate dimensions.

## Source Lineage (North-Star Scope)
| KPI Area | Dashboard Module | Primary Sources | Contract Logic |
| --- | --- | --- | --- |
| Leads qualification | Leads + Overview snapshot | `public.raw_hubspot_contacts` | `dashboard/src/lib/leadsQualificationRules.js` |
| Attendance Tue/Thu | Attendance + Overview snapshot | `public.raw_hubspot_meeting_activities`, `public.hubspot_activity_contact_associations` | ET weekday + scheduled-time tolerance + contact associations |
| Spend context | Leads + Overview | `public.raw_fb_ads_insights_daily` | Date-window sums and campaign/adset rollups |
| Sync freshness | Ops / audit | `public.vw_hubspot_sync_health_observability` | stale/dead/unhealthy run detection |

## Metric Contract

### Leads (7/30/90 day windows)
- Total Leads: active HubSpot contacts created in window (`is_deleted=false`).
- Qualified Leads: canonical rule in `evaluateLeadQualification`.
- Qualified %: `qualified_count / total_count`.
- Official Qualified Count: qualified where `qualificationBasis='official'`.
- Fallback Qualified Count: qualified where `qualificationBasis='fallback'`.
- Fallback Share %: `fallback_qualified_count / qualified_count`.
- Good/Great: `leadQualityTierFromOfficialRevenue`.

### Attendance (7/30/90 day windows)
- Tuesday/Thursday sessions and attendance derive from HubSpot call/meeting activities linked to contacts.
- Group session classification:
  - title heuristics (`Tactic Tuesday`, `Mastermind on Zoom`, etc.) OR
  - ET weekday/time proximity (Tue ~12:00 ET, Thu ~11:00 ET, +/- 120 min).
- Tuesday/Thursday unique contacts: distinct associated contact IDs by group type.
- New attendees: contact first seen in window.
- Average attendance per person: total attendance events / distinct contacts.

### Time and Window Standards
- Reference timezone for attendance scheduling: `America/New_York`.
- Date windows for integrity checks: 7, 30, 90 days (default).
- Strict sobriety boundary uses exact date math: exactly 1 year does **not** qualify.

## Reconciliation Suite

### 1) Node CLI (primary)
Command:
```bash
npm run integrity:check
```

Strict mode (requires HubSpot parity token):
```bash
npm run integrity:check:strict
```

JSON artifact:
```bash
npm run integrity:check:json
```

Repository/schema simplification audit:
```bash
npm run integrity:audit:repo-db
```

Behavior:
- Pulls raw contacts/activities/associations from Supabase Postgres.
- Computes 7/30/90 window KPIs with canonical dashboard logic.
- Validates strict qualification boundary + fallback-source-only rule.
- Runs duplicate and sync-health guard rails.
- Optionally runs row-level HubSpot parity sample checks.
- Writes markdown report to `docs/audits/kpi-data-integrity-latest.md`.
- Writes schema/object cleanup audit to `docs/audits/repo-db-simplification-audit.md`.
- Writes non-destructive cleanup SQL plan to `docs/data-integrity/proposed-db-cleanup.sql`.

### 2) SQL pack (manual DB verification)
Use:
```bash
scripts/verify_kpi_data_integrity.sql
```
in Supabase SQL Editor for independent read-side validation.

## Guard Rails and Gates
- Blocking:
  - strict sobriety boundary violation
  - fallback-source-only violation
  - dashboard snapshot parity mismatch
  - duplicate key groups > 0
  - stale/dead/unhealthy HubSpot sync rows > 0
  - HubSpot row-level parity mismatch (strict mode)
- Warning thresholds (configurable):
  - missing revenue percentage
  - missing sobriety percentage
  - fallback share percentage

Threshold env vars:
- `INTEGRITY_MAX_MISSING_REVENUE_PCT` (default `0.6`)
- `INTEGRITY_MAX_MISSING_SOBRIETY_PCT` (default `0.6`)
- `INTEGRITY_MAX_FALLBACK_SHARE_PCT` (default `0.5`)

## Required Environment Variables
- `SUPABASE_DB_URL` (or `DATABASE_URL`) for reconciliation queries.
- `HUBSPOT_PRIVATE_APP_TOKEN` for live HubSpot row parity checks.

Where to find these:
- Supabase project URL and keys:
  - [README env section](../../README.md)
  - [Supabase dashboard project settings](https://supabase.com/dashboard/projects)
- HubSpot private app token:
  - [HubSpot private apps](https://app.hubspot.com/private-apps)
  - [HubSpot trust sync runbook](../hubspot-trust-sync-runbook.md)

## QA Exit Criteria
1. `integrity:check` returns PASS with zero blocking failures.
2. `integrity:check:strict` returns PASS in an environment with `HUBSPOT_PRIVATE_APP_TOKEN`.
3. SQL pack outputs align with Node report for 7/30/90 windows.
4. Qualification rule evidence confirms strict sobriety `> 1 year`.
5. Final QA checklist file is completed and attached to release/audit note.
