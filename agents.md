# KPI Dashboard — Agent Operating Rules

## How to Use This File

This is the **single source of truth** for every agent working in this repo —
Claude, Codex, Gemini, or any other model. If you need to know how the codebase
works, the answer is here or it should be added here.

**Read this file before starting any non-trivial work.**

Structure:

1. [Repository Context](#repository-context) — stack, commands, key files
2. [Supabase Schema](#supabase-schema) — exact table/column definitions
3. [Strategic Priorities](#strategic-priorities-north-star) — organizational
   growth objectives that guide all recommendations
4. [Domain Rules](#domain-rules) — business logic that must not be changed
   without explicit instruction
5. [Data Flow](#data-flow) — how data moves from source to dashboard
6. [QA Protocol](#mandatory-qa-protocol) — self-verification steps required
   after every change
7. [Historical Bugs](#historical-bugs) — real failures from this codebase,
   ordered by frequency
8. [Open Issues](#open-issues) — known problems not yet fixed
9. [Resolved Issues](#resolved-issues) — problems fixed, kept as a record
10. [Agent Workflow](#agent-workflow) — multi-agent decomposition and output
    format

---

## Repository Context

**Product:** Sober Founders KPI Dashboard — a React + Supabase business
intelligence system tracking leads, attendance, donations, and operations.

**Stack:** React 18 + Vite (frontend) · Supabase PostgreSQL + Edge Functions
(backend) · Slack Bot via Bolt/TypeScript + OpenAI · Playwright e2e · Node test
runner for unit tests

### Commands

```bash
# Ensure deps are installed first
npm --prefix dashboard install

# Core gates — all three must pass after every change
npm --prefix dashboard run lint                         # 0 errors required
node --test "dashboard/tests/**/*.test.mjs"             # all tests pass (baseline: 22)
npm --prefix dashboard run build                        # must succeed (chunk warnings on metaCohortUnitEconPreview are pre-existing)

# Additional
npm --prefix dashboard run dev                          # local dev server
npm --prefix dashboard run test:e2e -- --reporter=line  # Playwright e2e smoke tests
npm run integrity:check                                 # KPI data integrity suite
npm run integrity:check:strict                          # requires HUBSPOT_PRIVATE_APP_TOKEN

# Slack bot
npm run slack:dev
npm run slack:test
npm run slack:lint
```

### Key Files

| File                                              | Role                                                                                                                    | Read before touching   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `agents.md`                                       | This file. Universal source of truth.                                                                                   | Always                 |
| `dashboard/src/lib/dashboardKpiHelpers.js`        | Formatting functions, matcher factories, comparison builders                                                            | Any KPI/dashboard work |
| `dashboard/src/lib/leadsQualificationRules.js`    | Revenue parsing, sobriety logic, qualification gate                                                                     | Lead qualification     |
| `dashboard/src/lib/leadsGroupAnalytics.js`        | Funnel grouping (Free vs Phoenix), attribution, Luma matching                                                           | Leads funnel           |
| `dashboard/src/lib/leadAnalytics.js`              | Snapshot builder (1,469 lines); has legacy Zoom refs pending cleanup                                                    | Leads analytics        |
| `dashboard/src/lib/leadsManagerInsights.js`       | Autonomous action engine; effect multipliers are unvalidated hypotheses                                                 | Manager insights       |
| `dashboard/src/lib/leadsConfidenceModel.js`       | Statistical confidence scoring — no unit tests yet                                                                      | Confidence model       |
| `dashboard/src/components/KPICard.jsx`            | KPI card — TONE color constant, trend badge, comparison rows                                                            | KPICard display        |
| `dashboard/src/views/DashboardOverview.jsx`       | Main dashboard — buildCardModel, KPI_CARD_DEFINITIONS, matchers, computeKpiSnapshot, normalizeHubspotAttendanceSessions | Dashboard overview     |
| `dashboard/src/views/LeadsDashboard.jsx`          | Leads funnel, qualification display, async enrichment with useRef guard                                                 | Leads view             |
| `dashboard/src/views/AttendanceDashboard.jsx`     | Attendance, contact enrichment with useRef guard, cardStyle                                                             | Attendance view        |
| `dashboard/src/views/WebsiteTrafficDashboard.jsx` | **ISOLATED.** Own local `formatInt`. Does NOT import from dashboardKpiHelpers. Do not touch unless explicitly asked.    | —                      |
| `dashboard/tests/dashboardKpiHelpers.test.mjs`    | Unit tests — all must pass                                                                                              | Any helper changes     |
| `docs/kpi-data-integrity-contract.md`             | Business rules for the reconciliation suite                                                                             | Integrity work         |

---

## Supabase Schema

These are the exact tables and columns in production. When writing queries,
referencing fields in code, or building fallback chains — use these exact names.

### raw_hubspot_contacts

Primary contact record synced from HubSpot.

| Column                                     | Type        | Notes                                                                 |
| ------------------------------------------ | ----------- | --------------------------------------------------------------------- |
| `hubspot_contact_id`                       | bigint      | Primary identifier                                                    |
| `email`                                    | text        | Primary email                                                         |
| `hs_additional_emails`                     | text        | Semicolon-separated list of alternate emails                          |
| `firstname`                                | text        |                                                                       |
| `lastname`                                 | text        |                                                                       |
| `createdate`                               | timestamptz | HubSpot contact creation date                                         |
| `sobriety_date`                            | text        | Free-text field — parsed by `hasOneYearSobrietyByDate()`              |
| `annual_revenue_in_dollars__official_`     | numeric     | **Primary revenue field** (note trailing underscore)                  |
| `annual_revenue_in_dollars`                | numeric     | **Fallback revenue field** — use only if official is null             |
| `membership_s`                             | text        | Membership status                                                     |
| `original_traffic_source`                  | text        |                                                                       |
| `campaign`                                 | text        |                                                                       |
| `campaign_source`                          | text        |                                                                       |
| `hs_analytics_source`                      | text        |                                                                       |
| `hs_analytics_source_data_1`               | text        |                                                                       |
| `hs_analytics_source_data_2`               | text        |                                                                       |
| `hs_latest_source`                         | text        |                                                                       |
| `hs_latest_source_data_1`                  | text        |                                                                       |
| `hs_latest_source_data_2`                  | text        |                                                                       |
| `hs_latest_form_submission_name`           | text        |                                                                       |
| `hs_latest_form_submitted_at`              | timestamptz |                                                                       |
| `first_conversion_event_name`              | text        |                                                                       |
| `recent_conversion_event_name`             | text        |                                                                       |
| `engagements_last_meeting_booked_campaign` | text        |                                                                       |
| `engagements_last_meeting_booked_medium`   | text        |                                                                       |
| `engagements_last_meeting_booked_source`   | text        |                                                                       |
| `num_conversion_events`                    | integer     |                                                                       |
| `num_unique_conversion_events`             | integer     |                                                                       |
| `hs_merged_object_ids`                     | text        | Comma-separated IDs of contacts merged into this one — used for dedup |
| `merged_into_hubspot_contact_id`           | bigint      | If this contact was merged into another, the target ID                |
| `hubspot_updated_at`                       | timestamptz |                                                                       |
| `hubspot_archived`                         | boolean     |                                                                       |
| `is_deleted`                               | boolean     |                                                                       |
| `deleted_at_hubspot`                       | timestamptz |                                                                       |
| `raw_payload`                              | jsonb       | Full HubSpot payload                                                  |
| `payload_hash`                             | text        | For change detection                                                  |
| `sync_source`                              | text        |                                                                       |
| `last_synced_at`                           | timestamptz |                                                                       |
| `ingested_at`                              | timestamptz |                                                                       |

**Revenue fallback chain:**

1. `annual_revenue_in_dollars__official_` (primary — note the trailing
   underscore in the column name)
2. `annual_revenue_in_dollars` (fallback — only if #1 is null)
3. If both are null → revenue is `null` (NEVER `0`)

**Sobriety field:** `sobriety_date` is free-text, parsed by
`hasOneYearSobrietyByDate()` in `leadsQualificationRules.js`.

**Merge dedup:** Contacts with `hs_merged_object_ids` set are merged contacts.
Dedup via `email` + parsed merge IDs. `merged_into_hubspot_contact_id` indicates
this contact was absorbed into another.

### raw_hubspot_meeting_activities

Meeting/call activities synced from HubSpot.

| Column                | Type        | Notes                                                          |
| --------------------- | ----------- | -------------------------------------------------------------- |
| `hubspot_activity_id` | bigint      | Primary identifier                                             |
| `activity_type`       | text        | e.g., `MEETING`, `CALL`                                        |
| `title`               | text        | Meeting title — matched against GROUP_ATTENDANCE_TITLE_SIGNALS |
| `body_preview`        | text        |                                                                |
| `hs_timestamp`        | timestamptz | When the meeting occurred                                      |
| `created_at_hubspot`  | timestamptz |                                                                |
| `updated_at_hubspot`  | timestamptz |                                                                |
| `portal_id`           | bigint      |                                                                |
| `owner_id`            | text        |                                                                |
| `metadata`            | jsonb       | Contains attendee info, meeting links, etc.                    |
| `raw_payload`         | jsonb       |                                                                |
| `hubspot_archived`    | boolean     |                                                                |
| `is_deleted`          | boolean     |                                                                |
| `deleted_at_hubspot`  | timestamptz |                                                                |
| `payload_hash`        | text        |                                                                |
| `sync_source`         | text        |                                                                |
| `last_synced_at`      | timestamptz |                                                                |
| `ingested_at`         | timestamptz |                                                                |

### hubspot_activity_contact_associations

Links activities to contacts.

| Column                | Type        | Notes                                |
| --------------------- | ----------- | ------------------------------------ |
| `hubspot_activity_id` | bigint      | FK to raw_hubspot_meeting_activities |
| `activity_type`       | text        |                                      |
| `hubspot_contact_id`  | bigint      | FK to raw_hubspot_contacts           |
| `association_type`    | text        |                                      |
| `contact_email`       | text        | Denormalized for convenience         |
| `contact_firstname`   | text        |                                      |
| `contact_lastname`    | text        |                                      |
| `metadata`            | jsonb       |                                      |
| `ingested_at`         | timestamptz |                                      |

### raw_fb_ads_insights_daily

Meta/Facebook ads data.

| Column                          | Type    | Notes                             |
| ------------------------------- | ------- | --------------------------------- |
| `ad_account_id`                 | text    |                                   |
| `date_day`                      | date    |                                   |
| `funnel_key`                    | text    | Maps ad to Free or Phoenix funnel |
| `campaign_id` / `campaign_name` | text    |                                   |
| `adset_id` / `adset_name`       | text    |                                   |
| `ad_id` / `ad_name`             | text    |                                   |
| `spend`                         | numeric |                                   |
| `impressions`                   | bigint  |                                   |
| `clicks`                        | bigint  |                                   |
| `leads`                         | bigint  | Lead form submissions             |

### kpi_metrics

Legacy metrics table (Zoom attendance data was stored here).

| Column         | Type    | Notes                          |
| -------------- | ------- | ------------------------------ |
| `source_slug`  | text    | e.g., `zoom_meeting_attendees` |
| `metric_name`  | text    |                                |
| `metric_value` | numeric |                                |
| `metric_date`  | date    |                                |
| `period`       | text    |                                |
| `metadata`     | jsonb   |                                |

**Note:** The Zoom data in this table is deprecated. The table still exists and
the fetch still runs but results are no longer consumed by the attendance path.
This is a cleanup item.

---

## Strategic Priorities (North Star)

These are the organization's top-level growth objectives. Every KPI insight,
recommendation, and action item should ladder up to one of these. When generating
"so what" summaries or prioritizing actions, weight by impact on these goals.

1. **Grow Phoenix Forum paying membership** — This is the primary revenue driver.
   More qualified leads → more interviews → more paying Phoenix members. Every
   funnel metric (CPL, CPQL, qualified lead count, interview count) serves this
   goal. Phoenix-qualified leads ($1M+ revenue, 1+ year sobriety) are the highest
   priority segment.

2. **Increase donations and donor retention** — Donations fund operations.
   Prioritize recurring donor retention over one-time gift acquisition. Track
   donor lifetime value, not just transaction count. Lapsed donor reactivation
   is higher ROI than cold acquisition.

3. **Raise attendance and improve retention** — Attendance drives community
   strength, which drives donations and referrals. Focus on repeat attendance
   rate (avg visits) over raw headcount. Net-new attendee activation (getting
   first-timers to return) is the biggest lever. Tuesday and Thursday sessions
   are both important.

**Priority order when resources conflict:** Phoenix membership > Donations >
Attendance > Operations. Operations supports all three but should never dominate
action item selection.

---

## Domain Rules

These are non-negotiable. Every rule below has caused a production bug when
violated. Do not change, reinterpret, or "simplify" any of them without explicit
instruction.

### Leads Qualification — Two Independent Systems

**System 1 — $250k Qualified/Unqualified (binary gate):**

- Revenue `>= $250,000` using the
  [revenue fallback chain](#raw_hubspot_contacts) **AND**
- Sobriety **strictly `> 1 year`** via `hasOneYearSobrietyByDate()` — NOT `>=`,
  exactly 1 year FAILS
- Both conditions must be true simultaneously
- If a HubSpot column is missing or null, the fallback must return `null`, NEVER
  `0`

Canonical source: `dashboard/src/lib/leadsQualificationRules.js`

**System 1.2 — $1m+ Phoenix Qualified/Unqualified (binary gate):**

- Revenue `>= $1,000,000` using the
  [revenue fallback chain](#raw_hubspot_contacts) **AND**
- Sobriety **strictly `> 1 year`** via `hasOneYearSobrietyByDate()` — NOT `>=`,
  exactly 1 year FAILS
- Both conditions must be true simultaneously
- If a HubSpot column is missing or null, the fallback must return `null`, NEVER
  `0`

Canonical source: `dashboard/src/lib/leadsQualificationRules.js`

**System 2 — Revenue Tier (sobriety irrelevant):**

| Tier  | Revenue Range       |
| ----- | ------------------- |
| Bad   | < $100,000          |
| OK    | $100,000 – $249,999 |
| Good  | $250,000 – $999,999 |
| Great | >= $1,000,000       |

A lead CAN be tier "Good" or "Great" but still Unqualified if sobriety < 1 year.

### Formatting Functions — Behavior Contract

All formatting functions in `dashboardKpiHelpers.js` return `'N/A'` for
non-finite inputs as their **first statement**:

```js
if (!Number.isFinite(Number(value))) return "N/A";
```

Applies to: `formatInt`, `formatDecimal`, `formatCurrency`, `formatPercent`.

`formatSignedDelta` guards `Number.isFinite(numeric)` BEFORE calling inner
formatters — making `'+N/A'` output impossible.

`formatValueByType` default branch (including `'count'` and `undefined` format)
calls `formatInt` → non-finite counts return `'N/A'` not `'0'`.

**Rule: Never add a fallback of `'0'` or `'0.00'` for missing/invalid data.
`'N/A'` is the correct sentinel — `'0'` implies a real business value of zero.**

`WebsiteTrafficDashboard.jsx` has its own isolated local `formatInt` (not
imported from helpers). It is intentionally decoupled and should not be touched
without explicit instruction.

### KPICard Color System

Module-level `TONE` constant with exactly three keys:

```js
const TONE = {
  better: { text: "<hex>", bg: "<hex>" },
  worse: { text: "<hex>", bg: "<hex>" },
  neutral: { text: "#64748b", bg: "<hex>" }, // neutral.text = #64748b, NOT old #334155
};
```

All style logic references `TONE.*`. No inline hex codes in ternaries or style
blocks.

`previousToneColor` uses `(TONE[previousTone] ?? TONE.neutral).text` — nullish
coalescing `??`, NOT optional chaining `?.`.

`backgroundColor: 'white'` on the card is intentional and documented with a
comment (light-surface component for dark text colors).

### Trend Arrow Logic

`buildCardModel` computes trend from period-over-period comparison:

```js
const rawDelta =
  Number.isFinite(Number(current)) && Number.isFinite(Number(previous))
    ? Number(current) - Number(previous)
    : null;
const trend = rawDelta === null
  ? "neutral"
  : rawDelta > 0
  ? "up"
  : rawDelta < 0
  ? "down"
  : "neutral";
```

Does **NOT** use `lastWeekComparison.delta` or `.pct` for the arrow (when "week"
range is selected, those resolve to identical windows → delta always 0 →
permanently neutral).

`trendValue` derives from `periodPct` with division-by-zero guard:
`previous === 0` → `periodPct = null` → `trendValue = 'N/A'`.

`comparisonRows: [lastWeekComparison, fourWeekAverageComparison]` must be
preserved in the return object (display-only rows for "vs Last Week" / "vs 4
Week Avg").

`invertColor: definition.direction === KPI_DIRECTION.LOWER_IS_BETTER` — NEVER
hardcoded `false`.

**KPI_CARD_DEFINITIONS direction values:**

| Key               | Direction          | Why         |
| ----------------- | ------------------ | ----------- |
| `freeCpql`        | `LOWER_IS_BETTER`  | Cost metric |
| `freeCpgl`        | `LOWER_IS_BETTER`  | Cost metric |
| `phoenixCpql`     | `LOWER_IS_BETTER`  | Cost metric |
| `phoenixCpgl`     | `LOWER_IS_BETTER`  | Cost metric |
| `freeQualified`   | `HIGHER_IS_BETTER` |             |
| `donationsAmount` | `HIGHER_IS_BETTER` |             |

**Verification trace:** CPQL current=$180, previous=$200 → rawDelta=-20 →
trend='down' → invertColor=true → KPICard:
`better = invertColor ? isDown : isUp = true` → GREEN badge ↓.

### Dashboard Section Order

| Section | Content                                 | Card array     |
| ------- | --------------------------------------- | -------------- |
| 1       | Phoenix Forum Funnel (highest priority) | `phoenixCards` |
| 2       | Free Group Funnel                       | `freeCards`    |
| 3       | Attendance                              | —              |
| 4       | Donations                               | —              |
| 5       | Operations                              | —              |

Section 1 MUST render `phoenixCards`. Section 2 MUST render `freeCards`.
Swapping labels without swapping data arrays is a bug.

Card key arrays:

- `FREE_CARD_KEYS`: `freeMeetings`, `freeQualified`, `freeCpql`, `freeGreat`,
  `freeCpgl`, `freeInterviews`
- `PHOENIX_CARD_KEYS`: `phoenixLeads`, `phoenixQualified`, `phoenixCpql`,
  `phoenixInterviews`

Label: `"Free Meeting Leads"` (NOT `"Free Meetings"`) — internal key
`freeMeetings` unchanged.

`buildSectionRecommendations` returns keys: `Leads`, `Attendance`, `Donations`,
`Operations`.

### Interview Matchers

Both use **dual matchers** (name-based primary, URL-based fallback for legacy
records):

**Free Group:**

```js
const FREE_GROUP_INTERVIEW_MEETING_NAME = "Sober Founders Intro Meeting";
const FREE_GROUP_INTERVIEW_LEGACY_URL_TOKEN =
  "meetings.hubspot.com/andrew-lassise/interview";
const matchesFreeGroupInterview = (row) =>
  _freeGroupNameMatcher(row) || _freeGroupUrlMatcher(row);
```

**Phoenix:**

```js
const PHOENIX_FORUM_MEETING_NAME_FRAGMENT = "Phoenix Forum";
const PHOENIX_INTERVIEW_MATCH_TOKENS = [
  "meetings.hubspot.com/andrew-lassise/phoenix-forum-interview",
  "meetings.hubspot.com/andrew-lassise/phoenix-forum-learn-more",
  "meetings.hubspot.com/andrew-lassise/phoenix-forum-good-fit",
];
const matchesPhoenixInterview = (row) =>
  _phoenixNameMatcher(row) || _phoenixUrlMatcher(row);
```

Both `createMeetingNameMatcher` and `createTokenMatcher` imported from
`dashboardKpiHelpers.js`. Single-matcher patterns (name only or URL only) are
bugs.

`phoenixInterviews` card note:
`'Phoenix Forum Interview, Learn More, and Good Fit meetings'`.

### Attendance

**Sources:**

- HubSpot Meeting Activities (Tuesday + Thursday) — title matched against
  `GROUP_ATTENDANCE_TITLE_SIGNALS`
- Luma (Thursday only) — email registrations cross-referenced with Thursday
  HubSpot call

**Deprecated — Do Not Reference:**

- Zoom meeting IDs `87199667045` and `84242212480` are legacy artifacts
- `normalizeZoomSessions` exists as dead code but must NOT be called in
  `computeKpiSnapshot`
- `matchedZoom`, `matchedZoomNetNew`, `zoomRows` in `leadAnalytics.js` are
  legacy pending cleanup

**GROUP_ATTENDANCE_TITLE_SIGNALS:** `'tactic tuesday'`, `'all our affairs'`,
`'all are welcome'`, `'mastermind'`

- Guard: `'mastermind'` signal excludes rows where `textBlob` includes `'intro'`

**Weekday detection:** Must use **Eastern Time (ET)** conversion, never UTC,
never server timezone. UTC causes Tue sessions to classify as Mon/Wed depending
on meeting time.

**AVG Visits:** Rolling 90-day window, not cumulative all-time.

**`normalizeHubspotAttendanceSessions` internals:**

- Accepts `interviewRows` (already-normalized by `normalizeInterviewActivities`)
- Filters by GROUP_ATTENDANCE_TITLE_SIGNALS with mastermind/intro guard
- Filters by day-of-week: `getUTCDay() === 2` (Tue) or `=== 4` (Thu) — others
  skipped
- Sessions keyed as `dayType|dateKey` (e.g., `'Tuesday|2026-03-11'`)
- Attendee dedup via `Set`; fallback `activity:${activityId}` when
  `attendeeKeys.length === 0`
- Contacts with `hs_merged_object_ids` deduped via email + merge ID

**`computeKpiSnapshot` data flow:**

```js
const interviewRows = normalizeInterviewActivities(rawData.activities || []); // called ONCE
const normalizedData = {
  interviewRows,
  zoomSessions: normalizeHubspotAttendanceSessions(interviewRows), // NOT normalizeZoomSessions
};
```

Interview counting (`freeInterviews`, `phoenixInterviews`) still uses
`countInterviewUniqueAttendees(interviewRows, window, matcher)` — NOT attendance
sessions.

### Enrichment / Async Patterns

**AttendanceDashboard enrichment gate:**

```js
if (!hsActivitiesResult.error) {
  void loadHubspotContactEnrichment(...);
} else {
  setContactEnrichmentStatus('error');
}
```

Condition: `!hsActivitiesResult.error` ONLY. `hsAssocsLoadError` must NOT appear
in gate — contact enrichment is independent of association load. If associations
fail, `hsAssocRows` = `[]` and backfill is safely skipped.

**Race condition guards (both LeadsDashboard and AttendanceDashboard):**

```js
// INSIDE component function (not module level):
const enrichmentInvocationRef = useRef(0);

// At call site:
enrichmentInvocationRef.current += 1;
const myInvocation = enrichmentInvocationRef.current;
void loadEnrichmentFunction({ ..., myInvocation });

// Inside async function, BEFORE any setState:
if (enrichmentInvocationRef.current !== myInvocation) return;
```

- `useRef` must be in the React import
- Ref declared INSIDE component function, not at module level
- Stale check BEFORE every `setState` in the async function

### Contrast / Visibility

- `cardStyle` in `AttendanceDashboard.jsx` must include `color: '#0f172a'` —
  without it, text inherits near-white CSS variable and is invisible on white
  cards
- `var(--color-text-secondary)` must NOT appear in `AttendanceDashboard.jsx` —
  all replaced with `#64748b`
- Gradient header card overrides with `color: 'white'` via
  `{...cardStyle, color: 'white'}` — this is correct

### Data Integrity — Other

- Recurring donation detection: exact `donation_type` match, NOT substring
- Donor names: Zapier first/last must map to `donor_name`/`donor_company`
- HubSpot activity associations use table
  `hubspot_activity_contact_associations` — verify exact name
- Metrics that are computed must be surfaced in dashboard — orphaned metrics are
  bugs

---

## Data Flow

```
HubSpot Contacts API
  → raw_hubspot_contacts (Supabase)
  → Edge Function incremental sync (hubspot_incremental_sync)
  → leadsQualificationRules.js (revenue fallback chain + sobriety evaluation)
  → leadsGroupAnalytics.js (Free vs Phoenix funnel grouping)
  → computeKpiSnapshot → DashboardOverview KPI cards

HubSpot Meeting Activities API
  → raw_hubspot_meeting_activities (Supabase)
  → hubspot_activity_contact_associations (attendee links)
  → normalizeInterviewActivities (called once in computeKpiSnapshot)
  → normalizeHubspotAttendanceSessions (filters by title signals + day-of-week)
  → Attendance KPI cards + AttendanceDashboard

Luma API
  → luma_registrations (Supabase)
  → Email match to HubSpot contacts
  → Thursday attendance: cross-reference with HubSpot Thursday call activity

Meta Ads API
  → raw_fb_ads_insights_daily (Supabase)
  → DashboardOverview spend + attribution aggregation
  → funnel_key maps ads to Free or Phoenix funnel

Zeffy (donations)
  → donations table (Supabase)
  → Donation snapshot (amount, count)
  → donation_type: exact match only (not substring)

Notion (operations)
  → Todos table (Supabase)
  → Operations snapshot (completedItems)
```

---

## Mandatory QA Protocol

**Execute this after every non-trivial change.** Non-trivial = anything beyond a
comment or whitespace edit. This protocol exists because agents have repeatedly
declared work "done" while shipping broken code across 32+ bugs in this
codebase.

### Phase 1: Automated Gates

Run ALL. Any failure = stop, fix, re-run all gates.

```bash
npm --prefix dashboard run lint                       # must exit 0, 0 errors
node --test "dashboard/tests/**/*.test.mjs"           # all pass — record count (baseline: 22)
npm --prefix dashboard run build                      # must succeed
```

If test count decreased from baseline, explain why before proceeding.

### Phase 2: Regression Scan

Run every grep. Read output. Confirm it matches expected result.

```bash
# No stale '0' fallbacks in formatting helpers
grep -n "return '0'" dashboard/src/lib/dashboardKpiHelpers.js
grep -n "return '0.00'" dashboard/src/lib/dashboardKpiHelpers.js
# EXPECTED: No output from either.

# No hardcoded invertColor: false
grep -n "invertColor: false" dashboard/src/views/DashboardOverview.jsx
# EXPECTED: No output.

# normalizeZoomSessions not called in computeKpiSnapshot
grep -n "normalizeZoomSessions" dashboard/src/views/DashboardOverview.jsx
# If matches: confirm NOT inside computeKpiSnapshot. Dead function existing is acceptable.

# No stale CSS variable in Attendance
grep -n "var(--color-text-secondary)" dashboard/src/views/AttendanceDashboard.jsx
# EXPECTED: No output.

# Dual matchers (must contain ||)
grep "matchesPhoenixInterview\s*=" dashboard/src/views/DashboardOverview.jsx
grep "matchesFreeGroupInterview\s*=" dashboard/src/views/DashboardOverview.jsx
# EXPECTED: Both definition lines contain ||.

# Enrichment gate excludes hsAssocsLoadError
grep -n "hsAssocsLoadError" dashboard/src/views/AttendanceDashboard.jsx
# If matches: verify NONE are on the loadHubspotContactEnrichment call line or its if-condition.

# Section ordering
grep -n "Section [12]" dashboard/src/views/DashboardOverview.jsx
# EXPECTED: Section 1 = Phoenix Forum, Section 2 = Free Group.

# No stale label
grep -rn "'Free Meetings'" dashboard/src/
# EXPECTED: No output.

# Clean git status
git status --short
# EXPECTED: No unexpected modified files under dashboard/src/.
```

### Phase 3: Verify Every Edit

For EVERY file modified:

1. **Re-read the file at the edited lines.** Use
   `sed -n '<start>,<end>p' <file>` or equivalent. Confirm the content matches
   intent. Edits silently fail more often than expected.

2. **Semantic check each change:**
   - `>` vs `>=` correct? (sobriety = strict `>`, revenue = inclusive `>=`)
   - `??` vs `?.` correct? (nullish coalescing for fallbacks, optional chaining
     for property access)
   - `Number.isFinite()` guards BEFORE arithmetic/formatting?
   - Async + setState → has useRef stale-invocation guard?
   - Colors reference TONE constant, not inline hex?

3. **Trace with concrete values.** For each logic change, substitute at least:
   - Happy path (normal values)
   - Edge case (0, null, boundary like exactly-1-year sobriety)
   - Error case (NaN, undefined, Infinity)

4. **Check collateral damage.** Read 20 lines above and below. Did you break an
   adjacent function, remove an import, shift JSX nesting, or introduce a
   duplicate variable name?

### Phase 4: Domain Invariant Checks

If your change touches any of these areas, verify by READING THE ACTUAL FILE:

**Formatting:** N/A guards as first statement in all four functions;
formatSignedDelta guards before inner calls; formatValueByType default →
formatInt; WebsiteTrafficDashboard untouched.

**KPICard:** TONE has 3 keys with text+bg; no old hex codes (#10b981, #ef4444,
#15803d, #b91c1c) in style logic; previousToneColor uses ??; backgroundColor:
'white' present with comment.

**Trend arrows:** rawDelta from current-previous, not lastWeekComparison;
invertColor from definition.direction; comparisonRows preserved; cost metrics =
LOWER_IS_BETTER.

**Matchers:** Both use || composition; both factory functions imported; URL
tokens defined.

**Attendance:** computeKpiSnapshot uses normalizeHubspotAttendanceSessions;
normalizeInterviewActivities called once; GROUP_ATTENDANCE_TITLE_SIGNALS with
mastermind/intro guard; ET timezone.

**Async:** Enrichment gate = !hsActivitiesResult.error only; useRef guards in
both dashboards; ref inside component; stale check before setState.

**Qualification:** sobriety `>` not `>=`; revenue `>=` $250k; both AND'd;
fallbacks return null not 0.

**Sections:** Phoenix=1 with phoenixCards; Free=2 with freeCards; "Free Meeting
Leads" label.

**Contrast:** cardStyle has color: '#0f172a'; no var(--color-text-secondary);
gradient header has color: 'white'.

### Phase 5: Push and Independent QA Verification

After self-QA passes:

1. **Commit and push to main — this is mandatory, not optional.** After self-QA
   passes (lint, tests, build all green), the agent MUST `git add`, `git commit`,
   and `git push origin main` before moving on to the QA verification prompt.
   Do not stop at "committed locally" — the push to `main` must happen. Use
   conventional commit format (`fix(dashboard):`, `feat(dashboard):`,
   `chore:`). One logical change per commit where practical; batching related
   fixes into a single commit is acceptable if they share a theme.

2. **Produce a QA verification prompt** for an independent agent to mechanically
   verify the changes. The prompt must be self-contained — the receiving agent
   needs nothing beyond the prompt and repo access. Include:
   - **Context:** 1-2 sentence summary of what changed and why
   - **Setup:** commands to run automated gates (lint, node tests, vitest,
     build) with expected pass counts
   - **Issue-specific checks:** for each resolved issue, provide exact `grep`
     commands with EXPECTED output, files + line ranges to read, and what a
     failure looks like
   - **Cross-cutting checks:** bundle size, dead imports, data flow integrity,
     no accidental renames of unrelated code
   - **Deliverable:** ask the agent to report a pass/fail table and flag
     anything blocking vs cosmetic

   How the prompt is delivered depends on the agent platform — see
   platform-specific instructions (e.g. `CLAUDE.md` for Claude Code). The QA
   agent must only read and run checks — it must NOT edit files.

3. **If running in Claude Code, spawn the QA agent directly.** Do not just
   produce the prompt — use the Agent tool (`subagent_type: "general-purpose"`,
   `model: "sonnet"`) in the foreground to execute the QA verification. The
   agent must be read-only (no edits). Report failures back to the user.

---

## Historical Bugs

Real failures from this codebase, ordered by frequency. Every one shipped or
nearly shipped because an agent declared "done" without verifying.

1. **"I changed it" but the file doesn't reflect the edit.** Silent failure from
   wrong string match, duplicate text, partial apply. #1 failure mode. Always
   re-read the file after editing.

2. **Off-by-one boundary conditions.** `>= 1 year` vs `> 1 year` for sobriety.
   Domain rules, not style preferences.

3. **Returning `'0'` instead of `'N/A'` for missing data.** Passes happy-path
   tests. Shows fake zeros on production KPI cards.

4. **Using `lastWeekComparison` for trend arrows.** "Week" range → identical
   date windows → delta always 0 → all arrows permanently neutral.

5. **Single-matcher for interviews.** Name-only matching misses legacy HubSpot
   records. Always dual: name `||` URL.

6. **Missing `useRef` stale-invocation guards.** User navigates away and back →
   two fetches in flight → stale overwrites fresh.

7. **Hardcoding `invertColor: false`.** Cost metrics show red on decrease
   (alarming users) instead of green.

8. **Wrong timezone for weekday detection.** UTC midnight ET = previous day. Tue
   11 PM ET = Wed UTC.

9. **Enrichment gate blocking on unrelated errors.** Association failures
   prevented independent contact enrichment.

10. **Inline hex colors instead of TONE constant.** Inconsistent theming,
    maintenance nightmare.

11. **Swapping section labels without swapping data arrays.** "Phoenix Forum"
    header renders `freeCards`.

12. **Invisible text from unset `color` property.** White cards + inherited
    near-white CSS variable = invisible text.

13. **Schema fallback returning `0` instead of `null`.** Downstream treats
    missing as "$0 revenue" → qualified count drops to 0.

14. **Substring matching for donation types.** `includes('recurring')` matches
    `'one-time-not-recurring'`.

15. **Double-counted attendance.** Sessions counted per-activity instead of
    per-session. Must use `dayType|dateKey` keying with Set dedup.

16. **Merged HubSpot contacts counted multiple times.** Contacts with
    `hs_merged_object_ids` need email + merge ID dedup.

17. **Computed metric never surfaced.** Phoenix Qualified calculated but never
    wired to a KPI card.

18. **Wrong HubSpot table name.** Activity contact associations table name must
    exactly match `hubspot_activity_contact_associations`.

---

## Open Issues (as of 2026-03-14)

No open issues.

---

## Resolved Issues (as of 2026-03-14)

These are kept as a record. Do not re-open unless a regression is detected.

- [x] `buildMustDoToday` Leads 2× weight asymmetry — reduced to 1.5× with
      documenting comment explaining revenue-impact rationale (2026-03-14)
- [x] E2E assertion brittle `'Leads (3 Suggestions)'` — switched to regex
      `/Leads\s*\(\d+ Suggestions?\)/` (2026-03-14)
- [x] Legacy Zoom code cleanup — removed `buildZoomNetNew`, `buildShowupIndex`,
      `matchLeadToShowup`, `dayTypeFromZoomMetric`, `zoomRows` parameter from
      `buildLeadAnalytics`/`buildGroupedLeadsSnapshot`/`getSnapshot`/`buildTrendRows`/`buildRecommendations`/`buildWindowDrilldown`
      (2026-03-14)
- [x] `normalizeZoomSessions` dead function — already removed in prior cleanup
      (confirmed 2026-03-14)
- [x] `zoomRows: zoomResponse.data` in `DashboardOverview.loadData` — already
      removed in prior cleanup (confirmed 2026-03-14)
- [x] `invokeMasterSync` auth fallback — removed `supabaseServiceRoleKey` from
      fallback chain; now throws if neither `masterSyncEdgeInvokeKey` nor
      `supabaseAnonKey` is set (2026-03-14)
- [x] `WebsiteTrafficDashboard.jsx` local `formatInt` — migrated to shared
      `formatInt` from `dashboardKpiHelpers.js` (2026-03-14)
- [x] Unit tests for `leadsQualificationRules.js` and `leadsConfidenceModel.js`
      — 60 tests covering leap year, negative revenue, suffix parsing, all
      blocker codes, integrity levels; `buildCardModel` skipped
      (component-internal, not exported) (2026-03-14)
- [x] `leadsManagerInsights.js` effect multipliers — replaced arbitrary
      multipliers with neutral 1.0 baseline and `evidence_note` field citing
      industry benchmarks (Meta, HubSpot, Salesforce studies) (2026-03-14)
- [x] Hardcoded hex colors in `DashboardOverview.jsx` — replaced with CSS
      variables (`--color-kpi-*` family) in KPI card definitions and
      error/warning states (2026-03-14)
- [x] localStorage recommendation feedback TTL — added 30-day TTL eviction with
      `_savedAt` timestamp; stale entries pruned on load (2026-03-14)
- [x] `matchedZoom`/`matchedZoomNetNew` renamed to
      `matchedAttendance`/`matchedAttendanceNetNew` across `leadAnalytics.js`,
      `leadsGroupAnalytics.js`, `LeadsDashboard.jsx`, `leadsManagerInsights.js`;
      `unmatchedZoomRows` preserved (different concept: Zoom→HubSpot attendee
      matching) (2026-03-14)
- [x] `buildCardModel` trend arrow always neutral — was using
      `lastWeekComparison.delta`; fixed to use period-over-period `rawDelta`
      (commit 4c6f34a)
- [x] Cost-metric trend arrow inverted — `invertColor` was hardcoded `false`;
      fixed to use `definition.direction === KPI_DIRECTION.LOWER_IS_BETTER`
      (commit 8482d6c)
- [x] KPICard three inconsistent color sets — unified into `TONE` constant
      (commit 8482d6c)
- [x] `formatInt`/`formatDecimal` returning `'0'` for non-finite — fixed to
      return `'N/A'` (commit 8b0a64c)
- [x] Race condition in Leads/Attendance enrichment — added `useRef` invocation
      guards (commit 4c6f34a)
- [x] Enrichment gate too strict — removed `hsAssocsLoadError` from condition
      (commit 4c6f34a)
- [x] Free group interview single matcher — added dual name+URL matching (commit
      4c6f34a)
- [x] Phoenix interview single matcher — added dual name+URL matching (commit
      fa0cffe)
- [x] Section order wrong — Phoenix now Section 1 (commit fa0cffe)
- [x] "Free Meetings" label — renamed to "Free Meeting Leads" (commit fa0cffe)
- [x] Attendance using Zoom instead of HubSpot activities — switched to
      `normalizeHubspotAttendanceSessions` (commit fa0cffe)
- [x] Invisible text on AttendanceDashboard cards — added `color: '#0f172a'` to
      `cardStyle` (commit fa0cffe)
- [x] `var(--color-text-secondary)` in AttendanceDashboard — replaced with
      `#64748b` (commit fa0cffe)
- [x] Leads bundle ~671 kB — split heavy panels to lazy-loaded chunks, reduced
      to ~326 kB
- [x] KPI cards blocked by slow enrichment — refactored to KPI-first load with
      background enrichment

---

## Performance Constraints

- Leads bundle target: ~326 kB (down from 671 kB via lazy-loading)
- Heavy panels must use `React.lazy` + `Suspense`:
  `CohortUnitEconomicsPreviewPanel`, `LeadsManagerInsightsPanel`,
  `LeadsExperimentAnalyzerPanel`
- KPI cards render before enrichment (KPI-first pattern)
- Background enrichment must show explicit loading status: "Loading Additional
  Lead Enrichment", "Loading Contact Enrichment"
- Verify bundle impact after adding dependencies or moving code between chunks

---

## Design System Rules

- Use CSS variables from `index.css`: `--color-text-primary`,
  `--color-text-secondary`, `--color-text-muted`, `--color-border`, etc.
- Exception: `AttendanceDashboard.jsx` uses hardcoded `#64748b` instead of
  `var(--color-text-secondary)` due to the contrast bug
- `KPICard` uses `backgroundColor: 'white'` intentionally (light-surface for
  dark text) — documented with comment
- Use regex patterns in E2E text assertions (e.g.,
  `/Leads \(\d+ Suggestions?\)/`) — never exact string match for dynamic-count
  UI

---

## Agent Workflow

### Pre-Flight (before starting any work)

1. Read this file (`agents.md`)
2. `git status --short` — confirm clean working tree
3. `npm --prefix dashboard install` if `node_modules/` missing
4. Run core gates (lint, test, build) — establish passing baseline and record
   test count

### Roles

| Role           | Scope                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| Data Integrity | Qualification rules, `npm run integrity:check`, HubSpot parity, schema    |
| UI Consistency | CSS variables, KPICard theme, dark/light rendering                        |
| Business Logic | leadsQualificationRules, leadsGroupAnalytics, leadsConfidenceModel        |
| Slack Bot      | RBAC, tool orchestration, OpenAI prompt safety, audit logs, auth fallback |
| Schema         | Migration idempotency, RLS policies, index coverage                       |
| Performance    | Lazy-load boundaries, Supabase query selectivity, bundle size             |

### Task Workflow

For every non-trivial task:

1. Task Understanding → 2. Decomposition → 3. Agent Assignment → 4. Independent
   Analysis → 5. Cross-Check → 6. Solution → 7. QA Protocol (above) → 8.
   Verification Spec → 9. Final Synthesis → **10. Commit & Push to `main`**

**Step 10 is mandatory.** After self-QA passes (and the Sonnet QA agent confirms),
commit the changes and `git push origin master:main`. Work is not done until it is
live on Vercel. Do not ask for permission — just push.

### Output Sections

Return these in order: TASK UNDERSTANDING · TASK DECOMPOSITION · AGENT REPORTS ·
CROSS-CHECK · PROPOSED SOLUTION · VERIFICATION · FINAL SYNTHESIS · NEXT ACTIONS
· RISKS / UNCERTAINTIES

### Behavior Rules

- Do not stop at the first plausible answer — look for second-order issues and
  edge cases
- Do not invent missing facts — say explicitly what's missing
- Prefer concise, information-dense writing
- If verification is incomplete, label result as partial or provisional
- If task has 2+ separable parts, use parallel agents by default

---

## Git Hygiene

- **Every completed task must end with a push to `main`.** No exceptions. Work
  that passes QA but is not pushed is not done — the user expects changes to be
  live on Vercel immediately after you finish.
- Push command: `git push origin master:main` (local branch is `master`, remote
  deploy branch is `main`).
- Do not push to `master` remote or any feature branch — always target `main`.
- Conventional commits: `fix(dashboard):`, `feat(dashboard):`, `chore:`
- One logical change per commit
- `git status --short` after finishing: no unexpected modified files under
  `dashboard/src/`
- If changes affect domain rules, update this file (`agents.md`) in the same or
  immediately following commit
