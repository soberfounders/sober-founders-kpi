# Leads Qualified vs Unqualified Source of Truth

## Scope
- Additive docs specification only.
- Applies to Leads qualification counts and related dashboard breakdowns.

## 1) Canonical Rule

HubSpot official annual revenue and sobriety date are the source of truth for `Qualified` vs `Unqualified`.

Revenue tiers (revenue-only, official annual revenue USD):
- Great: `>= 1,000,000`
- Good: `>= 250,000` and `< 1,000,000`
- OK: `>= 100,000` and `< 250,000`
- Bad: `< 100,000`
- Unknown: missing, null, empty, or unparseable official revenue

Qualification rule (independent of revenue-tier labels):
- Qualified: official annual revenue `>= 250,000` **AND** sobriety date is at least 1 year old as of runtime "today".
- Unqualified: any lead that does not meet the Qualified rule above.

Notes:
- Revenue must be parsed as a numeric USD value before classification.
- "At least 1 year old" means `today - sobriety_date >= 365 days` (UTC day boundary).
- Non-official revenue fields are not allowed for classification unless explicitly flagged (see allowed fields section).

## 2) Invariants

For identical date and source filters:
- `Revenue Eligible count == Good count + Great count` where `Revenue Eligible` means official revenue `>= 250,000`.
- `Qualified count <= Revenue Eligible count`.

Required behavior if invariant fails:
1. Dashboard must show a visible warning only when `Qualified count > Revenue Eligible count`.
2. Dashboard should expose both diagnostics:
   - `qualified_minus_revenue_eligible = qualified_count - revenue_eligible_count`
   - `qualified_sobriety_gap_count = revenue_eligible_count - qualified_count` (minimum `0`)
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

1. Revenue-tier classification correctness:
   - Test fixtures confirm boundary behavior at `249,999`, `250,000`, `999,999`, and `1,000,000`.
2. Qualified rule correctness:
   - Test fixtures confirm `Qualified` requires both: `official revenue >= 250,000` and `sobriety >= 1 year from today`.
3. Sobriety boundary:
   - Test fixtures confirm day-boundary behavior for sobriety at exactly `364`, `365`, and `366` days before today.
4. Unknown handling:
   - Null/empty/unparseable official revenue rows are counted as `Unknown`, not `Qualified` or `Unqualified`.
5. Field precedence:
   - If both official fields are present, first field in precedence order is used consistently.
6. No implicit fallback:
   - With fallback flag disabled, non-official fields do not affect classification.
7. Invariant enforcement:
   - For every supported date/source filter combination in QA samples, `Qualified <= Revenue Eligible` and `Revenue Eligible == Good + Great`.
8. Mismatch UX behavior:
   - Injected invalid state (`Qualified > Revenue Eligible`) triggers warning banner and diagnostic counts.
9. Source-of-truth traceability:
   - Diagnostic output/logging includes which official field was used for each classified row (or `unknown` reason).
10. Regression safety:
   - Existing dashboard totals remain stable except where corrected by canonical official-field enforcement.
