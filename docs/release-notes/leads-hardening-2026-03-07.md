# Leads Hardening Release Notes (2026-03-07)

## Summary
This release packages recent Leads hardening work focused on data quality, operational safety, and implementation readiness.

## What Changed
1. Confidence + action queue framework added (spec-level):
   - `docs/leads-confidence-action-queue-spec.md` defines a 0-100 confidence model, routing rules, output contract, and edge-case behavior.
2. E2E coverage additions for Leads-adjacent flows:
   - Playwright assets exist for baseline and marketing flow coverage (`dashboard/e2e/example.spec.js`, `dashboard/e2e/marketing.spec.js`).
   - Needs verification: exact delta of newly added tests in this release branch.
3. Lint debt cleanup started:
   - ESLint baseline config restoration landed in commit `4c9230f` (`dashboard/.eslintignore`, `dashboard/.eslintrc.cjs`).
   - Current branch still has outstanding lint debt (follow-up required).
4. Merged HubSpot dedupe hardening:
   - Commit `0036ef2` deduplicates merged HubSpot contacts across Leads KPIs (`dashboard/src/lib/leadAnalytics.js`, `dashboard/src/lib/leadsGroupAnalytics.js`, `dashboard/src/views/LeadsDashboard.jsx`, `dashboard/src/components/CohortUnitEconomicsPreviewPanel.jsx`).
   - Additional active-contact filtering and fallback hardening landed in `0d344ec`.

## Risk And Rollout Notes
- Medium risk: KPI shifts are expected where duplicate/merged contacts were previously double-counted.
- Medium risk: timezone/date-window and active-contact filtering updates can change day-bucketed counts.
- Low/medium risk: lint baseline files were restored, but full lint compliance is not yet complete.
- Rollout recommendation:
  - Deploy behind normal release controls.
  - Validate merged-contact and attribution-sensitive dashboards before broad stakeholder rollout.
  - Monitor first 24-48h for KPI discontinuities versus prior baseline.

## Verification Checklist
- [ ] Lint passes: `npm --prefix dashboard run lint`
- [ ] Build passes: `npm --prefix dashboard run build`
- [ ] E2E passes: `npm --prefix dashboard run test:e2e`
- [ ] Merged-contact PASS criteria:
  - [ ] A contact present in both `email` and `hs_additional_emails` is counted once in KPI rollups.
  - [ ] Contacts with `merged_into_hubspot_contact_id` are not double-counted as active standalone leads.
  - [ ] Lead rows do not duplicate by normalized email across cohort and dashboard views.
  - [ ] HubSpot-origin attribution remains stable after dedupe (no unexplained paid/free funnel flips).
  - [ ] Totals reconcile with source-of-truth query windows after timezone normalization.

## Follow-Up Items
1. Resolve remaining lint errors/warnings and lock a clean baseline in CI.
2. Add explicit regression tests for merged-contact dedupe edge cases (primary email + additional emails + merged IDs).
3. Confirm and document exact e2e test deltas for this release branch (needs verification).
4. If confidence/action queue moves from spec to implementation, add contract tests for `confidence_score`, routing arrays, and blocker behavior.
