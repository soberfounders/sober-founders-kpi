# Leads Metric Parity Guard Spec

## Purpose
Define a daily parity check that compares legacy Leads metrics against grouped/unified Leads metrics to detect regressions early without changing production logic.

## Scope
- Additive only.
- Docs-only specification.
- Daily check window: previous complete ET day (`00:00:00` to `23:59:59` America/New_York), unless otherwise configured.

## 1) Canonical Metric Mapping

| Legacy Metric Key | Grouped/Unified Metric Key | Formula Intent (must match) | Notes |
|---|---|---|---|
| `legacy_paid_spend` | `grouped_paid_spend` | Sum paid media spend for window | Same currency, same campaign inclusion filter. |
| `legacy_leads_paid` | `grouped_leads_paid` | Count of paid-social leads in window | Must apply same paid-source classification rules. |
| `legacy_cpl_paid` | `grouped_cpl_paid` | `paid_spend / leads_paid` | If denominator is 0, treat as `null` and compare null parity. |
| `legacy_registrations` | `grouped_registrations` | Count registrations in window | Same event eligibility and dedupe rules. |
| `legacy_cost_per_registration` | `grouped_cost_per_registration` | `paid_spend / registrations` | Null when registrations = 0. |
| `legacy_showups` | `grouped_showups` | Count show-ups in window | Same attendance source precedence and dedupe key. |
| `legacy_showup_rate` | `grouped_showup_rate` | `showups / registrations` | Null when registrations = 0. |
| `legacy_revenue_30d` | `grouped_revenue_30d` | Sum attributable 30-day revenue for cohort | Same attribution window anchor date. |
| `legacy_cac_30d` | `grouped_cac_30d` | `paid_spend / converted_clients_30d` | Null when converted clients = 0. |
| `legacy_repeat_rate_30d` | `grouped_repeat_rate_30d` | `repeat_clients_30d / total_clients_30d` | Null when total clients = 0. |

Needs verification:
- Exact metric key names in implementation code paths.
- Final mapping for any Phoenix/free split-only cards that do not exist in both systems.

## 2) Tolerance Rules

All checks run only when sample gate passes.

### 2.1 Thresholds
- Absolute delta threshold (`abs_delta_threshold`):
  - Count metrics: `<= 2`
  - Currency metrics: `<= 5.00`
  - Rate metrics (0..1): `<= 0.02`
- Relative delta threshold (`pct_delta_threshold`):
  - Default warning threshold: `<= 10.0%`
  - Alert/critical threshold: `> 20.0%`
  - Core metrics (`spend`, `leads_paid`, `registrations`, `showups`, `cpl_paid`) use the same 10%/20% policy to match current operating preference.

### 2.2 Sample Size Gate
- Minimum sample size per metric:
  - Denominator/count-based metrics: `max(25, legacy_value, grouped_value) >= 25`
  - Rate metrics: denominator must be `>= 25`
- If sample gate fails: status `SKIP_LOW_SAMPLE`, no warning/critical page.

### 2.3 Delta Calculation
- `abs_delta = abs(grouped_value - legacy_value)`
- `pct_delta = abs_delta / max(abs(legacy_value), 1)` for numeric metrics.
- For null-capable ratio metrics:
  - Both null => pass parity.
  - One null and one numeric => fail parity.

## 3) Alert Policy

### 3.1 Severity
- `PASS`: within thresholds or valid null parity.
- `WARNING`: relative delta breach above `10%` and up to `20%`, or stale/low-confidence source freshness.
- `CRITICAL`: relative delta breach above `20%` on any core metric (`spend`, `leads_paid`, `registrations`, `showups`, `cpl_paid`) or repeated warning on the same metric for 2 consecutive daily runs.

### 3.2 Escalation Path
1. Warning:
   - Send a push notification + Slack message with top 5 deltas and source freshness snapshot.
   - Create triage ticket if warning persists 2 days.
2. Critical:
   - Send immediate push notification + Slack alert to on-call data owner.
   - Open incident ticket and assign Leads owner + data pipeline owner.
   - Block parity-dependent release promotions until resolved or explicitly waived.

## 4) Output Contract

Per metric per check date:

```json
{
  "check_date": "2026-03-08",
  "metric_key": "grouped_cpl_paid",
  "legacy_value": 42.37,
  "grouped_value": 43.01,
  "abs_delta": 0.64,
  "pct_delta": 0.0151,
  "status": "PASS",
  "notes": "within strict threshold; sample=118"
}
```

Field requirements:
- `check_date`: ISO date (`YYYY-MM-DD`) for evaluation window.
- `metric_key`: canonical grouped/unified metric key.
- `legacy_value`: numeric or null (if metric undefined for window).
- `grouped_value`: numeric or null.
- `abs_delta`: numeric or null (null when both values null).
- `pct_delta`: numeric or null.
- `status`: `PASS | WARNING | CRITICAL | SKIP_LOW_SAMPLE | SKIP_MISSING_SOURCE`.
- `notes`: short machine+human-readable reason string.

## 5) PASS/FAIL Acceptance Criteria

Run-level PASS:
- All core metrics are `PASS` or `SKIP_LOW_SAMPLE`.
- No metric is `CRITICAL`.
- At most 2 non-core metrics in `WARNING`.

Run-level FAIL:
- Any core metric is `CRITICAL`.
- 3+ metrics in `WARNING` after sample gating.
- Any metric returns malformed contract fields.

Operational acceptance for rollout:
- 7 consecutive daily runs without `CRITICAL`.
- >= 95% of emitted rows have non-null values where source freshness is healthy.

## 6) Edge Cases (8)

1. Missing legacy data source for day
- Expected: emit `SKIP_MISSING_SOURCE` for affected metrics; include source name in `notes`.

2. Missing grouped/unified source for day
- Expected: emit `SKIP_MISSING_SOURCE`; do not compute deltas.

3. Partial sync (late-arriving records)
- Expected: first run may warn; auto re-run after freshness SLA window before escalating to critical.

4. Stale source timestamps (>24h behind expected)
- Expected: downgrade any would-be `CRITICAL` to `WARNING` with `notes=stale_source`; escalate only after freshness restored.

5. Zero denominators for rate metrics
- Expected: produce null ratio; pass only if both sides null.

6. Outlier spike from one-time backfill
- Expected: annotate `notes=backfill_detected`; allow temporary warning suppression only with explicit waiver record.

7. Timezone boundary mismatch (UTC vs ET)
- Expected: parity check must normalize both sides to ET day; if not possible, status `SKIP_MISSING_SOURCE` and flag configuration error.

8. Duplicate contacts merged mid-window
- Expected: compare post-dedupe counts; if one side still pre-dedupe, warning with `notes=dedupe_mismatch` and route to data owner.

## Implementation Notes (Non-Breaking)
- Persist outputs in a new additive parity result artifact/table/view.
- Do not modify existing legacy or grouped metric pipelines in this rollout.
- Keep metric mapping versioned (`mapping_version`) for future schema changes.
