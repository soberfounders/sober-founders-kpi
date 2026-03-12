# Attendance Identity Warning Audit (Optional Column Noise)

Date: 2026-03-12  
Scope: False-positive Attendance `Identity Mapping Warning` caused by missing optional alias columns in `raw_hubspot_contacts`.

## Issue

Attendance displayed user-facing warnings:

- `Attendance HubSpot contacts query auto-recovered from missing optional column annual_revenue_in_usd_official.`
- `Attendance HubSpot contacts query auto-recovered from missing optional column sobriety_date__official_.`

These columns are optional aliases in mixed-schema environments, so warnings were noisy and implied partial enrichment when core enrichment could still succeed.

## Root Cause

- `resolveAttendanceHubspotContactSelectColumns()` emits warnings for missing projection columns unless the column is in `ATTENDANCE_HUBSPOT_CONTACT_SILENT_FALLBACK_COLUMNS`.
- `annual_revenue_in_usd_official` and `sobriety_date__official_` were not in the silent list.
- Missing either column therefore surfaced a warning banner despite successful fallback to other enrichment fields.

## Fix

Added both columns to `ATTENDANCE_HUBSPOT_CONTACT_SILENT_FALLBACK_COLUMNS`:

- `annual_revenue_in_usd_official`
- `sobriety_date__official_`

This keeps schema auto-recovery behavior but suppresses non-actionable user-facing warning noise.

## Strict QA

1. Lint
   - Command: `npx eslint dashboard/src/views/AttendanceDashboard.jsx`
   - Result: PASS

2. Build
   - Command: `npm --prefix dashboard run build`
   - Result: PASS

3. Behavior validation (warning filter logic)
   - Verified both columns are now in silent-fallback set.
   - Sanity check:
     - `annual_revenue_in_usd_official` -> silent
     - `sobriety_date__official_` -> silent
     - `sync_source` -> still warns
   - Result: PASS

## Regression Risk Review

- No data-shape or query-path changes.
- No changes to required column handling.
- Warnings for genuinely actionable non-silent columns remain intact.

## QA Verdict

PASS: Non-actionable identity warnings for optional legacy alias columns are now suppressed without affecting attendance counts or enrichment fallback behavior.
