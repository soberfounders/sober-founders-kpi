# Leads + Attendance Funnel: Future Coding Instructions

## Purpose
Durable implementation guidance for future work on the Leads / Attendance modules so identity stitching and attribution remain consistent across:

- Meta Ad lead -> HubSpot contact
- Lu.ma registration -> HubSpot contact (Zapier-created, often duplicate/merge)
- Zoom attendance -> HubSpot contact (best when HubSpot Call activity mapping exists)

This file is intentionally redundant with other docs. Treat it as the operational reference for future coding.

## Source of Truth (Business Rule)
- `HubSpot` is the source of truth for contact identity + attribution when data exists.
- The dashboard is an analytics layer and should not create a competing truth system.
- Use cached/raw tables in Supabase for performance and reproducibility.
- Use fallback matching (Lu.ma/) only when HubSpot truth is unavailable or delayed.

## Auto-Creation / Merge Behavior (Critical)
- Meta leads auto-create HubSpot contacts via Meta->HubSpot integration.
- Lu.ma registrations auto-create HubSpot contacts via Zapier.
- If the same person uses a different email, HubSpot merges are common.
- The absorbed email is usually preserved in `hs_additional_emails` on the surviving HubSpot contact.
- Therefore all matching must check:
  1. primary email (`email`)
  2. secondary emails (`hs_additional_emails`)
  3. name fallbacks only after email checks fail

## Matching Priority (Required)
For identity stitching in Leads/Attendance:

1. `email` (primary)  
2. `secondary_email` (`hs_additional_emails`)  
3. `full_name` (normalized exact)  
4. `fuzzy_name` (first + last initial / prefix + last initial)  
5. `unmatched`

Rules:
- Store match confidence on the derived/unified row.
- `fuzzy_name` matches must remain visible and reviewable.
- Do not silently treat fuzzy matches as certain attribution.

## HubSpot Call / Meeting Activity Mapping (Highest Confidence for Zoom)
- Zoom attendee -> HubSpot Call activity association is the highest-confidence attendee identity signal.
- It is often delayed because manual HubSpot attendee tagging may happen after the meeting.
- Keep hybrid behavior:
  - Prefer HubSpot Call/meeting mapping when available
  - Fallback to Lu.ma/name matching when missing
  - Reconcile later (D+1 / D+3 / D+7 / rolling 30-day backfill)

## Attribution Precedence (Required)
When determining acquisition source:

1. HubSpot original source (`hs_analytics_source` + drilldowns)
2. HubSpot source recovered via Lu.ma-linked HubSpot contact
3. Lu.ma "How did you hear about Sober Founders?" normalized category (fallback only)
4. Unknown

### Specific rules
- `PAID_SOCIAL` => always treat as `Paid Social (Meta)` for this dashboard.
- `OFFLINE` is often a record-creation artifact (Lu.ma/Zapier/CRM UI), not true acquisition source.
- If HubSpot source is `OFFLINE` and Lu.ma self-report has a stronger signal (Referral/Meta/Google), prefer Lu.ma for acquisition interpretation.

## HubSpot Merge / Duplicate Attribution Rule
- The "real" original source for a merged person should be anchored to the **oldest HubSpot `createdate`** (user-confirmed business rule).
- When selecting among multiple possible HubSpot records, prefer:
  - valid attribution fields
  - revenue/sobriety completeness
  - oldest created date for attribution anchoring (tie-break awareness)

## Tuesday vs Thursday Funnel Reality
- Thursday often flows through Lu.ma (registrant -> hubspot_call ).
- Tuesday often bypasses Lu.ma and comes through apply/interview + Zoom.
- Do not assume Lu.ma coverage for all attendance analysis.
- Attendance modules must support Tuesday via HubSpot Calls evidence directly.

## Data Quality / Missing Reasons (Required UX Behavior)
When matching fails or attribution is weak, surface why:
- no email
- no primary/secondary email match
- no HubSpot full-name match
- ambiguous fuzzy match
- HubSpot OFFLINE likely Zap/Lu.ma artifact
- matched HubSpot contact exists but not in selected Meta base window

Do not allow silent failures in drilldowns.

## Non-Breaking Engineering Constraints (Required)
- Additive changes only unless explicitly approved.
- Do not remove or rewrite existing Leads/Attendance panels.
- Do not delete or alter existing columns/views/tables used by current dashboards.
- Prefer:
  - new views
  - new tables
  - new modules/panels
  - optional fetches that degrade gracefully if migrations are not applied yet

## Current Additive Assets (as of this phase)
- HubSpot meeting/call activity raw tables + associations (migration)
- `sync_hubspot_meeting_activities` edge function
- Attendance dashboard HubSpot identity enrichment (non-breaking)
- Leads `Unified Funnel (Meta to Lu.ma to hubspot calls)` panel with:
  - funnel rates
  - match confidence breakdowns
  - unmatched/review queues
  - HubSpot Call coverage rate

## Deployment / Backfill Expectations
- Apply migrations first.
- Backfill HubSpot meeting/call activities before expecting strong call coverage metrics.
- Reconcile recent windows after manual HubSpot attendee tagging is complete.
- Missing dates in Zoom sync (example: Jan 29, 2026) should be handled via backfill + HubSpot call evidence.

## Validation Checklist for Future Changes
- `npm run build` passes in `dashboard/`
- Existing Leads panels still render
- Existing Attendance panels still render
- New logic degrades gracefully if optional tables are absent
- Drilldowns remain clickable and show explicit missing reasons
- Match confidence categories remain visible

