import {
  DEFAULT_LEADS_EXPERIMENT_RUBRIC,
  LEADS_EXPERIMENT_RUBRIC_VERSION,
  resolveLeadsExperimentRubric,
} from './leadsExperimentRubric.js';

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeDivide(numerator, denominator) {
  const n = toNumberOrNull(numerator);
  const d = toNumberOrNull(denominator);
  if (n === null || d === null || d === 0) return null;
  return n / d;
}

function median(values) {
  const nums = (values || [])
    .map((value) => toNumberOrNull(value))
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? ((nums[mid - 1] + nums[mid]) / 2) : nums[mid];
}

function confidenceFromSample(leadBase, minLeadsThreshold) {
  if (leadBase < minLeadsThreshold) return 'LOW_SAMPLE';
  if (leadBase >= Math.max(minLeadsThreshold * 2, 24)) return 'HIGH';
  if (leadBase >= Math.max(Math.round(minLeadsThreshold * 1.5), 14)) return 'MEDIUM';
  return 'LOW';
}

function efficiencyBand(value, goodThreshold, poorThreshold) {
  const n = toNumberOrNull(value);
  if (n === null) return 'UNKNOWN';
  if (n <= goodThreshold) return 'GOOD';
  if (n >= poorThreshold) return 'POOR';
  return 'MID';
}

function buildGroupRows(adRows, keyBuilder, minLeadsThreshold, rubric) {
  const grouped = new Map();
  (adRows || []).forEach((row) => {
    const key = keyBuilder(row);
    if (!key) return;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        campaign_name: String(row?.campaignName || 'Unknown Campaign'),
        adset_name: String(row?.adsetName || 'Unknown Ad Set'),
        spend: 0,
        leads: 0,
        attributed_leads: 0,
        qualified_leads: 0,
        great_leads: 0,
      });
    }
    const target = grouped.get(key);
    target.spend += Number(row?.spend || 0);
    target.leads += Number(row?.metaLeads || 0);
    target.attributed_leads += Number(row?.attributedLeads || 0);
    target.qualified_leads += Number(row?.attributedQualifiedLeads || 0);
    target.great_leads += Number(row?.attributedGreatLeads || 0);
  });

  const baseRows = Array.from(grouped.values()).map((row) => {
    const leadBase = row.attributed_leads > 0 ? row.attributed_leads : row.leads;
    const cpl = safeDivide(row.spend, row.leads);
    const cpql = safeDivide(row.spend, row.qualified_leads);
    const cpgl = safeDivide(row.spend, row.great_leads);
    const qualifiedRate = safeDivide(row.qualified_leads, leadBase);
    const greatRate = safeDivide(row.great_leads, leadBase);
    return {
      ...row,
      lead_base: leadBase,
      cpl,
      cpql,
      cpgl,
      qualified_rate: qualifiedRate,
      great_rate: greatRate,
      sample_ok: leadBase >= minLeadsThreshold,
    };
  });

  const medians = {
    cpl: median(baseRows.map((row) => row.cpl)),
    cpql: median(baseRows.map((row) => row.cpql)),
    cpgl: median(baseRows.map((row) => row.cpgl)),
    qualified_rate: median(baseRows.map((row) => row.qualified_rate)),
    great_rate: median(baseRows.map((row) => row.great_rate)),
  };

  return baseRows.map((row) => {
    const confidence = confidenceFromSample(row.lead_base, minLeadsThreshold);
    if (row.lead_base < minLeadsThreshold) {
      return {
        ...row,
        confidence,
        decision: 'HOLD_LOW_SAMPLE',
        decision_reason: `Only ${Math.round(row.lead_base)} leads in sample; hold until at least ${minLeadsThreshold}.`,
        low_cpl_weak_quality_trap: false,
      };
    }

    const cpqlBand = efficiencyBand(row.cpql, rubric.efficiency.cpqlGood, rubric.efficiency.cpqlPoor);
    const cpglBand = efficiencyBand(row.cpgl, rubric.efficiency.cpglGood, rubric.efficiency.cpglPoor);

    const meetsQualityFloors = (
      toNumberOrNull(row.qualified_rate) !== null
      && toNumberOrNull(row.great_rate) !== null
      && row.qualified_rate >= rubric.quality.qualifiedKeepFloor
      && row.great_rate >= rubric.quality.greatKeepFloor
    );
    const failsQualityFloors = (
      (toNumberOrNull(row.qualified_rate) !== null && row.qualified_rate <= rubric.quality.qualifiedKillFloor)
      || (toNumberOrNull(row.great_rate) !== null && row.great_rate <= rubric.quality.greatKillFloor)
    );

    const relativeOutperforming = (
      (medians.qualified_rate !== null && row.qualified_rate !== null && row.qualified_rate >= medians.qualified_rate * 1.1)
      || (medians.great_rate !== null && row.great_rate !== null && row.great_rate >= medians.great_rate * 1.1)
      || (medians.cpql !== null && row.cpql !== null && row.cpql <= medians.cpql * 0.9)
      || (medians.cpgl !== null && row.cpgl !== null && row.cpgl <= medians.cpgl * 0.9)
    );
    const relativeUnderperforming = (
      (medians.qualified_rate !== null && row.qualified_rate !== null && row.qualified_rate <= medians.qualified_rate * 0.85)
      && (medians.great_rate !== null && row.great_rate !== null && row.great_rate <= medians.great_rate * 0.85)
    );

    const lowCpl = medians.cpl !== null && row.cpl !== null && row.cpl <= medians.cpl * 0.95;
    const lowCplWeakQualityTrap = lowCpl && failsQualityFloors;

    let decision = 'ITERATE';
    if (lowCplWeakQualityTrap) {
      decision = 'KILL';
    } else if (failsQualityFloors && (cpqlBand === 'POOR' || cpglBand === 'POOR' || relativeUnderperforming)) {
      decision = 'KILL';
    } else if (meetsQualityFloors && (cpqlBand === 'GOOD' || cpglBand === 'GOOD') && !relativeUnderperforming) {
      decision = 'KEEP';
    } else if (relativeOutperforming && (cpqlBand !== 'POOR' && cpglBand !== 'POOR')) {
      decision = 'KEEP';
    }

    const reasonParts = [];
    reasonParts.push(`Qualified ${(row.qualified_rate * 100).toFixed(1)}% (floor ${(rubric.quality.qualifiedKeepFloor * 100).toFixed(0)}%), Great ${(row.great_rate * 100).toFixed(1)}% (floor ${(rubric.quality.greatKeepFloor * 100).toFixed(0)}%).`);
    reasonParts.push(`Efficiency bands: CPQL ${cpqlBand}${row.cpql !== null ? ` (${Math.round(row.cpql)})` : ''}, CPGL ${cpglBand}${row.cpgl !== null ? ` (${Math.round(row.cpgl)})` : ''}.`);
    if (relativeOutperforming) reasonParts.push('Relative comparison: outperforming peer median.');
    if (relativeUnderperforming) reasonParts.push('Relative comparison: below peer median.');
    if (lowCplWeakQualityTrap) reasonParts.push('Low-CPL but weak-quality trap detected.');

    return {
      ...row,
      confidence,
      efficiency_band: {
        cpql: cpqlBand,
        cpgl: cpglBand,
      },
      relative_comparison: relativeOutperforming
        ? 'OUTPERFORM'
        : (relativeUnderperforming ? 'UNDERPERFORM' : 'NEUTRAL'),
      low_cpl_weak_quality_trap: lowCplWeakQualityTrap,
      decision,
      decision_reason: reasonParts.join(' '),
    };
  });
}

