# Hybrid Zoom + HubSpot Attendee Mapping Plan (Non-Breaking Augmentation)

Purpose: Improve attendee identity mapping and attribution quality without replacing the current Zoom/Lu.ma pipeline. The new HubSpot "meeting/call with many attendees" signal should be used as the highest-confidence mapping source when available, while preserving current behavior as fallback.

## Summary

- Keep current Zoom-based attendance rollups and Lu.ma/HubSpot fallback logic working as-is.
- Add a new HubSpot meeting activity attendee mapping layer (preferred identity signal).
- Use hybrid priority:
  1. Manual override (temporary, explicit user-confirmed corrections)
  2. HubSpot meeting/call attendee association map (best identity truth when present)
  3. Current Zoom canonicalization + alias/name matching to `raw_hubspot_contacts`
  4. Lu.ma email/name bridge + Lu.ma self-reported source fallback
  5. Unknown (with explicit reason)
- Add delayed reconciliation so HubSpot activity mappings can override fallback matches after the meeting (because manual attendee tagging may happen later).

## Why This Is Needed

Current strengths:
- Zoom attendee rows are a strong source for "who showed up".
- Lu.ma registrations are strong for Thursday email/source bridging.
- Current dashboard already exposes missing reasons and manual overrides.

Current gap:
- HubSpot meeting/call activities (with attendee contact associations) are often the best identity mapping signal, but they are not currently synced into Supabase.
- This causes avoidable `Unknown` rows and display-name misses (`SML`, `Robert D`, `Mark Howley` vs `Mark V Howley`).

## Design Principles (Do Not Break What Works)

- Additive only: no destructive schema or logic replacement in phase 1.
- Feature-flag or availability-gated: only use HubSpot meeting mapping when data exists.
- Keep existing fields and drilldowns intact; add new diagnostics instead of changing old semantics abruptly.
- Preserve current Zoom/Lu.ma fallback path for missing Zoom dates, missing HubSpot meeting rows, or delayed manual HubSpot tagging.

## Truth Model (Separate the Concerns)

- Attendance truth (`who showed up`): Zoom attendance rows (`kpi_metrics` / `Zoom Meeting Attendees`)
- Identity truth (`which HubSpot contact that attendee was`): HubSpot meeting/call attendee associations when available
- Attribution truth (`where they came from`): HubSpot contact original source, using oldest `createdate` across duplicate/merged candidates
- Fallback truth (when HubSpot identity is unavailable): Lu.ma email + self-reported `How did you hear...` + name/alias heuristics

## Proposed Priority (Attendee Identity Resolution)

For each Zoom attendee row in the Leads Zoom-first module:

1. `manual_override`
- Existing explicit overrides (user-confirmed)
- Use sparingly; treat as temporary scaffolding

2. `hubspot_meeting_activity_association`
- Match Zoom session -> HubSpot meeting/call activity
- Resolve attendee to HubSpot contact from activity association
- Highest confidence when present

3. `zoom_name_alias_match`
- Existing canonicalization + alias + exact/initial/prefix matching into `raw_hubspot_contacts`
- Current logic remains unchanged as fallback

4. `luma_email_bridge`
- Lu.ma registration email -> HubSpot contact
- Useful when Zoom display name is weak but Lu.ma is present

5. `luma_self_reported_source`
- Lu.ma `How did you hear...` (classification fallback only)

6. `unknown`
- Must include machine-readable reason (no silent failures)

## Time-Delay Reality (Important)

The HubSpot meeting activity mapping is sometimes created only after manual work by you.

Therefore:
- Same day / next morning: HubSpot meeting mapping may be missing
- A few days later: mapping may become available and more accurate than Zoom-only matching

Required solution:
- Run reconciliation on recent meetings (e.g., rolling last 30 days) to upgrade mappings automatically.

Suggested cadence:
- D+1 daily reconciliation
- D+3 retry
- D+7 retry
- Nightly rolling 30-day reconciliation job

## Data Model Additions (Supabase)

Additive tables (no existing table changes required initially):

### `raw_hubspot_meeting_activities`

