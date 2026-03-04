export const LEAD_TIER_THRESHOLDS = Object.freeze({
  ok: 100_000,
  qualified: 250_000,
  great: 1_000_000,
});

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toUtcDayStart(dateLike) {
  if (!dateLike) return null;
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function normalizeFunnelKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'free' || key === 'phoenix' || key === 'donation') return key;
  return key || 'unknown';
}

export function isPhoenixText(value) {
  return String(value || '').toLowerCase().includes('phoenix');
}

export function classifyAdFunnel(row, { defaultFunnel = 'free' } = {}) {
  const explicit = normalizeFunnelKey(row?.funnel_key);
  if (explicit === 'phoenix' || explicit === 'free' || explicit === 'donation') return explicit;

  const blob = [
    row?.campaign_name,
    row?.adset_name,
    row?.ad_name,
    row?.ad_account_id,
    row?.funnel_key,
  ].join(' ').toLowerCase();

  if (blob.includes('phoenix') || blob.includes('forum') || blob.includes('1034775818463907')) return 'phoenix';
  if (blob.includes('donat')) return 'donation';
  return defaultFunnel;
}

export function isPaidSocialHubspotContact(row) {
  const sourceBlob = [
    row?.hs_analytics_source,
    row?.hs_latest_source,
    row?.original_traffic_source,
  ].join(' ').toUpperCase();
  return sourceBlob.includes('PAID_SOCIAL');
}

export function isPhoenixHubspotContact(row) {
  const blob = [
    row?.hs_analytics_source_data_2,
    row?.hs_latest_source_data_2,
    row?.campaign,
    row?.campaign_source,
    row?.membership_s,
  ].join(' ').toLowerCase();
  return blob.includes('phoenix');
}

export function resolveHubspotOfficialRevenue(row) {
  const candidates = [
    row?.annual_revenue_in_dollars__official_,
    row?.annual_revenue_in_usd_official,
  ];
  for (const value of candidates) {
    const n = toFiniteNumber(value);
    if (n !== null) return n;
  }
  return null;
}

export function resolveHubspotRevenue(row) {
  const official = resolveHubspotOfficialRevenue(row);
  if (official !== null) return official;
  return toFiniteNumber(row?.annual_revenue_in_dollars);
}

export function parseHubspotSobrietyDateUtc(row) {
  const raw = row?.sobriety_date ?? row?.sobriety_date__official_ ?? null;
  const parsed = toUtcDayStart(raw);
  return parsed || null;
}

export function addUtcYears(date, years) {
  if (!date) return null;
  const out = new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
  if (out.getUTCMonth() !== date.getUTCMonth()) {
    return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth() + 1, 0));
  }
  return out;
}

export function isSoberAtLeastYearsOnDate(row, dateLike, years = 1) {
  const targetDay = toUtcDayStart(dateLike);
  const sobriety = parseHubspotSobrietyDateUtc(row);
  if (!targetDay || !sobriety) return false;
  const anniversary = addUtcYears(sobriety, years);
  return !!anniversary && anniversary.getTime() <= targetDay.getTime();
}

export function leadTierFromRevenue(value) {
  if (value === null || value === undefined || value === '') return 'unknown';
  const revenue = toFiniteNumber(value);
  if (revenue === null) return 'unknown';
  if (revenue >= LEAD_TIER_THRESHOLDS.great) return 'great';
  if (revenue >= LEAD_TIER_THRESHOLDS.qualified) return 'qualified';
  if (revenue >= LEAD_TIER_THRESHOLDS.ok) return 'ok';
  return 'bad';
}
