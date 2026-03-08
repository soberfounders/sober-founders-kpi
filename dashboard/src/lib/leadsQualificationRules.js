const OFFICIAL_REVENUE_FIELDS = Object.freeze([
  'annual_revenue_in_usd_official',
  'annual_revenue_in_dollars__official_',
]);

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseOfficialRevenue(contact) {
  if (!contact || typeof contact !== 'object') return null;
  for (const field of OFFICIAL_REVENUE_FIELDS) {
    const parsed = toNumberOrNull(contact?.[field]);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function leadQualityTierFromOfficialRevenue(revenue) {
  const value = toNumberOrNull(revenue);
  if (value === null) return 'unknown';
  if (value >= 1_000_000) return 'great';
  if (value >= 250_000) return 'good';
  if (value >= 100_000) return 'ok';
  return 'bad';
}

export function isQualifiedRevenueOnly(revenue) {
  const value = toNumberOrNull(revenue);
  return value !== null && value >= 250_000;
}

export { OFFICIAL_REVENUE_FIELDS };
