# Lead Intelligence Framework

This dashboard implementation standardizes lead-gen reporting around a single funnel:

1. Impressions (Meta Ads)
2. Clicks (Meta Ads)
3. Leads Captured (HubSpot PAID_SOCIAL)
4. Luma Registrations
5. Net New Show-Ups (Zoom Tue/Thu only)
6. Qualified Leads (`$250K-$1M` revenue)
7. Great Leads (`>$1M` revenue)

## Source Mapping

- `raw_fb_ads_insights_daily` provides impressions, clicks, spend, leads, and ad identifiers.
- `raw_hubspot_contacts` provides lead records, revenue, and lead-source metadata.
- `kpi_metrics` (`Zoom Meeting Attendees`) provides attendee names by meeting for net-new detection.
- `attendee_aliases` (if available) improves Zoom name normalization during sync.
- `manage_attendee_aliases` (edge function) is the write/read path for alias merges when browser RLS blocks direct table writes.

## Metric Definitions

- `CPL = Spend / Leads`
- `CPQL = Spend / Qualified Leads`
- `CPGL = Spend / Great Leads`
- `Cost Per Show-Up = Spend / Net New Show-Ups`
- `Cost Per Registration = Spend / Registrations`

Conversion rates:

- `Impression -> Click = Clicks / Impressions`
- `Click -> Lead = Leads / Clicks`
- `Lead -> Registration = Registrations / Leads`
- `Registration -> Show-Up = Show-Ups / Registrations`
- `Show-Up -> Qualified = Qualified Leads / Show-Ups`
- `Show-Up -> Great = Great Leads / Show-Ups`

## Net-New Show-Up Rules

- Only Tuesday/Thursday community sessions are used.
- Net new means the attendee has not appeared in prior Tue/Thu sessions in the historical window.
- Returning attendees are excluded from net-new counts.

## Monthly Visit Trend Definition

- Monthly average visits are evaluated at the start of each month (UTC, `YYYY-MM-01`).
- Value for a month is cumulative:
  - `total historical visits before month start / unique attendees seen before month start`.
- Month-over-month change compares the current month-start value to the previous month-start value.
- Year-over-year change compares to the same month-start one year prior (when available).
- Tuesday and Thursday are computed independently.

## Alias Merge Rules

- Merge actions should map alias variants into a stable canonical display name.
- Prefer complete personal names (for example, `Kandace Arena`) over short fragments (for example, `Kandace`).
- If two aliases conflict, the target canonical name should remain the root display name used in future attendance rollups.
- Duplicate recommendations should prioritize names that appear in the currently selected meeting before cross-session suggestions.
- Last-name-only fragments should not override a valid first+last canonical name.
- If an attendee is already represented by a clear first+last name, only suggest merge options when an in-session short alias with the same first name exists (for example, `Drew` or `Drew T`).

Runtime canonicalization guardrails (applied during Zoom/Lu.ma processing and dashboard rollups):

- Hard rules:
  - Any name starting with `Chris Lipper` resolves to `Chris Lipper`.
  - `Allen G*` and `Allen Godard` variants resolve to `Allen Goddard`.
  - Any name starting with `Josh Cougler` resolves to `Josh Cougler`.
  - `Matt S`/`Matt s` resolves to `Matt Shiebler`.
- Generic suffix rule:
  - If a display name starts with a clear `First Last` and then additional words, canonicalize to `First Last` (for example, `Matt Shiebler Interactive Accountants` -> `Matt Shiebler`).

## Attribution Method (Current)

Direct ad-to-contact IDs are not consistently available in the current schema, so the dashboard uses weighted attribution fallback:

1. Group HubSpot paid-social leads by `created_date + funnel`.
2. Group Meta rows by `date + funnel`.
3. Allocate lead quality, registration, and matched show-up counts to ads by weight:
- Primary weight: Meta leads share
- Fallback weight: spend share

This is sufficient for directional budget decisions but not perfect deterministic attribution.

## Thursday Lu.ma Registration Source

Thursday registration sync is handled by Supabase edge function:

- `sync_luma_registrations`
- Required secret: `LUMA_API_KEY` (Supabase function env)

It writes normalized records to:

- `raw_luma_registrations`

Matching performed during sync:

- Lu.ma -> Zoom (`matched_zoom`, `matched_zoom_net_new`) using guest full name against Thursday attendance rosters.
- Lu.ma -> HubSpot (`matched_hubspot`) using email first, then normalized full name fallback.
- Cross-email HubSpot guardrail: if email does not match, name-based auto-match only occurs when normalized full name aligns within `72` hours of registration time.

If `raw_luma_registrations` is missing/unavailable, the dashboard falls back to:

- HubSpot proxy registration (`membership_s` contains `luma` or `registered`).

## Operational Notes

- The Leads dashboard reads the last `120` days by default and computes:
- Week-over-week (`7d` vs prior `7d`)
- Month-over-month (`30d` vs prior `30d`)
- Leads includes a Fact Check Drilldown panel with window selector (`current/previous week`, `current/previous month`, `lookback`) and clickable metric drill-ins.
- `sync_zoom_attendance` should run before analytics review to keep show-up metrics current.
- `sync_luma_registrations` should run before Thursday funnel reviews to refresh registrations and match statuses.
- Deploy `manage_attendee_aliases` before using merge buttons in Attendance:
  - `supabase functions deploy manage_attendee_aliases`
- Run `deno run -A scripts/check_lead_analytics_readiness.ts` after schema changes or environment updates.

## Recommended Next Schema Improvements

1. Add direct Luma registration table (`raw_luma_registrations`) with `email`, `registered_at`, `event_id`.
2. Persist deterministic ad identifiers in HubSpot (`ad_id`, `campaign_id`, `adset_id`) at lead capture time.
3. Store canonical attendee email in Zoom sync metadata for stronger lead-to-show-up matching.
4. Add a materialized daily funnel fact table for faster historical analysis at scale.
