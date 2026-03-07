const DEFAULT_LEADS_CONFIDENCE_THRESHOLDS = Object.freeze({
  min_match_rate: 0.75,
  min_hubspot_call_coverage_rate: 0.6,
  min_luma_zoom_match_rate: 0.35,
  min_luma_hubspot_match_rate: 0.7,
  max_unknown_source_share: 0.15,
  max_stale_days: 3,
  min_showup_rows: 25,
  min_mapping_quality_score: 0.6,
  high_confidence_score: 80,
  medium_confidence_score: 60,
});

const MATCH_CONFIDENCE_WEIGHTS = Object.freeze({
  email: 1.0,
  secondary_email: 0.9,
  full_name: 0.75,
  fuzzy_name: 0.45,
  unmatched: 0.0,
});

const SCORE_WEIGHTS = Object.freeze({
  match_rate: 0.24,
  hubspot_call_coverage_rate: 0.18,
  mapping_quality_score: 0.24,
  luma_zoom_match_rate: 0.09,
  luma_hubspot_match_rate: 0.09,
  unknown_source_share: 0.06,
  stale_days: 0.05,
  showup_rows: 0.05,
});

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return 0;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

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

function normalizeThresholds(input = {}) {
  return {
    ...DEFAULT_LEADS_CONFIDENCE_THRESHOLDS,
    ...(input.thresholds && typeof input.thresholds === 'object' ? input.thresholds : {}),
  };
}

function normalizeConfidenceBreakdown(input = {}) {
  const direct = input.confidence_breakdown;
  if (direct && typeof direct === 'object') return direct;
  const fallback = input.match_confidence_breakdown;
  if (fallback && typeof fallback === 'object') return fallback;
  return {};
}

function confidenceMixScore(rows = []) {
  let weighted = 0;
  let total = 0;
  const normalized = [];

  for (const row of rows) {
    const confidence = String(row?.confidence || '').trim().toLowerCase();
    const baseWeight = MATCH_CONFIDENCE_WEIGHTS[confidence] ?? 0.3;
    const count = toNumberOrNull(row?.count);
    const pct = toNumberOrNull(row?.pct);
    const magnitude = count !== null && count > 0 ? count : (pct !== null && pct > 0 ? pct : 0);

    normalized.push({
      confidence: confidence || 'unknown',
      count: count ?? 0,
      pct: pct ?? null,
      mapped_weight: baseWeight,
      magnitude,
    });

    if (magnitude <= 0) continue;
    weighted += magnitude * baseWeight;
    total += magnitude;
  }

  if (total <= 0) {
    return {
      score: null,
      rows: normalized,
      total_magnitude: 0,
    };
  }

  return {
    score: clamp01(weighted / total),
    rows: normalized,
    total_magnitude: total,
  };
}

function scoreAgainstMin(value, minimum, fallbackScore = 0.5) {
  if (!Number.isFinite(value)) return fallbackScore;
  if (!Number.isFinite(minimum) || minimum <= 0) return clamp01(value);
  if (value >= minimum) return 1;
  return clamp01(value / minimum);
}

function scoreAgainstMax(value, maximum, fallbackScore = 0.5) {
  if (!Number.isFinite(value)) return fallbackScore;
  if (!Number.isFinite(maximum) || maximum <= 0) return value <= 0 ? 1 : 0;
  if (value <= maximum) return 1;
  const over = value - maximum;
  return clamp01(1 - (over / maximum));
}

