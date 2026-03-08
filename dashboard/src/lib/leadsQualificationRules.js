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

export function parseSobrietyDateKey(value) {
  const text = String(value || '').trim();
  if (!text || text.toLowerCase() === 'not found') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const mmddyyyy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const mm = String(mmddyyyy[1]).padStart(2, '0');
    const dd = String(mmddyyyy[2]).padStart(2, '0');
    const yyyy = mmddyyyy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function daysBetweenDateKeys(laterDateKey, earlierDateKey) {
  const later = new Date(`${laterDateKey}T00:00:00.000Z`);
  const earlier = new Date(`${earlierDateKey}T00:00:00.000Z`);
  if (Number.isNaN(later.getTime()) || Number.isNaN(earlier.getTime())) return null;
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

export function isQualifiedRevenueWithSobriety(revenue, sobrietyDateValue, asOfDateKey) {
  if (!isQualifiedRevenueOnly(revenue)) return false;
  const sobrietyDateKey = parseSobrietyDateKey(sobrietyDateValue);
  const asOfKey = parseSobrietyDateKey(asOfDateKey);
  if (!sobrietyDateKey || !asOfKey) return false;
  const sobrietyDays = daysBetweenDateKeys(asOfKey, sobrietyDateKey);
  return Number.isFinite(sobrietyDays) && sobrietyDays >= 365;
}

export { OFFICIAL_REVENUE_FIELDS };
