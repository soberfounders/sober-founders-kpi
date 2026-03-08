# Leads Qualified vs Unqualified Source of Truth

## Scope
- Additive docs specification only.
- Applies to Leads qualification counts and related dashboard breakdowns.

## 1) Canonical Rule

HubSpot official annual revenue is the only source of truth for qualification state.

Classification by official annual revenue (USD):
- Great: `>= 1,000,000`
- Good: `>= 250,000` and `< 1,000,000`
- Qualified: `>= 250,000` (equivalent to `Good + Great`)
- Unqualified: `< 250,000`
- Unknown: missing, null, empty, or unparseable official revenue

Notes:
- Revenue must be parsed as a numeric USD value before classification.
- Non-official revenue fields are not allowed for classification unless explicitly flagged (see allowed fields section).

## 2) Invariant

For identical date and source filters:
- `Qualified count == Good count + Great count`

Required behavior if invariant fails:
1. Dashboard must show a visible mismatch warning.
2. Dashboard must show diagnostic mismatch count:
   - `mismatch_count = qualified_count - (good_count + great_count)`
3. Warning state must include filter context (date range + source filter key) for debugging.

## 3) Allowed Revenue Fields (Strict Order)

Use only official HubSpot fields in this exact order:
1. `annual_revenue_in_usd_official`
2. `annual_revenue_in_dollars__official_`

Fallback policy:
- Do not fall back to non-official revenue fields by default.
- Non-official fallback is permitted only when an explicit runtime/config flag is enabled and surfaced in diagnostics.

## 4) Acceptance Checks for Release

Release is accepted only when all checks pass:

1. Classification correctness:
   - Test fixtures confirm boundary behavior at `249,999`, `250,000`, `999,999`, and `1,000,000`.
2. Unknown handling:
   - Null/empty/unparseable official revenue rows are counted as `Unknown`, not `Qualified` or `Unqualified`.
3. Field precedence:
   - If both official fields are present, first field in precedence order is used consistently.
4. No implicit fallback:
   - With fallback flag disabled, non-official fields do not affect classification.
5. Invariant enforcement:
   - For every supported date/source filter combination in QA samples, `Qualified == Good + Great`.
6. Mismatch UX behavior:
   - Injected mismatch test triggers warning banner and diagnostic mismatch count.
7. Source-of-truth traceability:
   - Diagnostic output/logging includes which official field was used for each classified row (or `unknown` reason).
8. Regression safety:
   - Existing dashboard totals remain stable except where corrected by canonical official-field enforcement.