function deriveUnknownSourceShare(input, unknownCount, totalShowups) {
  const explicitShare = pickNumber(input, [
    'unknown_source_share',
    'unknownSourceShare',
    'source_quality.unknown_source_share',
    'sourceQuality.unknownSourceShare',
  ]);
  if (explicitShare !== null) return clamp01(explicitShare);

  const denominator = toNumberOrNull(pickNumber(input, [
    'good_members_total',
    'goodMembersTotal',
    'source_quality.good_members_total',
    'sourceQuality.goodMembersTotal',
  ]));
  if (Number.isFinite(unknownCount) && Number.isFinite(denominator) && denominator > 0) {
    return clamp01(unknownCount / denominator);
  }
  if (Number.isFinite(unknownCount) && Number.isFinite(totalShowups) && totalShowups > 0) {
    return clamp01(unknownCount / totalShowups);
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
      'Lu.ma direct registration data is unavailable; fallback attribution reduces confidence.',
      'high',
      null,
      null,
    );
  }

  if (metrics.has_hubspot_attribution_columns === false) {
    add(
      'missing_hubspot_attribution_columns',
      'HubSpot attribution columns are missing; advanced attribution quality is degraded.',
      'high',
      null,
      null,
    );
  }

  if (Number.isFinite(metrics.match_rate) && metrics.match_rate < thresholds.min_match_rate) {
    add(
      'low_match_rate',
      'HubSpot match rate is below target.',
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
      'HubSpot Call/Meeting coverage is below target.',
      'medium',
      metrics.hubspot_call_coverage_rate,
      thresholds.min_hubspot_call_coverage_rate,
    );
  }

  if (metrics.has_direct_luma_data !== false) {
    if (
      Number.isFinite(metrics.luma_zoom_match_rate)
      && metrics.luma_zoom_match_rate < thresholds.min_luma_zoom_match_rate
    ) {
      add(
        'low_luma_zoom_match_rate',
        'Lu.ma to Zoom net-new match rate is below target.',
        'medium',
        metrics.luma_zoom_match_rate,
        thresholds.min_luma_zoom_match_rate,
      );
    }

    if (
      Number.isFinite(metrics.luma_hubspot_match_rate)
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
  }

  if (
    Number.isFinite(metrics.mapping_quality_score)
    && metrics.mapping_quality_score < thresholds.min_mapping_quality_score
  ) {
    add(
      'weak_mapping_quality',
      'Confidence mix is too dependent on fuzzy/unmatched rows.',
      'high',
      metrics.mapping_quality_score,
      thresholds.min_mapping_quality_score,
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
      'Source data is stale beyond allowed freshness.',
      'high',
      metrics.stale_days,
      thresholds.max_stale_days,
    );
  }

  if (Number.isFinite(metrics.total_showup_rows) && metrics.total_showup_rows < thresholds.min_showup_rows) {
    add(
      'low_sample_size',
      'Show-up sample size is below minimum for high-confidence decisions.',
      'medium',
      metrics.total_showup_rows,
      thresholds.min_showup_rows,
    );
  }

  return blockers;
}

