# Data Platform Maintenance Playbook

Purpose: keep business logic and schema tuning centralized so updates happen once and propagate everywhere.

## 1) Canonical business logic (single source of truth)

Use **one module** for lead/funnel definitions:

- `dashboard/src/lib/leadModel.js`

This file is canonical for:

- funnel normalization (`free`, `phoenix`, `donation`, `unknown`)
- ad funnel classification fallback rules
- paid-social / phoenix HubSpot contact detection
- lead tier thresholds:
  - `bad`: < $100k
  - `ok`: $100k–$249,999
  - `qualified`: $250k–$999,999
  - `great`: $1M+
- official/fallback revenue resolution
- sobriety-date normalization and sobriety-age checks

### Consumers that should import from this module

- `dashboard/src/views/DashboardOverview.jsx`
- `dashboard/src/views/LeadsDashboard.jsx`
- `dashboard/src/lib/leadAnalytics.js`
- `dashboard/src/lib/leadsGroupAnalytics.js`

If you need to change thresholds or funnel parsing, change `leadModel.js` first.

---

## 2) Canonical query/index tuning policy

When adding/adjusting indexes, match **actual query predicates** used by dashboard + edge functions.

Latest performance migration:

- `supabase/migrations/20260304052707_optimize_analytics_query_indexes.sql`

It adds targeted indexes for hot paths on:

- `kpi_metrics`
- `raw_hubspot_meeting_activities`
- `ai_briefings`
- `raw_fb_ads_insights_daily`
- `fb_funnel_rules`
- `funnel_rules`

### Rules

1. Prefer narrow, query-shaped indexes over blanket indexing.
2. Use `CREATE INDEX IF NOT EXISTS` in migrations for idempotence.
3. Re-check Supabase advisors after DDL changes (performance + security).
4. If an index is consistently unused and write load matters, remove it in a follow-up migration.

---

## 3) Funnel and quality model guardrails

### Funnel separation

- Free and Phoenix are intentionally separated for spend/lead quality analysis.
- Combined lead-gen totals may include both (for top-level CPx metrics), but cards/charts must state scope clearly.

### Lead quality

- Revenue tiers come from `leadModel.js`.
- In Dashboard Overview quality metrics, qualified/great require both:
  - revenue tier threshold met
  - sobriety >= 1 year at lead date

If this policy changes, update:

1. `leadModel.js` (thresholds/helpers)
2. any narrative copy that explains quality gating
3. this playbook

---

## 4) Change workflow (low-drift workflow)

For any funnel/lead-quality/schema update:

1. Update canonical logic (`leadModel.js`) and/or migration SQL.
2. Update consuming code paths.
3. Update docs (`lead-intelligence-framework.md` + this file).
4. Validate:
   - dashboard build
   - key metric screens (free vs phoenix, qualified/great, CPQL/CPGL)
5. Re-run advisors and record any follow-up actions.

---

## 5) Verification checklist

- [ ] `npm run build` succeeds in `/workspace/dashboard`
- [ ] Phoenix and Free metrics remain separated where expected
- [ ] Qualified/Great counts align with canonical thresholds
- [ ] New migration exists in repo and is applied in Supabase
- [ ] Documentation references canonical logic locations
