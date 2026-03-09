import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLeadsQualificationSnapshot,
  buildAttendanceNorthStarSnapshot,
  buildUnifiedKpiSnapshot,
} from '../src/lib/kpiSnapshot.js';

const REFERENCE_DATE = new Date('2026-03-09T00:00:00.000Z');

test('leads snapshot exposes qualified counts and qualification basis breakdown', () => {
  const leads = buildLeadsQualificationSnapshot({
    spend: 10000,
    referenceDate: REFERENCE_DATE,
    leadRows: [
      {
        annual_revenue_in_dollars__official_: 300000,
        sobrietyDate: '2022-01-01',
      },
      {
        annual_revenue_in_dollars__official_: null,
        annual_revenue_in_dollars: '$300,000',
        sobrietyDate: '2021-06-01',
      },
      {
        annual_revenue_in_dollars__official_: 200000,
        annual_revenue_in_dollars: 95000,
        sobrietyDate: '2020-04-01',
      },
    ],
  });

  assert.equal(leads.total_count, 3);
  assert.equal(leads.qualified_count, 2);
  assert.equal(leads.qualification_basis.official_qualified_count, 1);
  assert.equal(leads.qualification_basis.fallback_qualified_count, 1);
  assert.equal(leads.qualification_basis.fallback_share_pct, 0.5);
  assert.equal(leads.cpql_estimate, 5000);
});

test('unified snapshot keeps contract fields for leads, attendance, and source lineage', () => {
  const attendance = buildAttendanceNorthStarSnapshot({
    analytics: {
      stats: { uniqueTue: 12, uniqueThu: 15 },
      sessions: [{ newCount: 3 }, { newCount: 4 }],
      people: [{ visits: 2 }, { visits: 4 }],
    },
  });

  const snapshot = buildUnifiedKpiSnapshot({
    generatedAt: '2026-03-09T10:00:00.000Z',
    lookbackDays: 90,
    sourceLineage: [
      { key: 'hubspot', row_count: 100, latest_date: '2026-03-08' },
      { key: 'meta', row_count: 80, latest_date: '2026-03-01' },
    ],
    leads: {
      qualified_count: 20,
      qualified_pct: 0.4,
      qualification_basis: {
        official_qualified_count: 12,
        fallback_qualified_count: 8,
        fallback_share_pct: 0.4,
      },
    },
    attendance,
    dashboard: {
      sessions_7d: 100,
    },
  });

  assert.equal(snapshot.meta.generated_at, '2026-03-09T10:00:00.000Z');
  assert.equal(snapshot.meta.lookback_days, 90);
  assert.equal(Array.isArray(snapshot.meta.sources), true);
  assert.equal(snapshot.meta.sources.length, 2);
  assert.equal(snapshot.leads.qualified_count, 20);
  assert.equal(snapshot.leads.qualification_basis.fallback_qualified_count, 8);
  assert.equal(snapshot.attendance.tuesday_count, 12);
  assert.equal(snapshot.attendance.thursday_count, 15);
  assert.equal(snapshot.attendance.new_attendees_count, 7);
  assert.equal(snapshot.dashboard.sessions_7d, 100);
});
