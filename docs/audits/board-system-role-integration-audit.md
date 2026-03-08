# Board System-Role Integration Audit

Date: 2026-03-08
Auditor: W4
Scope:
- `docs/prompts/board-of-directors-system-role.md`
- `dashboard/src/views/DashboardOverview.jsx`
- `supabase/functions/ai-module-analysis/index.ts`
- `dashboard/e2e/dashboard-overview-board-wiring.spec.js`

## Overall Verdict

FAIL (not rollout-ready without contract alignment).

## PASS/FAIL by Criterion

### 1) Prompt wiring correctness: PASS

Evidence:
- Board role text is defined in dashboard source (`dashboard/src/views/DashboardOverview.jsx:105-113`) and included in board context (`dashboard/src/views/DashboardOverview.jsx:1767-1771`).
- Board module request now passes `system_role_override` when available (`dashboard/src/views/DashboardOverview.jsx:2211-2220`).
- Edge function applies override as the system prompt (`supabase/functions/ai-module-analysis/index.ts:29-33`, `126`).

Assessment:
- Wiring path from board manager -> edge function -> model system prompt is correct.

### 2) Output contract preservation: FAIL

Evidence:
- Prompt spec requires exact board-format sections/headings (KPI Observations, per-member Keep/Improve/Stop/Experiment, Board Synthesis, Execution Plan) (`docs/prompts/board-of-directors-system-role.md:78-109`).
- Edge function enforces a generic JSON contract with only `summary`, `autonomous_actions`, and `human_actions` (`supabase/functions/ai-module-analysis/index.ts:10-20`).
- Function normalization also truncates to generic structures (`supabase/functions/ai-module-analysis/index.ts:262-285`).

Assessment:
- Integration currently preserves the existing module-analysis JSON schema, not the board prompt’s required sectioned output contract.

### 3) Backward compatibility for non-board modules: PASS

Evidence:
- No override => default generic system prompt path remains unchanged (`supabase/functions/ai-module-analysis/index.ts:29-31`).
- Override is conditionally added only when present in manager context (`dashboard/src/views/DashboardOverview.jsx:2220`).

Assessment:
- Non-board module behavior remains compatible with existing cached/normalized response model.

### 4) Test coverage adequacy: FAIL

Evidence:
- Existing board wiring e2e verifies card presence, refresh flow, and fallback safety (`dashboard/e2e/dashboard-overview-board-wiring.spec.js:20-53`).
- It does not validate that `system_role_override` is sent in the network request.
- It does not validate preservation of board-required sections or per-member Keep/Improve/Stop/Experiment structure.

Assessment:
- Current coverage is good for UI stability, insufficient for prompt/contract correctness.

## Risks and Mitigations

### Risk 1: Contract drift between prompt spec and runtime output (High)
- Impact: leadership may assume board-format outputs are guaranteed when runtime only returns generic arrays.
- Mitigation: add explicit board-mode response contract in edge function and enforce schema validation before returning/storing.

### Risk 2: Silent regression of system-role override (Medium)
- Impact: board model could fall back to generic manager persona without obvious UI failure.
- Mitigation: add e2e/network assertion that board requests include `system_role_override` and that response metadata reports override active.

### Risk 3: Over-trust in generic summaries for board decisions (Medium)
- Impact: strategic recommendations may lose member-level reasoning transparency.
- Mitigation: persist board synthesis artifacts (agreements/disagreements/priorities/execution plan) in structured fields, not only free-text bullets.

## Top 3 Next Improvements

1) Introduce board-specific output schema in `ai-module-analysis`
- Support a board mode that returns required sections explicitly (while preserving current schema for non-board modules).

2) Add schema-level validation and telemetry
- Validate required board sections server-side; emit explicit failure reason when contract is not met.

3) Expand e2e coverage for integration correctness
- Assert outbound request includes `system_role_override` and that returned payload contains board-contract-compliant structure (or explicit fallback rationale).

## Validation Summary

Executed:
- `npm --prefix dashboard run test:e2e -- dashboard-overview-board-wiring.spec.js --reporter=line`

Result:
- PASS (`1 passed`, Chromium).
- Note: this confirms UI wiring stability, not full board output-contract fidelity.