# KPI Data Integrity QA Checklist

## Scope
- HubSpot -> Supabase -> KPI Dashboard integrity for Leads, Attendance, and Dashboard north-star metrics.

## Required Commands
```bash
npm run integrity:check
npm run integrity:audit:repo-db
node --test "dashboard/tests/**/*.test.mjs"
npm --prefix dashboard run test:e2e -- leads --reporter=line
npm --prefix dashboard run test:e2e -- dashboard-overview-board-wiring.spec.js --reporter=line
npm --prefix dashboard run build
```

If HubSpot parity credentials are present:
```bash
npm run integrity:check:strict
```

## QA Assertions
1. Qualified rule is strict:
   - revenue >= $250k
   - sobriety > 1 year
   - exactly 1 year fails
2. Fallback revenue is source-only and never lowers threshold below $250k.
3. Snapshot parity:
   - leads summary qualified counts match snapshot contract output.
4. Sync-health guard:
   - no stale run rows
   - no dead webhook rows
   - no unhealthy latest statuses
5. Duplicate guard:
   - no duplicate `hubspot_contact_id` groups
   - no duplicate activity-contact association groups
6. Attendance integrity:
   - Tuesday/Thursday metrics are produced from HubSpot activity + association rows
   - counts are non-negative and trend windows compute successfully
7. No unrelated file changes in final commit.

## Evidence Log
- Integrity report path:
  - `docs/audits/kpi-data-integrity-latest.md`
- Repo/schema audit path:
  - `docs/audits/repo-db-simplification-audit.md`
- Cleanup SQL plan path:
  - `docs/data-integrity/proposed-db-cleanup.sql`
- Optional JSON report path:
  - `docs/audits/kpi-data-integrity-latest.json`

## Final Verdict
- [ ] PASS
- [ ] FAIL

## Notes
- Blocking failures:
- Warnings:
- Follow-up actions:
