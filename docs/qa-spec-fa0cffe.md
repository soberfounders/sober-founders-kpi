# QA Verification Spec — commit fa0cffe
**Date:** 2026-03-11
**Commit:** fa0cffe — feat(dashboard): reorder sections, rename label, fix Phoenix matcher, fix attendance source, fix contrast
**Branch:** main
**Written by:** implementing agent — for execution by an independent agent
**Instructions:** Read every referenced file at every referenced line. Verify directly. Do not infer. Record PASS / FAIL per item. Run every command listed.

---

## Commits in scope

```
fa0cffe  feat(dashboard): reorder sections, rename label, fix Phoenix matcher, fix attendance source, fix contrast
```

---

## PART 1 — Section ordering (DashboardOverview.jsx)

**File:** `dashboard/src/views/DashboardOverview.jsx`

### 1.1 Phoenix Forum is Section 1 in JSX render
Search for `Section 1` in the file. Assert the first match is:
```
Section 1 - Phoenix Forum Funnel
```
Assert `Section 2` matches:
```
Section 2 - Free Group Funnel
```

### 1.2 Phoenix section renders phoenixCards, Free section renders freeCards
Read the full `<section>` blocks for Section 1 and Section 2.
- Assert Section 1 maps `phoenixCards` (not `freeCards`).
- Assert Section 2 maps `freeCards` (not `phoenixCards`).
- If the labels are swapped but the cards aren't, or vice versa, that is a FAIL.

### 1.3 Priority note under Phoenix section
Read the few lines immediately after the `Section 1 - Phoenix Forum Funnel` heading.
Assert a `<p>` element exists containing:
```
Top priority — drive Phoenix leads, interviews, and paying members.
```

### 1.4 Card data models are unchanged
Search for `FREE_CARD_KEYS` and `PHOENIX_CARD_KEYS`. Assert the arrays still contain the same metric keys as before — no keys were removed or swapped between arrays. The ordering change is JSX-only.

Assert `FREE_CARD_KEYS` still contains: `freeMeetings`, `freeQualified`, `freeCpql`, `freeGreat`, `freeCpgl`, `freeInterviews`
Assert `PHOENIX_CARD_KEYS` still contains: `phoenixLeads`, `phoenixQualified`, `phoenixGreat`, `phoenixCpql`, `phoenixCpgl`, `phoenixInterviews`

---

## PART 2 — "Free Meeting Leads" rename

### 2.1 KPI_CARD_DEFINITIONS title updated
**File:** `dashboard/src/views/DashboardOverview.jsx`

Search for `freeMeetings:` in `KPI_CARD_DEFINITIONS`. Assert the `title` field is:
```js
title: 'Free Meeting Leads',
```
Assert `title: 'Free Meetings'` does NOT appear anywhere in this file.

### 2.2 Metric key and underlying data are unchanged
In the same `freeMeetings` definition block, assert:
- `key: 'freeMeetings'` — internal key is unchanged
- `metric: 'meetings'` — data binding is unchanged
- `source: 'ads'` — still sourced from Meta ads (lead form submissions)
- `format: 'count'` — format unchanged

The rename is label-only; no metric logic was altered.

### 2.3 LeadsDashboard label updated
**File:** `dashboard/src/views/LeadsDashboard.jsx`

Search for `Zoom Source Attribution`. Assert the heading reads:
```
Zoom Source Attribution (Free Meeting Leads)
```
Assert `Zoom Source Attribution (Free Meetings)` does NOT appear.

### 2.4 No other stale "Free Meetings" label
```
grep -rn "Free Meetings" dashboard/src/
```
Assert zero matches. Any match is a missed rename.

---

## PART 3 — Priority notes / copy

### 3.1 phoenixInterviews note is populated
**File:** `dashboard/src/views/DashboardOverview.jsx`

Read the `phoenixInterviews` entry in `KPI_CARD_DEFINITIONS`. Assert:
```js
note: 'Phoenix Forum Interview, Learn More, and Good Fit meetings',
```
Assert it is NOT `note: null`.

