const OFFICIAL_REVENUE_FIELDS = Object.freeze([
  'annual_revenue_in_usd_official',
  'annual_revenue_in_dollars__official_',
]);

const NUMERIC_REVENUE_FALLBACK_FIELDS = Object.freeze([
  'annual_revenue_in_dollars',
  'annual_revenue',
  'revenue',
]);

const SOBRIETY_DATE_FIELDS = Object.freeze([
  'sobriety_date',
  'sobriety_date__official_',
  'sober_date',
  'clean_date',
  'sobrietydate',
]);

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toUtcDayStart(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function addUtcYears(date, years) {
  if (!date || !Number.isFinite(years)) return null;
  const out = new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
  // Normalize leap-day/month-end overflow.
  if (out.getUTCMonth() !== date.getUTCMonth()) {
    return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth() + 1, 0));
  }
  return out;
}

export function parseOfficialRevenue(input) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object') return toNumberOrNull(input);

  for (const field of OFFICIAL_REVENUE_FIELDS) {
    const parsed = toNumberOrNull(input?.[field]);
    if (parsed !== null) return parsed;
  }

  // Official revenue is canonical; if it is missing, allow numeric fallback fields.
  for (const field of NUMERIC_REVENUE_FALLBACK_FIELDS) {
    const parsed = toNumberOrNull(input?.[field]);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function parseSobrietyDate(input) {
  let raw = input;
  if (input && typeof input === 'object' && !(input instanceof Date)) {
    raw = null;
    for (const field of SOBRIETY_DATE_FIELDS) {
      const candidate = input?.[field];
      if (candidate !== null && candidate !== undefined && String(candidate).trim() !== '') {
        raw = candidate;
        break;
      }
    }
  }

  if (raw === null || raw === undefined || raw === '') return null;
  const text = String(raw).trim();
  if (!text || text.toLowerCase() === 'not found') return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return toUtcDayStart(`${text}T00:00:00.000Z`);
  }

  const mmddyyyy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const mm = String(mmddyyyy[1]).padStart(2, '0');
    const dd = String(mmddyyyy[2]).padStart(2, '0');
    const yyyy = String(mmddyyyy[3]).padStart(4, '0');
    return toUtcDayStart(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  }

  return toUtcDayStart(text);
}

export function hasOneYearSobrietyByDate(sobrietyDateInput, referenceDate = new Date()) {
  const sobrietyDate = parseSobrietyDate(sobrietyDateInput);
  const reference = toUtcDayStart(referenceDate);
  if (!sobrietyDate || !reference) return false;
  const anniversary = addUtcYears(sobrietyDate, 1);
  return !!anniversary && anniversary.getTime() <= reference.getTime();
}

export function isQualifiedLead({
  revenue,
  sobrietyDate,
  referenceDate = new Date(),
}) {
  const revenueValue = parseOfficialRevenue(revenue);
  if (revenueValue === null || revenueValue < 250_000) return false;
  return hasOneYearSobrietyByDate(sobrietyDate, referenceDate);
}

export function leadQualityTierFromOfficialRevenue(revenue) {
  const value = parseOfficialRevenue(revenue);
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

export { OFFICIAL_REVENUE_FIELDS, SOBRIETY_DATE_FIELDS, NUMERIC_REVENUE_FALLBACK_FIELDS };
