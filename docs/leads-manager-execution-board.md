# Leads Manager Execution Board

## Objective
Deliver a manager-at-a-glance Leads module that is HubSpot-truthful, split by **Phoenix Forum vs Free Groups**, and able to drive AI/human actions with measured outcomes.

## Guardrails (non-negotiable)
- HubSpot is source of truth for contact quality and revenue qualifiers.
- Additive changes only unless explicitly approved.
- No release to main without QA bundle and pass/fail evidence.
- If sync health is stale or critical, release is blocked.

---

## Program Ownership

| Workstream | Owner | Backup | Success Signal |
|---|---|---|---|
| Program manager + release gating | AI Manager (this agent) | President | Every task has owner, DoD, evidence link |
| HubSpot ↔ Supabase truth + health | Data Reliability Sub-agent | Platform backup | `vw_hubspot_sync_health_observability` has no critical stale states |
| Leads KPI model + Phoenix/Free economics | Analytics Sub-agent | Data Reliability backup | KPI definitions approved and parity checks pass |
| Dashboard UX and manager panel | Frontend Sub-agent | Analytics backup | Cards load and manager can read key deltas in <30s |
| Action engine + experiment governance | AI Insights Sub-agent | Program manager | Actions include expected outcomes + confidence + review window |
| QA + audit artifacts | QA Sub-agent | Program manager | Test suite + release checklist all PASS |

---


## Current Assignment Snapshot (active)

| Task ID | Task | Assignee | Target |
|---|---|---|---|
| A1 | Verify HubSpot cron jobs in production (`cron.job`) | Data Reliability Sub-agent | Today |
| A2 | Run `vw_hubspot_sync_health_observability` and classify PASS/FAIL | Data Reliability Sub-agent | Today |
| A3 | Review last-24h `hubspot_sync_runs`/`hubspot_sync_errors` and open incidents if needed | Data Reliability Sub-agent | Today |
| A4 | Enforce Sync Truth Gate in release checklist before every deploy | Program Manager | Today |
| B1 | Finalize canonical `Cost per Phoenix Member` denominator and conversion window | Analytics Sub-agent | This week |
| B2 | Implement Phoenix vs Free split scorecard with period deltas | Analytics + Frontend Sub-agents | This week |
| B3 | Add KPI data-quality badges (fresh/stale/low-sample) | Frontend Sub-agent | This week |
| C1 | Standardize AI action contract (`expected_delta`, `confidence`, `window_days`) | AI Insights Sub-agent | This week |
| C2 | Add proposed-vs-realized (7d/30d) action outcome ledger | AI Insights + Data Reliability Sub-agents | This week |
| C3 | Publish rubric version/change log in manager output | AI Insights Sub-agent | This week |
| D1 | Execute build + e2e + parity + sync verification checks | QA Sub-agent | Every release |
| D2 | Publish audit artifact with evidence and commit SHA | QA Sub-agent | Every release |
| D3 | Run rollback rehearsal and capture runbook evidence | Program Manager + QA Sub-agent | This sprint |

## Final Pieces Before Push to Main

1. **Production Sync Verification Evidence** attached (output from `scripts/verify_hubspot_sync_health.sql`).
2. **Cost per Phoenix Member Contract** approved (event source + conversion window + denominator).
3. **Release QA Bundle** attached (build, e2e, parity, sync gate).
4. **Audit Note** updated with commit SHA, blockers, waivers (if any).
5. **Main Push Rule**: push to `main` only when all gates are PASS; otherwise hold and remediate.

## Tasks to execute now

### Track A — HubSpot/Supabase Sync Integrity (highest priority)
1. **A1: Verify cron jobs are present and active**
   - Owner: Data Reliability Sub-agent
   - Deliverable: screenshot/export of `cron.job` rows for hubspot worker/incremental/reconcile/backfill jobs.
   - Done when: all 5 jobs exist at expected cadence.

2. **A2: Verify current sync health view status**
   - Owner: Data Reliability Sub-agent
   - Deliverable: query result from `vw_hubspot_sync_health_observability`.
   - Done when: `is_stale = false` for webhook/incremental/reconcile and `dead_events = 0`.

3. **A3: Verify last-24h run quality**
   - Owner: Data Reliability Sub-agent
   - Deliverable: report on `hubspot_sync_runs` + `hubspot_sync_errors`.
   - Done when: no repeated errors; last successful incremental < 30 minutes.

4. **A4: Add release blocker rule**
   - Owner: Program manager
   - Deliverable: release checklist item requiring Track A pass before deploy.
   - Done when: checklist is in repo and used each deploy.

### Track B — KPI Model Upgrades for manager decisions
5. **B1: Define canonical Phoenix Member conversion metric**
   - Owner: Analytics Sub-agent
   - Deliverable: metric contract (`member event source`, window, denominator).
   - Done when: `Cost per Phoenix Member` formula is computable and documented.

6. **B2: Build split KPI scorecard (Phoenix vs Free)**
   - Owner: Analytics + Frontend Sub-agents
   - Deliverable: card set for spend, leads, qualified%, great%, CPQL, CPGL, and cost per Phoenix member (or explicit unavailable status with reason).
   - Done when: cards render with current + prior period deltas.

7. **B3: Add confidence and data-quality badges on KPIs**
   - Owner: Frontend Sub-agent
   - Deliverable: per-card quality badge (fresh/stale/low-sample).
   - Done when: managers can identify unreliable metrics at a glance.

### Track C — AI action loop with measurable outcomes
8. **C1: Action object contract**
   - Owner: AI Insights Sub-agent
   - Deliverable: each action includes `expected_delta`, `confidence`, `window_days`, `owner_type(ai/human)`, `status`.
   - Done when: all top actions include complete contract fields.

9. **C2: 7-day/30-day realized outcome ledger**
   - Owner: AI Insights + Data Reliability Sub-agents
   - Deliverable: table/view tracking proposed vs realized KPI movement.
   - Done when: at least one completed action has realized outcome captured.

10. **C3: Experiment governance threshold review**
    - Owner: AI Insights Sub-agent
    - Deliverable: rubric config + version + change log.
    - Done when: thresholds are versioned and surfaced in manager output.

### Track D — QA and release governance
11. **D1: Automated pre-release checks**
    - Owner: QA Sub-agent
    - Deliverable: build, e2e leads panels, parity guard, sync health checks.
    - Done when: all checks are PASS.

12. **D2: Audit bundle for each release**
    - Owner: QA Sub-agent
    - Deliverable: markdown artifact with checks, timestamps, commit SHA, and blockers.
    - Done when: artifact is attached before push to main.

13. **D3: Rollback rehearsal**
    - Owner: Program manager
    - Deliverable: documented rollback command sequence.
    - Done when: rollback drill completes in staging/safe environment.

---

## How we know it is fully successful

A release is only successful when all conditions below are true:

1. **Sync Truth Gate**
   - HubSpot sync health is green (`is_stale=false`, `dead_events=0`, recent successes).
2. **KPI Completeness Gate**
   - Phoenix vs Free scorecard renders with all required metrics.
3. **Actionability Gate**
   - Top AI actions include expected outcomes and confidence, and at least one action has measured follow-up.
4. **QA Gate**
   - Build + regression suite + parity checks pass.
5. **Audit Gate**
   - Release checklist and evidence bundle are attached and reviewed.

If any gate fails, no push to main.

---

## Execution cadence
- Daily: Track A sync health review + action queue review.
- Weekly: KPI and experiment performance review (including Phoenix member metric readiness).
- Monthly: projected-vs-realized action accuracy review and rubric tuning.