Stores the HubSpot meeting/call objects used as the session-level bridge.

Suggested columns:
- `hubspot_activity_id` (PK)
- `activity_type` (`meeting` / `call`)
- `created_at`
- `updated_at`
- `hs_timestamp` (activity date/time)
- `title`
- `body_preview`
- `owner_id`
- `portal_id`
- `raw_payload` (jsonb)
- `ingested_at`

### `hubspot_activity_contact_associations`

Stores attendee/contact associations from HubSpot activity objects.

Suggested columns:
- `hubspot_activity_id`
- `hubspot_contact_id`
- `contact_email`
- `contact_firstname`
- `contact_lastname`
- `association_type`
- `ingested_at`

Composite uniqueness:
- (`hubspot_activity_id`, `hubspot_contact_id`, `association_type`)

### `zoom_session_hubspot_activity_matches`

Stores matching between Zoom sessions and HubSpot activities.

Suggested columns:
- `session_key` (e.g., `date|day|meeting_id|start_time`)
- `zoom_metric_date`
- `zoom_meeting_id`
- `zoom_start_time_utc`
- `hubspot_activity_id`
- `match_source` (`time_window`, `manual`, `exact_start_time`)
- `match_confidence` (0-1)
- `match_note`
- `resolved_at`

### `zoom_attendee_contact_mappings` (optional but recommended)

Materialized mapping result per attendee row for reproducibility and debugging.

Suggested columns:
- `session_key`
- `zoom_attendee_raw_name`
- `zoom_attendee_canonical_name`
- `hubspot_contact_id` (nullable)
- `mapping_source`
- `mapping_confidence`
- `mapping_priority_rank`
- `mapping_reason`
- `candidate_hints`
- `resolved_at`
- `resolver_version`

## Edge Function Plan (Additive)

### 1. `sync_hubspot_meeting_activities` (new)

Purpose:
- Pull HubSpot meeting/call activities for a date window
- Pull associated contacts for each activity
- Upsert into the new raw association tables

Requirements:
- Use service-role key for writes
- Use HubSpot private app token for API reads
- Support date-window sync and rolling backfill
- Idempotent upserts

### 2. `reconcile_zoom_attendee_mappings` (new or folded into existing sync)

Purpose:
- For recent Zoom sessions, attempt session-level match to HubSpot meeting/call activities
- If found, map attendees to associated HubSpot contacts and mark mapping source
- Fall back to current name/Lu.ma logic when no HubSpot activity map exists
- Store results in `zoom_attendee_contact_mappings` (optional materialization)

No-break requirement:
- If HubSpot activity tables are empty or unavailable, resolver must continue using current logic

## Session Matching Strategy (Zoom Session -> HubSpot Activity)

Do not rely on local date strings alone (timezone issues).

Use:
- `zoom_meeting_id`
- `zoom metadata.start_time` (UTC)
- Time-window matching (e.g., +/- 12 hours)
- Group/day hints (Tuesday/Thursday)
- Participant overlap heuristic (optional later)

This handles:
- User timezone mismatch (e.g., Jan 29 meeting referenced as Jan 30)
- HubSpot activity logged later than meeting start

## Attendee Mapping Strategy (Within a Matched Session)

When a HubSpot activity is matched to a Zoom session:

1. Build candidate set from contacts associated to the HubSpot activity (usually ~10-30 people, not whole DB)
2. Match Zoom display names against only that candidate set first
3. If unresolved, apply existing alias/canonicalization heuristics
4. If still unresolved, fall back to Lu.ma email bridge / source fallback

Why this is much better:
- `SML` can be resolved to `Samantha Lander` within a small, known attendee set
- Avoids guessing across thousands of HubSpot contacts

## Dashboard Integration Plan (Leads Module)

Current insertion point:
- `dashboard/src/views/LeadsDashboard.jsx` inside `zoomSourceModule` attendee enrichment (`enrichRows`)

Augmentation (not replacement):
- Add a new resolver stage before current `pickContactForAttendee(...)`
- If HubSpot activity mapping exists for the session/attendee:
  - use mapped `hubspot_contact_id`
  - mark `matchLookupStrategy = hubspot_meeting_activity`
  - mark `sourceAttributionMethod` based on HubSpot contact original source