### 3.2 Priority note tone and length
From Part 1.3, confirm the priority note is:
- One concise sentence (not a paragraph of copy)
- References leads, interviews, and paying members
- Does not contradict the existing dashboard tone

---

## PART 4 — Phoenix meeting filter

**File:** `dashboard/src/views/DashboardOverview.jsx`

### 4.1 Name fragment constant exists
Search for `PHOENIX_FORUM_MEETING_NAME_FRAGMENT`. Assert it is defined as:
```js
const PHOENIX_FORUM_MEETING_NAME_FRAGMENT = 'Phoenix Forum';
```
Assert it appears BEFORE the matcher declarations.

### 4.2 URL token list is unchanged
Assert `PHOENIX_INTERVIEW_MATCH_TOKENS` still contains all three URL tokens:
```js
'meetings.hubspot.com/andrew-lassise/phoenix-forum-interview',
'meetings.hubspot.com/andrew-lassise/phoenix-forum-learn-more',
'meetings.hubspot.com/andrew-lassise/phoenix-forum-good-fit',
```
No tokens were removed. The URL list is a fallback; it must remain intact.

### 4.3 Dual matcher is correctly composed
Assert the three declarations appear in this order:
```js
const _phoenixNameMatcher = createMeetingNameMatcher(PHOENIX_FORUM_MEETING_NAME_FRAGMENT);
const _phoenixUrlMatcher = createTokenMatcher(PHOENIX_INTERVIEW_MATCH_TOKENS);
const matchesPhoenixInterview = (row) => _phoenixNameMatcher(row) || _phoenixUrlMatcher(row);
```
- `_phoenixNameMatcher` uses `createMeetingNameMatcher` (name-based, primary).
- `_phoenixUrlMatcher` uses `createTokenMatcher` (URL-based, fallback).
- `matchesPhoenixInterview` is a composed OR — NOT a single call.

Assert `matchesPhoenixInterview = createTokenMatcher(...)` does NOT appear (that would be the old single-matcher pattern).

### 4.4 Free group matcher is unchanged
Assert `matchesFreeGroupInterview` is still:
```js
const matchesFreeGroupInterview = (row) => _freeGroupNameMatcher(row) || _freeGroupUrlMatcher(row);
```
This change must not have touched the free group matcher.

### 4.5 Matcher symmetry check
Verify that the Phoenix matcher now mirrors the free-group matcher pattern exactly:
| | Free Group | Phoenix |
|---|---|---|
| Primary | `createMeetingNameMatcher(FREE_GROUP_INTERVIEW_MEETING_NAME)` | `createMeetingNameMatcher(PHOENIX_FORUM_MEETING_NAME_FRAGMENT)` |
| Fallback | `createTokenMatcher([FREE_GROUP_INTERVIEW_LEGACY_URL_TOKEN])` | `createTokenMatcher(PHOENIX_INTERVIEW_MATCH_TOKENS)` |
| Composed | `name OR url` | `name OR url` |

### 4.6 Logic trace — name match
Manually verify: a row whose `meetingName` (normalized) contains `'phoenix forum'` would be matched by `_phoenixNameMatcher` and therefore by `matchesPhoenixInterview`. Confirm the code supports this without requiring a URL to be present.

### 4.7 Logic trace — URL fallback
Manually verify: a row whose `textBlob` contains `'meetings.hubspot.com/andrew-lassise/phoenix-forum-interview'` (normalized) but has NO meeting name would be matched by `_phoenixUrlMatcher`. Confirm the OR composition means this row still passes `matchesPhoenixInterview`.

---

## PART 5 — AVG Visits data source

**File:** `dashboard/src/views/DashboardOverview.jsx`

### 5.1 GROUP_ATTENDANCE_TITLE_SIGNALS constant exists
Search for `GROUP_ATTENDANCE_TITLE_SIGNALS`. Assert it is a module-level array containing:
```js
'tactic tuesday',
'big book',
'all are welcome',
'mastermind',
```
These mirror the signals in `AttendanceDashboard.inferGroupTypeFromTitle`.

### 5.2 normalizeHubspotAttendanceSessions function exists
Search for `function normalizeHubspotAttendanceSessions`. Assert it exists and accepts `interviewRows` as its parameter (already-normalized rows, not raw rows).

