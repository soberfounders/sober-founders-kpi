import { describe, it, expect } from 'vitest';
import {
  parseOfficialRevenue,
  parseSobrietyDate,
  hasOneYearSobrietyByDate,
  isQualifiedLead,
  isPhoenixQualifiedLead,
  evaluateLeadQualification,
  evaluatePhoenixQualification,
  leadQualityTierFromOfficialRevenue,
  extractRevenueSignals,
  isQualifiedRevenueOnly,
  OFFICIAL_QUALIFIED_MIN_REVENUE,
  PHOENIX_QUALIFIED_MIN_REVENUE,
} from './leadsQualificationRules';

// ---------------------------------------------------------------------------
// parseOfficialRevenue / extractRevenueSignals
// ---------------------------------------------------------------------------
describe('parseOfficialRevenue', () => {
  it('returns null for null/undefined input', () => {
    expect(parseOfficialRevenue(null)).toBe(null);
    expect(parseOfficialRevenue(undefined)).toBe(null);
  });

  it('parses a plain number', () => {
    expect(parseOfficialRevenue(500000)).toBe(500000);
  });

  it('parses a numeric string with currency symbols', () => {
    expect(parseOfficialRevenue('$1,250,000')).toBe(1250000);
  });

  it('parses suffix notation (k, m, b)', () => {
    expect(parseOfficialRevenue('500k')).toBe(500000);
    expect(parseOfficialRevenue('1.5M')).toBe(1500000);
    expect(parseOfficialRevenue('2B')).toBe(2000000000);
  });

  it('parses negative revenue from parentheses notation', () => {
    expect(parseOfficialRevenue('($100,000)')).toBe(-100000);
  });

  it('returns null for non-finite values', () => {
    expect(parseOfficialRevenue(NaN)).toBe(null);
    expect(parseOfficialRevenue(Infinity)).toBe(null);
    expect(parseOfficialRevenue('not a number')).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(parseOfficialRevenue('')).toBe(null);
  });

  it('prefers official revenue field over fallback when object input', () => {
    const input = {
      annual_revenue_in_usd_official: 300000,
      annual_revenue_in_dollars: 100000,
    };
    expect(parseOfficialRevenue(input)).toBe(300000);
  });

  it('falls back to numeric field when official is missing', () => {
    const input = { annual_revenue_in_dollars: 100000 };
    expect(parseOfficialRevenue(input)).toBe(100000);
  });
});

describe('extractRevenueSignals', () => {
  it('separates official from fallback revenue', () => {
    const result = extractRevenueSignals({
      annual_revenue_in_usd_official: 500000,
      annual_revenue_in_dollars: 200000,
    });
    expect(result.officialRevenue).toBe(500000);
    expect(result.fallbackRevenue).toBe(200000);
    expect(result.effectiveRevenue).toBe(500000);
  });

  it('uses fallback when official is missing', () => {
    const result = extractRevenueSignals({ annual_revenue: 200000 });
    expect(result.officialRevenue).toBe(null);
    expect(result.fallbackRevenue).toBe(200000);
    expect(result.effectiveRevenue).toBe(200000);
  });

  it('returns all null for null input', () => {
    const result = extractRevenueSignals(null);
    expect(result.officialRevenue).toBe(null);
    expect(result.fallbackRevenue).toBe(null);
    expect(result.effectiveRevenue).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// parseSobrietyDate
// ---------------------------------------------------------------------------
describe('parseSobrietyDate', () => {
  it('returns null for null/undefined/empty', () => {
    expect(parseSobrietyDate(null)).toBe(null);
    expect(parseSobrietyDate(undefined)).toBe(null);
    expect(parseSobrietyDate('')).toBe(null);
  });

  it('returns null for "Not Found" text', () => {
    expect(parseSobrietyDate('Not Found')).toBe(null);
    expect(parseSobrietyDate('not found')).toBe(null);
  });

  it('parses ISO date string (YYYY-MM-DD)', () => {
    const result = parseSobrietyDate('2020-06-15');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString().slice(0, 10)).toBe('2020-06-15');
  });

  it('parses US date format (MM/DD/YYYY)', () => {
    const result = parseSobrietyDate('6/15/2020');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString().slice(0, 10)).toBe('2020-06-15');
  });

  it('extracts sobriety_date from object input', () => {
    const result = parseSobrietyDate({ sobriety_date: '2020-01-01' });
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString().slice(0, 10)).toBe('2020-01-01');
  });

  it('handles leap year date Feb 29', () => {
    const result = parseSobrietyDate('2020-02-29');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString().slice(0, 10)).toBe('2020-02-29');
  });

  it('handles non-leap year Feb 29 gracefully', () => {
    // 2023 is not a leap year; Feb 29 should parse to Mar 1 or null
    const result = parseSobrietyDate('2023-02-29');
    // JS Date rolls over: 2023-02-29 → 2023-03-01
    if (result) {
      expect(result.toISOString().slice(0, 10)).toBe('2023-03-01');
    }
  });
});

