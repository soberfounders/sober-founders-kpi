import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLeadQualification } from '../src/lib/leadsQualificationRules.js';

const REFERENCE_DATE = new Date('2026-03-09T00:00:00.000Z');

test('official revenue >= 250k with sobriety > 1 year qualifies (official basis)', () => {
  const result = evaluateLeadQualification({
    revenue: {
      annual_revenue_in_dollars__official_: 275000,
      annual_revenue_in_dollars: 150000,
    },
    sobrietyDate: '2024-01-01',
    referenceDate: REFERENCE_DATE,
  });

  assert.equal(result.qualified, true);
  assert.equal(result.qualificationBasis, 'official');
});

test('exactly 1 year sobriety does not qualify', () => {
  const result = evaluateLeadQualification({
    revenue: {
      annual_revenue_in_dollars__official_: 275000,
    },
    sobrietyDate: '2025-03-09',
    referenceDate: REFERENCE_DATE,
  });

  assert.equal(result.qualified, false);
  assert.equal(result.sobrietyEligible, false);
});

test('1 year and 1 day sobriety qualifies', () => {
  const result = evaluateLeadQualification({
    revenue: {
      annual_revenue_in_dollars__official_: 275000,
    },
    sobrietyDate: '2025-03-08',
    referenceDate: REFERENCE_DATE,
  });

  assert.equal(result.qualified, true);
  assert.equal(result.sobrietyEligible, true);
});

test('official below 250k does not qualify even when fallback is higher', () => {
  const result = evaluateLeadQualification({
    revenue: {
      annual_revenue_in_dollars__official_: 225000,
      annual_revenue_in_dollars: '$420,000',
    },
    sobrietyDate: '2023-12-31',
    referenceDate: REFERENCE_DATE,
  });

  assert.equal(result.qualified, false);
  assert.equal(result.qualificationBasis, null);
});

test('fallback below 250k does not qualify', () => {
  const result = evaluateLeadQualification({
    revenue: {
      annual_revenue_in_dollars__official_: null,
      annual_revenue_in_dollars: '199,999',
    },
    sobrietyDate: '2020-05-05',
    referenceDate: REFERENCE_DATE,
  });

  assert.equal(result.qualified, false);
  assert.equal(result.qualificationBasis, null);
});

test('fallback >= 250k qualifies when official revenue is missing', () => {
  const result = evaluateLeadQualification({
    revenue: {
      annual_revenue_in_dollars__official_: null,
      annual_revenue_in_dollars: '$250,000',
    },
    sobrietyDate: '2020-05-05',
    referenceDate: REFERENCE_DATE,
  });

  assert.equal(result.qualified, true);
  assert.equal(result.qualificationBasis, 'fallback');
});

test('sobriety under 1 year blocks qualification even with high revenue', () => {
  const result = evaluateLeadQualification({
    revenue: {
      annual_revenue_in_dollars__official_: 500000,
    },
    sobrietyDate: '2025-12-01',
    referenceDate: REFERENCE_DATE,
  });

  assert.equal(result.qualified, false);
  assert.equal(result.sobrietyEligible, false);
});
