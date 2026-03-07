const DEFAULT_PARITY_THRESHOLDS = Object.freeze({
  warn_abs_delta: 0,
  fail_abs_delta: 1,
  warn_pct_delta: 0.02,
  fail_pct_delta: 0.05,
  zero_epsilon: 1e-9,
});

const DEFAULT_METRIC_KEYS = Object.freeze([
  'leads',
  'qualifiedLeads',
  'greatLeads',
  'registrations',
  'showUps',
  'spend',
]);

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function pickObject(input, candidates = []) {
  for (const key of candidates) {
    const value = input?.[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  return {};
}

function pickMetricKeys(input = {}, legacy, grouped) {
  const explicit = Array.isArray(input.metric_keys)
    ? input.metric_keys
    : (Array.isArray(input.metrics) ? input.metrics : null);
  if (explicit && explicit.length > 0) return explicit.map((key) => String(key));

  const merged = new Set([
    ...DEFAULT_METRIC_KEYS,
    ...Object.keys(legacy || {}),
    ...Object.keys(grouped || {}),
  ]);
  return Array.from(merged);
}

function normalizeThresholds(input = {}, metricKey = '') {
  const globalInput = input?.thresholds && typeof input.thresholds === 'object'
    ? input.thresholds
    : {};
  const metricOverrides = globalInput?.by_metric?.[metricKey];

  return {
    ...DEFAULT_PARITY_THRESHOLDS,
    ...globalInput,
    ...(metricOverrides && typeof metricOverrides === 'object' ? metricOverrides : {}),
  };
}

function makeSkip(metricKey, legacyValue, groupedValue, reason) {
  return {
    metric_key: metricKey,
    legacy_value: legacyValue,
    grouped_value: groupedValue,
    abs_delta: null,
    pct_delta: null,
    status: 'skip',
    reason,
  };
}

function evaluateMetric(metricKey, legacyRaw, groupedRaw, thresholds) {
  const legacyValue = toNumberOrNull(legacyRaw);
  const groupedValue = toNumberOrNull(groupedRaw);
  const eps = Number.isFinite(Number(thresholds.zero_epsilon))
    ? Math.max(0, Number(thresholds.zero_epsilon))
    : DEFAULT_PARITY_THRESHOLDS.zero_epsilon;

  if (legacyValue === null && groupedValue === null) {
    return makeSkip(metricKey, legacyValue, groupedValue, 'Both values are missing/non-numeric.');
  }
  if (legacyValue === null || groupedValue === null) {
    return makeSkip(metricKey, legacyValue, groupedValue, 'One side is missing/non-numeric.');
  }

  const absDeltaRaw = Math.abs(groupedValue - legacyValue);
  const absDelta = round(absDeltaRaw);
  const hasNonZeroBaseline = Math.abs(legacyValue) > eps;
  const pctDeltaRaw = hasNonZeroBaseline ? absDeltaRaw / Math.abs(legacyValue) : null;
  const pctDelta = pctDeltaRaw === null ? null : round(pctDeltaRaw);

  const warnAbs = Math.max(0, Number(thresholds.warn_abs_delta));
  const failAbs = Math.max(warnAbs, Number(thresholds.fail_abs_delta));
  const warnPct = Math.max(0, Number(thresholds.warn_pct_delta));
  const failPct = Math.max(warnPct, Number(thresholds.fail_pct_delta));

  const failByAbs = Number.isFinite(failAbs) && absDeltaRaw > failAbs;
  const warnByAbs = Number.isFinite(warnAbs) && absDeltaRaw > warnAbs;
  const failByPct = pctDeltaRaw !== null && Number.isFinite(failPct) && pctDeltaRaw > failPct;
  const warnByPct = pctDeltaRaw !== null && Number.isFinite(warnPct) && pctDeltaRaw > warnPct;

  let status = 'pass';
  let reason = 'Within parity thresholds.';

  if (failByAbs || failByPct) {
    status = 'fail';
    reason = failByAbs
      ? `Absolute delta ${round(absDeltaRaw)} exceeds fail_abs_delta ${round(failAbs)}.`
      : `Percent delta ${round(pctDeltaRaw)} exceeds fail_pct_delta ${round(failPct)}.`;
  } else if (warnByAbs || warnByPct) {
    status = 'warn';
    reason = warnByAbs
      ? `Absolute delta ${round(absDeltaRaw)} exceeds warn_abs_delta ${round(warnAbs)}.`
      : `Percent delta ${round(pctDeltaRaw)} exceeds warn_pct_delta ${round(warnPct)}.`;
  } else if (!hasNonZeroBaseline && absDeltaRaw > eps) {
    reason = 'Baseline is near zero; evaluated with absolute delta only.';
  }

  return {
    metric_key: metricKey,
    legacy_value: legacyValue,
    grouped_value: groupedValue,
    abs_delta: absDelta,
    pct_delta: pctDelta,
    status,
    reason,
  };
}

function buildSummary(checks = []) {
  return checks.reduce((acc, check) => {
    const status = String(check?.status || 'skip');
    if (!Object.prototype.hasOwnProperty.call(acc, status)) return acc;
    acc[status] += 1;
    return acc;
  }, { pass: 0, warn: 0, fail: 0, skip: 0 });
}

function normalizeGeneratedAt(input = {}) {
  const value = input.generated_at ?? input.generatedAt ?? input.as_of ?? input.asOf ?? null;
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function computeLeadsParityReport(input = {}) {
  const legacy = pickObject(input, ['legacy', 'legacy_metrics', 'legacyMetrics', 'legacy_snapshot', 'legacySnapshot']);
  const grouped = pickObject(input, ['grouped', 'grouped_metrics', 'groupedMetrics', 'unified', 'unified_metrics', 'unifiedMetrics']);
  const metricKeys = pickMetricKeys(input, legacy, grouped);

  const checks = metricKeys.map((metricKey) => {
    const thresholds = normalizeThresholds(input, metricKey);
    return evaluateMetric(
      metricKey,
      legacy?.[metricKey],
      grouped?.[metricKey],
      thresholds,
    );
  });

  return {
    generated_at: normalizeGeneratedAt(input),
    checks,
    summary: buildSummary(checks),
  };
}

export {
  DEFAULT_PARITY_THRESHOLDS,
  DEFAULT_METRIC_KEYS,
};
