# Attendance + HubSpot Identity Rollout Playbook (Non-Breaking)

Purpose: Improve attendee identity accuracy and HubSpot linkage without breaking current Zoom/Lu.ma analytics.

## What Is Already Safe

- Current attendance counts still come from `kpi_metrics` (`Zoom Meeting Attendees`)
- New HubSpot identity fields in Attendance dashboard are enrichment only (email/link/mapping source)
- Existing Leads/Attendance analytics logic remains intact

## New Pieces Added

- Additive tables for HubSpot meeting/call activities + associations + future mapping outputs
- New edge function: `sync_hubspot_meeting_activities`
- New shadow reconciliation scaffold: `reconcile_zoom_attendee_hubspot_mappings`
- Attendance drilldown now shows:
  - HubSpot match status
  - HubSpot email
  - Open in HubSpot link
  - identity mapping source / confidence / reason

## Recommended Rollout Sequence

### 1. Apply DB migration (additive)

Run:

```bash
npx supabase db push
```

This creates:
- `raw_hubspot_meeting_activities`
- `hubspot_activity_contact_associations`
- `zoom_session_hubspot_activity_matches`
- `zoom_attendee_hubspot_mappings`

### 2. Deploy HubSpot meeting activity sync function

Run:

```bash
npx supabase functions deploy sync_hubspot_meeting_activities
```

Optional (recommended now, shadow mode only):

```bash
npx supabase functions deploy reconcile_zoom_attendee_hubspot_mappings
```

Ensure env vars exist in Supabase project:
- `HUBSPOT_PRIVATE_APP_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional: `HUBSPOT_PORTAL_ID`

### 3. Backfill HubSpot meeting/call activities (recent history first)

Start with last 30 days:

```bash
npx supabase functions invoke sync_hubspot_meeting_activities --no-verify-jwt --body "{\"days\":30}"
```

Then extend:

```bash
npx supabase functions invoke sync_hubspot_meeting_activities --no-verify-jwt --body "{\"days\":90}"
```

If you want a specific range (useful for timezone/date debugging):

```bash
npx supabase functions invoke sync_hubspot_meeting_activities --no-verify-jwt --body "{\"from\":\"2026-01-20\",\"to\":\"2026-02-05\"}"
```

### 4. Re-sync / backfill Zoom attendance if a date is missing

If a meeting happened but no `Zoom Meeting Attendees` row exists (example: `2026-01-29`), run:

```bash
npx supabase functions invoke sync_zoom_attendance --no-verify-jwt
```

Then verify `kpi_metrics` has the missing date.

### 5. Re-sync Lu.ma registrations (optional but recommended after cleanup)

This refreshes Lu.ma bridges and `matched_hubspot_*` fields:

```bash
npx supabase functions invoke sync_luma_registrations --no-verify-jwt
```

### 6. Validate in Attendance dashboard

Look at the **Show-Up Drilldown** table for a recent Thursday:
- `HubSpot Match` should increase
- `HubSpot Email` and `Open in HubSpot` should be visible for more rows
- `Mapping Source` / `Missing Identity Reason` should make unresolved rows actionable

### 7. Run shadow reconciliation summary (no writes yet)

```bash
npx supabase functions invoke reconcile_zoom_attendee_hubspot_mappings --no-verify-jwt --body "{\"days\":30,\"dry_run\":true}"
```

This confirms:
- Zoom sessions are present
- HubSpot activity tables are populated
- how many sessions currently have a HubSpot activity match record

## Fact-Checking Workflow (Recommended)

When a row is wrong/missing:

1. Open the attendee row in Attendance drilldown
2. Check `Mapping Source`
3. If `manual_override`, verify it matches current HubSpot truth
4. If `none` / `luma_unresolved_bridge`, search in HubSpot by:
   - Zoom name
   - Lu.ma email
   - alternate email / merged record
5. Merge/fix in HubSpot
6. Re-run:
   - HubSpot meeting activity sync
   - Lu.ma sync (if needed)
   - Zoom sync (if attendance row missing)

## Important Notes

- HubSpot meeting/call activities are the best identity signal **when present**
- They may be delayed if attendee mapping in HubSpot is done manually after the meeting
- Current system should keep working using Zoom/Lu.ma fallback during that delay

## Next Build Step (after data is present)

Implement `reconcile_zoom_attendee_hubspot_mappings` to materialize:
- `zoom_session_hubspot_activity_matches`
- `zoom_attendee_hubspot_mappings`

That will let Attendance and Leads prefer HubSpot meeting-attendee mappings automatically and reduce manual overrides.
