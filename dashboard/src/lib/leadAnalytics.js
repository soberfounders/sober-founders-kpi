import { buildAliasMap, resolveCanonicalAttendeeName } from './attendeeCanonicalization';

const TUESDAY_MEETING_ID = '87199667045';
const THURSDAY_MEETING_ID = '84242212480';
const LOOKBACK_DAYS_DEFAULT = 120;
const MONTH_DAYS = 30;
const WEEK_DAYS = 7;
const LEAD_TO_SHOWUP_MATCH_WINDOW_DAYS = 30;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function parseDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toUtcDate(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function addDays(dateKey, days) {
  const date = toUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateInRange(dateKey, startKey, endKey) {
  return !!dateKey && dateKey >= startKey && dateKey <= endKey;
}

function normalizeName(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/['’]s\s*(iphone|ipad|android|galaxy|phone|pc|macbook)$/gi, '')
    .replace(/\((iphone|ipad|android|galaxy|phone)\)$/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dayTypeFromZoomMetric(row) {
  const metadata = row?.metadata || {};
  const group = String(metadata.group_name || '').toLowerCase();
  if (group === 'tuesday' || group === 'thursday') {
    return group[0].toUpperCase() + group.slice(1);
  }

  const meetingId = String(metadata.meeting_id || '');
  if (meetingId === TUESDAY_MEETING_ID) return 'Tuesday';
  if (meetingId === THURSDAY_MEETING_ID) return 'Thursday';

  const dateKey = parseDateKey(metadata.start_time || row.metric_date);
  if (!dateKey) return 'Other';
  const day = toUtcDate(dateKey).getUTCDay();
  if (day === 2) return 'Tuesday';
  if (day === 4) return 'Thursday';
  return 'Other';
}

function classifyAdFunnel(row) {
  const explicit = String(row?.funnel_key || '').toLowerCase();
  if (explicit === 'phoenix' || explicit === 'free') return explicit;

  const blob = [
    row?.campaign_name,
    row?.adset_name,
    row?.ad_name,
    row?.ad_account_id,
  ].join(' ').toLowerCase();

  if (blob.includes('phoenix') || blob.includes('1034775818463907')) return 'phoenix';
  return 'free';
}

function classifyLeadFunnel(row) {
  const blob = [
    row?.hs_analytics_source_data_2,
    row?.membership_s,
    row?.campaign,
  ].join(' ').toLowerCase();
  return blob.includes('phoenix') ? 'phoenix' : 'free';
}

function leadTierFromRevenue(value) {
  const revenue = toNumber(value);
  if (revenue > 1_000_000) return 'great';
  if (revenue >= 250_000 && revenue <= 1_000_000) return 'qualified';
  return 'standard';
}

function resolveHubspotRevenue(row) {
  const officialRaw = row?.annual_revenue_in_dollars__official_;
  if (officialRaw !== null && officialRaw !== undefined && officialRaw !== '') {
    const official = Number(officialRaw);
    if (Number.isFinite(official)) return official;
  }

  const fallbackRaw = row?.annual_revenue_in_dollars;
  if (fallbackRaw !== null && fallbackRaw !== undefined && fallbackRaw !== '') {
    const fallback = Number(fallbackRaw);
    if (Number.isFinite(fallback)) return fallback;
  }

  return null;
}

function isPaidSocialLead(row) {
  const source = String(row?.hs_analytics_source || '').toUpperCase();
  return source === 'PAID_SOCIAL' || source.includes('PAID_SOCIAL');
}

function isLumaRegistrationLead(row) {
  const membership = String(row?.membership_s || '').toLowerCase();
  return membership.includes('luma') || membership.includes('registered');
}

function getLeadName(row) {
  const first = String(row?.firstname || '').trim();
  const last = String(row?.lastname || '').trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;

  const emailPrefix = String(row?.email || '').split('@')[0] || '';
  if (!emailPrefix) return '';
  return emailPrefix.replace(/[._-]+/g, ' ').trim();
}

function pickPrimaryDate(rows, fallbackKey) {
  const keys = rows
    .map((row) => parseDateKey(row?.date_day || row?.metric_date || row?.createdate))
    .filter(Boolean)
    .sort();
  if (keys.length === 0) return fallbackKey;
  return keys[keys.length - 1];
}

function buildZoomNetNew(zoomRows, aliasMap = new Map()) {
  const sessions = (zoomRows || [])
    .filter((row) => row?.metric_name === 'Zoom Meeting Attendees')
    .map((row) => {
      const dateKey = parseDateKey(row?.metadata?.start_time || row?.metric_date);
      const dayType = dayTypeFromZoomMetric(row);
      const rawAttendees = Array.isArray(row?.metadata?.attendees) ? row.metadata.attendees : [];

      const dedupedMap = new Map();
      rawAttendees.forEach((name) => {
        const canonical = resolveCanonicalAttendeeName(name, aliasMap) || String(name || '').trim();
        const normalized = normalizeName(canonical);
        if (!normalized) return;
        if (!dedupedMap.has(normalized)) dedupedMap.set(normalized, canonical);
      });

      return {
        dateKey,
        dayType,
        attendees: Array.from(dedupedMap.values()),
      };
    })
    .filter((row) => row.dateKey && (row.dayType === 'Tuesday' || row.dayType === 'Thursday'))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const seen = new Set();
  const firstSeenByName = new Map();
  const dailyMap = new Map();
  const detailedSessions = [];

  sessions.forEach((session) => {
    const newNames = [];
    const returningNames = [];

    session.attendees.forEach((name) => {
      const key = normalizeName(name);
      if (!key) return;
      if (seen.has(key)) {
        returningNames.push(name);
        return;
      }
      seen.add(key);
      newNames.push(name);
      firstSeenByName.set(key, {
        name,
        dateKey: session.dateKey,
        dayType: session.dayType,
      });
    });

    if (!dailyMap.has(session.dateKey)) {
      dailyMap.set(session.dateKey, {
        date: session.dateKey,
        tuesday: 0,
        thursday: 0,
        total: 0,
        tuesdaySessions: 0,
        thursdaySessions: 0,
      });
    }

    const row = dailyMap.get(session.dateKey);
    if (session.dayType === 'Tuesday') {
      row.tuesday += newNames.length;
      row.tuesdaySessions += 1;
    } else {
      row.thursday += newNames.length;
      row.thursdaySessions += 1;
    }
    row.total += newNames.length;

    detailedSessions.push({
      dateKey: session.dateKey,
      dayType: session.dayType,
      attendees: session.attendees,
      newNames,
      returningNames,
      netNewCount: newNames.length,
      totalCount: session.attendees.length,
    });
  });

  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const totalTuesday = daily.reduce((acc, row) => acc + row.tuesday, 0);
  const totalThursday = daily.reduce((acc, row) => acc + row.thursday, 0);

  return {
    daily,
    sessions: detailedSessions,
    firstSeenByName,
    totalNetNew: totalTuesday + totalThursday,
    totalTuesday,
    totalThursday,
    tuesdaySessions: daily.reduce((acc, row) => acc + row.tuesdaySessions, 0),
    thursdaySessions: daily.reduce((acc, row) => acc + row.thursdaySessions, 0),
  };
}

function buildShowupIndex(firstSeenByName) {
  const byKey = new Map();
  const entries = [];
  firstSeenByName.forEach((value, key) => {
    byKey.set(key, value);
    entries.push({ ...value, key });
  });
  return { byKey, entries };
}

function daysDiff(startKey, endKey) {
  const start = toUtcDate(startKey).getTime();
  const end = toUtcDate(endKey).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function matchLeadToShowup(leadName, createdDateKey, showupIndex) {
  const key = normalizeName(leadName);
  if (!key) return null;

  const direct = showupIndex.byKey.get(key);
  if (direct) {
    const diff = daysDiff(createdDateKey, direct.dateKey);
    if (diff >= 0 && diff <= LEAD_TO_SHOWUP_MATCH_WINDOW_DAYS) return direct;
  }

  for (const candidate of showupIndex.entries) {
    const minLen = Math.min(candidate.key.length, key.length);
    if (minLen < 8) continue;
    if (!candidate.key.includes(key) && !key.includes(candidate.key)) continue;
    const diff = daysDiff(createdDateKey, candidate.dateKey);
    if (diff >= 0 && diff <= LEAD_TO_SHOWUP_MATCH_WINDOW_DAYS) return candidate;
  }

  return null;
}

function buildPaidLeads(hubspotRows, showupIndex) {
  return (hubspotRows || [])
    .filter((row) => isPaidSocialLead(row))
    .map((row) => {
      const createdDateKey = parseDateKey(row?.createdate);
      if (!createdDateKey) return null;

      const revenue = resolveHubspotRevenue(row);
      const tier = leadTierFromRevenue(revenue);
      const leadName = getLeadName(row);
      const showupMatch = matchLeadToShowup(leadName, createdDateKey, showupIndex);

      return {
        createdDateKey,
        createdAt: row?.createdate || null,
        funnel: classifyLeadFunnel(row),
        tier,
        isRegistration: isLumaRegistrationLead(row),
        matchedShowup: !!showupMatch,
        matchedShowupDateKey: showupMatch?.dateKey || null,
        leadName,
        email: String(row?.email || '').trim().toLowerCase(),
        firstName: String(row?.firstname || '').trim(),
        lastName: String(row?.lastname || '').trim(),
        membership: String(row?.membership_s || '').trim(),
        campaign: String(row?.campaign || '').trim(),
        sourceData1: String(row?.hs_analytics_source_data_1 || '').trim(),
        sourceData2: String(row?.hs_analytics_source_data_2 || '').trim(),
        revenue,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.createdDateKey.localeCompare(b.createdDateKey));
}

function buildLumaRegistrations(lumaRows) {
  const deduped = new Map();

  (lumaRows || []).forEach((row) => {
    const eventApiId = String(row?.event_api_id || row?.eventApiId || '').trim();
    const guestApiId = String(row?.guest_api_id || row?.guestApiId || '').trim();
    const dedupeKey = `${eventApiId}|${guestApiId}`;
    if (!eventApiId || !guestApiId || deduped.has(dedupeKey)) return;

    const dateKey = parseDateKey(row?.event_date || row?.registered_at || row?.event_start_at);
    if (!dateKey) return;

    const approval = String(row?.approval_status || 'approved').toLowerCase();
    if (approval && approval !== 'approved') return;

    const isThursday = row?.is_thursday === undefined ? true : !!row.is_thursday;
    if (!isThursday) return;

    const funnelRaw = String(row?.funnel_key || '').toLowerCase();
    const tierRaw = String(row?.matched_hubspot_tier || '').toLowerCase();

    deduped.set(dedupeKey, {
      dedupeKey,
      dateKey,
      eventApiId,
      guestApiId,
      guestName: String(row?.guest_name || '').trim(),
      guestEmail: String(row?.guest_email || '').trim().toLowerCase(),
      funnel: funnelRaw === 'phoenix' ? 'phoenix' : 'free',
      matchedZoom: !!row?.matched_zoom,
      matchedZoomNetNew: !!row?.matched_zoom_net_new,
      matchedHubspot: !!row?.matched_hubspot,
      tier: tierRaw === 'great' ? 'great' : tierRaw === 'qualified' ? 'qualified' : 'standard',
    });
  });

  return Array.from(deduped.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
function aggregateAdsRows(adsRows) {
  const normalizedRows = (adsRows || [])
    .map((row) => ({
      dateKey: parseDateKey(row?.date_day),
      adId: String(row?.ad_id || '').trim() || `unknown-${Math.random().toString(36).slice(2, 9)}`,
      adName: String(row?.ad_name || 'Unknown Ad'),
      adsetName: String(row?.adset_name || 'Unknown Ad Set'),
      campaignName: String(row?.campaign_name || 'Unknown Campaign'),
      funnel: classifyAdFunnel(row),
      spend: toNumber(row?.spend),
      impressions: toNumber(row?.impressions),
      clicks: toNumber(row?.clicks),
      leads: toNumber(row?.leads),
    }))
    .filter((row) => !!row.dateKey);

  const adTotals = new Map();
  const adRowsByDateFunnel = new Map();
  const adRowsByDate = new Map();

  normalizedRows.forEach((row) => {
    if (!adTotals.has(row.adId)) {
      adTotals.set(row.adId, {
        adId: row.adId,
        adName: row.adName,
        adsetName: row.adsetName,
        campaignName: row.campaignName,
        funnel: row.funnel,
        spend: 0,
        impressions: 0,
        clicks: 0,
        metaLeads: 0,
        attributedLeads: 0,
        attributedRegistrations: 0,
        attributedShowUps: 0,
        attributedQualifiedLeads: 0,
        attributedGreatLeads: 0,
      });
    }

    const ad = adTotals.get(row.adId);
    ad.spend += row.spend;
    ad.impressions += row.impressions;
    ad.clicks += row.clicks;
    ad.metaLeads += row.leads;

    const dateFunnelKey = `${row.dateKey}|${row.funnel}`;
    if (!adRowsByDateFunnel.has(dateFunnelKey)) adRowsByDateFunnel.set(dateFunnelKey, []);
    adRowsByDateFunnel.get(dateFunnelKey).push(row);

    if (!adRowsByDate.has(row.dateKey)) adRowsByDate.set(row.dateKey, []);
    adRowsByDate.get(row.dateKey).push(row);
  });

  return { normalizedRows, adTotals, adRowsByDateFunnel, adRowsByDate };
}

function buildLeadBuckets(paidLeads, lumaRegistrations = []) {
  const byDateFunnel = new Map();
  const byDate = new Map();

  paidLeads.forEach((lead) => {
    const dateFunnelKey = `${lead.createdDateKey}|${lead.funnel}`;
    if (!byDateFunnel.has(dateFunnelKey)) {
      byDateFunnel.set(dateFunnelKey, {
        leads: 0,
        registrations: 0,
        qualifiedLeads: 0,
        greatLeads: 0,
        matchedShowUps: 0,
      });
    }
    if (!byDate.has(lead.createdDateKey)) {
      byDate.set(lead.createdDateKey, {
        leads: 0,
        registrations: 0,
        qualifiedLeads: 0,
        greatLeads: 0,
      });
    }

    const bucket = byDateFunnel.get(dateFunnelKey);
    bucket.leads += 1;
    if (lead.isRegistration) bucket.registrations += 1;
    if (lead.tier === 'qualified') bucket.qualifiedLeads += 1;
    if (lead.tier === 'great') bucket.greatLeads += 1;
    if (lead.matchedShowup) bucket.matchedShowUps += 1;

    const dateRow = byDate.get(lead.createdDateKey);
    dateRow.leads += 1;
    if (lead.isRegistration) dateRow.registrations += 1;
    if (lead.tier === 'qualified') dateRow.qualifiedLeads += 1;
    if (lead.tier === 'great') dateRow.greatLeads += 1;
  });

  if ((lumaRegistrations || []).length > 0) {
    const byDateFunnelLuma = new Map();
    const byDateLuma = new Map();

    lumaRegistrations.forEach((reg) => {
      const dateFunnelKey = `${reg.dateKey}|${reg.funnel}`;
      if (!byDateFunnelLuma.has(dateFunnelKey)) {
        byDateFunnelLuma.set(dateFunnelKey, {
          registrations: 0,
          matchedShowUps: 0,
        });
      }
      if (!byDateLuma.has(reg.dateKey)) {
        byDateLuma.set(reg.dateKey, {
          registrations: 0,
          matchedShowUps: 0,
        });
      }

      const bucket = byDateFunnelLuma.get(dateFunnelKey);
      bucket.registrations += 1;
      if (reg.matchedZoomNetNew) bucket.matchedShowUps += 1;

      const day = byDateLuma.get(reg.dateKey);
      day.registrations += 1;
      if (reg.matchedZoomNetNew) day.matchedShowUps += 1;
    });

    byDateFunnelLuma.forEach((luma, key) => {
      if (!byDateFunnel.has(key)) {
        byDateFunnel.set(key, {
          leads: 0,
          registrations: 0,
          qualifiedLeads: 0,
          greatLeads: 0,
          matchedShowUps: 0,
        });
      }
      const existing = byDateFunnel.get(key);
      existing.registrations = luma.registrations;
      existing.matchedShowUps = luma.matchedShowUps;
    });

    byDateLuma.forEach((luma, key) => {
      if (!byDate.has(key)) {
        byDate.set(key, {
          leads: 0,
          registrations: 0,
          qualifiedLeads: 0,
          greatLeads: 0,
        });
      }
      const existing = byDate.get(key);
      existing.registrations = luma.registrations;
    });
  }

  return { byDateFunnel, byDate };
}

function applyAttribution(adState, leadBuckets) {
  let attributedLeadsTotal = 0;
  let attributedShowUpsTotal = 0;

  leadBuckets.byDateFunnel.forEach((leadBucket, key) => {
    const [dateKey] = key.split('|');
    const candidates = adState.adRowsByDateFunnel.get(key) || adState.adRowsByDate.get(dateKey) || [];
    if (candidates.length === 0) return;

    const totalLeadWeight = candidates.reduce((acc, row) => acc + row.leads, 0);
    const totalSpendWeight = candidates.reduce((acc, row) => acc + row.spend, 0);

    candidates.forEach((row) => {
      let weight = 1 / candidates.length;
      if (totalLeadWeight > 0) {
        weight = row.leads / totalLeadWeight;
      } else if (totalSpendWeight > 0) {
        weight = row.spend / totalSpendWeight;
      }

      const ad = adState.adTotals.get(row.adId);
      if (!ad) return;

      ad.attributedLeads += leadBucket.leads * weight;
      ad.attributedRegistrations += leadBucket.registrations * weight;
      ad.attributedShowUps += leadBucket.matchedShowUps * weight;
      ad.attributedQualifiedLeads += leadBucket.qualifiedLeads * weight;
      ad.attributedGreatLeads += leadBucket.greatLeads * weight;
    });

    attributedLeadsTotal += leadBucket.leads;
    attributedShowUpsTotal += leadBucket.matchedShowUps;
  });

  return { attributedLeadsTotal, attributedShowUpsTotal };
}

function summarizeAdRows(adTotals) {
  return Array.from(adTotals.values()).map((row) => {
    const attributedBaseLeads = row.attributedLeads > 0 ? row.attributedLeads : row.metaLeads;
    const cpl = safeDivide(row.spend, row.metaLeads);
    const cpql = safeDivide(row.spend, row.attributedQualifiedLeads);
    const cpgl = safeDivide(row.spend, row.attributedGreatLeads);
    const cpsu = safeDivide(row.spend, row.attributedShowUps);
    const ctr = safeDivide(row.clicks, row.impressions);
    const clickToLeadRate = safeDivide(row.metaLeads, row.clicks);
    const showUpRate = safeDivide(row.attributedShowUps, attributedBaseLeads);
    const qualityScore = (safeDivide(row.attributedQualifiedLeads, attributedBaseLeads) * 100)
      + (safeDivide(row.attributedGreatLeads, attributedBaseLeads) * 200);

    return {
      ...row,
      cpl,
      cpql,
      cpgl,
      costPerShowUp: cpsu,
      ctr,
      clickToLeadRate,
      showUpRate,
      qualityScore,
    };
  });
}

function getSnapshot({ adsRows, paidLeads, zoomDaily, lumaRegistrations, hasDirectLumaData }, startKey, endKey) {
  const adsInRange = adsRows.filter((row) => dateInRange(row.dateKey, startKey, endKey));
  const leadsInRange = paidLeads.filter((row) => dateInRange(row.createdDateKey, startKey, endKey));
  const showupsInRange = zoomDaily.filter((row) => dateInRange(row.date, startKey, endKey));
  const lumaInRange = (lumaRegistrations || []).filter((row) => dateInRange(row.dateKey, startKey, endKey));

  const spend = adsInRange.reduce((acc, row) => acc + row.spend, 0);
  const impressions = adsInRange.reduce((acc, row) => acc + row.impressions, 0);
  const clicks = adsInRange.reduce((acc, row) => acc + row.clicks, 0);
  const metaLeads = adsInRange.reduce((acc, row) => acc + row.leads, 0);

  const leads = leadsInRange.length > 0 ? leadsInRange.length : metaLeads;
  const fallbackRegistrations = leadsInRange.filter((row) => row.isRegistration).length;
  const lumaRegistrationsCount = lumaInRange.length;
  const lumaMatchedShowUps = lumaInRange.filter((row) => row.matchedZoom).length;
  const lumaMatchedNetNewShowUps = lumaInRange.filter((row) => row.matchedZoomNetNew).length;
  const lumaHubspotMatches = lumaInRange.filter((row) => row.matchedHubspot).length;

  const registrations = hasDirectLumaData ? lumaRegistrationsCount : fallbackRegistrations;
  const showUps = showupsInRange.reduce((acc, row) => acc + row.total, 0);
  const registrationShowUps = hasDirectLumaData ? lumaMatchedNetNewShowUps : showUps;

  const qualifiedLeads = leadsInRange.filter((row) => row.tier === 'qualified').length;
  const greatLeads = leadsInRange.filter((row) => row.tier === 'great').length;
  const standardLeads = Math.max(leads - qualifiedLeads - greatLeads, 0);

  const tuesdayShowUps = showupsInRange.reduce((acc, row) => acc + row.tuesday, 0);
  const thursdayShowUps = showupsInRange.reduce((acc, row) => acc + row.thursday, 0);

  const costs = {
    cpl: safeDivide(spend, leads),
    cpql: safeDivide(spend, qualifiedLeads),
    cpgl: safeDivide(spend, greatLeads),
    costPerShowUp: safeDivide(spend, showUps),
    costPerRegistration: safeDivide(spend, registrations),
  };

  const conversions = {
    impressionToClick: safeDivide(clicks, impressions),
    clickToLead: safeDivide(leads, clicks),
    leadToRegistration: safeDivide(registrations, leads),
    registrationToShowUp: safeDivide(registrationShowUps, registrations),
    showUpToQualified: safeDivide(qualifiedLeads, showUps),
    showUpToGreat: safeDivide(greatLeads, showUps),
  };

  return {
    period: { startKey, endKey },
    spend,
    impressions,
    clicks,
    leads,
    metaLeads,
    registrations,
    showUps,
    registrationShowUps,
    tuesdayShowUps,
    thursdayShowUps,
    qualifiedLeads,
    greatLeads,
    standardLeads,
    lumaRegistrations: lumaRegistrationsCount,
    lumaMatchedShowUps,
    lumaMatchedNetNewShowUps,
    lumaHubspotMatches,
    costs,
    conversions,
  };
}

function metricDelta(current, previous) {
  const delta = current - previous;
  const deltaPct = previous === 0 ? null : delta / previous;
  return { delta, deltaPct };
}

function buildMetricSnapshotRows(monthCurrent, monthPrevious, weekCurrent, weekPrevious) {
  const row = (label, key, current, previous, weeklyCurrent, weeklyPrevious, format, betterWhen) => ({
    id: key,
    label,
    current,
    previous,
    weeklyCurrent,
    weeklyPrevious,
    monthlyDelta: metricDelta(current, previous),
    weeklyDelta: metricDelta(weeklyCurrent, weeklyPrevious),
    format,
    betterWhen,
  });

  return [
    row('Ad Spend', 'spend', monthCurrent.spend, monthPrevious.spend, weekCurrent.spend, weekPrevious.spend, 'currency', 'lower'),
    row('Impressions', 'impressions', monthCurrent.impressions, monthPrevious.impressions, weekCurrent.impressions, weekPrevious.impressions, 'count', 'higher'),
    row('Clicks', 'clicks', monthCurrent.clicks, monthPrevious.clicks, weekCurrent.clicks, weekPrevious.clicks, 'count', 'higher'),
    row('Leads Captured', 'leads', monthCurrent.leads, monthPrevious.leads, weekCurrent.leads, weekPrevious.leads, 'count', 'higher'),
    row('Luma Registrations', 'registrations', monthCurrent.registrations, monthPrevious.registrations, weekCurrent.registrations, weekPrevious.registrations, 'count', 'higher'),
    row('Net New Show-Ups', 'showups', monthCurrent.showUps, monthPrevious.showUps, weekCurrent.showUps, weekPrevious.showUps, 'count', 'higher'),
    row('Qualified Leads', 'qualified', monthCurrent.qualifiedLeads, monthPrevious.qualifiedLeads, weekCurrent.qualifiedLeads, weekPrevious.qualifiedLeads, 'count', 'higher'),
    row('Great Leads', 'great', monthCurrent.greatLeads, monthPrevious.greatLeads, weekCurrent.greatLeads, weekPrevious.greatLeads, 'count', 'higher'),
    row('CPL', 'cpl', monthCurrent.costs.cpl, monthPrevious.costs.cpl, weekCurrent.costs.cpl, weekPrevious.costs.cpl, 'currency', 'lower'),
    row('CPQL', 'cpql', monthCurrent.costs.cpql, monthPrevious.costs.cpql, weekCurrent.costs.cpql, weekPrevious.costs.cpql, 'currency', 'lower'),
    row('CPGL', 'cpgl', monthCurrent.costs.cpgl, monthPrevious.costs.cpgl, weekCurrent.costs.cpgl, weekPrevious.costs.cpgl, 'currency', 'lower'),
    row('Cost Per Show-Up', 'cost_per_showup', monthCurrent.costs.costPerShowUp, monthPrevious.costs.costPerShowUp, weekCurrent.costs.costPerShowUp, weekPrevious.costs.costPerShowUp, 'currency', 'lower'),
    row('Cost Per Registration', 'cost_per_registration', monthCurrent.costs.costPerRegistration, monthPrevious.costs.costPerRegistration, weekCurrent.costs.costPerRegistration, weekPrevious.costs.costPerRegistration, 'currency', 'lower'),
    row('Impression -> Click', 'impr_to_click', monthCurrent.conversions.impressionToClick, monthPrevious.conversions.impressionToClick, weekCurrent.conversions.impressionToClick, weekPrevious.conversions.impressionToClick, 'percent', 'higher'),
    row('Click -> Lead', 'click_to_lead', monthCurrent.conversions.clickToLead, monthPrevious.conversions.clickToLead, weekCurrent.conversions.clickToLead, weekPrevious.conversions.clickToLead, 'percent', 'higher'),
    row('Lead -> Registration', 'lead_to_registration', monthCurrent.conversions.leadToRegistration, monthPrevious.conversions.leadToRegistration, weekCurrent.conversions.leadToRegistration, weekPrevious.conversions.leadToRegistration, 'percent', 'higher'),
    row('Registration -> Show-Up', 'registration_to_showup', monthCurrent.conversions.registrationToShowUp, monthPrevious.conversions.registrationToShowUp, weekCurrent.conversions.registrationToShowUp, weekPrevious.conversions.registrationToShowUp, 'percent', 'higher'),
    row('Show-Up -> Qualified', 'showup_to_qualified', monthCurrent.conversions.showUpToQualified, monthPrevious.conversions.showUpToQualified, weekCurrent.conversions.showUpToQualified, weekPrevious.conversions.showUpToQualified, 'percent', 'higher'),
    row('Show-Up -> Great', 'showup_to_great', monthCurrent.conversions.showUpToGreat, monthPrevious.conversions.showUpToGreat, weekCurrent.conversions.showUpToGreat, weekPrevious.conversions.showUpToGreat, 'percent', 'higher'),
  ];
}
function buildFunnelStages(snapshot) {
  const stages = [
    { key: 'impressions', label: 'Impressions', value: snapshot.impressions },
    { key: 'clicks', label: 'Clicks', value: snapshot.clicks },
    { key: 'leads', label: 'Leads Captured', value: snapshot.leads },
    { key: 'registrations', label: 'Luma Registrations', value: snapshot.registrations },
    { key: 'showups', label: 'Net New Show-Ups', value: snapshot.showUps },
    { key: 'qualified', label: 'Qualified Leads', value: snapshot.qualifiedLeads },
    { key: 'great', label: 'Great Leads', value: snapshot.greatLeads },
  ];

  return stages.map((stage, index) => ({
    ...stage,
    conversionFromPrevious: index === 0 ? null : safeDivide(stage.value, stages[index - 1].value),
  }));
}

function buildTrendRows(primaryDate, adsRows, leadByDate, zoomDaily) {
  const startDate = addDays(primaryDate, -59);
  const rows = [];
  let cursor = startDate;

  const adsByDate = new Map();
  adsRows.forEach((row) => {
    if (!adsByDate.has(row.dateKey)) {
      adsByDate.set(row.dateKey, { spend: 0, impressions: 0, clicks: 0, leads: 0 });
    }
    const aggregate = adsByDate.get(row.dateKey);
    aggregate.spend += row.spend;
    aggregate.impressions += row.impressions;
    aggregate.clicks += row.clicks;
    aggregate.leads += row.leads;
  });

  const zoomByDate = new Map((zoomDaily || []).map((row) => [row.date, row]));

  while (cursor <= primaryDate) {
    const ad = adsByDate.get(cursor) || { spend: 0, impressions: 0, clicks: 0, leads: 0 };
    const lead = leadByDate.get(cursor) || { leads: 0, registrations: 0, qualifiedLeads: 0, greatLeads: 0 };
    const zoom = zoomByDate.get(cursor) || { tuesday: 0, thursday: 0, total: 0 };

    rows.push({
      date: cursor,
      label: cursor.slice(5),
      spend: ad.spend,
      impressions: ad.impressions,
      clicks: ad.clicks,
      leads: lead.leads || ad.leads,
      registrations: lead.registrations,
      qualifiedLeads: lead.qualifiedLeads,
      greatLeads: lead.greatLeads,
      netNewTuesday: zoom.tuesday,
      netNewThursday: zoom.thursday,
      netNewTotal: zoom.total,
    });

    cursor = addDays(cursor, 1);
  }

  return rows;
}

function getTopAds(adRows) {
  const scored = adRows
    .filter((row) => row.spend > 0)
    .map((row) => {
      const cpglScore = row.attributedGreatLeads > 0 ? 1 / row.cpgl : 0;
      const cpqlScore = row.attributedQualifiedLeads > 0 ? 1 / row.cpql : 0;
      const showupScore = row.showUpRate;
      const qualityScore = safeDivide(row.qualityScore, 100);
      return {
        ...row,
        rankingScore: cpglScore * 0.5 + cpqlScore * 0.2 + showupScore * 0.15 + qualityScore * 0.15,
      };
    })
    .sort((a, b) => b.rankingScore - a.rankingScore);

  return scored.slice(0, 5);
}

function getBottomAds(adRows) {
  return adRows
    .filter((row) => row.spend > 0)
    .map((row) => {
      const zeroGreatPenalty = row.attributedGreatLeads === 0 ? 1 : 0;
      const zeroQualifiedPenalty = row.attributedQualifiedLeads === 0 ? 1 : 0;
      const cplPenalty = row.cpl;
      return {
        ...row,
        wasteScore: row.spend * (1 + zeroGreatPenalty + zeroQualifiedPenalty) + cplPenalty * 5,
      };
    })
    .sort((a, b) => b.wasteScore - a.wasteScore)
    .slice(0, 5);
}

function buildHeadline(monthCurrent, monthPrevious, topAds, bottomAds) {
  const cpglDelta = metricDelta(monthCurrent.costs.cpgl, monthPrevious.costs.cpgl).deltaPct;
  const hasGreatLeads = monthCurrent.greatLeads > 0;

  if (!hasGreatLeads) {
    return 'No Great Leads were captured in the current 30-day window. Immediate budget and funnel action is required to protect CPGL.';
  }

  if (cpglDelta !== null && cpglDelta < -0.15) {
    return `CPGL is improving month-over-month (${round(cpglDelta * 100, 1)}%), with ${topAds[0]?.adName || 'top ads'} driving higher-quality outcomes.`;
  }

  if (bottomAds.length > 0 && topAds.length > 0) {
    return `Cost inefficiency is concentrated in ${bottomAds[0].adName}. Reallocating budget to ${topAds[0].adName} is the fastest path to lower CPGL.`;
  }

  return 'Lead quality and cost performance are stable. Focus now is to tighten attribution and improve registration-to-show-up conversion.';
}

function buildRecommendations(monthCurrent, monthPrevious, topAds, bottomAds, funnelStages, showupSummary) {
  const recommendations = [];

  if (bottomAds.length > 0 && topAds.length > 0) {
    const worst = bottomAds[0];
    const best = topAds[0];
    const budgetShift = worst.spend * 0.25;
    const worstGreatPerDollar = safeDivide(worst.attributedGreatLeads, worst.spend);
    const bestGreatPerDollar = safeDivide(best.attributedGreatLeads, best.spend);
    const expectedGreatLift = Math.max((bestGreatPerDollar - worstGreatPerDollar) * budgetShift, 0);

    recommendations.push({
      title: `Reallocate 25% of spend from "${worst.adName}" to "${best.adName}"`,
      reason: `"${worst.adName}" has weak quality efficiency, while "${best.adName}" has the strongest cost-to-quality profile.`,
      impact: expectedGreatLift > 0
        ? `Expected impact: +${round(expectedGreatLift, 2)} Great Leads per similar period and lower CPGL.`
        : `Expected impact: remove roughly $${round(budgetShift, 0)} in inefficient spend with limited quality downside.`,
    });
  }

  const leadToRegistrationStage = funnelStages.find((stage) => stage.key === 'registrations');
  const previousLeadToReg = monthPrevious.conversions.leadToRegistration;
  const currentLeadToReg = monthCurrent.conversions.leadToRegistration;
  if (leadToRegistrationStage && currentLeadToReg < 0.5) {
    const targetRate = Math.max(currentLeadToReg + 0.1, previousLeadToReg);
    const additionalRegistrations = Math.max((targetRate - currentLeadToReg) * monthCurrent.leads, 0);
    recommendations.push({
      title: 'Improve Lead -> Registration with tighter CTA and registration reminders',
      reason: `Lead -> Registration is ${round(currentLeadToReg * 100, 1)}%, creating a bottleneck before show-up.`,
      impact: `Expected impact: +${round(additionalRegistrations, 1)} registrations per 30 days, improving downstream show-ups and CPGL.`,
    });
  }

  const registrationToShowUpRate = monthCurrent.conversions.registrationToShowUp;
  if (monthCurrent.lumaRegistrations > 0 && registrationToShowUpRate < 0.45) {
    recommendations.push({
      title: 'Improve Thursday Lu.ma registration follow-up to lift Zoom show-up matches',
      reason: `Only ${round(registrationToShowUpRate * 100, 1)}% of Thursday Lu.ma registrations are matching net-new Zoom show-ups.`,
      impact: `Expected impact: +${round((0.55 - registrationToShowUpRate) * monthCurrent.lumaRegistrations, 1)} net-new Thursday show-ups if match rate reaches 55%.`,
    });
  }

  const tueAvg = safeDivide(showupSummary.totalTuesday, showupSummary.tuesdaySessions);
  const thuAvg = safeDivide(showupSummary.totalThursday, showupSummary.thursdaySessions);
  if (Math.abs(tueAvg - thuAvg) >= 1) {
    const weakerDay = tueAvg < thuAvg ? 'Tuesday' : 'Thursday';
    recommendations.push({
      title: `Run a ${weakerDay}-specific follow-up sequence to raise show-up conversion`,
      reason: `${weakerDay} is underperforming on net new attendance per session.`,
      impact: `Expected impact: +${round(Math.abs(tueAvg - thuAvg), 1)} net-new show-ups per ${weakerDay} session if parity is reached.`,
    });
  }

  if (recommendations.length < 3) {
    recommendations.push({
      title: 'Add deterministic ad_id capture into HubSpot and Luma registration records',
      reason: 'Current attribution relies on weighted fallback logic due missing direct ad -> lead -> registration linkage.',
      impact: 'Expected impact: cleaner CPQL/CPGL optimization decisions and faster budget iteration cycles.',
    });
  }

  return recommendations.slice(0, 3);
}

function buildAlerts(monthCurrent, monthPrevious, weekCurrent, weekPrevious, dataAvailability) {
  const alerts = [];

  const cplDelta = metricDelta(monthCurrent.costs.cpl, monthPrevious.costs.cpl).deltaPct;
  if (cplDelta !== null && cplDelta > 0.25) {
    alerts.push(`CPL increased ${round(cplDelta * 100, 1)}% month-over-month.`);
  }

  const regToShowDelta = metricDelta(monthCurrent.conversions.registrationToShowUp, monthPrevious.conversions.registrationToShowUp).deltaPct;
  if (regToShowDelta !== null && regToShowDelta < -0.25) {
    alerts.push(`Registration -> Show-Up dropped ${round(Math.abs(regToShowDelta) * 100, 1)}% month-over-month.`);
  }

  const weekShowupDelta = metricDelta(weekCurrent.showUps, weekPrevious.showUps).deltaPct;
  if (weekShowupDelta !== null && weekShowupDelta < -0.3) {
    alerts.push(`Net new show-ups are down ${round(Math.abs(weekShowupDelta) * 100, 1)}% week-over-week.`);
  }

  if (!dataAvailability.hasDirectLumaData) {
    alerts.push('Luma registration table is unavailable. Registration metrics are currently using HubSpot membership proxy logic.');
  }

  if (dataAvailability.hasDirectLumaData && dataAvailability.lumaRegistrationsCurrent > 0 && dataAvailability.lumaZoomMatchRate < 0.35) {
    alerts.push(`Low Thursday Lu.ma -> Zoom net-new match rate (${round(dataAvailability.lumaZoomMatchRate * 100, 1)}%).`);
  }

  if (dataAvailability.hasDirectLumaData && dataAvailability.lumaRegistrationsCurrent > 0 && dataAvailability.lumaHubspotMatchRate < 0.7) {
    alerts.push(`Low Thursday Lu.ma -> HubSpot identity match rate (${round(dataAvailability.lumaHubspotMatchRate * 100, 1)}%).`);
  }

  if (!dataAvailability.hasHubSpotAttributionColumns) {
    alerts.push('Advanced HubSpot attribution columns are missing in this environment; ad-path analysis is operating in fallback mode.');
  }

  if (alerts.length === 0) {
    alerts.push('No critical anomalies detected in the current window.');
  }

  return alerts;
}

function buildLeadQualityBreakdown(snapshot) {
  const total = snapshot.leads;
  const standardPct = safeDivide(snapshot.standardLeads, total);
  const qualifiedPct = safeDivide(snapshot.qualifiedLeads, total);
  const greatPct = safeDivide(snapshot.greatLeads, total);

  return {
    standard: snapshot.standardLeads,
    qualified: snapshot.qualifiedLeads,
    great: snapshot.greatLeads,
    standardPct,
    qualifiedPct,
    greatPct,
    chartRows: [
      { name: 'Standard', value: snapshot.standardLeads, pct: standardPct, color: '#94a3b8' },
      { name: 'Qualified', value: snapshot.qualifiedLeads, pct: qualifiedPct, color: '#0ea5e9' },
      { name: 'Great', value: snapshot.greatLeads, pct: greatPct, color: '#16a34a' },
    ],
  };
}

function buildWindowDrilldown({
  startKey,
  endKey,
  adsRows,
  paidLeads,
  lumaRegistrations,
  zoomSessions,
  hasDirectLumaData,
}) {
  const adsInRange = (adsRows || []).filter((row) => dateInRange(row.dateKey, startKey, endKey));
  const leadsInRange = (paidLeads || []).filter((row) => dateInRange(row.createdDateKey, startKey, endKey));
  const lumaInRange = (lumaRegistrations || []).filter((row) => dateInRange(row.dateKey, startKey, endKey));
  const sessionsInRange = (zoomSessions || []).filter((row) => dateInRange(row.dateKey, startKey, endKey));

  const adRows = adsInRange.map((row) => ({
    date: row.dateKey,
    campaign: row.campaignName,
    adset: row.adsetName,
    ad: row.adName,
    funnel: row.funnel,
    spend: round(row.spend, 2),
    impressions: round(row.impressions, 0),
    clicks: round(row.clicks, 0),
    metaLeads: round(row.leads, 0),
  }));

  const leadRows = leadsInRange.map((row) => ({
    leadDate: row.createdDateKey,
    leadName: row.leadName,
    email: row.email || '',
    funnel: row.funnel,
    tier: row.tier,
    revenue: row.revenue,
    matchedShowup: row.matchedShowup ? 'Yes' : 'No',
    matchedShowupDate: row.matchedShowupDateKey || '',
    registrationProxy: row.isRegistration ? 'Yes' : 'No',
    campaign: row.campaign || '',
    membership: row.membership || '',
    sourceData2: row.sourceData2 || '',
  }));

  const standardLeadRows = leadRows.filter((row) => row.tier === 'standard');
  const qualifiedLeadRows = leadRows.filter((row) => row.tier === 'qualified');
  const greatLeadRows = leadRows.filter((row) => row.tier === 'great');

  const fallbackRegistrationRows = leadsInRange
    .filter((row) => row.isRegistration)
    .map((row) => ({
      eventDate: row.createdDateKey,
      guestName: row.leadName,
      guestEmail: row.email || '',
      funnel: row.funnel,
      hubspotTier: row.tier,
      matchedZoom: row.matchedShowup ? 'Yes' : 'No',
      matchedZoomNetNew: row.matchedShowup ? 'Yes' : 'No',
      matchedHubspot: 'Yes',
      source: 'HubSpot Proxy',
    }));

  const lumaRows = lumaInRange.map((row) => ({
    eventDate: row.dateKey,
    guestName: row.guestName || '',
    guestEmail: row.guestEmail || '',
    funnel: row.funnel,
    hubspotTier: row.tier,
    matchedZoom: row.matchedZoom ? 'Yes' : 'No',
    matchedZoomNetNew: row.matchedZoomNetNew ? 'Yes' : 'No',
    matchedHubspot: row.matchedHubspot ? 'Yes' : 'No',
    source: 'Luma',
  }));

  const registrationRows = hasDirectLumaData ? lumaRows : fallbackRegistrationRows;
  const lumaZoomMatchRows = lumaRows.filter((row) => row.matchedZoom === 'Yes');
  const lumaZoomNetNewMatchRows = lumaRows.filter((row) => row.matchedZoomNetNew === 'Yes');
  const lumaHubspotMatchRows = lumaRows.filter((row) => row.matchedHubspot === 'Yes');

  const showupRows = [];
  sessionsInRange.forEach((session) => {
    const names = Array.isArray(session?.newNames) ? session.newNames : [];
    names.forEach((attendee) => {
      showupRows.push({
        sessionDate: session.dateKey,
        dayType: session.dayType,
        attendeeName: attendee,
      });
    });
  });

  const adColumns = [
    { key: 'date', label: 'Date', type: 'text' },
    { key: 'campaign', label: 'Campaign', type: 'text' },
    { key: 'adset', label: 'Ad Set', type: 'text' },
    { key: 'ad', label: 'Ad', type: 'text' },
    { key: 'funnel', label: 'Funnel', type: 'text' },
    { key: 'spend', label: 'Spend', type: 'currency' },
  ];

  const tables = {
    impressions: {
      columns: [...adColumns, { key: 'impressions', label: 'Impressions', type: 'number' }],
      rows: adRows.filter((row) => row.impressions > 0),
      emptyMessage: 'No Meta impression rows in this window.',
    },
    clicks: {
      columns: [...adColumns, { key: 'clicks', label: 'Clicks', type: 'number' }],
      rows: adRows.filter((row) => row.clicks > 0),
      emptyMessage: 'No Meta click rows in this window.',
    },
    leads: {
      columns: [
        { key: 'leadDate', label: 'Lead Date', type: 'text' },
        { key: 'leadName', label: 'Lead Name', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'funnel', label: 'Funnel', type: 'text' },
        { key: 'tier', label: 'Tier', type: 'text' },
        { key: 'revenue', label: 'Revenue', type: 'currency' },
        { key: 'matchedShowup', label: 'Matched Show-Up', type: 'text' },
        { key: 'matchedShowupDate', label: 'Show-Up Date', type: 'text' },
        { key: 'campaign', label: 'Campaign', type: 'text' },
      ],
      rows: leadRows,
      emptyMessage: 'No paid-social leads in this window.',
    },
    registrations: {
      columns: [
        { key: 'eventDate', label: 'Registration Date', type: 'text' },
        { key: 'guestName', label: 'Name', type: 'text' },
        { key: 'guestEmail', label: 'Email', type: 'text' },
        { key: 'funnel', label: 'Funnel', type: 'text' },
        { key: 'hubspotTier', label: 'HubSpot Tier', type: 'text' },
        { key: 'matchedZoom', label: 'Matched Zoom', type: 'text' },
        { key: 'matchedZoomNetNew', label: 'Matched Net New', type: 'text' },
        { key: 'matchedHubspot', label: 'Matched HubSpot', type: 'text' },
        { key: 'source', label: 'Source', type: 'text' },
      ],
      rows: registrationRows,
      emptyMessage: hasDirectLumaData
        ? 'No Lu.ma registrations in this window.'
        : 'No HubSpot membership proxy registrations in this window.',
    },
    showups: {
      columns: [
        { key: 'sessionDate', label: 'Session Date', type: 'text' },
        { key: 'dayType', label: 'Day', type: 'text' },
        { key: 'attendeeName', label: 'Net New Attendee', type: 'text' },
      ],
      rows: showupRows,
      emptyMessage: 'No net-new Zoom show-ups in this window.',
    },
    standard: {
      columns: [
        { key: 'leadDate', label: 'Lead Date', type: 'text' },
        { key: 'leadName', label: 'Lead Name', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'funnel', label: 'Funnel', type: 'text' },
        { key: 'revenue', label: 'Revenue', type: 'currency' },
        { key: 'campaign', label: 'Campaign', type: 'text' },
      ],
      rows: standardLeadRows,
      emptyMessage: 'No standard leads in this window.',
    },
    qualified: {
      columns: [
        { key: 'leadDate', label: 'Lead Date', type: 'text' },
        { key: 'leadName', label: 'Lead Name', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'funnel', label: 'Funnel', type: 'text' },
        { key: 'revenue', label: 'Revenue', type: 'currency' },
        { key: 'matchedShowup', label: 'Matched Show-Up', type: 'text' },
        { key: 'campaign', label: 'Campaign', type: 'text' },
      ],
      rows: qualifiedLeadRows,
      emptyMessage: 'No qualified leads in this window.',
    },
    great: {
      columns: [
        { key: 'leadDate', label: 'Lead Date', type: 'text' },
        { key: 'leadName', label: 'Lead Name', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'funnel', label: 'Funnel', type: 'text' },
        { key: 'revenue', label: 'Revenue', type: 'currency' },
        { key: 'matchedShowup', label: 'Matched Show-Up', type: 'text' },
        { key: 'campaign', label: 'Campaign', type: 'text' },
      ],
      rows: greatLeadRows,
      emptyMessage: 'No great leads in this window.',
    },
    luma_zoom_matches: {
      columns: [
        { key: 'eventDate', label: 'Registration Date', type: 'text' },
        { key: 'guestName', label: 'Name', type: 'text' },
        { key: 'guestEmail', label: 'Email', type: 'text' },
        { key: 'matchedZoom', label: 'Matched Zoom', type: 'text' },
        { key: 'matchedZoomNetNew', label: 'Matched Net New', type: 'text' },
      ],
      rows: lumaZoomMatchRows,
      emptyMessage: 'No Lu.ma registrations matched to Zoom in this window.',
    },
    luma_zoom_net_new_matches: {
      columns: [
        { key: 'eventDate', label: 'Registration Date', type: 'text' },
        { key: 'guestName', label: 'Name', type: 'text' },
        { key: 'guestEmail', label: 'Email', type: 'text' },
        { key: 'matchedZoomNetNew', label: 'Matched Net New', type: 'text' },
      ],
      rows: lumaZoomNetNewMatchRows,
      emptyMessage: 'No Lu.ma registrations matched to net-new Zoom show-ups in this window.',
    },
    luma_hubspot_matches: {
      columns: [
        { key: 'eventDate', label: 'Registration Date', type: 'text' },
        { key: 'guestName', label: 'Name', type: 'text' },
        { key: 'guestEmail', label: 'Email', type: 'text' },
        { key: 'hubspotTier', label: 'HubSpot Tier', type: 'text' },
        { key: 'matchedHubspot', label: 'Matched HubSpot', type: 'text' },
      ],
      rows: lumaHubspotMatchRows,
      emptyMessage: 'No Lu.ma registrations matched to HubSpot in this window.',
    },
  };

  tables.cpl = tables.leads;
  tables.cpql = tables.qualified;
  tables.cpgl = tables.great;
  tables.cost_per_showup = tables.showups;
  tables.cost_per_registration = tables.registrations;

  return {
    startKey,
    endKey,
    tables,
  };
}

export function buildLeadAnalytics({
  adsRows = [],
  hubspotRows = [],
  zoomRows = [],
  lumaRows = [],
  aliases = [],
  lookbackDays = LOOKBACK_DAYS_DEFAULT,
}) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const primaryDate = pickPrimaryDate([...adsRows, ...hubspotRows, ...zoomRows], todayKey);
  const lookbackStart = addDays(primaryDate, -(lookbackDays - 1));
  const aliasMap = buildAliasMap(aliases);

  const zoomNetNew = buildZoomNetNew(zoomRows.filter((row) => {
    const key = parseDateKey(row?.metadata?.start_time || row?.metric_date);
    return dateInRange(key, lookbackStart, primaryDate);
  }), aliasMap);
  const showupIndex = buildShowupIndex(zoomNetNew.firstSeenByName);
  const paidLeads = buildPaidLeads(
    hubspotRows.filter((row) => {
      const key = parseDateKey(row?.createdate);
      return dateInRange(key, lookbackStart, primaryDate);
    }),
    showupIndex,
  );
  const lumaRegistrations = buildLumaRegistrations(
    lumaRows.filter((row) => {
      const key = parseDateKey(row?.event_date || row?.registered_at || row?.event_start_at);
      return dateInRange(key, lookbackStart, primaryDate);
    }),
  );
  const hasDirectLumaData = lumaRegistrations.length > 0;

  const adState = aggregateAdsRows(adsRows.filter((row) => {
    const key = parseDateKey(row?.date_day);
    return dateInRange(key, lookbackStart, primaryDate);
  }));
  const leadBuckets = buildLeadBuckets(paidLeads, hasDirectLumaData ? lumaRegistrations : []);
  const attributionTotals = applyAttribution(adState, leadBuckets);
  const adAttributionRows = summarizeAdRows(adState.adTotals)
    .sort((a, b) => b.spend - a.spend);

  const monthCurrentRange = {
    start: addDays(primaryDate, -(MONTH_DAYS - 1)),
    end: primaryDate,
  };
  const monthPreviousRange = {
    end: addDays(monthCurrentRange.start, -1),
    start: addDays(monthCurrentRange.start, -MONTH_DAYS),
  };
  const weekCurrentRange = {
    start: addDays(primaryDate, -(WEEK_DAYS - 1)),
    end: primaryDate,
  };
  const weekPreviousRange = {
    end: addDays(weekCurrentRange.start, -1),
    start: addDays(weekCurrentRange.start, -WEEK_DAYS),
  };
  const lookbackRange = {
    start: lookbackStart,
    end: primaryDate,
  };

  const monthCurrent = getSnapshot(
    { adsRows: adState.normalizedRows, paidLeads, zoomDaily: zoomNetNew.daily, lumaRegistrations, hasDirectLumaData },
    monthCurrentRange.start,
    monthCurrentRange.end,
  );
  const monthPrevious = getSnapshot(
    { adsRows: adState.normalizedRows, paidLeads, zoomDaily: zoomNetNew.daily, lumaRegistrations, hasDirectLumaData },
    monthPreviousRange.start,
    monthPreviousRange.end,
  );
  const weekCurrent = getSnapshot(
    { adsRows: adState.normalizedRows, paidLeads, zoomDaily: zoomNetNew.daily, lumaRegistrations, hasDirectLumaData },
    weekCurrentRange.start,
    weekCurrentRange.end,
  );
  const weekPrevious = getSnapshot(
    { adsRows: adState.normalizedRows, paidLeads, zoomDaily: zoomNetNew.daily, lumaRegistrations, hasDirectLumaData },
    weekPreviousRange.start,
    weekPreviousRange.end,
  );

  const metricSnapshotRows = buildMetricSnapshotRows(monthCurrent, monthPrevious, weekCurrent, weekPrevious);
  const funnelStages = buildFunnelStages(monthCurrent);
  const leadQualityBreakdown = buildLeadQualityBreakdown(monthCurrent);
  const trendRows = buildTrendRows(primaryDate, adState.normalizedRows, leadBuckets.byDate, zoomNetNew.daily);
  const topAds = getTopAds(adAttributionRows);
  const bottomAds = getBottomAds(adAttributionRows);

  const hasHubSpotAttributionColumns = hubspotRows.some((row) => Object.prototype.hasOwnProperty.call(row, 'hs_latest_source'));
  const lumaZoomMatchRate = safeDivide(monthCurrent.lumaMatchedNetNewShowUps, monthCurrent.lumaRegistrations);
  const lumaHubspotMatchRate = safeDivide(monthCurrent.lumaHubspotMatches, monthCurrent.lumaRegistrations);
  const drilldownWindows = {
    monthCurrent: { label: 'Current 30 Days', startKey: monthCurrentRange.start, endKey: monthCurrentRange.end },
    monthPrevious: { label: 'Previous 30 Days', startKey: monthPreviousRange.start, endKey: monthPreviousRange.end },
    weekCurrent: { label: 'Current 7 Days', startKey: weekCurrentRange.start, endKey: weekCurrentRange.end },
    weekPrevious: { label: 'Previous 7 Days', startKey: weekPreviousRange.start, endKey: weekPreviousRange.end },
    lookback: { label: 'Lookback Window', startKey: lookbackRange.start, endKey: lookbackRange.end },
  };
  const drilldownByWindow = Object.entries(drilldownWindows).reduce((acc, [key, range]) => {
    acc[key] = buildWindowDrilldown({
      startKey: range.startKey,
      endKey: range.endKey,
      adsRows: adState.normalizedRows,
      paidLeads,
      lumaRegistrations,
      zoomSessions: zoomNetNew.sessions || [],
      hasDirectLumaData,
    });
    return acc;
  }, {});
  const drilldownMetricLabels = {
    impressions: 'Impressions',
    clicks: 'Clicks',
    leads: 'Leads Captured',
    registrations: 'Registrations',
    showups: 'Net New Show-Ups',
    standard: 'Standard Leads',
    qualified: 'Qualified Leads',
    great: 'Great Leads',
    cpl: 'CPL',
    cpql: 'CPQL',
    cpgl: 'CPGL',
    cost_per_showup: 'Cost Per Show-Up',
    cost_per_registration: 'Cost Per Registration',
    luma_zoom_matches: 'Lu.ma Matched in Zoom',
    luma_zoom_net_new_matches: 'Lu.ma Matched Net New',
    luma_hubspot_matches: 'Lu.ma Matched in HubSpot',
  };
  const dataAvailability = {
    hasDirectLumaData,
    hasHubSpotAttributionColumns,
    attributionLeadCoverage: safeDivide(attributionTotals.attributedLeadsTotal, paidLeads.length),
    lumaRegistrationsCurrent: monthCurrent.lumaRegistrations,
    lumaZoomMatchRate,
    lumaHubspotMatchRate,
  };

  const analysis = {
    headline: buildHeadline(monthCurrent, monthPrevious, topAds, bottomAds),
    metricSnapshotRows,
    funnelStages,
    recommendations: buildRecommendations(
      monthCurrent,
      monthPrevious,
      topAds,
      bottomAds,
      funnelStages,
      zoomNetNew,
    ),
    alerts: buildAlerts(monthCurrent, monthPrevious, weekCurrent, weekPrevious, dataAvailability),
  };

  return {
    generatedAt: new Date().toISOString(),
    windows: {
      lookbackStart,
      primaryDate,
      monthCurrentRange,
      monthPreviousRange,
      weekCurrentRange,
      weekPreviousRange,
      lookbackRange,
    },
    dataAvailability,
    current: monthCurrent,
    previous: monthPrevious,
    weekCurrent,
    weekPrevious,
    costCards: [
      { key: 'cpl', label: 'CPL', value: monthCurrent.costs.cpl, previous: monthPrevious.costs.cpl },
      { key: 'cpql', label: 'CPQL', value: monthCurrent.costs.cpql, previous: monthPrevious.costs.cpql },
      { key: 'cpgl', label: 'CPGL', value: monthCurrent.costs.cpgl, previous: monthPrevious.costs.cpgl },
      { key: 'cost_per_showup', label: 'Cost Per Show-Up', value: monthCurrent.costs.costPerShowUp, previous: monthPrevious.costs.costPerShowUp },
      { key: 'cost_per_registration', label: 'Cost Per Registration', value: monthCurrent.costs.costPerRegistration, previous: monthPrevious.costs.costPerRegistration },
    ],
    funnelStages,
    leadQualityBreakdown,
    showUpTracker: {
      rows: trendRows,
      totalTuesday: zoomNetNew.totalTuesday,
      totalThursday: zoomNetNew.totalThursday,
      tuesdaySessions: zoomNetNew.tuesdaySessions,
      thursdaySessions: zoomNetNew.thursdaySessions,
      averageTuesday: safeDivide(zoomNetNew.totalTuesday, zoomNetNew.tuesdaySessions),
      averageThursday: safeDivide(zoomNetNew.totalThursday, zoomNetNew.thursdaySessions),
    },
    thursdayLumaFunnel: {
      registrations: monthCurrent.lumaRegistrations,
      zoomMatches: monthCurrent.lumaMatchedShowUps,
      zoomNetNewMatches: monthCurrent.lumaMatchedNetNewShowUps,
      hubspotMatches: monthCurrent.lumaHubspotMatches,
      regToShowRate: monthCurrent.conversions.registrationToShowUp,
    },
    adAttributionRows,
    topAds,
    bottomAds,
    drilldowns: {
      defaultWindowKey: 'monthCurrent',
      defaultMetricKey: 'leads',
      windows: drilldownWindows,
      byWindow: drilldownByWindow,
      metricLabels: drilldownMetricLabels,
    },
    analysis,
    helpers: {
      round,
      safeDivide,
    },
  };
}