function buildPaidRecommendations(campaignRows, adsetRows) {
  const bullets = [];
  const keepRows = adsetRows.filter((row) => row.decision === 'KEEP').sort((a, b) => (
    (Number(b.qualified_rate || 0) - Number(a.qualified_rate || 0))
    || (Number(a.cpql || Number.POSITIVE_INFINITY) - Number(b.cpql || Number.POSITIVE_INFINITY))
  ));
  const killRows = adsetRows.filter((row) => row.decision === 'KILL').sort((a, b) => (
    (Number(a.qualified_rate || Number.POSITIVE_INFINITY) - Number(b.qualified_rate || Number.POSITIVE_INFINITY))
    || (Number(a.great_rate || Number.POSITIVE_INFINITY) - Number(b.great_rate || Number.POSITIVE_INFINITY))
  ));
  const holdRows = adsetRows.filter((row) => row.decision === 'HOLD_LOW_SAMPLE');
  const trapRows = adsetRows.filter((row) => row.low_cpl_weak_quality_trap);

  if (keepRows.length > 0) {
    const row = keepRows[0];
    bullets.push(`Scale "${row.adset_name}" in "${row.campaign_name}" first; it currently clears quality floors with efficient CPQL/CPGL.`);
  }
  if (killRows.length > 0) {
    const row = killRows[0];
    bullets.push(`Reduce or pause "${row.adset_name}" due to weak quality and poor efficiency banding versus rubric floors.`);
  }
  if (trapRows.length > 0) {
    bullets.push(`${trapRows.length} row(s) are low-CPL but weak-quality traps; treat quality rates as the primary decision metric.`);
  }
  if (holdRows.length > 0) {
    bullets.push(`${holdRows.length} row(s) are HOLD_LOW_SAMPLE; collect more leads before irreversible keep/kill decisions.`);
  }

  const campaignKeep = campaignRows.filter((row) => row.decision === 'KEEP').length;
  const campaignKill = campaignRows.filter((row) => row.decision === 'KILL').length;
  bullets.push(`Campaign-level decisions: ${campaignKeep} KEEP / ${campaignKill} KILL with rubric + sample gating.`);

  return bullets.slice(0, 5);
}

