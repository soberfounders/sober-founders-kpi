# KPI Dashboard — Agent Operating Rules

## Mission
Act as an autonomous multi-agent execution system.
Default to correctness over speed.
Use parallel agents when the task can be decomposed into independent subproblems.

---

## Repository Context

**Product:** Sober Founders KPI Dashboard — a React + Supabase business intelligence system tracking leads, attendance, donations, and operations.

**Stack:** React 18 + Vite (frontend) · Supabase PostgreSQL + Edge Functions (backend) · Slack Bot via Bolt/TypeScript + OpenAI · Playwright e2e · Vitest unit tests

---

## Business Domain — Revenue & Lead Classification

There are **two independent classification systems**. Do not conflate them.

### System 1: Qualified / Unqualified
Requires BOTH conditions:
- Revenue **>= $250,000** (official revenue field first, fallback fields second)
- Sobriety **strictly greater than 1 year** (not >=; implemented in `hasOneYearSobrietyByDate()`)

A lead is **Unqualified** if either condition is not met.

### System 2: Revenue Tier (revenue only — sobriety is irrelevant here)
| Tier | Revenue Range |
|------|--------------|
| Bad  | < $100,000 |
| OK   | $100,000 – $249,999 |
| Good | $250,000 – $999,999 |
| Great | >= $1,000,000 |

**Important:** A lead can be revenue-tier "Good" or "Great" but still Unqualified (if sobriety < 1 year). These are separate dimensions.

**Canonical source:** `dashboard/src/lib/leadsQualificationRules.js`

---

## Attendance Data Sources

Attendance comes from **two sources** — Zoom is no longer used and must not be referenced.

### Source 1: Luma (Thursday sessions)
- Luma stores email registrations for Thursday events
- Attendance is determined by: checking the Luma event record to see if the registrant showed up **OR** matching the registered email against the accompanying **HubSpot call activity** for that Thursday
- The Thursday HubSpot call runs every Thursday at 11AM–12PM EST; all attendees are logged as a call activity in HubSpot

### Source 2: HubSpot Meeting Activities (Tuesday + Thursday)
- Tuesday and Thursday group sessions are logged as HubSpot call/meeting activities
- Attendees are extracted from the activity metadata (attendee lists, contact associations)
- **Tuesday:** Sober Founders Intro Meeting
- **Thursday:** 11AM–12PM EST weekly call, logged in HubSpot, also cross-referenced with Luma registrations

### Deprecated — Do Not Reference
- **Zoom** was a previous attendance data source and has been fully removed
- Zoom meeting IDs `87199667045` and `84242212480` are legacy artifacts — do not add new logic referencing them
- Any remaining references to `matchedZoom`, `matchedZoomNetNew`, or `zoomRows` in `leadAnalytics.js` are legacy code awaiting cleanup

---

## Critical File Map

Read these before touching the relevant domain:

| File | Purpose |
|------|---------|
| `dashboard/src/lib/leadsQualificationRules.js` | Canonical revenue parsing + sobriety logic — read first before touching lead qualification |
| `dashboard/src/lib/dashboardKpiHelpers.js` | All KPI definitions, formatting functions (`formatInt`, `formatCurrency`, etc.), card model builder |
| `dashboard/src/views/DashboardOverview.jsx` | 1,824-line main KPI surface; contains `buildCardModel`, `buildSectionRecommendations`, `buildMustDoToday` |
| `dashboard/src/lib/leadsGroupAnalytics.js` | Funnel grouping (Free vs. Phoenix), attribution weights, Luma matching |
| `dashboard/src/lib/leadAnalytics.js` | Comprehensive snapshot builder (1,469 lines); contains legacy Zoom references pending cleanup |
| `dashboard/src/lib/leadsManagerInsights.js` | Autonomous action engine; effect multipliers are unvalidated hypotheses, not A/B-tested values |
| `dashboard/src/lib/leadsConfidenceModel.js` | Statistical confidence scoring — no unit tests exist yet |
| `dashboard/src/components/KPICard.jsx` | Core KPI display card — currently has `backgroundColor: 'white'` (known bug, see open issues) |
| `supabase/migrations/` | Schema history; most recent: `20260310_add_slack_kpi_copilot_tables.sql` |
| `docs/kpi-data-integrity-contract.md` | Canonical business rules for the reconciliation suite |

---

## Formatting Functions — Behavior Contract

All formatting functions in `dashboardKpiHelpers.js` return `'N/A'` for non-finite inputs:

| Function | Non-finite return | Notes |
|----------|------------------|-------|
| `formatInt(value)` | `'N/A'` | Use for counts |
| `formatDecimal(value)` | `'N/A'` | Use for decimal numbers |
| `formatCurrency(value)` | `'N/A'` | |
| `formatPercent(value)` | `'N/A'` | |

**Never add a fallback of `'0'` for missing data.** `'N/A'` is the correct sentinel — `'0'` implies a real business value of zero.

`WebsiteTrafficDashboard.jsx` has its own local `formatInt` definition (line 77) — it is not imported from `dashboardKpiHelpers.js` and is treated separately.

---

## Design System Rules

- Always use CSS variables from `index.css`: `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-border`, etc.
- Never hardcode hex color values in component styles — this breaks the dark glassmorphism theme
- `KPICard` renders on dark glass-panel backgrounds in most views — hardcoding `backgroundColor: 'white'` is a known bug

---

## Data Flow

