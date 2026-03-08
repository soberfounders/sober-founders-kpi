# Leads Autonomous Manager Plan (HubSpot-First)

## Confirmed Operating Decisions

- GitHub deployment authority: ship to `main` only after audit + QA pass.
- Source of truth: HubSpot official revenue + sobriety fields for qualification logic.
- Alert thresholds: warning at `>10%` parity drift, critical alert at `>20%`.
- Escalation path: push notification + Slack message.
- Human-response SLA: 24 hours on workdays.
- Notion automation: temporarily deferred until secrets are available.

## Sub-Agent Topology

### Agent A — HubSpot Truth Guard

**Purpose**: enforce canonical quality rules and detect source drift before downstream actions.

**Inputs**
- HubSpot contact/company fields and attribution metadata.
- Latest Leads qualification outputs.

**Checks**
- Revenue-tier classification consistency.
- Qualified/unqualified rule compliance.
- Missing/stale HubSpot fields by impact rank.

**Output**
- Daily truth report with pass/fail status and blocker codes.

### Agent B — Parity + Drift Guard

**Purpose**: compare grouped/unified metrics against legacy metrics and gate releases.

**Checks**
- Metric parity against documented formulas.
- Threshold policy: warning >10%, critical >20%.
- Freshness gating and low-sample suppression.

**Output**
- Machine-readable parity artifact + alert payload.
- Release gate status (`PASS`, `WARNING`, `CRITICAL`).

### Agent C — Insight + Action Compiler

**Purpose**: produce manager-ready recommendations without unsafe mutations.

**Checks**
- Top 3 AI actions with explicit projected KPI impacts.
- Human-required decisions flagged for approval.
- Confidence and sample-size explanation in every recommendation.

**Output**
- Daily manager brief.
- Action queue with autonomous/human split.

### Agent D — QA + Audit Enforcer

**Purpose**: prevent unsafe deploys while keeping iteration speed.

**Checks**
- Build/lint/e2e gates for changed surfaces.
- Contract validation for analyzer outputs.
- HubSpot truth + parity reports attached to release candidate.

**Output**
- Audit bundle attached to each release candidate.
- Go/no-go recommendation for `main`.

## Release Gate Contract (Required to Deploy)

A deployment is approved only if all are true:

1. Build + relevant tests pass.
2. HubSpot truth guard is pass/no-critical.
3. Parity guard has no critical metrics.
4. Alerting pipeline for warning/critical is healthy.
5. Audit bundle includes timestamp, dataset window, and report links.

## Scalability Controls

- Partition checks by date window to keep runtime predictable as volume grows.
- Persist additive daily artifacts (do not mutate historical source rows).
- Keep threshold and rubric values versioned for reproducibility.
- Fail closed for deployment gates; fail open only for dashboard read-only display.
