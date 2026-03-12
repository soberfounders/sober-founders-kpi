# Attendance Show-Up Drilldown Readability Audit

Date: 2026-03-12  
Scope: Improve readability/contrast of Attendance `Show-Up Drilldown` panel on dark dashboard surfaces.

## Problem

Show-Up Drilldown rendered low-contrast dark text tokens on dark navy card/table surfaces, making attendee data difficult to read.

## Plan Executed

1. Locate all text, table, badge, and chip styles in the drilldown block.
2. Replace low-contrast hardcoded dark text tokens with theme-safe CSS variables.
3. Improve table legibility with stronger header contrast and alternating row surfaces.
4. Keep existing behavior/data unchanged (visual-only refactor).

## Changes Verified

- File: `dashboard/src/views/AttendanceDashboard.jsx`
- Block: Show-Up Drilldown section
- Adjustments:
  - Converted low-contrast text colors to:
    - `var(--color-text-primary)`
    - `var(--color-text-secondary)`
    - semantic vars (`--color-success`, `--color-warning`, `--color-info`, etc.)
  - Updated cards/table containers to dark-theme-safe surfaces and borders.
  - Added alternating table row surfaces for scannability.
  - Reworked action chips/buttons to readable contrast on dark background.

## QA Checks

1. Lint
   - Command: `npx eslint dashboard/src/views/AttendanceDashboard.jsx`
   - Result: PASS

2. Build
   - Command: `npm --prefix dashboard run build`
   - Result: PASS

3. Contrast guard check (targeted)
   - Script scanned Show-Up Drilldown line range for known low-contrast dark hex tokens:
     - `#0f172a`, `#334155`, `#475569`, `#64748b`, `#1e293b`, `#94a3b8`
   - Result: PASS (none found in drilldown block)

## Residual Risk

- Visual QA in live browser is still recommended for final signoff across desktop/mobile breakpoints.

## Verdict

PASS: Show-Up Drilldown readability issue is resolved in code, with dark-theme-safe contrast and no black-on-navy data text in the drilldown block.
