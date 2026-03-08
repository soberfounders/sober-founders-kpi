# Load-Time KPI Prioritization Policy (Keep vs Noise)

Date: 2026-03-09
Owner: W4 Audit
Scope: KPI dashboard initial-load optimization policy for Leads, Attendance, and Dashboard overview surfaces.

## Policy Intent

Define which KPIs are non-negotiable on first load and which sections are safe to defer, so performance gains do not erode decision quality.

## Priority Tiers

- `P0 (Must Keep on Initial Load)`: required for immediate operator/manager decisions.
- `P1 (Load After First Useful Paint)`: useful context, safe to lazy-load after core KPIs render.
- `P2 (Noise/Secondary)`: defer by default and load on interaction or explicit deep-dive.

## 1) Must-Keep Metrics (`P0`)

### Leads (required)

- Campaign quality analyzer at campaign/adset level.
- `CPQL` and `CPGL`.
- Qualified leads and Great leads counts.
- Qualified% and Great% in the same current filter window.

Why `P0`:
- These are the minimum set to avoid low-CPL/low-quality optimization mistakes.
- They directly control budget shift decisions and quality preservation.

### Attendance (required)

- Tuesday attendance count.
- Thursday attendance count.
- New attendees count.
- Average attendance per person.

Why `P0`:
- These are the minimum health indicators for attendance growth and retention quality.
- They inform immediate outreach, scheduling, and funnel continuity decisions.

### Dashboard North-Star (required)

- North-star KPI strip (module headline metrics only).
- Concise insight bullets tied to current window movement (WoW/MoM summary-level only).

Why `P0`:
- Leadership requires instant directional context before drilling down.
- Headline KPI + short insights support fast prioritization without loading heavy diagnostic detail.

## 2) Safe to Defer/Cut on Initial Load (`P1`/`P2`)

### Safe to defer to post-initial load (`P1`)

- Detailed drilldown tables and raw row listings.
- Expanded trend charts beyond current decision window.
- Deep diagnostic panels not needed for first action decision.
- Historical comparison views older than primary operating window.

### Safe to cut from initial load by default (`P2`)

- Long narrative blocks that repeat KPI cards.
- Secondary visualizations with low operator action value.
- Duplicate KPI views with alternate formatting but same conclusion.
- Large exploratory datasets only used in ad-hoc analysis.

Load rule:
- `P1` should lazy-load immediately after `P0` is interactive.
- `P2` should load only via explicit user action (tab expand, drilldown click, or “load more diagnostics”).

## 3) Performance Budget Targets

Primary budgets (selected filter window):

- First usable render (`P0` skeleton + structure interactive): `<= 1.8s` p75, `<= 2.8s` p95.
- Data-ready for all `P0` KPIs: `<= 3.0s` p75, `<= 4.5s` p95.
- Post-load `P1` completion: `<= 6.0s` p75 (non-blocking).

Hard fail thresholds:

- FAIL if any `P0` metric is deferred behind user interaction.
- FAIL if `P0` data-ready exceeds `5.0s` p95 for two consecutive releases.
- FAIL if optimization removes CPQL/CPGL or qualified/great visibility from first-load Leads decisions.

## 4) Rollout Risk Notes

### Risk: Over-pruning quality signals (High)

- Failure mode: fast load but degraded decision quality.
- Mitigation: lock Leads quality analyzer + CPQL/CPGL + qualified/great as immutable `P0` policy.

### Risk: Attendance drift from missing Tue/Thu segmentation (High)

- Failure mode: apparent attendance stability hides day-specific drops.
- Mitigation: require separate Tue/Thu counts in initial payload and render.

### Risk: North-star card-only dashboard with no actionable context (Medium)

- Failure mode: leadership sees numbers without directional signal.
- Mitigation: require concise insight bullets on initial render, limited to high-signal deltas.

### Risk: Deferred sections silently fail and never load (Medium)

- Failure mode: deep-dive diagnostics unavailable when needed.
- Mitigation: add visible lazy-load status states and retry path for deferred panels.

## Acceptance Gate (PASS/FAIL)

PASS when all are true:

- All `P0` metrics above render in initial load without user interaction.
- First usable render and `P0` data-ready budgets are met.
- `P1`/`P2` defer strategy is explicit and does not remove first-decision quality.

FAIL when any is true:

- A required `P0` KPI is moved behind drilldown/secondary fetch.
- Budget thresholds breach hard-fail limits.
- Leads quality decision layer can no longer distinguish low-CPL vs low-quality outcomes on first load.