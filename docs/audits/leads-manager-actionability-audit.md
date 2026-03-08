# Leads Manager Actionability Audit

Date: 2026-03-08
Auditor: W4
Scope:
- `dashboard/src/lib/leadsManagerInsights.js`
- `dashboard/src/lib/leadsExperimentAnalyzer.js`
- `dashboard/src/components/LeadsManagerInsightsPanel.jsx`
- `dashboard/src/components/LeadsExperimentAnalyzerPanel.jsx`
- `dashboard/src/views/LeadsDashboard.jsx`

## Verdict

Overall decision quality and actionability: FAIL.

Top finding summary:
- FAIL (High): Projected KPI impacts are heuristic, hard-coded, and not defensible as forecasts.
- FAIL (High): KEEP/ITERATE/KILL decisions are median-relative with low sample guardrails, creating unstable or misleading kill/scale decisions.
- FAIL (High): Organic/Referral recommendations optimize show-up share, not qualified/great quality outcomes.
- PASS (Medium): Autonomous vs human task lanes are visually separated and include human reasons.
- FAIL (Medium): Handoff to Notion from manager panel only passes task name, not required structured decision fields.

## Severity-Ranked Findings

### 1) HIGH - Projected impacts are not forecast-defensible (FAIL)

Evidence:
- Impact outputs are derived from formula clamps, not historical causal lift or confidence intervals (`dashboard/src/lib/leadsManagerInsights.js:170`-`173`, `185`-`190`).
- The three autonomous actions are static templates; only scaling factors vary (`dashboard/src/lib/leadsManagerInsights.js:194`-`217`).
- No uncertainty bands, no confidence label per action, no realized-vs-projected calibration loop.

Risk:
- Managers may treat synthetic percentages as reliable forecasts and over-rotate budget/creative decisions.

### 2) HIGH - Decision rubric can over/under-kill due to relative-only thresholds (FAIL)

Evidence:
- Trap and weakness checks are tied to medians only (`dashboard/src/lib/leadsExperimentAnalyzer.js:76`-`81`).
- `KILL` fires when both weak-qualified and weak-great are true, independent of absolute floor quality or margin-of-error (`dashboard/src/lib/leadsExperimentAnalyzer.js:92`-`99`).
- `minLeadsThreshold` is fixed at 8 in the dashboard (`dashboard/src/views/LeadsDashboard.jsx:3912`).

Risk:
- In weak overall cohorts, poor segments can escape KILL because medians are already low.
- In strong cohorts, healthy segments can be mislabeled KILL on relative variance/noise.

### 3) HIGH - Organic/Referral insights are volume-share oriented, not quality oriented (FAIL)

Evidence:
- Organic/Referral bullets are driven by `showUpRows` share (`dashboard/src/lib/leadsExperimentAnalyzer.js:147`-`166`).
- No channel-level qualified rate, great rate, CPQL, or quality trend gating in this recommendation block.

Risk:
- Recommendations can favor channels with large volume but weaker qualification economics.

### 4) MEDIUM - Human vs autonomous lanes exist, but governance payload is incomplete (FAIL)

Evidence:
- Distinct sections and reasons are present in UI (`dashboard/src/components/LeadsManagerInsightsPanel.jsx:141`-`175`, `177`-`193`).
- Manager Notion handoff currently sends only task name (`dashboard/src/views/LeadsDashboard.jsx:3993`, `4002`).

Risk:
- Human approval trail lacks required fields (owner, expected KPI impact, confidence, due date, decision state), reducing accountability and auditability.

### 5) MEDIUM - Output parseability is mixed for human + AI consumers (ITERATE)

Evidence:
- Trend insights are free-text bullets (`dashboard/src/lib/leadsManagerInsights.js:141`-`153`) and not structured objects.
- Analyzer table is structurally strong (decision/confidence/metrics columns) (`dashboard/src/components/LeadsExperimentAnalyzerPanel.jsx:54`-`67`, `174`-`237`).
- Decision rationale is not exposed as explicit reason codes in the table payload.

Risk:
- Human readability is acceptable; machine actionability and post-hoc explanation are weaker than needed.

### 6) MEDIUM - Missing diagnostics/observability for decision governance (FAIL)

Evidence:
- Analyzer output does not include threshold values used per row, margin-to-threshold, or reason codes.
- Manager actions do not include confidence or expected time-to-impact metadata in the payload.
- No built-in projected-vs-actual tracking key in scoped outputs.

Risk:
- Hard to debug false positives/false negatives in recommendations or trust model output over time.

## Requested Checks

### Low-CPL vs low-quality trap handling
- Partial PASS: trap exists and is visually flagged (`dashboard/src/lib/leadsExperimentAnalyzer.js:81`, `103`; `dashboard/src/components/LeadsExperimentAnalyzerPanel.jsx:206`, `222`-`225`).
- FAIL for decision robustness: trap logic is relative-only and can drift with cohort medians.

### Are projected impacts defensible?
- FAIL: impact values are formula-generated heuristics without calibration, confidence intervals, or causal grounding.

### Autonomous vs human separation
- PASS with caveat: lanes are separated in data and UI.
- FAIL on operating rigor: handoff payload is under-specified for manager workflows.

### Easy to parse for humans + AI managers
- Human parsing: PASS-ITERATE.
- AI parsing: ITERATE-FAIL due to text-only trends and missing structured rationale fields.

## Threshold/Rubric Tuning Recommendations

### KEEP (recommend tighten)
- Require all:
  - `lead_base >= 20`
  - `qualified_leads >= 5`
  - `qualified_rate >= max(median_qualified_rate * 0.95, absolute_floor)`
  - (`cpql <= median_cpql * 0.95` OR `cpgl <= median_cpgl * 0.95`)
- Add `absolute_floor` default from recent rolling baseline (example: 30th percentile of last 8 weeks).

### ITERATE (recommend broaden as safe middle)
- Use when:
  - `lead_base` in `[8, 19]`, or
  - quality/cost metrics are mixed within +/-15% of median bands.
- Require explicit experiment next step: audience, creative, landing/form, or offer test.

### KILL (recommend make stricter and time-aware)
- Require all:
  - `lead_base >= 20`
  - Two consecutive windows meeting weak-quality criteria
  - (`qualified_rate <= median_qualified_rate * 0.75` AND `great_rate <= median_great_rate * 0.70`)
  - PLUS one cost guardrail (`cpql >= median_cpql * 1.20` OR `cpgl >= median_cpgl * 1.20`)
- This reduces single-window noise kills.

## Missing Observability/Diagnostics to Add

- Per-row `decision_reason_codes` (for example: `LOW_SAMPLE`, `WEAK_QUAL_RATE`, `WEAK_GREAT_RATE`, `COST_REGRESSION`, `TRAP_LOW_CPL_WEAK_QUALITY`).
- Per-row threshold snapshot used at scoring time (medians, thresholds, min lead gate).
- Action-level `confidence`, `expected_days_to_impact`, and `projection_basis` metadata.
- Post-action tracker linking recommendation ID to realized KPI deltas (CPL, CPQL, Qualified%, Non-Qualified%, Great%).
- Channel-level Organic/Referral quality diagnostics: qualified rate, great rate, CPQL proxy, and trend deltas.

## Final PASS/FAIL

- Decision quality: FAIL
- Actionability for managers: FAIL
- Low-CPL trap protection: FAIL (partial implementation, insufficient robustness)
- Human vs autonomous separation: PASS (with governance gap)
- Parseability (human + AI): ITERATE