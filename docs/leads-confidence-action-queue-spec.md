# Leads Confidence and Action Queue Spec

## Reviewed Scope

- Feature type: additive only (non-breaking)
- Module: Leads
- Business intent alignment: improve client quality, improve retention outcomes, reduce acquisition cost

## 1) Confidence Model (0-100)

### 1.1 Scoring formula

`confidence_score = identity_score + attribution_score + completeness_score + freshness_score`

All component scores are clamped at their weighted max, and the final score is clamped to `[0, 100]`.

### 1.2 Weighted factors

- `identity_confidence` (0-35 points)
- `attribution_confidence` (0-35 points)
- `required_field_completeness` (0-20 points)
- `data_freshness` (0-10 points)

Total max: `100`.

### 1.3 Factor detail

#### A) identity_confidence (max 35)

Use best available match method for the lead/contact identity.

- Exact email match (primary email): `35`
- Secondary email (`hs_additional_emails`) match: `31`
- Exact normalized full-name match: `24`
- Fuzzy name match (first+last initial/prefix): `14`
- Ambiguous multi-candidate fuzzy match: `8`
- No match: `0`

#### B) attribution_confidence (max 35)

Source precedence follows current Leads rules (HubSpot first, Lu.ma fallback).

- HubSpot original source present and deterministic (for this use-case, especially `PAID_SOCIAL`): `35`
- HubSpot source present but weak/indirect (`OFFLINE`, partial drilldown): `20`
- Lu.ma fallback source used with no HubSpot source: `14`
- Mixed/conflicting source signals across systems: `8`
- Unknown: `0`

#### C) required_field_completeness (max 20)

Required fields for queue-quality decisions:

- `lead_id` / stable key
- contact identity anchor (email or hubspot_contact_id)
- lead created date
- acquisition source classification
- funnel stage or equivalent quality classification
- revenue band (or equivalent quality proxy)
- attendance/show-up indicator where relevant

Scoring:

- Start at `20`
- Subtract `3` points per missing required field
- Floor at `0`

#### D) data_freshness (max 10)

Use newest timestamp across relevant source records for that lead row.

- Fresh within 24h: `10`
- >24h and <=72h: `8`
- >72h and <=7d: `6`
- >7d and <=30d: `3`
- >30d or unknown timestamp: `0`

### 1.4 Blockers rule

Any of these should append a blocker reason string to `blockers[]`:

- no identity match
- ambiguous identity match
- unknown attribution
- required field completeness score < 10
- freshness score = 0

Blockers do not force score to zero, but they prevent autonomous high-impact actions.

## 2) Confidence Level Mapping

- High: `>= 80`
- Medium: `60-79`
- Low: `< 60`

## 3) Task Routing Rules

### 3.1 autonomous_tasks

Only include tasks that are safe, reversible, and low-risk.

Examples:

- internal CRM tag normalization
- schedule non-sending internal reminder
- create internal QA follow-up ticket
- queue low-risk data backfill/re-sync task
- suggest non-destructive merge candidate review task (no auto-merge)

Autonomous gating:

- `confidence_level` must be `High` or `Medium`
- no blocker for identity ambiguity
- no external communication
- no budget/spend mutation

### 3.2 human_tasks

Require explicit human approval for any risky or externally visible action.

Examples:

- direct outreach to a lead/client
- spend/budget or campaign allocation changes
- irreversible identity merges
- source override decisions when attribution is conflicting
- lifecycle-stage overrides tied to retention reporting

Human routing triggers:

- `confidence_level = Low`
- any blocker requiring judgment
- any action with external comms, spend impact, or irreversible mutation

## 4) Minimum Output Contract

For each lead queue record:

```json
{
  "confidence_score": 0,
  "confidence_level": "High|Medium|Low",
  "blockers": [],
  "autonomous_tasks": [],
  "human_tasks": [],
  "generated_at": "2026-03-07T00:00:00.000Z"
}
```

Contract requirements:

- `confidence_score`: integer `0..100`
- `confidence_level`: enum `High|Medium|Low`
- `blockers`: array of stable reason codes or reason strings
- `autonomous_tasks`: array of task objects or strings (implementation choice, but stable shape required)
- `human_tasks`: array of task objects or strings (implementation choice, but stable shape required)
- `generated_at`: ISO-8601 UTC timestamp

## 5) Edge Cases and Expected Behavior (10)

1. Primary email missing, secondary email matched
- Expected: identity scored as secondary-email tier, add blocker only if multiple candidates still exist.

2. Fuzzy name maps to multiple HubSpot candidates
- Expected: low identity score, blocker `identity_ambiguous`, no autonomous merge task.

3. HubSpot source says `OFFLINE` but Lu.ma says referral/meta
- Expected: attribution scored as weak/conflicting, route source override review to `human_tasks`.

4. Lead has high quality signals but stale data (>30 days)
- Expected: freshness score `0`, blocker `data_stale`, allow only internal refresh autonomous task.

5. Missing revenue band but other fields present
- Expected: completeness penalty applied, include blocker if completeness drops below threshold.

6. Deterministic PAID_SOCIAL attribution + exact email + fresh record
- Expected: high confidence (`>=80`), allow safe autonomous internal tasks.

7. Unknown source + no identity match
- Expected: very low score, only `human_tasks` and reconciliation tasks.

8. Lead merged across multiple emails with oldest `createdate` retained for attribution
- Expected: attribution uses oldest-record rule; if conflict remains unresolved, add human review task.

9. Temporary upstream sync outage (partial source data)
- Expected: partial scoring with blockers, never fail hard; output contract always returned.

10. Re-run on same unchanged input
- Expected: deterministic score/task outputs except `generated_at`.

## 6) Acceptance Criteria Checklist (Engineering + QA)

### Engineering

- [ ] Feature is additive and does not break existing Leads panels or APIs.
- [ ] Confidence score computation follows the exact weights and clamping rules.
- [ ] Level mapping uses exact thresholds: High `>=80`, Medium `60-79`, Low `<60`.
- [ ] Output contract fields always present with valid types.
- [ ] Blockers are emitted when required by rules.
- [ ] Routing enforces autonomous safety constraints.
- [ ] Deterministic behavior for identical inputs (except `generated_at`).
- [ ] Unknown/partial data still returns a valid contract (no hard failure).

### QA

- [ ] Verify at least one fixture for each confidence level.
- [ ] Verify all 10 edge cases produce expected score band, blockers, and routing.
- [ ] Verify autonomous tasks are never generated for external comms/spend changes.
- [ ] Verify low confidence always includes at least one `human_task`.
- [ ] Verify schema validation on response contract.
- [ ] Verify regression: existing Leads views and calculations remain unchanged.

## Non-Breaking Implementation Notes

- Add new queue outputs as new fields/view/module artifacts; do not remove existing fields.
- If confidence inputs are unavailable, degrade gracefully with blockers and lower score.
- Preserve existing attribution precedence and identity rules already documented in Leads docs.

