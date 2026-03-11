# Leads + Attendance Load Performance QA

Date: 2026-03-11  
Scope: KPI-first load optimization in Leads and Attendance dashboards.

## Expected Behavior Checklist

- [x] Dashboard KPI cards render before deep drilldown/enrichment datasets.
- [x] Leads core metrics are not blocked by HubSpot activity association fetches.
- [x] Attendance core metrics are not blocked by HubSpot contacts enrichment fetches.
- [x] Users get explicit UI feedback when background enrichment is still loading.
- [x] Deep drilldowns still hydrate and remain functional after initial render.
- [x] No regressions in qualification rule logic or KPI contract tests.
- [x] Existing e2e smoke flows still pass for Dashboard, Leads, and Attendance.

## What Was Verified

- Leads:
  - Optional HubSpot activity/mapping enrichment now hydrates after first paint.
  - Heavy panel components are lazy-loaded:
    - `CohortUnitEconomicsPreviewPanel`
    - `LeadsManagerInsightsPanel`
    - `LeadsExperimentAnalyzerPanel`
  - Added user-facing "Loading Additional Lead Enrichment" status.

- Attendance:
  - Core attendance sessions/associations load first.
  - HubSpot contacts enrichment (`raw_hubspot_contacts`) moves to background hydration.
  - Added user-facing "Loading Contact Enrichment" status.

## Likely-Missed Risks Reviewed

- [x] Silent partial-data confusion
  - Mitigation: explicit enrichment-loading banners in Leads + Attendance.
- [x] Regression from lazy component imports
  - Mitigation: `Suspense` fallbacks for all lazy-loaded panels.
- [x] KPI/qualification contract drift
  - Mitigation: unit suite includes strict qualification boundary tests and contract tests.
- [x] Cross-module regression
  - Mitigation: full e2e suite rerun, not only targeted tests.

## Validation Results

- `npm --prefix dashboard run lint` -> PASS
- `node --test "dashboard/tests/**/*.test.mjs"` -> PASS (`17 passed`, `0 failed`)
- `npm --prefix dashboard run build` -> PASS
- `npm --prefix dashboard run test:e2e -- --reporter=line` -> PASS (`8 passed`, `0 failed`)

## Observed Build Impact

- Leads main bundle reduced from ~`671 kB` to ~`326 kB`.
- Heavy leads panels now split into separate on-demand chunks.

## QA Verdict

PASS: KPI-first load behavior implemented, regressions not detected, and user-facing loading context added for deferred enrichment paths.

