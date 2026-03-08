# Leads Action Manager Spec

## Purpose

Define manager-facing improvements for Leads so weekly decisions optimize lead quality, not just cheap volume.

## Canonical Truth (Must Not Drift)

- Revenue tiers are revenue-only labels based on official annual revenue USD:
  - Bad: `< 100,000`
  - OK: `100,000 - 249,999`
  - Good: `250,000 - 999,999`
  - Great: `>= 1,000,000`
- Qualified vs Unqualified is a separate classification:
  - Qualified: official annual revenue `>= 250,000` AND sobriety age `>= 365 days` as of runtime today.
  - Unqualified: all other leads.
- Source of truth is HubSpot official revenue + sobriety date fields.

## Manager Insights (Weekly + Monthly)

Show one manager card set for WoW (`last 7d` vs prior `7d`) and MoM (`last 30d` vs prior `30d`) with short bullet insights:

- Trend bullets:
  - `CPL`: direction, magnitude, confidence note.
  - `CPQL`: direction, magnitude, quality-adjusted cost context.
  - `Qualified%` and `Non-Qualified%`: split movement and contribution by source.
  - `Great%`: movement among all leads and among qualified leads.
- Top 3 autonomous actions (AI-generated, manager-approvable):
  1. Reallocate paid budget from low-Qualified adsets to high-Qualified adsets.
  2. Reduce spend on low-CPL / high-Non-Qualified segments.
  3. Increase budget on sources with improving Great% and stable CPQL.
- Projected impact (must be explicit for each proposed action):
  - Expected delta range for `CPL`, `CPQL`, `Qualified%`, `Non-Qualified%`.
  - Window for impact realization (`7d` and `30d` expectations).
  - Confidence level (`high`, `medium`, `low`) based on sample size and volatility.

## Human-Required Actions

AI must not execute tasks that require business judgment, legal/compliance accountability, or external system authority.

Human-required examples:

- Final budget approval and channel spend shifts above manager threshold.
- Creative messaging approvals that can affect compliance or brand risk.
- CRM lifecycle or pipeline stage policy changes.
- Suppression/targeting rules with legal or partner implications.
- Lead-quality exception handling when source data is incomplete or conflicting.

Why human is required:

- Accountability for spend authority and compliance.
- Context AI cannot fully observe (partnership commitments, seasonality events, legal constraints).
- Final decision rights for tradeoffs between volume, quality, and revenue outcomes.

### Add-to-Notion To-Do Flow

When an action needs human follow-through, AI creates a structured handoff item.

Flow:

1. AI proposes action with projected KPI impact.
2. Manager clicks `Add to Notion To-Do`.
3. Item is created with required fields (below) and owner assignment.
4. Manager sets due date + priority, then marks decision (`approved`, `rejected`, `needs info`).
5. Post-action review captures actual vs projected impact.

Required Notion fields:

- `Title`
- `Date Created`
- `Requested By` (`AI` or human)
- `Owner`
- `Channel` (`Paid`, `Organic`, `Referral`, `Cross-channel`)
- `Action Type` (`Budget Shift`, `Creative`, `Audience`, `Lifecycle`, `Data Fix`, `Other`)
- `Reason`
- `Expected Impact` (`CPL`, `CPQL`, `Qualified%`, `Non-Qualified%`, `Great%`)
- `Confidence`
- `Due Date`
- `Status` (`Backlog`, `In Progress`, `Blocked`, `Done`)
- `Decision`
- `Outcome Notes`

## Experiment Quality Analyzer (Campaign/Adset Comparison)

### Required Comparison Metrics

- `CPL`
- `CPQL`
- `Qualified%`
- `Great%`
- Optional support metrics: spend, lead volume, confidence/sample size.

### Decision Rubric (Avoid Low-CPL / High-Junk Traps)

Gate checks, in order:

1. Quality gate: prefer higher `Qualified%` first; reject segments with materially worse quality even if `CPL` is lower.
2. High-value gate: prioritize stable or improving `Great%` when `CPQL` is comparable.
3. Cost gate: compare `CPQL` before `CPL`; only use `CPL` as tie-breaker if quality is equivalent.
4. Confidence gate: require minimum lead count threshold before scaling budget.
5. Risk gate: flag segments where non-qualified growth outpaces qualified growth.

Decision outcomes:

- `Scale`: better or equal `CPQL` and better quality rates with sufficient sample.
- `Hold`: mixed signal or low confidence; gather more data.
- `Reduce`: low quality despite low CPL.
- `Stop`: worst quality and no high-value recovery signal.

## Recommendation Tracks

### Paid Leads

- Shift spend from low-Qualified adsets to higher `Qualified%` and `Great%` adsets.
- Use adset-level quality benchmarking (not only campaign-level averages).
- Enforce a guardrail: no budget increase if `CPQL` degrades and `Qualified%` declines together.
- Trigger creative/audience refresh if CPL improves but CPQL worsens.

### Organic and Referral

- Prioritize channels/referrers with highest `Qualified%` and `Great%` conversion.
- Improve landing/form qualification prompts to reduce unqualified intake.
- Build referral-partner scorecards using `Qualified%`, `Great%`, and time-to-qualified.
- Route nurturing based on sobriety age readiness and revenue potential.

## Phased Rollout Plan

### Phase 1 (Week 1): Visibility

- Add manager insights bullets for WoW/MoM.
- Add quality analyzer table and decision labels (`Scale/Hold/Reduce/Stop`).
- Add explicit Qualified vs Unqualified split and Great% view.

Acceptance criteria:

- All displayed metrics use canonical definitions.
- Trend bullets render for both 7-day and 30-day windows.
- Analyzer computes metrics for campaign and adset cuts.

### Phase 2 (Week 2): Actionability

- Enable top 3 autonomous actions with projected impact ranges.
- Enable Add-to-Notion handoff with required fields.
- Add human-required action tags and reason codes.

Acceptance criteria:

- Each autonomous action includes projected impact and confidence.
- Notion handoff creates all required fields without manual schema edits.
- Human-required items cannot be auto-executed by AI.

### Phase 3 (Week 3+): Governance + Optimization

- Add quality drift alerts (Qualified% drop, Great% drop, CPQL spike).
- Add post-action audit comparing projected vs actual impact.
- Add monthly manager review pack with decision quality scoring.

Acceptance criteria:

- Alerts trigger only on defined thresholds with filter context.
- Audit report shows forecast error for each completed action.
- Monthly review includes Paid and Organic/Referral sections separately.

## PASS/FAIL Release Checklist

- PASS only if all are true:
  - Qualified rule uses both revenue and sobriety age.
  - Bad/OK/Good/Great remain revenue-only.
  - Manager insights include WoW and MoM trend bullets.
  - Exactly top 3 autonomous actions are shown with projected impact.
  - Human-required action section and Notion flow are documented.
  - Experiment analyzer and decision rubric are present.
  - Paid and Organic/Referral recommendations are separate.
  - Phased rollout and phase acceptance criteria are explicit.
- FAIL if any item above is missing or redefines canonical metric logic.