export function buildLeadsConfidenceSummary(input = {}) {
  const thresholds = normalizeThresholds(input);
  const confidenceBreakdown = normalizeConfidenceBreakdown(input);
  const lumaMix = confidenceMixScore(Array.isArray(confidenceBreakdown?.luma) ? confidenceBreakdown.luma : []);
  const zoomMix = confidenceMixScore(Array.isArray(confidenceBreakdown?.zoom) ? confidenceBreakdown.zoom : []);

  const mappingQualityScore = (() => {
    const lumaMagnitude = lumaMix.total_magnitude || 0;
    const zoomMagnitude = zoomMix.total_magnitude || 0;
    const total = lumaMagnitude + zoomMagnitude;
    if (total > 0) {
      const weighted =
        ((lumaMix.score ?? 0.5) * lumaMagnitude)
        + ((zoomMix.score ?? 0.5) * zoomMagnitude);
      return clamp01(weighted / total);
    }
    if (Number.isFinite(lumaMix.score) && Number.isFinite(zoomMix.score)) {
      return clamp01((lumaMix.score + zoomMix.score) / 2);
    }
    if (Number.isFinite(lumaMix.score)) return clamp01(lumaMix.score);
    if (Number.isFinite(zoomMix.score)) return clamp01(zoomMix.score);
    return 0.5;
  })();

  const totalShowups = pickNumber(input, [
    'total_showup_rows',
    'totalShowupRows',
    'zoom_source.total_showup_rows',
    'zoomSource.totalShowupRows',
    'zoom_source_module.current.totalShowUpRows',
    'zoomSourceModule.current.totalShowUpRows',
  ]);
  const unknownOrOtherGoodMembers = pickNumber(input, [
    'unknown_or_other_good_members',
    'unknownOrOtherGoodMembers',
    'zoom_source.unknown_or_other_good_members',
    'zoomSource.unknownOrOtherGoodMembers',
    'zoom_source_module.current.unknownOrOtherGoodMembers',
    'zoomSourceModule.current.unknownOrOtherGoodMembers',
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
      'zoom_source.match_rate',
      'zoomSource.matchRate',
      'zoom_source_module.current.matchRate',
      'zoomSourceModule.current.matchRate',
    ]),
    hubspot_call_coverage_rate: pickNumber(input, [
      'hubspot_call_coverage_rate',
      'hubspotCallCoverageRate',
      'hubspot_call_coverage.rate',
      'hubspotCallCoverage.rate',
      'unified_funnel.hubspot_call_coverage.rate',
      'unifiedFunnel.hubspotCallCoverage.rate',
      'unified_funnel_module.current.hubspotCallCoverage.rate',
      'unifiedFunnelModule.current.hubspotCallCoverage.rate',
    ]),
    luma_zoom_match_rate: pickNumber(input, [
      'luma_zoom_match_rate',
      'lumaZoomMatchRate',
      'data_availability.luma_zoom_match_rate',
      'dataAvailability.lumaZoomMatchRate',
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
    total_showup_rows: totalShowups,
    unknown_source_share: deriveUnknownSourceShare(input, unknownOrOtherGoodMembers, totalShowups),
    unknown_or_other_good_members: unknownOrOtherGoodMembers,
    mapping_quality_score: mappingQualityScore,
  };

  const componentScores = {
    match_rate: scoreAgainstMin(metrics.match_rate, thresholds.min_match_rate, 0.5),
    hubspot_call_coverage_rate: scoreAgainstMin(
      metrics.hubspot_call_coverage_rate,
      thresholds.min_hubspot_call_coverage_rate,
      0.5,
    ),
    mapping_quality_score: scoreAgainstMin(
      metrics.mapping_quality_score,
      thresholds.min_mapping_quality_score,
      0.5,
    ),
    luma_zoom_match_rate: scoreAgainstMin(
      metrics.luma_zoom_match_rate,
      thresholds.min_luma_zoom_match_rate,
      metrics.has_direct_luma_data === false ? 0.45 : 0.5,
    ),
    luma_hubspot_match_rate: scoreAgainstMin(
      metrics.luma_hubspot_match_rate,
      thresholds.min_luma_hubspot_match_rate,
      metrics.has_direct_luma_data === false ? 0.45 : 0.5,
    ),
    unknown_source_share: scoreAgainstMax(
      metrics.unknown_source_share,
      thresholds.max_unknown_source_share,
      0.5,
    ),
    stale_days: scoreAgainstMax(metrics.stale_days, thresholds.max_stale_days, 0.5),
    showup_rows: scoreAgainstMin(metrics.total_showup_rows, thresholds.min_showup_rows, 0.4),
  };

  const weighted = Object.keys(SCORE_WEIGHTS).reduce((acc, key) => {
    const weight = SCORE_WEIGHTS[key];
    const value = componentScores[key];
    return acc + (Number.isFinite(value) ? value * weight : 0);
  }, 0);
  const confidenceScore = round(clamp01(weighted) * 100, 1);

  const confidenceLevel = confidenceScore >= thresholds.high_confidence_score
    ? 'high'
    : confidenceScore >= thresholds.medium_confidence_score
      ? 'medium'
      : 'low';

  const blockers = buildBlockers(metrics, thresholds);

  return {
    confidence_score: confidenceScore,
    confidence_level: confidenceLevel,
    blockers,
    diagnostics: {
      thresholds,
      normalized_inputs: metrics,
      component_scores: componentScores,
      score_weights: SCORE_WEIGHTS,
      confidence_breakdown: {
        luma: lumaMix,
        zoom: zoomMix,
      },
      blocker_count: blockers.length,
    },
  };
}

export {
  DEFAULT_LEADS_CONFIDENCE_THRESHOLDS,
  MATCH_CONFIDENCE_WEIGHTS,
  SCORE_WEIGHTS,
};
