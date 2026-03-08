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

function buildImpactSampleProfile(metrics) {
  const weeklyEnough = (
    Number(metrics.weekly.current.leads || 0) >= 20
    && Number(metrics.weekly.previous.leads || 0) >= 20
    && Number(metrics.weekly.current.qualified || 0) >= 5
    && Number(metrics.weekly.previous.qualified || 0) >= 5
  );
  const monthlyEnough = (
    Number(metrics.monthly.current.leads || 0) >= 40
    && Number(metrics.monthly.previous.leads || 0) >= 40
    && Number(metrics.monthly.current.qualified || 0) >= 12
    && Number(metrics.monthly.previous.qualified || 0) >= 12
  );
  return {
    weeklyEnough,
    monthlyEnough,
    anyEnough: weeklyEnough || monthlyEnough,
  };
}

function metricProjectionEntry(metricKey, rawValue, basis, sampleProfile) {
  const confidence = sampleProfile.weeklyEnough && sampleProfile.monthlyEnough
    ? 'HIGH'
    : (sampleProfile.anyEnough ? 'MEDIUM' : 'LOW_SAMPLE');
  return {
    key: metricKey,
    value: sampleProfile.anyEnough ? rawValue : 'insufficient sample',
    basis: sampleProfile.anyEnough ? basis : `${basis} (insufficient sample)`,
    confidence,
  };
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
  const sampleProfile = buildImpactSampleProfile(metrics);

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
    basisPrefix,
  }) => {
    const cplEntry = metricProjectionEntry(
      'cpl_pct',
      -clamp(baseCplGain * cplScale, 0.01, 0.25),
      `${basisPrefix}; based on CPL trend regression and current non-qualified gap (${fmtPct(nonQualifiedRate)}).`,
      sampleProfile,
    );
    const cpqlEntry = metricProjectionEntry(
      'cpql_pct',
      -clamp(baseCpqlGain * cpqlScale, 0.02, 0.35),
      `${basisPrefix}; based on CPQL trend regression and qualification gap pressure.`,
      sampleProfile,
    );
    const qualifiedEntry = metricProjectionEntry(
      'qualified_rate_pp',
      clamp(baseQualifiedGainPp * qualificationScale, 0.5, 10),
      `${basisPrefix}; based on historical sensitivity between message tightness and qualified conversion.`,
      sampleProfile,
    );
    const nonQualifiedEntry = metricProjectionEntry(
      'non_qualified_rate_pp',
      -clamp(baseQualifiedGainPp * qualificationScale, 0.5, 10),
      `${basisPrefix}; inverse of qualified-rate projection.`,
      sampleProfile,
    );

    return {
      title,
      summary,
      priority,
      projected_impact: {
        cpl_pct: cplEntry.value,
        cpql_pct: cpqlEntry.value,
        qualified_rate_pp: qualifiedEntry.value,
        non_qualified_rate_pp: nonQualifiedEntry.value,
        impact_basis: {
          cpl_pct: cplEntry.basis,
          cpql_pct: cpqlEntry.basis,
          qualified_rate_pp: qualifiedEntry.basis,
          non_qualified_rate_pp: nonQualifiedEntry.basis,
        },
        confidence: {
          cpl_pct: cplEntry.confidence,
          cpql_pct: cpqlEntry.confidence,
          qualified_rate_pp: qualifiedEntry.confidence,
          non_qualified_rate_pp: nonQualifiedEntry.confidence,
        },
      },
    };
  };

  return [
    actionTemplate({
      title: 'Shift budget to higher-quality ad cohorts',
      summary: 'Reallocate spend from low-fit ad sets toward campaigns already generating qualified leads.',
      priority: (nonQualifiedRate > 0.55 || cpqlRegression > 0.08) ? 'High' : 'Medium',
      cplScale: 1.0,
      cpqlScale: 1.0,
      qualificationScale: 1.0,
      basisPrefix: 'Budget-mix reallocation model',
    }),
    actionTemplate({
      title: 'Tighten qualification messaging in ads and forms',
      summary: 'Deploy creative and form-copy variants that pre-qualify for revenue and sobriety fit.',
      priority: nonQualifiedRate > 0.5 ? 'High' : 'Medium',
      cplScale: 0.7,
      cpqlScale: 0.9,
      qualificationScale: 1.1,
      basisPrefix: 'Qualification copy sensitivity model',
    }),
    actionTemplate({
      title: 'Automate high-fit no-show reactivation',
      summary: 'Trigger follow-up sequences for qualified leads that did not show up within 24 hours.',
      priority: 'Medium',
      cplScale: 0.25,
      cpqlScale: 0.65,
      qualificationScale: 0.7,
      basisPrefix: 'Post-registration recovery model',
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
    autonomous_actions: buildAutonomousActions(metrics),
    human_required_actions: buildHumanRequiredActions(metrics, qualificationCurrent?.qualityCounts),
    organic_referral_insights: buildOrganicReferralQualityInsights(groupedData),
  };
}

