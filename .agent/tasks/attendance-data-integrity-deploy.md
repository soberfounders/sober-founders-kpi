# Attendance Data Integrity Agent - Deployment Task

## Objective

Deploy the Attendance Data Integrity Agent to make HubSpot the only attendance
source of truth for the dashboard and prove that dashboard attendance numbers
match HubSpot numbers for Tuesday 12 PM ET and Thursday 11 AM ET sessions.

## Status

- [x] Agent charter written
- [x] Execution board created in `docs/attendance-hubspot-truth-execution-board.md`
- [ ] Canonical HubSpot attendance selector documented in code and docs
- [ ] Attendance parity checks added to the integrity workflow
- [ ] Latest parity artifact published with 7/30/90 day comparisons
- [ ] Sync freshness gate enforced before release

## Remaining Steps

### Step 1 - Lock the attendance contract

Document the exact HubSpot activity classification rules used by the dashboard:

- Tuesday session: HubSpot call/meeting activity at approximately 12:00 PM
  `America/New_York`
- Thursday session: HubSpot call/meeting activity at approximately 11:00 AM
  `America/New_York`
- Attendee count: unique associated HubSpot contacts per classified session

### Step 2 - Make parity reproducible

Use the existing integrity tooling as the base and add an attendance-specific
parity section that compares:

- dashboard current window counts
- raw HubSpot activity counts
- associated contact counts
- sync freshness state

### Step 3 - Publish release evidence

Publish a markdown audit artifact showing PASS/FAIL for:

- Tuesday attendance parity
- Thursday attendance parity
- net-new attendee logic
- stale sync detection

## Key Contract Definitions (Must Not Change)

- Attendance truth for the dashboard comes only from HubSpot call/meeting
  activities and their contact associations.
- Attendance confidence scoring is retired for this workflow.
- Integrity means parity with HubSpot, reproducible counting logic, and fresh
  synced data.
- Zoom meeting IDs, Zoom meeting names, and `kpi_metrics` rows named
  `Zoom Meeting Attendees` are not valid attendance inputs.
