# Leads Confidence Operator Playbook

## Purpose
This playbook describes how operators and developers should interpret the Leads Confidence signal and execute the Action Queue safely.

## Confidence Levels In Practice

### High Confidence
- Meaning: Data quality is strong enough for routine optimization decisions.
- Typical signal profile: healthy match rates, acceptable HubSpot coverage, no major stale-source flags.
- Operator action: proceed with normal execution cadence and autonomous queue items.

### Medium Confidence
- Meaning: Data is usable, but some quality dimensions are drifting.
- Typical signal profile: one or two blocker-adjacent metrics near threshold.
- Operator action: proceed with caution, complete autonomous tasks first, and schedule human validation on highest-risk rows.

### Low Confidence
- Meaning: Decision quality risk is high.
- Typical signal profile: blocker conditions present (for example low identity match reliability or stale upstream data).
- Operator action: freeze non-essential optimization decisions and prioritize blocker resolution before campaign or attribution changes.

## Blocker Triage Priority (Top-Down)
1. Data freshness and ingestion integrity
- Confirm latest source refresh windows are current before trusting trend movement.
- Validate sync jobs and ingestion status before reviewing downstream metrics.

2. Identity/match quality blockers
- Resolve HubSpot/Lu.ma/Zoom matching reliability before attribution decisions.
- Prioritize blockers that affect denominator integrity (who is counted where).

3. HubSpot call/meeting coverage blockers
- Verify call association completeness and attendee linkage.
- Fix structural coverage issues before evaluating conversion quality by source.

4. Attribution completeness blockers
- Address missing source fields and unresolved buckets.
- Ensure unknown-source share is controlled before spend reallocations.

5. Secondary optimization blockers
- Handle lower-severity quality drifts after core data trust is restored.

## Autonomous vs Human Task Queues

### Autonomous Queue
- Intended for deterministic, repeatable remediation steps.
- Run autonomous tasks first when confidence is medium/high.
- Recompute confidence after completion; do not assume task success equals trust restoration.

### Human Queue
- Intended for judgment calls, ambiguous mappings, and policy decisions.
- Prioritize tasks tied to highest-impact blocker codes and shortest SLA.
- Document decision rationale for each completed human task so future runs are reproducible.

### Execution Order
1. Execute highest-priority autonomous task.
2. Re-check blocker state and confidence trend.
3. Execute highest-priority human task if blocker remains.
4. Repeat until blockers are cleared or escalated.

## 10-Minute Weekly Review Checklist
1. Confirm confidence level and score delta vs prior week.
2. Review top blockers (max five) and verify root-cause category.
3. Run/verify completion of top autonomous tasks.
4. Review human-required queue and assign owners + SLA.
5. Validate freshness windows for all critical sources.
6. Check unknown-source share and match quality movement.
7. Record "go/no-go" decision for optimization changes this week.
8. Log open risks and carry-forward tasks.

## Do Not Act When...
- Confidence level is low and core blockers are unresolved.
- Source freshness is stale or ingestion is incomplete.
- Match quality is below guardrail and identity reconciliation is pending.
- HubSpot call coverage is degraded enough to distort conversion interpretation.
- Unknown-source share is high enough to invalidate channel-level decisions.

In these states, only run stabilization/remediation tasks; defer spend or strategy changes until confidence is recovered.

## Related Docs
- [Leads Confidence & Action Queue Spec](./leads-confidence-action-queue-spec.md)
- [HubSpot Merged Contact Dedupe Verification](./hubspot-merged-contact-dedupe-verification.md)
