# Attendance HubSpot Truth Execution Board

## Objective

Deliver a manager-safe attendance model that is 100% HubSpot-truthful for the
dashboard, uses Tuesday 12 PM ET and Thursday 11 AM ET group session logic, and
removes legacy Zoom references without breaking KPI integrity.

## Guardrails (non-negotiable)

- HubSpot call/meeting activities are the only attendance source of truth for
  the dashboard.
- Tuesday attendance is classified from HubSpot activities for the Tuesday
  group session around 12:00 PM `America/New_York`.
- Thursday attendance is classified from HubSpot activities for the Thursday
  group session around 11:00 AM `America/New_York`.
- The dashboard must not depend on Zoom meeting IDs, Zoom meeting names, or
  `kpi_metrics` rows named `Zoom Meeting Attendees`.
- Attendance confidence scoring is retired. Integrity means HubSpot parity,
  sync freshness, and reproducible counting logic.
- Lu.ma may still be used for Thursday registration context, but not as the
  attendance source of truth when HubSpot attendee data exists.
- No push to `main` until parity checks, cleanup inventory, and regression
  tests pass.

---

## Program Ownership

| Workstream | Owner | Backup | Success Signal |
|---|---|---|---|
| Program manager + release gating | AI Manager | President | Every task has owner, DoD, and evidence link |
| HubSpot attendance parity | Attendance Data Integrity Agent | QA Agent | Dashboard attendance matches HubSpot source counts |
| Legacy contract cleanup | Attendance Data Cleanup Agent | Program manager | No active dashboard path depends on Zoom semantics |
| Safe retirement and regression control | Zoom Retirement Safety Agent | QA Agent | Final delete/rename list is evidence-backed |
| Release verification | QA Agent | Program manager | Integrity, regression, and audit checks all PASS |

---

## Current Assignment Snapshot (active)

| Task ID | Task | Assignee | Target |
|---|---|---|---|
| DI1 | Lock canonical Tuesday and Thursday HubSpot attendance selectors | Attendance Data Integrity Agent | Today |
| DI2 | Add attendance parity checks to the integrity workflow | Attendance Data Integrity Agent | Today |
| DI3 | Publish attendance parity artifact with 7/30/90 day evidence | Attendance Data Integrity Agent | Today |
| CL1 | Inventory all Zoom references in attendance code and docs | Attendance Data Cleanup Agent | Today |
| CL2 | Remove dead fetches, dead state, and dead labels tied to Zoom | Attendance Data Cleanup Agent | This week |
| CL3 | Rename surviving attendance fields from `zoom*` to HubSpot/attendance semantics | Attendance Data Cleanup Agent | This week |
| ZR1 | Build a safe deletion inventory for every attendance-related Zoom reference | Zoom Retirement Safety Agent | Today |
| ZR2 | Add regression coverage for HubSpot-only attendance behavior | Zoom Retirement Safety Agent | This week |
| ZR3 | Certify final delete/rename/hold decisions before merge | Zoom Retirement Safety Agent | This week |
| QA1 | Run release checks: build, e2e, integrity, audit bundle | QA Agent | Every release |

## Final Pieces Before Push to Main

1. HubSpot attendance contract is documented and referenced from code review.
2. Attendance parity evidence is attached and marked PASS.
3. Zoom reference inventory is attached with delete/rename/hold decisions.
4. Regression tests cover Tuesday and Thursday HubSpot classification plus
   attendee extraction and dedupe.
5. Release audit note includes commit SHA, residual risks, and any approved
   waivers.

## Tasks to execute now

### Track A - HubSpot attendance parity (highest priority)

1. **DI1: Lock canonical attendance selectors**
   - Owner: Attendance Data Integrity Agent
   - Deliverable: one written contract for Tuesday and Thursday HubSpot
     session classification.
   - Done when: all dashboard attendance queries and transforms use the same
     selectors.

2. **DI2: Extend integrity checks**
   - Owner: Attendance Data Integrity Agent
   - Deliverable: parity verification between dashboard counts and HubSpot
     counts for 7/30/90 day windows.
   - Done when: mismatches fail the integrity gate.

3. **DI3: Publish parity evidence**
   - Owner: Attendance Data Integrity Agent
   - Deliverable: markdown artifact with pass/fail results and row counts.
   - Done when: artifact is attached before deploy.

### Track B - Cleanup and contract alignment

4. **CL1: Complete Zoom inventory**
   - Owner: Attendance Data Cleanup Agent
   - Deliverable: file-by-file inventory with active/dead/rename-only status.
   - Done when: no unclassified attendance-related Zoom reference remains.

5. **CL2: Remove dead paths**
   - Owner: Attendance Data Cleanup Agent
   - Deliverable: deleted fetches, deleted dead state, deleted outdated labels.
   - Done when: removed code has no runtime consumer.

6. **CL3: Normalize names**
   - Owner: Attendance Data Cleanup Agent
   - Deliverable: HubSpot-first naming in code, docs, and UI.
   - Done when: product-facing attendance semantics do not mention Zoom.

### Track C - Safe Zoom retirement

7. **ZR1: Create safe deletion matrix**
   - Owner: Zoom Retirement Safety Agent
   - Deliverable: each Zoom reference tagged as delete now, rename now, or hold.
   - Done when: every remaining reference has an explicit decision.

8. **ZR2: Add regression safeguards**
   - Owner: Zoom Retirement Safety Agent
   - Deliverable: tests for session classification, attendee extraction, dedupe,
     and stale-data warnings.
   - Done when: regression suite fails on contract drift.

9. **ZR3: Approve retirement decision**
   - Owner: Zoom Retirement Safety Agent
   - Deliverable: final signoff note for safe removal.
   - Done when: merge can proceed without unresolved Zoom blockers.

### Track D - QA and release governance

10. **QA1: Pre-release validation**
    - Owner: QA Agent
    - Deliverable: build, e2e, integrity, and audit bundle.
    - Done when: all checks are PASS.

---

## How we know it is fully successful

1. **Truth Gate**
   - Dashboard attendance counts match HubSpot attendance counts for Tuesday and
     Thursday sessions.
2. **Cleanup Gate**
   - No active dashboard attendance path depends on Zoom contracts.
3. **Regression Gate**
   - HubSpot-only attendance tests pass after cleanup.
4. **Freshness Gate**
   - Sync health shows current data with no blocking stale state.
5. **Audit Gate**
   - Evidence bundle is attached before push to `main`.

If any gate fails, do not push to `main`.

---

## Execution cadence

- Daily: parity review and cleanup inventory update until Zoom retirement is
  complete.
- Every release: run build, e2e, and integrity checks before merge.
- Weekly: review residual hold items and retire the next batch of legacy
  references.
