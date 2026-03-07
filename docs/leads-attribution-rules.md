# Leads Attribution Rules (Working Notes)

Purpose: Preserve business rules and debugging heuristics for Leads/Zoom/Lu.ma attribution so future work does not lose context.

## Source precedence (current business intent)

1. HubSpot `hs_analytics_source` (Original Traffic Source) is source of truth when available.
2. HubSpot source recovered via Lu.ma-linked contact is still HubSpot source (acceptable).
3. Lu.ma answer to `How did you hear about Sober Founders?` is fallback only.
4. `Unknown` only after all above fail.

## Attendee identity mapping priority (hybrid plan)

When mapping Zoom attendees to HubSpot contacts (for show-up analysis), use this identity priority:

1. Manual override (temporary, user-confirmed)
2. HubSpot meeting/call activity attendee associations (best when available)
3. Zoom canonicalization + alias/name matching into `raw_hubspot_contacts`
4. Lu.ma email/name bridge
5. Unknown (with explicit reason)

Notes:
- Attendance truth still comes from Zoom (`who showed up`).
- HubSpot meeting/call activity is preferred for identity truth (`which contact it was`) when available.
- HubSpot mapping may be delayed if attendee tagging happens after the meeting; reconciliation retries are required.

## Paid attribution rule

- If HubSpot Original Traffic Source is `PAID_SOCIAL`, attribute as `Paid Social (Meta)`.

## KPI contract: Total Unique Paid Leads (must stay stable)

This KPI is intentionally strict and should not be reinterpreted in future refactors.

- **Metric name:** `Total Unique Paid Leads (Last Week)`
- **Source of truth:** `raw_hubspot_contacts` (HubSpot), not Meta lead totals
- **Source filter:** HubSpot Original Traffic Source = `PAID_SOCIAL`
  - Practical matching currently used in code: `original_traffic_source`, `hs_analytics_source`, `hs_latest_source` contains `PAID_SOCIAL`
- **Time window:** Previous full Monday-Sunday week in **America/New_York**
- **Uniqueness:** one real person once, merge-aware
  - Exclude merged/deleted rows:
    - `merged_into_hubspot_contact_id IS NULL`
    - `is_deleted = false`
    - `hubspot_archived = false`
  - Dedupe by canonical HubSpot identity (`hubspot_contact_id` + `hs_additional_emails` fallback)
- **Important:** Meta `leads` can be used for spend/CPL context, but **must never define this unique total KPI**.

### Regression that was fixed (53 -> 51)

Root cause:
- The dashboard counted raw paid-social contact rows (and in one card, even Meta leads), which allowed merged/archived duplicate records to inflate totals.

Observed issue:
- Raw row count for last week: `53`
- Correct merge-aware unique paid-lead count: `51`

The two overcounted records were merged/archived contact rows:
- `hubspot_contact_id=205309778512` -> `merged_into_hubspot_contact_id=205618290357`
- `hubspot_contact_id=205551557982` -> `merged_into_hubspot_contact_id=205723057048`

### Never-again guardrails (required)

1. **Do not label Meta lead counts as unique paid leads.**
   - If a card says "Total Unique Paid Leads", it must come from HubSpot merge-aware deduped logic.
2. **Always ET-week bucket HubSpot created dates.**
   - Last-week boundaries must be computed in `America/New_York`.
3. **Always enforce merge/deletion filters before counting.**
   - Never count rows where contact is archived/deleted/merged-into another contact.
4. **Keep an acceptance check in PR validation for this KPI:**
   - `raw paid_social rows (last week)` vs `corrected unique paid leads (last week)` and verify corrected value is expected.
5. **When this KPI changes unexpectedly, first audit for merge artifacts and stale sync state before changing attribution rules.**

## OFFLINE interpretation rule (important)

- `OFFLINE` in HubSpot often means the contact record was created via integration (commonly Lu.ma -> Zapier -> HubSpot) before a proper lead/contact match existed.
- In practice, this usually means the person registered in Lu.ma with an email that did not match an existing HubSpot contact at that moment.
- Do not automatically treat `OFFLINE` as final acquisition source in analysis.
- For `OFFLINE`, prefer supplemental evidence:
  - Lu.ma registration timing
  - Lu.ma `How did you hear...`
  - HubSpot original source from a duplicate/merged contact if discoverable

## Duplicate / cross-email reality

- Same person may:
  - become a lead with one email
  - register in Lu.ma with another email
  - appear in Zoom with display name only
- This happens frequently and may be obvious within ~720 hours (30 days), but can also persist longer.
- Merged contacts are common and usually caused by the same person using different email addresses.
- In HubSpot UI, merged records can still be found by either historical email or name.
- Merge history is visible in the contact activity log.

## "Real" original source rule for merged people

- When multiple HubSpot contacts appear to represent the same person, treat the **oldest HubSpot `createdate`** as the source-of-truth for original acquisition attribution.
- This rule is specifically for attribution (where they came from).
- Revenue / profile enrichment may still come from the most complete surviving record, but attribution should anchor to oldest creation.

## Matching expectations

- User expectation: >95% of Zoom attendees should be matchable to HubSpot with correct logic/cleanup.
- When unmatched, treat as a matching/data-sync problem first, not true unknown source.

## Known data quality heuristics to add/maintain

- Personal-name answers in Lu.ma `How did you hear...` (e.g., `Andrew`, `Brooke R`) usually imply `Referral`.
- Case-insensitive matching for emails and names is required.
- Keep alias/canonicalization workflow for Zoom display names.
- Surface candidate hints / mismatch reasons in drilldowns (no silent failures).

## Upstream data caveat (Supabase sync)

- `raw_hubspot_contacts` is not necessarily a full HubSpot mirror.
- Current `sync_kpis` HubSpot sync pulls contacts by `createdate` week windows.
- If a person exists in HubSpot UI but not `raw_hubspot_contacts`, dashboard attribution will fail unless:
  - a backfill was run for that contact's creation period, or
  - another sync path stores enough attribution data.

## Debugging checklist for "should be known" attendees

1. Check exact Zoom attendee display name (and aliases).
2. Check Lu.ma registrations for same/similar name and alternate emails.
3. Check `raw_luma_registrations.matched_hubspot_*` fields.
4. Check `raw_hubspot_contacts` for:
   - primary email
   - `hs_additional_emails`
   - original traffic source
   - oldest `createdate` across duplicate candidates (for attribution)
5. If missing in `raw_hubspot_contacts`, classify as HubSpot sync coverage gap (not source logic failure).
6. If HubSpot says `OFFLINE`, inspect Lu.ma `How did you hear...` and early registration context before final attribution.
