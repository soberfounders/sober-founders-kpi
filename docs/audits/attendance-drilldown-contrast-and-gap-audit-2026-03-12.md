# Attendance Drilldown Contrast + Gap Audit

Date: 2026-03-12  
Scope: Long-term fix for unreadable Show-Up Drilldown visuals and stale Weekly Schedule Gap warnings.

## Problems

1. Show-Up Drilldown remained hard to read (dark text perception on dark/navy surfaces).
2. Weekly Schedule Gap warning surfaced stale historical gaps (2025) that should not drive current operations.

## Long-Term Fixes Implemented

1. Dedicated high-contrast surface tokens added to global theme:
   - `--color-surface-contrast`
   - `--color-surface-contrast-alt`
   - `--color-surface-contrast-header`

2. Show-Up Drilldown now uses those contrast tokens across:
   - Panel wrapper
   - Summary stat cards
   - Mobile attendee cards
   - Desktop table container, header, zebra rows
   - Action chips/buttons

3. Gap-audit logic changed from full-history range scan to trailing recent-window scan:
   - New constant: `SCHEDULE_GAP_AUDIT_LOOKBACK_WEEKS = 8`
   - Anchored on latest observed week key
   - Ignores known expected-zero weeks via `EXPECTED_ZERO_WEEK_KEYS_BY_DAY`
   - Warning copy now explicitly states: `Recent 8-week audit`

## QA Performed

1. Lint
   - Command: `npx eslint dashboard/src/views/AttendanceDashboard.jsx`
   - Result: PASS

2. Build
   - Command: `npm --prefix dashboard run build`
   - Result: PASS

3. Logic verification (targeted)
   - Verified presence of required long-term-fix snippets in source.
   - Simulated recent-window gap check with historical missing weeks plus current complete weeks:
     - Result: historical 2025 gaps excluded from recent 8-week audit.
   - Result: PASS

4. Contrast guard (targeted)
   - Scanned Show-Up Drilldown render block for known low-contrast dark hex values:
     - `#0f172a`, `#334155`, `#475569`, `#64748b`, `#1e293b`, `#94a3b8`
   - Result: none found in drilldown block.
   - Result: PASS

## Files Changed

- `dashboard/src/index.css`
- `dashboard/src/views/AttendanceDashboard.jsx`

## Verdict

PASS: Drilldown has hardened high-contrast styling and schedule-gap warnings are now recent-window based, preventing stale historical warnings from showing by default.