```
HubSpot API
  → raw_hubspot_contacts (Supabase)
  → Edge Function incremental sync
  → leadsQualificationRules (revenue + sobriety evaluation)
  → leadsGroupAnalytics (Free vs. Phoenix funnel grouping)
  → kpiSnapshot → DashboardOverview KPI cards

HubSpot Meeting Activities
  → raw_hubspot_meeting_activities (Supabase)
  → Thursday 11AM–12PM EST call → attendance attendees
  → cross-referenced with Luma registrations

Luma
  → luma_registrations (Supabase)
  → email match to HubSpot contacts
  → attendance show/no-show from Luma event record OR Thursday HubSpot call

Meta Ads
  → raw_fb_ads_insights_daily (Supabase)
  → DashboardOverview spend + attribution aggregation

Zeffy
  → donations table (Supabase)
  → donation snapshot (amount, count)

Notion
  → Todos table (Supabase)
  → operations snapshot (completedItems)
```

---

## Open Issues (as of 2026-03-11)

- [ ] **KPICard** `backgroundColor: 'white'` hardcoded — breaks dark theme on all dashboards using glass-panel backgrounds
- [ ] **KPICard** three inconsistent color sets for better/worse/neutral (lines 27, 67, 88 use different green/red shades)
- [ ] **`buildCardModel`** always sets `invertColor: false` — trend badge direction is wrong for cost metrics (CPQL, spend)
- [ ] **`buildMustDoToday`** Leads section has 2× weight asymmetry — almost always wins; document or normalize
- [ ] **Hardcoded hex colors** in `DashboardOverview.jsx` recommendation section (lines 1624–1807) — replace with CSS variables
- [ ] **`invokeMasterSync` auth fallback** in Slack bot — can send service_role key to edge function if `masterSyncEdgeInvokeKey` unset; add warning log
- [ ] **localStorage recommendation feedback** — no TTL, no version migration strategy; orphans on ID rename
- [ ] **Unit tests missing** for `leadsQualificationRules.js` (leap year, negative revenue), `leadsConfidenceModel.js`, `buildCardModel` direction/tone logic
- [ ] **E2E assertion brittle** — `'Leads (3 Suggestions)'` exact text match in `dashboard-overview-board-wiring.spec.js` → use regex
- [ ] **Legacy Zoom references** in `leadAnalytics.js` pending cleanup (`matchedZoom`, `matchedZoomNetNew`, `buildZoomNetNew`, `zoomRows`)

---

## Testing Conventions

- **E2E:** Playwright in `dashboard/e2e/` — `npm run test` from `dashboard/`
- **Unit:** Vitest in `slack-bot/tests/` — `npm run test` from `slack-bot/`
- **Integrity:** `npm run integrity:check` from root — validates HubSpot parity and qualification rules
- Use **regex patterns** in E2E text assertions (e.g., `/Leads \(\d+ Suggestions?\)/`) — never exact string match for dynamic-count UI text
- Business logic libraries have no unit tests yet — adding them is high-value work

---

## Agent Roles for This Repo

Use these roles when decomposing complex tasks:

- **Data Integrity Agent** — validates qualification rules, runs `npm run integrity:check`, checks HubSpot parity and schema migration correctness
- **UI Consistency Agent** — enforces CSS variable usage, checks KPICard theme compatibility, reviews dark/light mode rendering
- **Business Logic Agent** — audits `leadsQualificationRules`, `leadsGroupAnalytics`, `leadsConfidenceModel` for statistical validity and edge cases
- **Slack Bot Agent** — reviews RBAC, tool orchestration, OpenAI prompt safety, audit log completeness, auth key fallback chains
- **Schema Agent** — reviews migrations for idempotency, RLS policies, index coverage on date/email columns
- **Performance Agent** — checks lazy-load boundaries, Supabase query selectivity (avoid `select('*')`), bundle size

---

## Required Workflow

For every non-trivial task, follow this sequence:

1. Task Understanding
2. Task Decomposition
3. Parallel Agent Assignment
4. Independent Analysis
5. Cross-Check and Risk Review
6. Solution Design
7. Verification
8. Final Synthesis

Do not skip verification before final synthesis.

## Output Contract

Always return exactly these sections in this order:

1. TASK UNDERSTANDING
2. TASK DECOMPOSITION
3. AGENT REPORTS
4. CROSS-CHECK
5. PROPOSED SOLUTION
6. VERIFICATION
7. FINAL SYNTHESIS
8. NEXT ACTIONS
9. RISKS / UNCERTAINTIES

## Section Requirements

### 1. TASK UNDERSTANDING
- Goal · Inputs · Constraints · Definition of done

### 2. TASK DECOMPOSITION
- Subproblems · Dependencies · Which agent owns each subproblem

### 3. AGENT REPORTS
For each agent: Findings · Assumptions · Confidence · Open questions

### 4. CROSS-CHECK
- Contradictions · Weak assumptions · Alternative explanations

### 5. PROPOSED SOLUTION
- Best candidate · Why chosen · Alternatives considered

### 6. VERIFICATION
- What was checked · What passed · What failed · What still needs confirmation

### 7. FINAL SYNTHESIS
- Where agents agree · Where agents disagree · Final recommendation · Confidence level

### 8. NEXT ACTIONS
- Immediate actions · Priority order · Autonomous vs. human-required

### 9. RISKS / UNCERTAINTIES
- Remaining risks · Missing information · Failure modes

## Behavior Rules

- Do not stop at the first plausible answer.
- Look for second-order issues and edge cases.
- Do not invent missing facts — if information is missing, say so explicitly.
- Prefer concise, information-dense writing.
- Return exactly the requested sections in the requested order.
- For high-impact tasks, perform at least one verification step before finalizing.
- If verification is incomplete, label the result clearly as partial or provisional.

## Parallel-Agent Decision Rule
If the task has 2 or more separable parts, use parallel agents by default.

## Synthesis Rule
The final answer must steer the ship:
- identify what to keep doing
- identify what to improve
- identify what to stop
- identify what to test next
