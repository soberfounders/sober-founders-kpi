# QA Checklist: Zoom API Removal

**Commit:** `58d1096` — fix(sync): remove all Zoom API code, edge functions, and freeze utilities
**Date:** 2026-03-14
**Scope:** Removed all Zoom API dependencies. HubSpot is now the sole attendance source of truth.

---

## 1. Deleted Files — Verify Gone

- [ ] `supabase/functions/sync_zoom_attendance/index.ts` no longer exists
- [ ] `supabase/functions/reconcile_zoom_attendee_hubspot_mappings/index.ts` no longer exists
- [ ] `supabase/functions/_shared/zoom_freeze.ts` no longer exists
- [ ] `scripts/trigger_zoom_sync.ts` no longer exists
- [ ] `scripts/diagnose_zoom_history.ts` no longer exists

## 2. No Dangling Imports

- [ ] Grep `supabase/functions/` for `zoom_freeze` — expect 0 results
- [ ] Grep `supabase/functions/` for `ZOOM_ACCOUNT_ID` — expect 0 results
- [ ] Grep `supabase/functions/` for `ZOOM_CLIENT_ID` — expect 0 results
- [ ] Grep `supabase/functions/` for `ZOOM_CLIENT_SECRET` — expect 0 results
- [ ] Grep `supabase/functions/` for `getZoomFreezeConfig` — expect 0 results
- [ ] Grep `supabase/functions/` for `shouldFreezeZoom` — expect 0 results
- [ ] Grep `supabase/functions/` for `buildZoomFreezePayload` — expect 0 results
- [ ] Grep `supabase/functions/` for `buildZoomFreezeWarning` — expect 0 results

## 3. master-sync/index.ts — Unchanged

- [ ] Verify `supabase/functions/master-sync/index.ts` has NO references to `sync_zoom_attendance`, `reconcile_zoom`, or `zoom_freeze`
- [ ] Verify it still invokes: `hubspot_incremental_sync`, `hubspot_reconcile_sync`, `sync_hubspot_meeting_activities`, `sync-metrics`, `sync_google_analytics`, `sync_search_console`, `sync_fb_ads`, `sync_luma_registrations`

## 4. sync-metrics/index.ts — Cleaned

- [ ] No import of `zoom_freeze.ts`
- [ ] No `getZoomFreezeConfig()` call
- [ ] No `buildZoomFreezeWarning()` call
- [ ] The `syncZoom` function is fully removed (was ~160 lines of dead code)
- [ ] The `zoom` slug case exists but is a no-op comment (`// Zoom integration removed — skip silently`)
- [ ] The `mailchimp` slug case no longer references zoom freeze warnings
- [ ] The `notion` and `mailchimp` sync logic is intact and unchanged

## 5. sync_luma_registrations/index.ts — Cleaned

- [ ] No import of `zoom_freeze.ts`
- [ ] No `getZoomFreezeConfig()` call
- [ ] No `zoomFreeze` variable
- [ ] No `shouldKeepLegacyMatch` variable or branch
- [ ] No `postFreezeEventsPresent` variable or warning block
- [ ] No `existingByKey` / `existingRegistrations` / `existingRows` queries (were only used by the legacy match branch)
- [ ] `matchThursdayAttendance()` is always called (no conditional freeze bypass)
- [ ] The function still writes BOTH `matched_attendance*` AND `matched_zoom*` columns to the same values (backward compat)
- [ ] HubSpot contact matching logic (`matchHubspotContact`, `buildHubspotIndexes`, etc.) is untouched
- [ ] HubSpot activity/attendance logic (`buildThursdayHubspotAttendanceIndex`, `classifyHubspotThursdaySession`) is untouched

## 6. Dashboard Backward Compatibility

- [ ] `dashboard/src/views/LeadsDashboard.jsx` reads `matched_attendance ?? matched_zoom` — both columns still written by sync_luma_registrations
- [ ] `dashboard/src/lib/leadAnalytics.js` reads `row?.matched_attendance ?? row?.matched_zoom` — same
- [ ] `dashboard/src/lib/leadsGroupAnalytics.js` reads `row?.matched_attendance ?? row?.matched_zoom` — same
- [ ] No dashboard file imports or calls any deleted function

## 7. Functional Smoke Test

- [ ] Click "Refresh Data" button in dashboard header
- [ ] Verify sync completes without errors (alert should say "Data refresh completed...")
- [ ] Verify HubSpot contacts sync (check `raw_hubspot_contacts` table has recent `updated_at`)
- [ ] Verify HubSpot calls/meetings sync (check `raw_hubspot_meeting_activities` table)
- [ ] Verify attendance data still appears on dashboard (Attendance tab shows sessions)
- [ ] Verify no errors in Supabase edge function logs mentioning `zoom_freeze`, `ZOOM_ACCOUNT_ID`, or missing imports
