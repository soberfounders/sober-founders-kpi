# Leads Manager Final Acceptance Audit

Date: 2026-03-08
Auditor: W4
Scope reviewed:
- `dashboard/src/lib/leadsManagerInsights.js`
- `dashboard/src/lib/leadsExperimentAnalyzer.js`
- `dashboard/src/components/LeadsManagerInsightsPanel.jsx`
- `dashboard/src/components/LeadsExperimentAnalyzerPanel.jsx`
- `dashboard/e2e/leads-manager-experiment-panels.spec.js`

## Overall Verdict

FAIL (one blocking criterion remains).

Blocking reason:
- Projected impact basis/confidence is present in UI, but the impact model remains heuristic and not empirically defensible enough for full acceptance.

## PASS/FAIL By Manager Goal

1) Actionable trend bullets: PASS
- WoW/MoM qualified rate plus CPL/CPQL deltas are produced as explicit bullets.
- Evidence: `dashboard/src/lib/leadsManagerInsights.js:149`-`183`.

2) Top 3 autonomous tasks + defensible impact basis/confidence: FAIL
- PASS: exactly 3 autonomous tasks are emitted.
- PASS: each metric impact now includes basis text + confidence labels and insufficient-sample fallback.
- FAIL (blocker): basis is still formula/heuristic-driven, not calibrated against realized historical lift or uncertainty bands.
- Evidence:
  - top 3 actions: `dashboard/src/lib/leadsManagerInsights.js:293`-`322`
  - basis/confidence fields: `dashboard/src/lib/leadsManagerInsights.js:243`-`289`
  - heuristic formulas: `dashboard/src/lib/leadsManagerInsights.js:230`-`233`

3) Human-required tasks + Notion-action path visibility: PASS
- Human-required tasks are clearly separated with reasons and priority.
- Notion handoff button is visible from each human-required action.
- Evidence:
  - task generation: `dashboard/src/lib/leadsManagerInsights.js:324`-`350`
  - panel section + button: `dashboard/src/components/LeadsManagerInsightsPanel.jsx:188`-`233`

4) Clear low-sample hold behavior: PASS
- Analyzer emits explicit `HOLD_LOW_SAMPLE` decision with required lead threshold reason.
- UI maps and displays `HOLD LOW SAMPLE` clearly.
- QA spec asserts this behavior is rendered.
- Evidence:
  - hold logic: `dashboard/src/lib/leadsExperimentAnalyzer.js:107`-`115`
  - decision label mapping: `dashboard/src/components/LeadsExperimentAnalyzerPanel.jsx:41`-`47`
  - e2e assertion: `dashboard/e2e/leads-manager-experiment-panels.spec.js:63`

5) Campaign/adset quality comparison that prevents low-CPL trap: PASS
- Absolute quality floors + efficiency bands + trap detection now gate keep/kill decisions.
- Decision reason context is surfaced per row.
- Evidence:
  - rubric and trap logic: `dashboard/src/lib/leadsExperimentAnalyzer.js:24`-`37`, `121`-`155`
  - trap flag + decision context in UI: `dashboard/src/components/LeadsExperimentAnalyzerPanel.jsx:225`-`233`

6) Paid + organic/referral insights: PASS (with caution)
- Paid recommendation bullets are present and include hold/trap references.
- Organic/referral insights are present in both manager insights and analyzer outputs.
- Evidence:
  - paid recs: `dashboard/src/lib/leadsExperimentAnalyzer.js:181`-`214`
  - organic/referral in analyzer: `dashboard/src/lib/leadsExperimentAnalyzer.js:216`-`245`
  - organic/referral quality in manager insights: `dashboard/src/lib/leadsManagerInsights.js:361`-`417`

## QA Validation Summary

Executed:
- `npm run test:e2e -- e2e/leads-manager-experiment-panels.spec.js`

Result:
- PASS (`1 passed`, Chromium) on 2026-03-08.
- Confirms key UI safety and visibility checks for manager insights/analyzer, including low-sample hold rendering.

## Residual Risks

High:
- Forecast trust risk: impact projections can still be interpreted as predictive despite heuristic origin.

Medium:
- Threshold portability risk: hard-coded quality/efficiency floors may not generalize by seasonality/source mix.
- Organic/referral decision quality risk: analyzer organic/referral block is still show-up-share weighted, not quality-cost weighted.

Low:
- Confidence display consistency risk: one fallback label path shows `LOW SAMPLE` while another displays `INSUFFICIENT SAMPLE/DATA`.

## Top 3 Next Improvements

1) Replace heuristic impact projection with calibrated backtest model
- Add rolling forecast calibration (predicted vs realized CPL/CPQL/Qualified% deltas) and show error bands.

2) Externalize and version rubric thresholds
- Move floors/bands to config with environment/date-version tagging and periodic re-baselining by source type.

3) Upgrade organic/referral analyzer to quality economics
- Add qualified rate, great rate, and CPQL/CPGL proxy per non-paid source so recommendations optimize quality, not only volume share.

## Final Acceptance Decision

- Current release acceptance: FAIL
- Reason: criterion #2 (defensible projected impact basis/confidence) is not yet met at production-governance level.