### 5.3 Function filters by positive group signal
Read the body of `normalizeHubspotAttendanceSessions`. Assert:
- It iterates `interviewRows`.
- For each row, it checks `GROUP_ATTENDANCE_TITLE_SIGNALS.some(...)` against `row.textBlob`.
- Rows that do NOT match any signal are skipped (`return`).

### 5.4 Function filters by day-of-week (Tue/Thu only)
Assert the function computes `weekday = date.getUTCDay()` and assigns:
- `dayType = 'Tuesday'` when `weekday === 2`
- `dayType = 'Thursday'` when `weekday === 4`
- Rows with any other day are skipped.

### 5.5 Function groups by session key and deduplicates attendees
Assert:
- Sessions are keyed as `dayType|dateKey` (e.g., `'Tuesday|2026-03-11'`).
- Attendee keys are accumulated into a `Set` to prevent double-counting.
- The `activity:${activityId}` fallback is used when `row.attendeeKeys.length === 0`.

### 5.6 computeKpiSnapshot normalizes activities once and reuses
Read `function computeKpiSnapshot`. Assert:
```js
const interviewRows = normalizeInterviewActivities(rawData.activities || []);
```
This line must appear BEFORE the `normalizedData` object literal.

Assert `normalizedData` contains:
```js
interviewRows,
zoomSessions: normalizeHubspotAttendanceSessions(interviewRows),
```
Both use the same `interviewRows` variable. `normalizeInterviewActivities` is called exactly ONCE.

Assert `normalizeZoomSessions(rawData.zoomRows || [])` does NOT appear inside `computeKpiSnapshot` (the old Zoom-based attendance is replaced).

### 5.7 mastermind exclusion of 'intro' variant
Read the `isGroupSession` check. Assert it includes the guard:
```js
!(signal === 'mastermind' && row.textBlob.includes('intro'))
```
This prevents "Sober Founders Intro Meeting" from being mistakenly matched via 'mastermind' if 'intro' appears nearby. (Note: 'Sober Founders Intro Meeting' does not contain 'mastermind', so this is a belt-and-suspenders guard.)

### 5.8 No duplicate data source for attendance
```
grep -n "normalizeZoomSessions" dashboard/src/views/DashboardOverview.jsx
```
Assert: `normalizeZoomSessions` still exists (it was not deleted), but it is NOT called inside `computeKpiSnapshot`. It may still exist as a dead function — that is acceptable.

### 5.9 Interview counting still uses the shared interviewRows
In `buildWindowMetrics`, confirm `freeInterviews` and `phoenixInterviews` are still computed via `countInterviewUniqueAttendees(interviewRows, window, matcher)` — they did not accidentally get wired to the new attendance sessions.

---

## PART 6 — Attendance contrast fix

**File:** `dashboard/src/views/AttendanceDashboard.jsx`

### 6.1 cardStyle includes explicit dark color
Read `const cardStyle`. Assert it contains:
```js
color: '#0f172a',
```
This must appear inside the `cardStyle` object. If absent, all unset-color text (h3, p) inherits the body's near-white CSS variable and is invisible on white cards.

### 6.2 No var(--color-text-secondary) remains in this file
```
grep -n "var(--color-text-secondary)" dashboard/src/views/AttendanceDashboard.jsx
```
Assert zero matches. All occurrences were replaced with `#64748b`.

### 6.3 #64748b is the replacement value
```
grep -c "#64748b" dashboard/src/views/AttendanceDashboard.jsx
```
Assert the count increased relative to the old file. A reasonable number is 15+. The exact count matters less than confirming the replacement happened.

### 6.4 Header section still uses white text (no regression)
Read lines around `linear-gradient(120deg, #0f766e 0%` — this is the dark gradient header card.
Assert `color: 'white'` is still explicitly set on that container. The `cardStyle` override (`color: '#0f172a'`) applies to cards, not to this gradient header, because the gradient container uses `{...cardStyle, background: '...', color: 'white', ...}` which overrides `cardStyle.color`. Confirm this override is still in place.