// ---------------------------------------------------------------------------
// hasOneYearSobrietyByDate
// ---------------------------------------------------------------------------
describe('hasOneYearSobrietyByDate', () => {
  it('returns true when sobriety is more than 1 year ago', () => {
    expect(hasOneYearSobrietyByDate('2020-01-01', new Date('2022-01-02'))).toBe(true);
  });

  it('returns false on exact 1-year anniversary (strictly > 1 year required)', () => {
    expect(hasOneYearSobrietyByDate('2020-01-01', new Date('2021-01-01'))).toBe(false);
  });

  it('returns false when sobriety is less than 1 year ago', () => {
    expect(hasOneYearSobrietyByDate('2020-06-01', new Date('2021-01-01'))).toBe(false);
  });

  it('returns false for null sobriety date', () => {
    expect(hasOneYearSobrietyByDate(null)).toBe(false);
  });

  it('handles leap year sobriety date correctly', () => {
    // Sober on Feb 29, 2020; anniversary is Feb 28, 2021 (no Feb 29 in 2021)
    // Reference: Mar 1, 2021 — should be > 1 year
    expect(hasOneYearSobrietyByDate('2020-02-29', new Date('2021-03-01'))).toBe(true);
  });

  it('handles leap year boundary — just under 1 year', () => {
    // Sober on Feb 29, 2020; reference Feb 28, 2021 — should NOT be > 1 year
    expect(hasOneYearSobrietyByDate('2020-02-29', new Date('2021-02-28'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isQualifiedLead / evaluateLeadQualification
// ---------------------------------------------------------------------------
describe('isQualifiedLead', () => {
  const refDate = new Date('2025-01-15');

  it('returns true for revenue >= 250k and sobriety > 1 year', () => {
    expect(isQualifiedLead({
      revenue: 300000,
      sobrietyDate: '2023-01-01',
      referenceDate: refDate,
    })).toBe(true);
  });

  it('returns false when revenue is below threshold', () => {
    expect(isQualifiedLead({
      revenue: 100000,
      sobrietyDate: '2023-01-01',
      referenceDate: refDate,
    })).toBe(false);
  });

  it('returns false when sobriety is too recent', () => {
    expect(isQualifiedLead({
      revenue: 500000,
      sobrietyDate: '2024-06-01',
      referenceDate: refDate,
    })).toBe(false);
  });

  it('returns false for negative revenue', () => {
    expect(isQualifiedLead({
      revenue: -500000,
      sobrietyDate: '2020-01-01',
      referenceDate: refDate,
    })).toBe(false);
  });

  it('returns false for zero revenue', () => {
    expect(isQualifiedLead({
      revenue: 0,
      sobrietyDate: '2020-01-01',
      referenceDate: refDate,
    })).toBe(false);
  });

  it('returns false when both revenue and sobriety are null', () => {
    expect(isQualifiedLead({
      revenue: null,
      sobrietyDate: null,
      referenceDate: refDate,
    })).toBe(false);
  });
});

describe('evaluateLeadQualification', () => {
  const refDate = new Date('2025-01-15');

  it('returns full breakdown for a qualified lead', () => {
    const result = evaluateLeadQualification({
      revenue: { annual_revenue_in_usd_official: 500000 },
      sobrietyDate: '2023-01-01',
      referenceDate: refDate,
    });
    expect(result.qualified).toBe(true);
    expect(result.qualificationBasis).toBe('official');
    expect(result.officialQualified).toBe(true);
    expect(result.sobrietyEligible).toBe(true);
    expect(result.thresholds.official).toBe(OFFICIAL_QUALIFIED_MIN_REVENUE);
  });

  it('uses fallback revenue when official is missing', () => {
    const result = evaluateLeadQualification({
      revenue: { annual_revenue_in_dollars: 300000 },
      sobrietyDate: '2023-01-01',
      referenceDate: refDate,
    });
    expect(result.qualified).toBe(true);
    expect(result.qualificationBasis).toBe('fallback');
    expect(result.officialQualified).toBe(false);
    expect(result.fallbackQualified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isPhoenixQualifiedLead / evaluatePhoenixQualification
// ---------------------------------------------------------------------------
describe('isPhoenixQualifiedLead', () => {
  const refDate = new Date('2025-01-15');

  it('returns true for revenue >= 1M and sobriety > 1 year', () => {
    expect(isPhoenixQualifiedLead({
      revenue: 1500000,
      sobrietyDate: '2023-01-01',
      referenceDate: refDate,
    })).toBe(true);
  });

  it('returns false for revenue between 250k and 1M', () => {
    expect(isPhoenixQualifiedLead({
      revenue: 500000,
      sobrietyDate: '2023-01-01',
      referenceDate: refDate,
    })).toBe(false);
  });

  it('returns false without sobriety', () => {
    expect(isPhoenixQualifiedLead({
      revenue: 2000000,
      sobrietyDate: null,
      referenceDate: refDate,
    })).toBe(false);
  });
});

describe('evaluatePhoenixQualification', () => {
  it('includes threshold in result', () => {
    const result = evaluatePhoenixQualification({
      revenue: 2000000,
      sobrietyDate: '2020-01-01',
      referenceDate: new Date('2025-01-15'),
    });
    expect(result.phoenixQualified).toBe(true);
    expect(result.threshold).toBe(PHOENIX_QUALIFIED_MIN_REVENUE);
  });
});

// ---------------------------------------------------------------------------
// leadQualityTierFromOfficialRevenue
// ---------------------------------------------------------------------------
describe('leadQualityTierFromOfficialRevenue', () => {
  it('returns "great" for >= 1M', () => {
    expect(leadQualityTierFromOfficialRevenue(1000000)).toBe('great');
    expect(leadQualityTierFromOfficialRevenue(5000000)).toBe('great');
  });

  it('returns "good" for 250k–999k', () => {
    expect(leadQualityTierFromOfficialRevenue(250000)).toBe('good');
    expect(leadQualityTierFromOfficialRevenue(999999)).toBe('good');
  });

  it('returns "ok" for 100k–249k', () => {
    expect(leadQualityTierFromOfficialRevenue(100000)).toBe('ok');
    expect(leadQualityTierFromOfficialRevenue(249999)).toBe('ok');
  });

  it('returns "bad" for < 100k', () => {
    expect(leadQualityTierFromOfficialRevenue(50000)).toBe('bad');
    expect(leadQualityTierFromOfficialRevenue(0)).toBe('bad');
  });

  it('returns "unknown" for null/undefined', () => {
    expect(leadQualityTierFromOfficialRevenue(null)).toBe('unknown');
    expect(leadQualityTierFromOfficialRevenue(undefined)).toBe('unknown');
  });

  it('handles negative revenue as "bad"', () => {
    expect(leadQualityTierFromOfficialRevenue(-100000)).toBe('bad');
  });
});

// ---------------------------------------------------------------------------
// isQualifiedRevenueOnly
// ---------------------------------------------------------------------------
describe('isQualifiedRevenueOnly', () => {
  it('returns true for revenue >= 250k (no sobriety check)', () => {
    expect(isQualifiedRevenueOnly(300000)).toBe(true);
  });

  it('returns false for revenue < 250k', () => {
    expect(isQualifiedRevenueOnly(100000)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isQualifiedRevenueOnly(null)).toBe(false);
  });
});