function buildOrganicReferralInsights(sourceRows) {
  const rows = Array.isArray(sourceRows) ? sourceRows : [];
  const findBucket = (name) => rows.find((row) => String(row?.bucket || '').toLowerCase() === name.toLowerCase()) || null;
  const organic = findBucket('Organic Search');
  const referral = findBucket('Referral');
  const paid = findBucket('Paid Social (Meta)');

  const qualitySnapshot = (row) => {
    if (!row) return null;
    const showUps = Number(row?.showUpRows || 0);
    const repeatMembers = Number(row?.repeatMembers || 0);
    const goodRepeatMembers = Number(row?.goodRepeatMembers || 0);
    const qualifiedRate = safeDivide(repeatMembers, showUps);
    const greatRate = safeDivide(goodRepeatMembers, showUps);
    const weightedQualityScore = (
      ((qualifiedRate || 0) * 100 * 0.65)
      + ((greatRate || 0) * 100 * 0.35)
    );

    return {
      showUps,
      repeatMembers,
      goodRepeatMembers,
      qualifiedRate,
      greatRate,
      weightedQualityScore,
    };
  };

  const formatSnapshot = (label, snapshot) => {
    if (!snapshot || snapshot.showUps < 5) {
      return `${label}: insufficient sample (${snapshot?.showUps || 0} show-ups) for quality-economics scoring.`;
    }
    return `${label}: Repeat ${(snapshot.qualifiedRate * 100).toFixed(1)}%, Good-repeat ${(snapshot.greatRate * 100).toFixed(1)}%, weighted quality score ${snapshot.weightedQualityScore.toFixed(1)}.`;
  };

  const paidMetrics = qualitySnapshot(paid);
  const organicMetrics = qualitySnapshot(organic);
  const referralMetrics = qualitySnapshot(referral);

  const bullets = [];
  if (organicMetrics) {
    bullets.push(formatSnapshot('Organic Search', organicMetrics));
  } else {
    bullets.push('Organic Search source rows are sparse; improve UTM/source hygiene and SEO landing-page tracking before scaling content experiments.');
  }
  if (referralMetrics) {
    bullets.push(formatSnapshot('Referral', referralMetrics));
  } else {
    bullets.push('Referral pipeline appears under-attributed; add explicit referral capture and partner tagging in forms and HubSpot fields.');
  }

  if (paidMetrics && paidMetrics.showUps >= 5) {
    if (organicMetrics && organicMetrics.showUps >= 5) {
      const qualityDelta = organicMetrics.weightedQualityScore - paidMetrics.weightedQualityScore;
      bullets.push(
        qualityDelta >= 0
          ? `Organic quality score is +${qualityDelta.toFixed(1)} vs paid; prioritize conversion-path and capture improvements to preserve this edge while scaling.`
          : `Organic quality score is ${qualityDelta.toFixed(1)} vs paid; tighten SEO landing ICP intent and form filtering before traffic expansion.`,
      );
    }

    if (referralMetrics && referralMetrics.showUps >= 5) {
      const qualityDelta = referralMetrics.weightedQualityScore - paidMetrics.weightedQualityScore;
      bullets.push(
        qualityDelta >= 0
          ? `Referral quality score is +${qualityDelta.toFixed(1)} vs paid; expand partner loops and referral ask playbooks.`
          : `Referral quality score is ${qualityDelta.toFixed(1)} vs paid; tighten partner qualification criteria before adding volume.`,
      );
    }
  } else {
    bullets.push('Paid baseline sample is limited; hold channel reallocations until Paid Social has at least 5 attributed show-ups in-window.');
  }

  return bullets.slice(0, 4);
}

export function buildLeadsExperimentAnalyzer({
  adAttributionRows = [],
  sourceRows = [],
  minLeadsThreshold = 8,
  rubricOverride = null,
}) {
  const rubric = resolveLeadsExperimentRubric(rubricOverride || DEFAULT_LEADS_EXPERIMENT_RUBRIC);

  const campaignRows = buildGroupRows(
    adAttributionRows,
    (row) => `campaign:${String(row?.campaignName || 'Unknown Campaign')}`,
    minLeadsThreshold,
    rubric,
  );
  const adsetRows = buildGroupRows(
    adAttributionRows,
    (row) => `campaign:${String(row?.campaignName || 'Unknown Campaign')}|adset:${String(row?.adsetName || 'Unknown Ad Set')}`,
    minLeadsThreshold,
    rubric,
  );

  const paidRecommendations = buildPaidRecommendations(campaignRows, adsetRows);
  const organicReferralInsights = buildOrganicReferralInsights(sourceRows);

  return {
    generated_at: new Date().toISOString(),
    min_leads_threshold: minLeadsThreshold,
    rubric,
    rubric_version: LEADS_EXPERIMENT_RUBRIC_VERSION,
    campaign_rows: campaignRows,
    adset_rows: adsetRows,
    paid_recommendations: paidRecommendations,
    organic_referral_insights: organicReferralInsights,
  };
}