### 6.5 Error/warning cards still have correct text colors
Check a few non-standard card variants to ensure the contrast fix did not clobber their explicit colors:
- Loading enrichment card (borderLeft `#2563eb`): still has `color: '#1d4ed8'` or similar dark blue
- Alias warning card (borderLeft `#f59e0b`): still has `color: '#92400e'` or similar
These are set via explicit overrides and `cardStyle.color` would only be a fallback if no override exists.

---

## PART 7 — Regression checks

### 7.1 No "Section 1 - Free Group" in the file
```
grep -n "Section 1 - Free Group" dashboard/src/views/DashboardOverview.jsx
```
Assert zero matches.

### 7.2 No "Section 2 - Phoenix Forum" in the file
```
grep -n "Section 2 - Phoenix" dashboard/src/views/DashboardOverview.jsx
```
Assert zero matches.

### 7.3 All five dashboard sections still render
Read the JSX return for DashboardOverview. Assert all five `<section className="glass-panel">` blocks are present in this order:
1. Section 1 - Phoenix Forum Funnel
2. Section 2 - Free Group Funnel
3. Section 3 - Attendance
4. Section 4 - Donations
5. Section 5 - Operations

### 7.4 Attendance section numbers unchanged
Assert `Section 3 - Attendance`, `Section 4 - Donations`, `Section 5 - Operations` headings are unchanged. Only sections 1 and 2 were reordered.

### 7.5 buildSectionRecommendations is unchanged
Search for `function buildSectionRecommendations`. Confirm the returned object still has keys `Leads`, `Attendance`, `Donations`, `Operations` — these are cross-funnel and were not changed.

### 7.6 zoomResponse fetch is still present (deprecated but not blocking)
```
grep -n "kpi_metrics\|zoomResponse\|Zoom Meeting Attendees" dashboard/src/views/DashboardOverview.jsx
```
Assert the `supabase.from('kpi_metrics')` fetch and the `zoomResponse` variable are still present in `loadData`. The Zoom table returns empty data but removing the fetch was out of scope; it must not have been accidentally deleted.

---

## PART 8 — Test suite

### 8.1 All 22 tests pass
```
node --test "dashboard/tests/**/*.test.mjs"
```
Assert: `pass 22`, `fail 0`.

### 8.2 Lint is clean
```
npm --prefix dashboard run lint
```
Assert: exits 0, no errors.

### 8.3 Build is clean
```
npm --prefix dashboard run build
```
Assert: Vite outputs "built in Xs" with no errors. Pre-existing chunk size warnings on `metaCohortUnitEconPreview` are acceptable.

---

## Verdict criteria

**APPROVE** — all items in Parts 1–8 pass.

**DO NOT SHIP** — any of the following:
- Section 1 renders freeCards or section 2 renders phoenixCards (labels swapped without data swap or vice versa)
- `matchesPhoenixInterview` is still a single `createTokenMatcher(...)` call (name matcher not added)
- `normalizeHubspotAttendanceSessions` does not exist or `computeKpiSnapshot` still calls `normalizeZoomSessions`
- `var(--color-text-secondary)` still appears in `AttendanceDashboard.jsx`
- `cardStyle` does not include `color: '#0f172a'`
- Any test fails

**APPROVE WITH NOTE** — only Part 7.6 (zoomResponse fetch status) raises a concern, no logic failures.

---

## Known non-issues (do not flag)

- `normalizeZoomSessions` still exists as a function — it was not deleted, just no longer called in `computeKpiSnapshot`. This is intentional; removal of deprecated Zoom infrastructure is tracked in agents.md open issues.
- `zoomRows: zoomResponse.data || []` still stored in `rawData` — the Zoom fetch still runs but its result is no longer consumed by the attendance path. This is a follow-up cleanup item, not a regression.
- AVG Visits values may be 0 if no HubSpot group session activities with matching title signals exist in the loaded date range — this means the data is sparse, not that the logic is wrong. Verify with a wider date range if needed.
- The `mastermind`/`intro` guard in `normalizeHubspotAttendanceSessions` is belt-and-suspenders — "Sober Founders Intro Meeting" does not contain "mastermind", so it would never match that signal anyway.
