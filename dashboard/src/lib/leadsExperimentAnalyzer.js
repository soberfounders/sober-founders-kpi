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

function buildGroupRows(adRows, keyBuilder, minLeadsThreshold) {
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

  const rows = Array.from(grouped.values()).map((row) => {
    const leadBase = row.attributed_leads > 0 ? row.attributed_leads : row.leads;
    const cpl = safeDivide(row.spend, row.leads);
    const cpql = safeDivide(row.spend, row.qualified_leads);
    const cpgl = safeDivide(row.spend, row.great_leads);
    return {
      ...row,
      lead_base: leadBase,
      cpl,
      cpql,
      cpgl,
      qualified_rate: safeDivide(row.qualified_leads, leadBase),
      great_rate: safeDivide(row.great_leads, leadBase),
      sample_ok: leadBase >= minLeadsThreshold,
      confidence: leadBase >= minLeadsThreshold ? 'HIGH' : 'LOW_SAMPLE',
    };
  });

  const medians = {
    cpl: median(rows.map((row) => row.cpl)),
    cpql: median(rows.map((row) => row.cpql)),
    cpgl: median(rows.map((row) => row.cpgl)),
    qualified_rate: median(rows.map((row) => row.qualified_rate)),
    great_rate: median(rows.map((row) => row.great_rate)),
  };

  return rows.map((row) => {
    const lowCpl = medians.cpl !== null && row.cpl !== null && row.cpl <= (medians.cpl * 1.05);
    const weakQualified = medians.qualified_rate !== null && row.qualified_rate !== null
      && row.qualified_rate <= (medians.qualified_rate * 0.75);
    const weakGreat = medians.great_rate !== null && row.great_rate !== null
      && row.great_rate <= (medians.great_rate * 0.7);
    const lowCplWeakQualityTrap = lowCpl && weakQualified && weakGreat;

    const strongQuality = (
      (medians.qualified_rate !== null && row.qualified_rate !== null && row.qualified_rate >= medians.qualified_rate)
      && (medians.great_rate === null || row.great_rate === null || row.great_rate >= (medians.great_rate * 0.9))
    );
    const efficientQualityCost = (
      (medians.cpql !== null && row.cpql !== null && row.cpql <= medians.cpql)
      || (medians.cpgl !== null && row.cpgl !== null && row.cpgl <= medians.cpgl)
    );

    let decision = 'ITERATE';
    if (!row.sample_ok) {
      decision = 'ITERATE';
    } else if (lowCplWeakQualityTrap || (weakQualified && weakGreat)) {
      decision = 'KILL';
    } else if (strongQuality && efficientQualityCost) {
      decision = 'KEEP';
    }

    return {
      ...row,
      low_cpl_weak_quality_trap: lowCplWeakQualityTrap,
      decision,
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
  const trapRows = adsetRows.filter((row) => row.low_cpl_weak_quality_trap);

  if (keepRows.length > 0) {
    const row = keepRows[0];
    bullets.push(`Scale "${row.adset_name}" in "${row.campaign_name}" first; it is currently the strongest quality-cost profile (decision: KEEP).`);
  }
  if (killRows.length > 0) {
    const row = killRows[0];
    bullets.push(`Reduce or pause "${row.adset_name}" because it is converting low-quality leads versus peers (decision: KILL).`);
  }
  if (trapRows.length > 0) {
    bullets.push(`${trapRows.length} row(s) show the low-CPL but weak-quality trap; optimize for CPQL/CPGL and qualified/great rates, not CPL alone.`);
  }

  const campaignKeep = campaignRows.filter((row) => row.decision === 'KEEP').length;
  const campaignKill = campaignRows.filter((row) => row.decision === 'KILL').length;
  bullets.push(`Campaign-level mix currently suggests ${campaignKeep} KEEP / ${campaignKill} KILL decisions; prioritize budget reallocation before launching net-new tests.`);

  return bullets.slice(0, 4);
}

function buildOrganicReferralInsights(sourceRows) {
  const rows = Array.isArray(sourceRows) ? sourceRows : [];
  const findBucket = (name) => rows.find((row) => String(row?.bucket || '').toLowerCase() === name.toLowerCase()) || null;
  const organic = findBucket('Organic Search');
  const referral = findBucket('Referral');
  const paid = findBucket('Paid Social (Meta)');

  const showUpsTotal = rows.reduce((sum, row) => sum + Number(row?.showUpRows || 0), 0);
  const organicShare = safeDivide(Number(organic?.showUpRows || 0), showUpsTotal);
  const referralShare = safeDivide(Number(referral?.showUpRows || 0), showUpsTotal);
  const paidShare = safeDivide(Number(paid?.showUpRows || 0), showUpsTotal);

  const bullets = [];
  if (organic) {
    bullets.push(`Organic Search contributes ${Math.round((organicShare || 0) * 100)}% of show-up volume; expand pages and topics that already generate repeat/high-fit attendees.`);
  } else {
    bullets.push('Organic Search source rows are sparse; improve UTM/source hygiene and SEO landing-page tracking before scaling content experiments.');
  }
  if (referral) {
    bullets.push(`Referral contributes ${Math.round((referralShare || 0) * 100)}% of show-up volume; formalize partner/referral loops to increase qualified pipeline share.`);
  } else {
    bullets.push('Referral pipeline appears under-attributed; add explicit referral capture and partner tagging in forms and HubSpot fields.');
  }
  if (paid && paidShare !== null && (organicShare !== null || referralShare !== null)) {
    const nonPaidShare = Math.max(1 - paidShare, 0);
    bullets.push(`Non-paid sources are ${Math.round(nonPaidShare * 100)}% of current show-ups; protect this channel mix while paid optimization is in flight.`);
  }

  return bullets.slice(0, 4);
}

export function buildLeadsExperimentAnalyzer({
  adAttributionRows = [],
  sourceRows = [],
  minLeadsThreshold = 8,
}) {
  const campaignRows = buildGroupRows(
    adAttributionRows,
    (row) => `campaign:${String(row?.campaignName || 'Unknown Campaign')}`,
    minLeadsThreshold,
  );
  const adsetRows = buildGroupRows(
    adAttributionRows,
    (row) => `campaign:${String(row?.campaignName || 'Unknown Campaign')}|adset:${String(row?.adsetName || 'Unknown Ad Set')}`,
    minLeadsThreshold,
  );

  const paidRecommendations = buildPaidRecommendations(campaignRows, adsetRows);
  const organicReferralInsights = buildOrganicReferralInsights(sourceRows);

  return {
    generated_at: new Date().toISOString(),
    min_leads_threshold: minLeadsThreshold,
    campaign_rows: campaignRows,
    adset_rows: adsetRows,
    paid_recommendations: paidRecommendations,
    organic_referral_insights: organicReferralInsights,
  };
}

