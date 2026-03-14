# QA Specification: Phoenix Card Removal (2026-03-14)

## 1. Header
- **Target Hash(es)**: Pending commit
- **Date**: 2026-03-14
- **Files Changed**:
  - `agents.md`: Updated `PHOENIX_CARD_KEYS` rule to remove `phoenixGreat` and `phoenixCpgl`.
  - `dashboard/src/views/DashboardOverview.jsx`: Removed `phoenixGreat` and `phoenixCpgl` from `KPI_CARD_DEFINITIONS` and `PHOENIX_CARD_KEYS` array.

## 2. Check Groups
**Category: UI Consistency**
- **File**: `dashboard/src/views/DashboardOverview.jsx`
- **Lines**: `PHOENIX_CARD_KEYS` array assignment.
- **Assertion**: `PHOENIX_CARD_KEYS` must exactly equal `['phoenixLeads', 'phoenixQualified', 'phoenixCpql', 'phoenixInterviews']`. `phoenixGreat` and `phoenixCpgl` must be absent.
- **Bug Prevented**: Rendering unwanted or deprecated metric cards on the dashboard, out of sync with business requirements.

**Category: Documentation**
- **File**: `agents.md`
- **Lines**: Dashboard Section Order rule for `PHOENIX_CARD_KEYS`.
- **Assertion**: Must reflect the exact 4 cards remaining for the Phoenix funnel.
- **Bug Prevented**: Future agents re-introducing deprecated cards due to stale documentation truth.

## 3. Regression Scan
Run these mechanically and verify expected output:

```bash
# No stale '0' fallbacks in formatting helpers
grep -n "return '0'" dashboard/src/lib/dashboardKpiHelpers.js
grep -n "return '0.00'" dashboard/src/lib/dashboardKpiHelpers.js
# EXPECTED: No output from either.

# No hardcoded invertColor: false
grep -n "invertColor: false" dashboard/src/views/DashboardOverview.jsx
# EXPECTED: No output.

# normalizeZoomSessions not called in computeKpiSnapshot
grep -n "normalizeZoomSessions" dashboard/src/views/DashboardOverview.jsx
# If matches: confirm NOT inside computeKpiSnapshot. Dead function existing is acceptable.

# No stale CSS variable in Attendance
grep -n "var(--color-text-secondary)" dashboard/src/views/AttendanceDashboard.jsx
# EXPECTED: No output.

# Dual matchers (must contain ||)
grep "matchesPhoenixInterview\s*=" dashboard/src/views/DashboardOverview.jsx
grep "matchesFreeGroupInterview\s*=" dashboard/src/views/DashboardOverview.jsx
# EXPECTED: Both definition lines contain ||.

# Enrichment gate excludes hsAssocsLoadError
grep -n "hsAssocsLoadError" dashboard/src/views/AttendanceDashboard.jsx
# EXPECTED: NONE are on the loadHubspotContactEnrichment call line or its if-condition.

# Section ordering
grep -n "Section [12]" dashboard/src/views/DashboardOverview.jsx
# EXPECTED: Section 1 = Phoenix Forum, Section 2 = Free Group.

# No stale label
grep -rn "'Free Meetings'" dashboard/src/
# EXPECTED: No output.

# Clean git status
git status --short
# EXPECTED: No unexpected modified files under dashboard/src/.
```

## 4. Logic Traces
Not strictly applicable for this change as it involves only deleting static keys/definitions and no computation changes were made. 
- *Input*: `PHOENIX_CARD_KEYS` passed to card renderer.
- *Expected Output*: Exactly 4 cards ("Phoenix Forum Leads", "Phoenix $250k Qualified Leads", "Phoenix CPQL", "Phoenix Forum Interviews") appear in Section 1. No "Phoenix Great Leads" or "Phoenix CPGL" cards are rendered.

## 5. Test/Build Verification
- `npm --prefix dashboard run lint`
  - *Expected*: Exit code 0, no errors (warnings acceptable if pre-existing).
- `node --test "dashboard/tests/**/*.test.mjs"`
  - *Expected*: All tests pass (baseline: ~61 tests).
- `npm --prefix dashboard run build`
  - *Expected*: Build succeeds (chunk size warnings are acceptable).

## 6. Known Non-Issues
- The remaining Phoenix cards and Free cards are expected to remain completely untouched.
- `metaCohortUnitEconPreview` returning chunk size warnings during the build step is a pre-existing non-issue.
- Pre-existing warnings in `LeadsDashboard.jsx` identified during linting are acceptable (e.g., unused variable or react-hooks/exhaustive-deps).

## 7. Verdict
- **APPROVE if**: Both `dashboard/src/views/DashboardOverview.jsx` and `agents.md` reflect the exact removals; testing, linting and building succeed without new errors, and no other areas of the codebase were collateral damage.
- **DO NOT SHIP if**: `phoenixGreat` or `phoenixCpgl` definitions are still exposed via the array or the DOM; any core gate fails.
- **APPROVE WITH NOTE if**: Linting warnings appear but are strictly unrelated to `DashboardOverview.jsx`.
