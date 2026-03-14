import { describe, it, expect } from 'vitest';
import {
  buildLeadsConfidenceSummary,
  DEFAULT_LEADS_CONFIDENCE_THRESHOLDS,
} from './leadsConfidenceModel';

describe('buildLeadsConfidenceSummary', () => {
  it('returns high integrity when all metrics pass', () => {
    const result = buildLeadsConfidenceSummary({
      has_direct_luma_data: true,
      has_hubspot_attribution_columns: true,
      match_rate: 0.9,
      hubspot_call_coverage_rate: 0.8,
      luma_hubspot_match_rate: 0.85,
      stale_days: 1,
      total_attendance_rows: 50,
      unknown_or_other_good_members: 2,
    });
    expect(result.integrity_level).toBe('high');
    expect(result.blockers).toHaveLength(0);
    expect(result.confidence_score).toBe(100);
  });

  it('returns low integrity when match_rate is below threshold', () => {
    const result = buildLeadsConfidenceSummary({
      match_rate: 0.5,
      total_attendance_rows: 50,
    });
    expect(result.integrity_level).toBe('low');
    expect(result.blockers.some((b) => b.code === 'low_match_rate')).toBe(true);
  });

  it('returns low integrity when luma data is missing', () => {
    const result = buildLeadsConfidenceSummary({
      has_direct_luma_data: false,
      total_attendance_rows: 50,
    });
    expect(result.integrity_level).toBe('low');
    expect(result.blockers.some((b) => b.code === 'missing_luma_data')).toBe(true);
  });

  it('returns low integrity when hubspot attribution columns missing', () => {
    const result = buildLeadsConfidenceSummary({
      has_hubspot_attribution_columns: false,
      total_attendance_rows: 50,
    });
    expect(result.integrity_level).toBe('low');
    expect(result.blockers.some((b) => b.code === 'missing_hubspot_attribution_columns')).toBe(true);
  });

  it('returns low integrity when data is stale', () => {
    const result = buildLeadsConfidenceSummary({
      stale_days: 10,
      total_attendance_rows: 50,
    });
    expect(result.integrity_level).toBe('low');
    expect(result.blockers.some((b) => b.code === 'stale_data')).toBe(true);
  });

  it('returns medium integrity for medium-severity-only issues', () => {
    const result = buildLeadsConfidenceSummary({
      has_direct_luma_data: true,
      luma_hubspot_match_rate: 0.3,
      total_attendance_rows: 50,
    });
    expect(result.integrity_level).toBe('medium');
    expect(result.blockers.some((b) => b.code === 'low_luma_hubspot_match_rate')).toBe(true);
  });

  it('flags low hubspot call coverage', () => {
    const result = buildLeadsConfidenceSummary({
      hubspot_call_coverage_rate: 0.3,
      total_attendance_rows: 50,
    });
    expect(result.blockers.some((b) => b.code === 'low_hubspot_call_coverage')).toBe(true);
  });

  it('flags high unknown source share', () => {
    const result = buildLeadsConfidenceSummary({
      unknown_or_other_good_members: 20,
      total_attendance_rows: 50,
    });
    expect(result.blockers.some((b) => b.code === 'high_unknown_source_share')).toBe(true);
  });

  it('flags low sample size', () => {
    const result = buildLeadsConfidenceSummary({
      total_attendance_rows: 5,
    });
    expect(result.blockers.some((b) => b.code === 'low_sample_size')).toBe(true);
  });

  it('returns high integrity with empty input (defaults)', () => {
    const result = buildLeadsConfidenceSummary({});
    // No numeric metrics provided → no blockers triggered (booleans default to true)
    expect(result.integrity_level).toBe('high');
  });

  it('includes diagnostics with thresholds and normalized inputs', () => {
    const result = buildLeadsConfidenceSummary({ match_rate: 0.9, total_attendance_rows: 50 });
    expect(result.diagnostics.thresholds).toEqual(DEFAULT_LEADS_CONFIDENCE_THRESHOLDS);
    expect(result.diagnostics.normalized_inputs.match_rate).toBe(0.9);
  });

  it('supports camelCase input paths', () => {
    const result = buildLeadsConfidenceSummary({
      hasDirectLumaData: false,
      totalAttendanceRows: 50,
    });
    expect(result.blockers.some((b) => b.code === 'missing_luma_data')).toBe(true);
  });

  it('supports nested input paths', () => {
    const result = buildLeadsConfidenceSummary({
      data_availability: { has_direct_luma_data: false },
      total_attendance_rows: 50,
    });
    expect(result.blockers.some((b) => b.code === 'missing_luma_data')).toBe(true);
  });

  it('multiple blockers accumulate correctly', () => {
    const result = buildLeadsConfidenceSummary({
      has_direct_luma_data: false,
      has_hubspot_attribution_columns: false,
      match_rate: 0.3,
      stale_days: 10,
      total_attendance_rows: 5,
    });
    expect(result.blockers.length).toBeGreaterThanOrEqual(4);
    expect(result.integrity_level).toBe('low');
  });
});
