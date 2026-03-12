# Attendance Weekly Schedule Gap Audit

Date: 2026-03-12  
Scope: Attendance dashboard warning text for weekly gap audit examples.

## Issue

`Weekly Schedule Gap Audit` displayed Monday dates under:

- `Tuesday missing weeks`
- `Thursday missing weeks`

Those values were raw week-start anchors (`weekKey`) and were misleading as session examples.

## Expected Behavior

- Keep weekly-gap counting logic unchanged.
- Display expected session dates in examples:
  - Tuesday gaps: `weekKey + 1 day`
  - Thursday gaps: `weekKey + 3 days`
- Make examples explicit as meeting dates.

## Code Changes Verified

- Added `scheduledDateKeyFromWeekKey(weekKey, dayType)`:
  - `dashboard/src/views/AttendanceDashboard.jsx`
- Updated `scheduleCoverageWarning` formatter to render converted dates and label them as `meeting dates`.

## Validation Steps

1. Static quality checks
   - `npx eslint dashboard/src/views/AttendanceDashboard.jsx`
   - Result: PASS

2. Build validation
   - `npm --prefix dashboard run build`
   - Result: PASS

3. Deterministic date mapping sanity check
   - Inputs from reported warning:
     - Tuesday week keys: `2025-06-16`, `2025-06-23`, `2025-06-30`
     - Thursday week keys: `2025-06-30`, `2025-07-07`, `2025-08-11`
   - Output:
     - Tuesday: `2025-06-17`, `2025-06-24`, `2025-07-01`
     - Thursday: `2025-07-03`, `2025-07-10`, `2025-08-14`
   - Result: PASS

## Regression Risk Review

- Counting semantics unchanged (`listMissingWeekKeys` still operates on week anchors).
- Only warning example rendering changed.
- No impact to analytics aggregation, trend charts, or KPI computations.

## QA Verdict

PASS: Weekly schedule gap warning now reports session-relevant Tuesday/Thursday meeting dates instead of Monday week starts.
