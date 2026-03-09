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

const OFFICIAL_QUALIFIED_MIN_REVENUE = 250_000;
const FALLBACK_QUALIFIED_MIN_REVENUE = OFFICIAL_QUALIFIED_MIN_REVENUE;

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;

    const negativeFromParens = /^\(.*\)$/.test(raw);
    let normalized = raw
      .replace(/[,\s$]/g, '')
      .replace(/usd/ig, '')
      .trim();

    if (negativeFromParens) {
      normalized = normalized.replace(/[()]/g, '');
      normalized = `-${normalized}`;
    }

    const suffixMatch = normalized.match(/^([-+]?\d*\.?\d+)([kmb])$/i);
    if (suffixMatch) {
      const base = Number(suffixMatch[1]);
      const suffix = String(suffixMatch[2]).toLowerCase();
      const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1_000_000_000;
      const parsed = base * multiplier;
      return Number.isFinite(parsed) ? parsed : null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

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
  // Backward-compatible behavior for existing tiering/analytics code:
  // return official revenue when present, otherwise numeric fallback revenue.
  return extractRevenueSignals(input).effectiveRevenue;
}

export function parseFallbackRevenue(input) {
  return extractRevenueSignals(input).fallbackRevenue;
}

export function extractRevenueSignals(input) {
  if (input === null || input === undefined) {
    return { officialRevenue: null, fallbackRevenue: null, effectiveRevenue: null };
  }

  if (typeof input !== 'object') {
    const parsed = toNumberOrNull(input);
    return { officialRevenue: parsed, fallbackRevenue: null, effectiveRevenue: parsed };
  }

  let officialRevenue = null;
  for (const field of OFFICIAL_REVENUE_FIELDS) {
    const parsed = toNumberOrNull(input?.[field]);
    if (parsed !== null) {
      officialRevenue = parsed;
      break;
    }
  }

  let fallbackRevenue = null;
  for (const field of NUMERIC_REVENUE_FALLBACK_FIELDS) {
    const parsed = toNumberOrNull(input?.[field]);
    if (parsed !== null) {
      fallbackRevenue = parsed;
      break;
    }
  }

  const effectiveRevenue = officialRevenue ?? fallbackRevenue;
  return { officialRevenue, fallbackRevenue, effectiveRevenue };
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
  return evaluateLeadQualification({ revenue, sobrietyDate, referenceDate }).qualified;
}

export function evaluateLeadQualification({
  revenue,
  sobrietyDate,
  referenceDate = new Date(),
}) {
  const { officialRevenue, fallbackRevenue, effectiveRevenue } = extractRevenueSignals(revenue);
  const sobrietyEligible = hasOneYearSobrietyByDate(sobrietyDate, referenceDate);
  const hasOfficialRevenue = officialRevenue !== null;
  const officialQualified = officialRevenue !== null && officialRevenue >= OFFICIAL_QUALIFIED_MIN_REVENUE;
  const fallbackQualified = !hasOfficialRevenue
    && fallbackRevenue !== null
    && fallbackRevenue >= FALLBACK_QUALIFIED_MIN_REVENUE;
  const qualifiedFromRevenue = officialQualified || fallbackQualified;
  const qualified = sobrietyEligible && qualifiedFromRevenue;
  const qualificationBasis = qualified ? (officialQualified ? 'official' : 'fallback') : null;

  return {
    qualified,
    qualificationBasis,
    qualifiedFromRevenue,
    officialQualified,
    fallbackQualified,
    sobrietyEligible,
    officialRevenue,
    fallbackRevenue,
    effectiveRevenue,
    thresholds: {
      official: OFFICIAL_QUALIFIED_MIN_REVENUE,
      fallback: FALLBACK_QUALIFIED_MIN_REVENUE,
    },
  };
}

export function leadQualityTierFromOfficialRevenue(revenue) {
  const value = extractRevenueSignals(revenue).effectiveRevenue;
  if (value === null) return 'unknown';
  if (value >= 1_000_000) return 'great';
  if (value >= 250_000) return 'good';
  if (value >= 100_000) return 'ok';
  return 'bad';
}

export function isQualifiedRevenueOnly(revenue) {
  const { officialRevenue, fallbackRevenue } = extractRevenueSignals(revenue);
  const hasOfficialRevenue = officialRevenue !== null;
  return (officialRevenue !== null && officialRevenue >= OFFICIAL_QUALIFIED_MIN_REVENUE)
    || (!hasOfficialRevenue && fallbackRevenue !== null && fallbackRevenue >= FALLBACK_QUALIFIED_MIN_REVENUE);
}

export {
  OFFICIAL_REVENUE_FIELDS,
  SOBRIETY_DATE_FIELDS,
  NUMERIC_REVENUE_FALLBACK_FIELDS,
  OFFICIAL_QUALIFIED_MIN_REVENUE,
  FALLBACK_QUALIFIED_MIN_REVENUE,
};
