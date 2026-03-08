function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickNumber(...values) {
  for (const value of values) {
    const parsed = toNumberOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function safeDivide(numerator, denominator) {
  const n = toNumberOrNull(numerator);
  const d = toNumberOrNull(denominator);
  if (n === null || d === null || d === 0) return null;
  return n / d;
}

function relativeDelta(currentValue, previousValue) {
  const current = toNumberOrNull(currentValue);
  const previous = toNumberOrNull(previousValue);
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mean(values) {
  const nums = (values || []).map((value) => toNumberOrNull(value)).filter((value) => value !== null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function standardDeviation(values) {
  const nums = (values || []).map((value) => toNumberOrNull(value)).filter((value) => value !== null);
  if (nums.length === 0) return null;
  const avg = mean(nums);
  if (avg === null) return null;
  const variance = nums.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / nums.length;
  return Math.sqrt(variance);
}

function percentile(values, p) {
  const nums = (values || [])
    .map((value) => toNumberOrNull(value))
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  if (nums.length === 1) return nums[0];
  const rank = (p / 100) * (nums.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return nums[lower];
  const weight = rank - lower;
  return nums[lower] + ((nums[upper] - nums[lower]) * weight);
}

function fmtPct(value, digits = 1) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return 'N/A';
  return `${(parsed * 100).toFixed(digits)}%`;
}

function fmtSignedPct(value, digits = 1) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return 'N/A';
  const sign = parsed >= 0 ? '+' : '';
  return `${sign}${(parsed * 100).toFixed(digits)}%`;
}

function fmtSignedPp(value, digits = 1) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return 'N/A';
  const sign = parsed >= 0 ? '+' : '';
  return `${sign}${parsed.toFixed(digits)} pp`;
}

function parseSobrietyDate(value) {
  const text = String(value || '').trim();
  if (!text || text.toLowerCase() === 'not found') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00.000Z`);
  const mmddyyyy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const mm = String(mmddyyyy[1]).padStart(2, '0');
    const dd = String(mmddyyyy[2]).padStart(2, '0');
    const yyyy = String(mmddyyyy[3]).padStart(4, '0');
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasOneYearSobriety(sobrietyDateValue, referenceDate = new Date()) {
  const sobrietyDate = parseSobrietyDate(sobrietyDateValue);
  if (!sobrietyDate) return false;
  const reference = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
  const anniversary = new Date(Date.UTC(
    sobrietyDate.getUTCFullYear() + 1,
    sobrietyDate.getUTCMonth(),
    sobrietyDate.getUTCDate(),
  ));
  return anniversary.getTime() <= reference.getTime();
}

function extractMetrics({
  analytics,
  groupedData,
  qualificationCurrent,
  qualificationPrevious,
}) {
  const currentCombined = groupedData?.current?.free?.combined || null;
  const previousCombined = groupedData?.previous?.free?.combined || null;

  const weekCurrent = analytics?.weekCurrent || null;
  const weekPrevious = analytics?.weekPrevious || null;
  const monthCurrent = analytics?.current || null;
  const monthPrevious = analytics?.previous || null;

  const currentLeadsFallback = pickNumber(
    currentCombined?.metaLeads,
    currentCombined?.categorization?.total,
    currentCombined?.categorization?.categorizedTotal,
    0,
  );
  const previousLeadsFallback = pickNumber(
    previousCombined?.metaLeads,
    previousCombined?.categorization?.total,
    previousCombined?.categorization?.categorizedTotal,
    0,
  );
  const currentQualifiedFallback = pickNumber(
    qualificationCurrent?.qualified,
    currentCombined?.categorization?.qualified_count,
    0,
  );
  const previousQualifiedFallback = pickNumber(
    qualificationPrevious?.qualified,
    previousCombined?.categorization?.qualified_count,
    0,
  );

  const metricBlock = (snapshot, leadFallback, qualifiedFallback, spendFallback) => {
    const leads = pickNumber(snapshot?.leads, leadFallback, 0);
    const qualified = pickNumber(snapshot?.qualifiedLeads, qualifiedFallback, 0);
    const nonQualified = Math.max(leads - qualified, 0);
    const spend = pickNumber(snapshot?.spend, spendFallback, 0);
    const cpl = pickNumber(snapshot?.costs?.cpl, safeDivide(spend, leads));
    const cpql = pickNumber(snapshot?.costs?.cpql, safeDivide(spend, qualified));
    return {
      leads,
      qualified,
      nonQualified,
      spend,
      cpl,
      cpql,
      qualifiedRate: safeDivide(qualified, leads),
      nonQualifiedRate: safeDivide(nonQualified, leads),
    };
  };

  const weekly = {
    current: metricBlock(weekCurrent, currentLeadsFallback, currentQualifiedFallback, currentCombined?.spend),
    previous: metricBlock(weekPrevious, previousLeadsFallback, previousQualifiedFallback, previousCombined?.spend),
  };

  const monthly = {
    current: metricBlock(monthCurrent, currentLeadsFallback, currentQualifiedFallback, currentCombined?.spend),
    previous: metricBlock(monthPrevious, previousLeadsFallback, previousQualifiedFallback, previousCombined?.spend),
  };

  return { weekly, monthly };
}

function buildTrendInsights(metrics) {
  const weeklyQualifiedRateDeltaPp = (
    toNumberOrNull(metrics.weekly.current.qualifiedRate) !== null
      && toNumberOrNull(metrics.weekly.previous.qualifiedRate) !== null
  )
    ? (metrics.weekly.current.qualifiedRate - metrics.weekly.previous.qualifiedRate) * 100
    : null;
  const monthlyQualifiedRateDeltaPp = (
    toNumberOrNull(metrics.monthly.current.qualifiedRate) !== null
      && toNumberOrNull(metrics.monthly.previous.qualifiedRate) !== null
  )
    ? (metrics.monthly.current.qualifiedRate - metrics.monthly.previous.qualifiedRate) * 100
    : null;

  const weeklyCplDelta = relativeDelta(metrics.weekly.current.cpl, metrics.weekly.previous.cpl);
  const monthlyCplDelta = relativeDelta(metrics.monthly.current.cpl, metrics.monthly.previous.cpl);
  const weeklyCpqlDelta = relativeDelta(metrics.weekly.current.cpql, metrics.weekly.previous.cpql);
  const monthlyCpqlDelta = relativeDelta(metrics.monthly.current.cpql, metrics.monthly.previous.cpql);

  const trendInsights = [];
  trendInsights.push(
    `WoW qualified rate: ${fmtPct(metrics.weekly.current.qualifiedRate)} (${fmtSignedPp(weeklyQualifiedRateDeltaPp)}).`,
  );
  trendInsights.push(
    `MoM qualified rate: ${fmtPct(metrics.monthly.current.qualifiedRate)} (${fmtSignedPp(monthlyQualifiedRateDeltaPp)}).`,
  );
  trendInsights.push(
    `WoW CPL: ${fmtSignedPct(weeklyCplDelta)} | MoM CPL: ${fmtSignedPct(monthlyCplDelta)}.`,
  );
  trendInsights.push(
    `WoW CPQL: ${fmtSignedPct(weeklyCpqlDelta)} | MoM CPQL: ${fmtSignedPct(monthlyCpqlDelta)}.`,
  );

  return trendInsights;
}

function buildHistoricalMetricSeries(analytics) {
  const rows = Array.isArray(analytics?.showUpTracker?.rows) ? analytics.showUpTracker.rows : [];
  const series = {
    cpl_pct: [],
    cpql_pct: [],
    qualified_rate_pp: [],
    non_qualified_rate_pp: [],
  };

  rows.forEach((row) => {
    const spend = toNumberOrNull(row?.spend);
    const leads = toNumberOrNull(row?.leads);
    const qualifiedLeads = toNumberOrNull(row?.qualifiedLeads);

    if (spend !== null && leads !== null && leads > 0) {
      const cpl = spend / leads;
      series.cpl_pct.push(cpl);

      const qualifiedRate = safeDivide(qualifiedLeads, leads);
      if (qualifiedRate !== null) {
        series.qualified_rate_pp.push(qualifiedRate);
        series.non_qualified_rate_pp.push(1 - qualifiedRate);
      }
    }

    if (spend !== null && qualifiedLeads !== null && qualifiedLeads > 0) {
      series.cpql_pct.push(spend / qualifiedLeads);
    }
  });

  return series;
}

function deriveConfidenceFromEvidence(sampleSize, volatility, volatilityMax) {
  const sampleScore = clamp(sampleSize / 30, 0, 1);
  const volatilityScore = volatility === null
    ? 0
    : clamp(1 - (volatility / volatilityMax), 0, 1);
  const confidenceScore = (sampleScore * 0.6) + (volatilityScore * 0.4);

  if (confidenceScore >= 0.75) return 'HIGH';
  if (confidenceScore >= 0.55) return 'MEDIUM';
  if (confidenceScore >= 0.35) return 'LOW';
  return 'VERY_LOW';
}

function buildEmpiricalImpact({
  baselineValue,
  historicalValues,
  betterDirection,
  targetPercentile,
  minSampleSize,
  volatilityType,
  volatilityMax,
  method,
}) {
  const sampleSize = (historicalValues || []).length;
  const targetValue = percentile(historicalValues, targetPercentile);
  const avg = mean(historicalValues);
  const stdDev = standardDeviation(historicalValues);
  const volatility = volatilityType === 'coefficient_of_variation'
    ? safeDivide(stdDev, Math.abs(avg || 0))
    : stdDev;
  const confidence = deriveConfidenceFromEvidence(sampleSize, volatility, volatilityMax);

  const insufficientEvidence = (
    baselineValue === null
    || targetValue === null
    || sampleSize < minSampleSize
    || volatility === null
    || volatility > volatilityMax
  );

  if (insufficientEvidence) {
    return {
      insufficient_evidence: true,
      impact_value: null,
      baseline_value: baselineValue,
      target_value: targetValue,
      method,
      sample_size: sampleSize,
      volatility,
      confidence,
    };
  }

  const impactValue = betterDirection === 'lower'
    ? relativeDelta(targetValue, baselineValue)
    : ((targetValue - baselineValue) * 100);

  return {
    insufficient_evidence: false,
    impact_value: impactValue,
    baseline_value: baselineValue,
    target_value: targetValue,
    method,
    sample_size: sampleSize,
    volatility,
    confidence,
  };
}

function buildActionProjectedImpact(metrics, analytics) {
  const historical = buildHistoricalMetricSeries(analytics);
  const baselines = {
    cpl_pct: pickNumber(metrics.weekly.current.cpl, metrics.monthly.current.cpl),
    cpql_pct: pickNumber(metrics.weekly.current.cpql, metrics.monthly.current.cpql),
    qualified_rate_pp: pickNumber(metrics.weekly.current.qualifiedRate, metrics.monthly.current.qualifiedRate),
    non_qualified_rate_pp: pickNumber(metrics.weekly.current.nonQualifiedRate, metrics.monthly.current.nonQualifiedRate),
  };

  return {
    cpl_pct: buildEmpiricalImpact({
      baselineValue: baselines.cpl_pct,
      historicalValues: historical.cpl_pct,
      betterDirection: 'lower',
      targetPercentile: 25,
      minSampleSize: 14,
      volatilityType: 'coefficient_of_variation',
      volatilityMax: 1.0,
      method: 'historical_percentile_target_gap_cost_p25_vs_current',
    }),
    cpql_pct: buildEmpiricalImpact({
      baselineValue: baselines.cpql_pct,
      historicalValues: historical.cpql_pct,
      betterDirection: 'lower',
      targetPercentile: 25,
      minSampleSize: 14,
      volatilityType: 'coefficient_of_variation',
      volatilityMax: 1.0,
      method: 'historical_percentile_target_gap_cost_p25_vs_current',
    }),
    qualified_rate_pp: buildEmpiricalImpact({
      baselineValue: baselines.qualified_rate_pp,
      historicalValues: historical.qualified_rate_pp,
      betterDirection: 'higher',
      targetPercentile: 75,
      minSampleSize: 14,
      volatilityType: 'standard_deviation',
      volatilityMax: 0.18,
      method: 'historical_percentile_target_gap_rate_p75_vs_current',
    }),
    non_qualified_rate_pp: buildEmpiricalImpact({
      baselineValue: baselines.non_qualified_rate_pp,
      historicalValues: historical.non_qualified_rate_pp,
      betterDirection: 'lower',
      targetPercentile: 25,
      minSampleSize: 14,
      volatilityType: 'standard_deviation',
      volatilityMax: 0.18,
      method: 'historical_percentile_target_gap_rate_p25_vs_current',
    }),
  };
}

function buildAutonomousActions(metrics, analytics) {
  const nonQualifiedRate = pickNumber(metrics.weekly.current.nonQualifiedRate, metrics.monthly.current.nonQualifiedRate, 0.5);
  const projectedImpact = buildActionProjectedImpact(metrics, analytics);

  const actionTemplate = ({ title, summary, priority }) => ({
    title,
    summary,
    priority,
    projected_impact: projectedImpact,
  });

  return [
    actionTemplate({
      title: 'Shift budget to higher-quality ad cohorts',
      summary: 'Reallocate spend from low-fit ad sets toward campaigns already generating qualified leads.',
      priority: nonQualifiedRate > 0.55 ? 'High' : 'Medium',
    }),
    actionTemplate({
      title: 'Tighten qualification messaging in ads and forms',
      summary: 'Deploy creative and form-copy variants that pre-qualify for revenue and sobriety fit.',
      priority: nonQualifiedRate > 0.5 ? 'High' : 'Medium',
    }),
    actionTemplate({
      title: 'Automate high-fit no-show reactivation',
      summary: 'Trigger follow-up sequences for qualified leads that did not show up within 24 hours.',
      priority: 'Medium',
    }),
  ].slice(0, 3);
}

function buildHumanRequiredActions(metrics, qualityCounts) {
  const nonQualifiedRate = pickNumber(metrics.weekly.current.nonQualifiedRate, metrics.monthly.current.nonQualifiedRate, 0);
  const good = pickNumber(qualityCounts?.good, 0);
  const great = pickNumber(qualityCounts?.great, 0);
  const qualified = pickNumber(metrics.weekly.current.qualified, metrics.monthly.current.qualified, 0);
  const sobrietyGap = Math.max((good + great) - qualified, 0);

  return [
    {
      task: 'Approve campaign budget reallocation plan',
      reason: 'Budget shifts across campaigns require human authorization in Ads Manager.',
      priority: (nonQualifiedRate > 0.55) ? 'High' : 'Medium',
    },
    {
      task: 'Complete HubSpot sobriety-date cleanup for revenue-eligible leads',
      reason: sobrietyGap > 0
        ? `At least ${Math.round(sobrietyGap)} revenue-eligible leads are blocked by sobriety data/rule status and need manual CRM verification.`
        : 'CRM field audits still require manual verification and owner confirmation.',
      priority: sobrietyGap > 0 ? 'High' : 'Medium',
    },
    {
      task: 'Run founder outreach for top qualified leads from this window',
      reason: 'White-glove follow-up and objection handling require human context and judgment.',
      priority: 'High',
    },
  ];
}

function classifySourceBucket(row) {
  const source = String(row?.originalTrafficSource || '').trim().toUpperCase();
  const hearAbout = String(row?.hearAboutCategory || '').trim().toLowerCase();
  if (source.includes('ORGANIC_SEARCH') || hearAbout === 'google') return 'organic';
  if (source.includes('REFERRAL') || hearAbout === 'referral') return 'referral';
  if (source.includes('PAID_SOCIAL') || hearAbout === 'meta') return 'paid';
  return 'other';
}

function buildOrganicReferralQualityInsights(groupedData) {
  const rows = groupedData?.current?.free?.combined?.lumaRows || [];
  const stats = {
    organic: { rows: 0, showUps: 0, qualified: 0, great: 0 },
    referral: { rows: 0, showUps: 0, qualified: 0, great: 0 },
    paid: { rows: 0, showUps: 0, qualified: 0, great: 0 },
  };

  rows.forEach((row) => {
    const bucket = classifySourceBucket(row);
    if (!stats[bucket]) return;
    const revenue = pickNumber(row?.revenueOfficial, row?.revenue);
    const great = revenue !== null && revenue >= 1_000_000;
    const qualified = revenue !== null && revenue >= 250_000 && hasOneYearSobriety(row?.sobrietyDate);
    stats[bucket].rows += 1;
    if (row?.matchedZoom) stats[bucket].showUps += 1;
    if (great) stats[bucket].great += 1;
    if (qualified) stats[bucket].qualified += 1;
  });

  const organic = stats.organic;
  const referral = stats.referral;
  const paid = stats.paid;
  const totalRows = rows.length;

  const makeQualityLine = (label, s) => {
    if (s.rows < 5) return `${label}: insufficient sample (${s.rows} rows) to trust Qualified%/Great% projections.`;
    const qualifiedRate = safeDivide(s.qualified, s.rows);
    const greatRate = safeDivide(s.great, s.rows);
    const share = safeDivide(s.rows, totalRows);
    return `${label}: ${s.rows} rows (${fmtPct(share)} share), Qualified ${fmtPct(qualifiedRate)}, Great ${fmtPct(greatRate)}.`;
  };

  const bullets = [
    makeQualityLine('Organic Search', organic),
    makeQualityLine('Referral', referral),
  ];

  if (paid.rows >= 5) {
    const paidQualifiedRate = safeDivide(paid.qualified, paid.rows);
    const paidGreatRate = safeDivide(paid.great, paid.rows);
    if (organic.rows >= 5) {
      const organicQualifiedRate = safeDivide(organic.qualified, organic.rows);
      if (organicQualifiedRate !== null && paidQualifiedRate !== null && organicQualifiedRate < paidQualifiedRate) {
        bullets.push(`Organic Qualified% trails paid by ${fmtSignedPp((organicQualifiedRate - paidQualifiedRate) * 100)}; tighten organic ICP messaging and conversion path.`);
      }
    }
    if (referral.rows >= 5) {
      const referralGreatRate = safeDivide(referral.great, referral.rows);
      if (referralGreatRate !== null && paidGreatRate !== null && referralGreatRate > paidGreatRate) {
        bullets.push(`Referral Great% exceeds paid by ${fmtSignedPp((referralGreatRate - paidGreatRate) * 100)}; expand partner-led qualified introductions.`);
      }
    }
  }

  return bullets.slice(0, 4);
}

export function buildLeadsManagerInsights({
  analytics,
  groupedData,
  dateWindows,
  qualificationCurrent,
  qualificationPrevious,
}) {
  const metrics = extractMetrics({
    analytics,
    groupedData,
    qualificationCurrent,
    qualificationPrevious,
  });

  return {
    generated_at: new Date().toISOString(),
    date_context: {
      current_window: dateWindows?.current || null,
      previous_window: dateWindows?.previous || null,
    },
    trend_insights: buildTrendInsights(metrics),
    autonomous_actions: buildAutonomousActions(metrics, analytics),
    human_required_actions: buildHumanRequiredActions(metrics, qualificationCurrent?.qualityCounts),
    organic_referral_insights: buildOrganicReferralQualityInsights(groupedData),
  };
}
