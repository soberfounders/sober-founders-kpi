import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KPI_DIRECTION,
  buildCompletedWeekWindows,
  buildDirectionalComparison,
  countInterviewUniqueAttendees,
  createMeetingNameMatcher,
  createTokenMatcher,
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

// ── Regression: dual matcher for free group interviews ──────────────────────

test('legacy URL token still matches free group interview activities', () => {
  // Simulates older HubSpot records where the booking URL was stored in metadata
  // rather than "Sober Founders Intro Meeting" as the meeting title.
  const rawActivities = [
    {
      hubspot_activity_id: 301,
      hs_timestamp: '2026-03-03T18:00:00.000Z',
      title: 'Call with Alice Smith',
      metadata: {
        meeting_name: 'meetings.hubspot.com/andrew-lassise/interview',
        attendees: [{ name: 'Alice Smith' }],
      },
    },
    {
      hubspot_activity_id: 302,
      hs_timestamp: '2026-03-04T18:00:00.000Z',
      title: 'Call with Bob Jones',
      body_preview: 'Scheduled via meetings.hubspot.com/andrew-lassise/interview',
      metadata: { attendees: [{ name: 'Bob Jones' }] },
    },
    {
      hubspot_activity_id: 303,
      hs_timestamp: '2026-03-05T18:00:00.000Z',
      title: 'Unrelated Call',
      metadata: { attendees: [{ name: 'Charlie Brown' }] },
    },
  ];

  const normalized = normalizeInterviewActivities(rawActivities);
  const urlMatcher = createTokenMatcher(['meetings.hubspot.com/andrew-lassise/interview']);
  const count = countInterviewUniqueAttendees(normalized, {
    start: '2026-03-02',
    end: '2026-03-08',
  }, urlMatcher);

  // Alice (from meeting_name) + Bob (from body_preview) should match; Charlie should not.
  assert.equal(count, 2);
});

test('dual matcher catches both name-based and URL-based free group interviews', () => {
  const rawActivities = [
    {
      hubspot_activity_id: 401,
      hs_timestamp: '2026-03-03T18:00:00.000Z',
      title: 'Sober Founders Intro Meeting',
      metadata: { attendees: [{ name: 'New Format Person' }] },
    },
    {
      hubspot_activity_id: 402,
      hs_timestamp: '2026-03-04T18:00:00.000Z',
      title: 'Legacy Interview Call',
      metadata: {
        meeting_name: 'meetings.hubspot.com/andrew-lassise/interview',
        attendees: [{ name: 'Legacy Format Person' }],
      },
    },
  ];

  const normalized = normalizeInterviewActivities(rawActivities);
  const nameMatcher = createMeetingNameMatcher('Sober Founders Intro Meeting');
  const urlMatcher = createTokenMatcher(['meetings.hubspot.com/andrew-lassise/interview']);
  const dualMatcher = (row) => nameMatcher(row) || urlMatcher(row);

  const count = countInterviewUniqueAttendees(normalized, {
    start: '2026-03-02',
    end: '2026-03-08',
  }, dualMatcher);

  assert.equal(count, 2);
});

// ── buildDirectionalComparison edge cases ───────────────────────────────────

test('buildDirectionalComparison returns better tone and null pct when baseline is zero and current is non-zero', () => {
  const comparison = buildDirectionalComparison({
    label: 'vs Last Week',
    current: 5,
    baseline: 0,
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
  });

  // delta = 5 > 0 so tone should be 'better', but pct must be null (div by zero)
  assert.equal(comparison.tone, 'better');
  assert.equal(comparison.pct, null);
  // display should show the delta without a division-by-zero error
  assert.ok(comparison.display.startsWith('+5'), `expected display to start with '+5', got: ${comparison.display}`);
});

test('buildDirectionalComparison returns neutral when both current and baseline are zero', () => {
  const comparison = buildDirectionalComparison({
    label: 'vs Last Week',
    current: 0,
    baseline: 0,
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
  });

  assert.equal(comparison.tone, 'neutral');
  assert.equal(comparison.pct, 0);
});

// ── buildCompletedWeekWindows boundary ──────────────────────────────────────

test('buildCompletedWeekWindows lastWeek never overlaps current week when today is Monday', () => {
  // When today IS a Monday, last week should end on the previous Sunday.
  const windows = buildCompletedWeekWindows('2026-03-09'); // Monday
  assert.equal(windows.lastWeek.end, '2026-03-08');    // previous Sunday
  assert.equal(windows.lastWeek.start, '2026-03-02');
  // Verify lastWeek.end is strictly before current week start
  assert.ok(windows.lastWeek.end < '2026-03-09');
});
