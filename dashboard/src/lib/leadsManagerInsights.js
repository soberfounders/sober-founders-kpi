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

function buildAutonomousActions(metrics) {
  const nonQualifiedRate = pickNumber(metrics.weekly.current.nonQualifiedRate, metrics.monthly.current.nonQualifiedRate, 0.5);
  const cplRegression = Math.max(
    pickNumber(relativeDelta(metrics.weekly.current.cpl, metrics.weekly.previous.cpl), 0),
    0,
  );
  const cpqlRegression = Math.max(
    pickNumber(relativeDelta(metrics.weekly.current.cpql, metrics.weekly.previous.cpql), 0),
    0,
  );
  const qualificationGap = Math.max(nonQualifiedRate - 0.45, 0);

  const baseCplGain = clamp(0.03 + (cplRegression * 0.35) + (qualificationGap * 0.15), 0.02, 0.15);
  const baseCpqlGain = clamp(0.06 + (cpqlRegression * 0.45) + (qualificationGap * 0.2), 0.04, 0.25);
  const baseQualifiedGainPp = clamp(1.2 + (qualificationGap * 10) + (cpqlRegression * 4), 1.0, 8.0);

  const actionTemplate = ({
    title,
    summary,
    priority,
    cplScale,
    cpqlScale,
    qualificationScale,
  }) => ({
    title,
    summary,
    priority,
    projected_impact: {
      cpl_pct: -clamp(baseCplGain * cplScale, 0.01, 0.25),
      cpql_pct: -clamp(baseCpqlGain * cpqlScale, 0.02, 0.35),
      qualified_rate_pp: clamp(baseQualifiedGainPp * qualificationScale, 0.5, 10),
      non_qualified_rate_pp: -clamp(baseQualifiedGainPp * qualificationScale, 0.5, 10),
    },
  });

  return [
    actionTemplate({
      title: 'Shift budget to higher-quality ad cohorts',
      summary: 'Reallocate spend from low-fit ad sets toward campaigns already generating qualified leads.',
      priority: (nonQualifiedRate > 0.55 || cpqlRegression > 0.08) ? 'High' : 'Medium',
      cplScale: 1.0,
      cpqlScale: 1.0,
      qualificationScale: 1.0,
    }),
    actionTemplate({
      title: 'Tighten qualification messaging in ads and forms',
      summary: 'Deploy creative and form-copy variants that pre-qualify for revenue and sobriety fit.',
      priority: nonQualifiedRate > 0.5 ? 'High' : 'Medium',
      cplScale: 0.7,
      cpqlScale: 0.9,
      qualificationScale: 1.1,
    }),
    actionTemplate({
      title: 'Automate high-fit no-show reactivation',
      summary: 'Trigger follow-up sequences for qualified leads that did not show up within 24 hours.',
      priority: 'Medium',
      cplScale: 0.25,
      cpqlScale: 0.65,
      qualificationScale: 0.7,
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
    autonomous_actions: buildAutonomousActions(metrics),
    human_required_actions: buildHumanRequiredActions(metrics, qualificationCurrent?.qualityCounts),
  };
}
