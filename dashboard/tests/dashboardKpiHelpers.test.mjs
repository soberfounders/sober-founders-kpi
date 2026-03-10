import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KPI_DIRECTION,
  buildCompletedWeekWindows,
  buildDirectionalComparison,
  countInterviewUniqueAttendees,
  createMeetingNameMatcher,
  formatCurrency,
  normalizeInterviewActivities,
} from '../src/lib/dashboardKpiHelpers.js';

test('formatCurrency always renders two decimal places', () => {
  assert.equal(formatCurrency(12), '$12.00');
  assert.equal(formatCurrency(12.3), '$12.30');
  assert.equal(formatCurrency(12.345), '$12.35');
});

test('buildDirectionalComparison marks lower cost as better', () => {
  const comparison = buildDirectionalComparison({
    label: 'vs Last Week',
    current: 30,
    baseline: 42,
    format: 'currency',
    direction: KPI_DIRECTION.LOWER_IS_BETTER,
  });

  assert.equal(comparison.tone, 'better');
  assert.equal(comparison.display, '-$12.00 (-28.6%)');
});

test('buildDirectionalComparison marks lower volume as worse', () => {
  const comparison = buildDirectionalComparison({
    label: 'vs Last Week',
    current: 9,
    baseline: 12,
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
  });

  assert.equal(comparison.tone, 'worse');
  assert.equal(comparison.display, '-3 (-25.0%)');
});

test('buildCompletedWeekWindows excludes current week', () => {
  const windows = buildCompletedWeekWindows('2026-03-11');
  assert.equal(windows.lastWeek.start, '2026-03-02');
  assert.equal(windows.lastWeek.end, '2026-03-08');
  assert.equal(windows.lastFourCompletedWeeks.length, 4);
  assert.equal(windows.lastFourCompletedWeeks[3].start, '2026-02-09');
});

test('free group interviews count unique attendees by meeting name', () => {
  const rawActivities = [
    {
      hubspot_activity_id: 101,
      hs_timestamp: '2026-03-03T18:00:00.000Z',
      title: 'Sober Founders Intro Meeting',
      metadata: { attendees: [{ name: 'Cassandra J Mann' }] },
    },
    {
      hubspot_activity_id: 102,
      hs_timestamp: '2026-03-04T18:00:00.000Z',
      title: 'Sober Founders Intro Meeting',
      metadata: { attendees: [{ name: 'Brian Harvey' }] },
    },
    {
      hubspot_activity_id: 103,
      hs_timestamp: '2026-03-05T18:00:00.000Z',
      title: 'Sober Founders Intro Meeting',
      metadata: { attendees: [{ name: 'Cassandra J Mann' }] },
    },
    {
      hubspot_activity_id: 104,
      hs_timestamp: '2026-03-06T18:00:00.000Z',
      title: 'Different Meeting',
      metadata: { attendees: [{ name: 'Not Counted' }] },
    },
  ];

  const normalized = normalizeInterviewActivities(rawActivities);
  const matcher = createMeetingNameMatcher('Sober Founders Intro Meeting');
  const count = countInterviewUniqueAttendees(normalized, {
    start: '2026-03-02',
    end: '2026-03-08',
  }, matcher);

  assert.equal(count, 2);
});

test('free group interviews dedupe attendees inferred from title when metadata names are missing', () => {
  const rawActivities = [
    {
      hubspot_activity_id: 201,
      hs_timestamp: '2026-03-03T18:00:00.000Z',
      title: 'Cassandra J Mann Sober Founders Intro Meeting',
      metadata: { archived: false, object_type: 'meetings' },
    },
    {
      hubspot_activity_id: 202,
      hs_timestamp: '2026-03-04T18:00:00.000Z',
      title: 'Brian Harvey Sober Founders Intro Meeting',
      metadata: { archived: false, object_type: 'meetings' },
    },
    {
      hubspot_activity_id: 203,
      hs_timestamp: '2026-03-05T18:00:00.000Z',
      title: 'Cassandra J Mann Sober Founders Intro Meeting',
      metadata: { archived: false, object_type: 'meetings' },
    },
  ];

  const normalized = normalizeInterviewActivities(rawActivities);
  const matcher = createMeetingNameMatcher('Sober Founders Intro Meeting');
  const count = countInterviewUniqueAttendees(normalized, {
    start: '2026-03-02',
    end: '2026-03-08',
  }, matcher);

  assert.equal(count, 2);
});
