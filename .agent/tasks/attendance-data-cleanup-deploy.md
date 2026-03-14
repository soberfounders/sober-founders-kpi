# Attendance Data Cleanup Agent - Deployment Task

## Objective

Deploy the Attendance Data Cleanup Agent to remove stale Zoom-shaped contracts,
rename misleading fields, and align attendance code and docs with the
HubSpot-only dashboard model.

## Status

- [x] Agent charter written
- [x] Execution board created in `docs/attendance-hubspot-truth-execution-board.md`
- [ ] Repo-wide Zoom reference inventory completed
- [ ] Dead attendance fetches and state removed
- [ ] Remaining attendance naming migrated from `zoom*` semantics to
      `attendance*` or `hubspot*`
- [ ] Docs updated to match the cleanup result

## Remaining Steps

### Step 1 - Inventory all legacy references

Classify every existing Zoom reference into one of these buckets:

- active dashboard dependency
- dead fetch or dead state
- rename-only legacy field
- historical note that can remain in audits only

### Step 2 - Remove dead paths

Prioritize removal of:

- unused `zoomRows` state in dashboard attendance flows
- `kpi_metrics` queries for `Zoom Meeting Attendees` where no KPI depends on
  them
- comments and labels that still describe attendance as Zoom-based

### Step 3 - Normalize language

Rename surviving attendance fields and UI copy so the business contract reads as:

- HubSpot attendance sessions
- HubSpot attendee matches
- HubSpot Tuesday and Thursday sessions

not:

- Zoom sessions
- Zoom show-ups
- Zoom net-new matches

## Key Contract Definitions (Must Not Change)

- The dashboard should not use Zoom names or Zoom meeting IDs to classify
  attendance.
- Lu.ma can remain a Thursday registration source, but not the source of truth
  for attendance counts when HubSpot attendee data is available.
- Cleanup is complete only when product-facing attendance semantics are
  HubSpot-first across code, docs, and tests.
