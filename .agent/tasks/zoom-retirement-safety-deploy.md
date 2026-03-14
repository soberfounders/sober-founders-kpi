# Zoom Retirement Safety Agent - Deployment Task

## Objective

Deploy the Zoom Retirement Safety Agent to prove that removing legacy Zoom
references will not break attendance KPIs, historical reporting, or release
readiness.

## Status

- [x] Agent charter written
- [x] Execution board created in `docs/attendance-hubspot-truth-execution-board.md`
- [ ] Safety inventory completed for all attendance-related Zoom references
- [ ] Regression tests added for HubSpot-only attendance classification
- [ ] Safe-to-delete list approved with evidence
- [ ] Residual exceptions documented, if any remain

## Remaining Steps

### Step 1 - Build a safe deletion inventory

For every Zoom reference in attendance code paths, record:

- file and line
- current use
- replacement logic
- delete now / rename now / hold temporarily

### Step 2 - Add regression coverage

Before deleting the final legacy references, verify:

- Tuesday 12 PM ET HubSpot session classification
- Thursday 11 AM ET HubSpot session classification
- attendee extraction from HubSpot associations
- duplicate attendee handling
- stale or missing HubSpot data warnings

### Step 3 - Issue a retirement decision

Produce one of these outcomes for each remaining reference:

- safe to delete now
- safe to rename now
- blocked pending downstream consumer confirmation

## Key Contract Definitions (Must Not Change)

- "Safe removal" means dashboard behavior is unchanged except for the intended
  shift to HubSpot-only attendance semantics.
- Any remaining Zoom reference must have a documented reason and an exit plan.
- Release is blocked if attendance parity or regression checks fail after
  cleanup.