- Else run existing logic unchanged

Add fields (drilldown/debug):
- `identityMappingSource`
- `identityMappingConfidence`
- `hubspotActivityId`
- `hubspotActivityMatchNote`
- `hubspotActivityAvailable` (`Yes/No`)

## Rollout Plan (Safe, Phased)

### Phase 0 (Now) - Foundation (done/in progress)
- Keep current Zoom/Lu.ma mapping live
- Add explicit missing reasons
- Add manual override layer
- Document OFFLINE and merge rules

### Phase 1 - Data Ingestion (No UI Behavior Change)
- Create new HubSpot activity raw/association tables
- Build `sync_hubspot_meeting_activities`
- Backfill last 60-120 days
- Validate data presence for known meetings (including 2026-01-29)

Success criteria:
- HubSpot activity rows and associated contacts are present in Supabase
- No changes to current dashboard outputs yet

### Phase 2 - Shadow Resolver (Compare, Do Not Replace)
- Build hybrid resolver in parallel to current resolver
- Compute both:
  - `current_mapping_result`
  - `hubspot_activity_mapping_result`
- Log/track differences in diagnostics

Success criteria:
- Improved match rate in shadow mode
- No regressions in existing rows

### Phase 3 - Controlled Activation
- Prefer HubSpot activity mapping when available
- Fall back to current logic automatically
- Keep manual overrides active

Success criteria:
- Unknown rate drops materially
- Manual override count trends down over time
- No loss in existing metrics/drilldowns

### Phase 4 - Reconciliation + Cleanup Workflow
- Add rolling 30-day reconciliation job
- Add "Attribution Cleanup Queue" panel (Unknown / OFFLINE provisional / high-repeat unresolved)
- Add override retirement prompts when raw data catches up

## Validation / QA Scenarios

Use these cases during rollout:

### Known display-name mismatch cases
- `SML` -> `Samantha Lander`
- `Robert D` -> `Robert Davidman`
- `Mark Howley` -> `Mark V Howley`
- `Matthew S` -> `Matthew Shiebler`

Expected result:
- HubSpot activity attendee set reduces ambiguity and improves mapping confidence

### Jan 29, 2026 Thursday meeting
- Current state observed:
  - Lu.ma registrations exist in `raw_luma_registrations`
  - no `Zoom Meeting Attendees` row in `kpi_metrics`
  - no HubSpot meeting activity sync exists yet
- After implementation:
  - HubSpot meeting activity sync should recover attendee contact set (when manually mapped in HubSpot)
  - If Zoom row remains missing, system should clearly flag "attendance row missing" instead of silent attribution gaps

## Operational Cleanup Process (User Workflow)

1. Review `Attribution Cleanup Queue`
2. Resolve obvious identities in HubSpot (merge duplicates, verify source)
3. Ensure HubSpot meeting activity attendee tags are correct (when available)
4. Run sync/reconciliation jobs
5. Confirm dashboard upgrade of mappings
6. Retire manual overrides once replaced by synced truth

## Risks and Mitigations

Risk: HubSpot meeting activity is delayed or absent
- Mitigation: keep current Zoom/Lu.ma fallback path and reconciliation retries

Risk: Sync gaps (Zoom missing date rows)
- Mitigation: add missing-session diagnostics and Zoom backfill tooling

Risk: Conflicting signals (HubSpot OFFLINE vs Lu.ma source)
- Mitigation: keep existing OFFLINE provisional rule; prefer merged oldest-contact attribution when available

Risk: Regression in current dashboard
- Mitigation: phased shadow mode + additive tables + no replacement until validated

## Immediate Next Implementation Tasks

1. Create migrations for HubSpot meeting activity tables (additive only)
2. Build `sync_hubspot_meeting_activities` edge function
3. Backfill last 90 days
4. Add `hubspotActivityAvailable` diagnostics to current Zoom drilldowns
5. Implement hybrid resolver in shadow mode
6. Add `Attribution Cleanup Queue` UI panel
