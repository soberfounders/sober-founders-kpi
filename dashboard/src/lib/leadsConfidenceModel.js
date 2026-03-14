const DEFAULT_LEADS_CONFIDENCE_THRESHOLDS = Object.freeze({
  min_match_rate: 0.75,
  min_hubspot_call_coverage_rate: 0.6,
  min_luma_hubspot_match_rate: 0.7,
  max_unknown_source_share: 0.15,
  max_stale_days: 3,
  min_attendance_rows: 25,
});

const MATCH_CONFIDENCE_WEIGHTS = Object.freeze({});
const SCORE_WEIGHTS = Object.freeze({});

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPathValue(input, path) {
  const keys = String(path || '').split('.');
  let node = input;
  for (const key of keys) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[key];
  }
  return node;
}

function pickNumber(input, paths = []) {
  for (const path of paths) {
    const value = toNumberOrNull(getPathValue(input, path));
    if (value !== null) return value;
  }
  return null;
}

function pickBoolean(input, paths = [], fallback = null) {
  for (const path of paths) {
    const value = getPathValue(input, path);
    if (typeof value === 'boolean') return value;
  }
  return fallback;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function normalizeThresholds(input = {}) {
  return {
    ...DEFAULT_LEADS_CONFIDENCE_THRESHOLDS,
    ...(input.thresholds && typeof input.thresholds === 'object' ? input.thresholds : {}),
  };
}

function deriveUnknownSourceShare(input, unknownCount, totalAttendanceRows) {
  const explicitShare = pickNumber(input, [
    'unknown_source_share',
    'unknownSourceShare',
    'source_quality.unknown_source_share',
    'sourceQuality.unknownSourceShare',
  ]);
  if (explicitShare !== null) return clamp01(explicitShare);

  const denominator = pickNumber(input, [
    'good_members_total',
    'goodMembersTotal',
    'source_quality.good_members_total',
    'sourceQuality.goodMembersTotal',
  ]);
  if (Number.isFinite(unknownCount) && Number.isFinite(denominator) && denominator > 0) {
    return clamp01(unknownCount / denominator);
  }
  if (Number.isFinite(unknownCount) && Number.isFinite(totalAttendanceRows) && totalAttendanceRows > 0) {
    return clamp01(unknownCount / totalAttendanceRows);
  }
  return null;
}

function buildBlockers(metrics, thresholds) {
  const blockers = [];
  const add = (code, message, severity, value, threshold) => {
    blockers.push({
      code,
      message,
      severity,
      value,
      threshold,
    });
  };

  if (metrics.has_direct_luma_data === false) {
    add(
      'missing_luma_data',
      'Lu.ma direct registration data is unavailable; Thursday registration reconciliation is degraded.',
      'high',
      null,
      null,
    );
  }

  if (metrics.has_hubspot_attribution_columns === false) {
    add(
      'missing_hubspot_attribution_columns',
      'HubSpot attribution columns are missing; source attribution is degraded.',
      'high',
      null,
      null,
    );
  }

  if (Number.isFinite(metrics.match_rate) && metrics.match_rate < thresholds.min_match_rate) {
    add(
      'low_match_rate',
      'HubSpot attendance/source match rate is below target.',
      'high',
      metrics.match_rate,
      thresholds.min_match_rate,
    );
  }

  if (
    Number.isFinite(metrics.hubspot_call_coverage_rate)
    && metrics.hubspot_call_coverage_rate < thresholds.min_hubspot_call_coverage_rate
  ) {
    add(
      'low_hubspot_call_coverage',
      'Expected Tuesday/Thursday HubSpot call coverage is below target.',
      'high',
      metrics.hubspot_call_coverage_rate,
      thresholds.min_hubspot_call_coverage_rate,
    );
  }

  if (
    metrics.has_direct_luma_data !== false
    && Number.isFinite(metrics.luma_hubspot_match_rate)
    && metrics.luma_hubspot_match_rate < thresholds.min_luma_hubspot_match_rate
  ) {
    add(
      'low_luma_hubspot_match_rate',
      'Lu.ma to HubSpot identity match rate is below target.',
      'medium',
      metrics.luma_hubspot_match_rate,
      thresholds.min_luma_hubspot_match_rate,
    );
  }

  if (
    Number.isFinite(metrics.unknown_source_share)
    && metrics.unknown_source_share > thresholds.max_unknown_source_share
  ) {
    add(
      'high_unknown_source_share',
      'Unknown/Other source share is above target.',
      'medium',
      metrics.unknown_source_share,
      thresholds.max_unknown_source_share,
    );
  }

  if (Number.isFinite(metrics.stale_days) && metrics.stale_days > thresholds.max_stale_days) {
    add(
      'stale_data',
      'HubSpot or Lu.ma source data is stale beyond allowed freshness.',
      'high',
      metrics.stale_days,
      thresholds.max_stale_days,
    );
  }

  if (
    Number.isFinite(metrics.total_attendance_rows)
    && metrics.total_attendance_rows < thresholds.min_attendance_rows
  ) {
    add(
      'low_sample_size',
      'Attendance sample size is below the minimum for stable decision-making.',
      'medium',
      metrics.total_attendance_rows,
      thresholds.min_attendance_rows,
    );
  }

  return blockers;
}

function deriveIntegrityLevel(blockers = []) {
  if (!Array.isArray(blockers) || blockers.length === 0) return 'high';
  if (blockers.some((blocker) => String(blocker?.severity || '').toLowerCase() === 'high')) return 'low';
  return 'medium';
}

export function buildLeadsConfidenceSummary(input = {}) {
  const thresholds = normalizeThresholds(input);
  const totalAttendanceRows = pickNumber(input, [
    'total_attendance_rows',
    'totalAttendanceRows',
    'total_showup_rows',
    'totalShowupRows',
  ]);
  const unknownOrOtherGoodMembers = pickNumber(input, [
    'unknown_or_other_good_members',
    'unknownOrOtherGoodMembers',
  ]);

  const metrics = {
    has_direct_luma_data: pickBoolean(input, [
      'has_direct_luma_data',
      'hasDirectLumaData',
      'data_availability.has_direct_luma_data',
      'dataAvailability.hasDirectLumaData',
    ], true),
    has_hubspot_attribution_columns: pickBoolean(input, [
      'has_hubspot_attribution_columns',
      'hasHubspotAttributionColumns',
      'data_availability.has_hubspot_attribution_columns',
      'dataAvailability.hasHubSpotAttributionColumns',
    ], true),
    match_rate: pickNumber(input, [
      'match_rate',
      'matchRate',
      'attendance_integrity.match_rate',
      'attendanceIntegrity.matchRate',
    ]),
    hubspot_call_coverage_rate: pickNumber(input, [
      'hubspot_call_coverage_rate',
      'hubspotCallCoverageRate',
      'hubspot_call_coverage.rate',
      'hubspotCallCoverage.rate',
      'attendance_integrity.hubspot_call_coverage_rate',
      'attendanceIntegrity.hubspotCallCoverageRate',
    ]),
    luma_hubspot_match_rate: pickNumber(input, [
      'luma_hubspot_match_rate',
      'lumaHubspotMatchRate',
      'data_availability.luma_hubspot_match_rate',
      'dataAvailability.lumaHubspotMatchRate',
    ]),
    stale_days: pickNumber(input, [
      'stale_days',
      'staleDays',
      'freshness.stale_days',
      'freshness.staleDays',
    ]),
    total_attendance_rows: totalAttendanceRows,
    unknown_source_share: deriveUnknownSourceShare(input, unknownOrOtherGoodMembers, totalAttendanceRows),
    unknown_or_other_good_members: unknownOrOtherGoodMembers,
  };

  const blockers = buildBlockers(metrics, thresholds);
  const integrityLevel = deriveIntegrityLevel(blockers);

  return {
    confidence_score: 100,
    confidence_level: integrityLevel,
    integrity_level: integrityLevel,
    blockers,
    diagnostics: {
      thresholds,
      normalized_inputs: metrics,
      blocker_count: blockers.length,
      retired_confidence_scoring: true,
      deterministic_confidence_score: 100,
    },
  };
}

export {
  DEFAULT_LEADS_CONFIDENCE_THRESHOLDS,
  MATCH_CONFIDENCE_WEIGHTS,
  SCORE_WEIGHTS,
};
