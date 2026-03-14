import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import KPICard from '../components/KPICard';
import SendToNotionModal from '../components/SendToNotionModal';
import notionLogo from '../assets/notion-logo.png';
import { supabase } from '../lib/supabaseClient';
import { DASHBOARD_LOOKBACK_DAYS } from '../lib/env';
import { evaluateLeadQualification, isPhoenixQualifiedLead, parseOfficialRevenue } from '../lib/leadsQualificationRules';
import {
  buildDateRangeWindows,
} from '../lib/leadsGroupAnalytics';
import {
  KPI_DIRECTION,
  addDays,
  averageFinite,
  buildCompletedWeekWindows,
  buildDirectionalComparison,
  countInterviewUniqueAttendees,
  createMeetingNameMatcher,
  createTokenMatcher,
  dateInRange,
  directionToneForDelta,
  formatCurrency,
  formatDecimal,
  formatInt,
  formatPercent,
  formatValueByType,
  normalizeInterviewActivities,
  normalizeText,
  toDateKey,
} from '../lib/dashboardKpiHelpers';

const RANGE_OPTIONS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'week', label: 'Last Week' },
  { value: 'last_30_days', label: 'Past 30 Days' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_90_days', label: 'Last 90 Days' },
  { value: 'custom', label: 'Custom Range' },
];

const FREE_GROUP_INTERVIEW_MEETING_NAME = 'Sober Founders Intro Meeting';
// Legacy HubSpot records stored the booking URL rather than the meeting name as a title.
// Keep the URL token as a fallback so older activities are not silently dropped.
const FREE_GROUP_INTERVIEW_LEGACY_URL_TOKEN = 'meetings.hubspot.com/andrew-lassise/interview';
// Phoenix Forum meetings are identified by name fragment first (newer HubSpot records store
// the meeting name), with URL token fallback for older records (same pattern as free group).
const PHOENIX_FORUM_MEETING_NAME_FRAGMENT = 'Phoenix Forum';
const PHOENIX_INTERVIEW_MATCH_TOKENS = [
  'meetings.hubspot.com/andrew-lassise/phoenix-forum-interview',
  'meetings.hubspot.com/andrew-lassise/phoenix-forum-learn-more',
  'meetings.hubspot.com/andrew-lassise/phoenix-forum-good-fit',
];

const ET_TIMEZONE = 'America/New_York';

const DONATION_EXCLUDED_STATUSES = new Set(['refunded', 'refund', 'failed', 'void', 'voided', 'canceled', 'cancelled']);

const HUBSPOT_CONTACT_SELECT_COLUMNS = [
  'hubspot_contact_id',
  'createdate',
  'email',
  'hs_analytics_source',
  'hs_latest_source',
  'hs_analytics_source_data_2',
  'hs_latest_source_data_2',
  'campaign',
  'campaign_source',
  'membership_s',
  'annual_revenue_in_dollars__official_',
  'annual_revenue_in_dollars',
  'sobriety_date',
  'sobriety_date__official_',
  'is_deleted',
  'hubspot_archived',
  'merged_into_hubspot_contact_id',
];

const HUBSPOT_OPTIONAL_COLUMNS = new Set([
  'campaign_source',
  'sobriety_date__official_',
]);

const LOOKBACK_DAYS_SAFE = Number.isFinite(Number(DASHBOARD_LOOKBACK_DAYS))
  ? Math.max(90, Math.trunc(Number(DASHBOARD_LOOKBACK_DAYS)))
  : 365;

const cardGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '14px',
};

const KPI_CARD_DEFINITIONS = {
  freeMeetings: {
    key: 'freeMeetings',
    section: 'free',
    metric: 'meetings',
    title: 'Free Meeting Leads',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'ads',
    note: 'Meta free-group lead form submissions',
    color: '#0f766e',
  },
  freeQualified: {
    key: 'freeQualified',
    section: 'free',
    metric: 'qualified',
    title: 'New $250k Qualified Leads',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'contacts',
    note: 'Revenue >= $250k and sobriety > 1 year',
    color: '#166534',
  },
  freePhoenixQualified: {
    key: 'freePhoenixQualified',
    section: 'free',
    metric: 'phoenixQualified',
    title: 'New Phoenix Qualified Leads',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'contacts',
    note: 'Revenue >= $1M and sobriety > 1 year',
    color: '#b45309',
  },
  freeCpql: {
    key: 'freeCpql',
    section: 'free',
    metric: 'cpql',
    title: 'Cost Per $250k Qualified Lead (CPQL)',
    format: 'currency',
    direction: KPI_DIRECTION.LOWER_IS_BETTER,
    source: ['ads', 'contacts'],
    note: 'Free Group Ad Spend / New $250k Qualified Leads',
    color: '#0369a1',
  },
  freeGreat: {
    key: 'freeGreat',
    section: 'free',
    metric: 'great',
    title: 'New Great Leads',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'contacts',
    note: 'Revenue >= $1M',
    color: '#4f46e5',
  },
  freeCpgl: {
    key: 'freeCpgl',
    section: 'free',
    metric: 'cpgl',
    title: 'Cost Per Great Lead (CPGL)',
    format: 'currency',
    direction: KPI_DIRECTION.LOWER_IS_BETTER,
    source: ['ads', 'contacts'],
    note: 'Free Group Ad Spend / New Great Leads',
    color: '#7c3aed',
  },
  freeInterviews: {
    key: 'freeInterviews',
    section: 'free',
    metric: 'interviews',
    title: 'Free Group Interviews',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'interviews',
    note: null,
    color: '#0ea5e9',
  },
  phoenixLeads: {
    key: 'phoenixLeads',
    section: 'phoenix',
    metric: 'leads',
    title: 'Phoenix Forum Leads',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'ads',
    note: 'Campaign name contains "Phoenix"',
    color: '#0f766e',
  },
  phoenixQualified: {
    key: 'phoenixQualified',
    section: 'phoenix',
    metric: 'qualified',
    title: 'Phoenix $250k Qualified Leads',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'contacts',
    note: 'Revenue >= $250k and sobriety > 1 year',
    color: '#166534',
  },
  phoenixPhoenixQualified: {
    key: 'phoenixPhoenixQualified',
    section: 'phoenix',
    metric: 'phoenixQualified',
    title: 'Phoenix Forum Phoenix Qualified',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'contacts',
    note: 'Revenue >= $1M and sobriety > 1 year',
    color: '#b45309',
  },
  phoenixCpql: {
    key: 'phoenixCpql',
    section: 'phoenix',
    metric: 'cpql',
    title: 'Phoenix CPQL',
    format: 'currency',
    direction: KPI_DIRECTION.LOWER_IS_BETTER,
    source: ['ads', 'contacts'],
    note: 'Phoenix Ad Spend / Phoenix $250k Qualified Leads',
    color: '#0369``a1',
  },
  phoenixInterviews: {
    key: 'phoenixInterviews',
    section: 'phoenix',
    metric: 'interviews',
    title: 'Phoenix Forum Interviews',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'interviews',
    note: 'Phoenix Forum Interview, Learn More, and Good Fit meetings',
    color: '#0ea5e9',
  },
  attendanceTotalTue: {
    key: 'attendanceTotalTue',
    section: 'attendance',
    metric: 'totalTue',
    title: 'Total Attendance (Tuesday)',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'sessions',
    note: 'Total Tuesday attendees in selected range',
    color: '#0ea5e9',
  },
  attendanceAvgVisitsTue: {
    key: 'attendanceAvgVisitsTue',
    section: 'attendance',
    metric: 'avgVisitsTue',
    title: 'Avg Visits (Tuesday)',
    format: 'decimal',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'sessions',
    note: 'Rolling 90-day Tuesday visits / unique Tuesday attendees',
    color: '#38bdf8',
  },
  attendanceTotalThu: {
    key: 'attendanceTotalThu',
    section: 'attendance',
    metric: 'totalThu',
    title: 'Total Attendance (Thursday)',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'sessions',
    note: 'Total Thursday attendees in selected range',
    color: '#6366f1',
  },
  attendanceAvgVisitsThu: {
    key: 'attendanceAvgVisitsThu',
    section: 'attendance',
    metric: 'avgVisitsThu',
    title: 'Avg Visits (Thursday)',
    format: 'decimal',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'sessions',
    note: 'Rolling 90-day Thursday visits / unique Thursday attendees',
    color: '#818cf8',
  },
  donationsCount: {
    key: 'donationsCount',
    section: 'donations',
    metric: 'count',
    title: '# Donations',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'donations',
    note: 'Count of donations in selected range',
    color: '#16a34a',
  },
  donationsAmount: {
    key: 'donationsAmount',
    section: 'donations',
    metric: 'amount',
    title: '$ Donations',
    format: 'currency',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'donations',
    note: 'Total donation amount in selected range',
    color: '#15803d',
  },
  operationsCompletedItems: {
    key: 'operationsCompletedItems',
    section: 'operations',
    metric: 'completedItems',
    title: 'Completed Items',
    format: 'count',
    direction: KPI_DIRECTION.HIGHER_IS_BETTER,
    source: 'todos',
    note: 'Notion status changed to Done in selected range',
    color: '#f97316',
  },
};

const FREE_CARD_KEYS = ['freeQualified', 'freePhoenixQualified', 'freeCpql', 'freeGreat', 'freeCpgl', 'freeInterviews'];
const PHOENIX_CARD_KEYS = ['phoenixLeads', 'phoenixQualified', 'phoenixCpql', 'phoenixInterviews'];
const ATTENDANCE_CARD_KEYS = ['attendanceTotalTue', 'attendanceAvgVisitsTue', 'attendanceTotalThu', 'attendanceAvgVisitsThu'];
const DONATION_CARD_KEYS = ['donationsCount', 'donationsAmount'];
const OPERATIONS_CARD_KEYS = ['operationsCompletedItems'];

function toUtcDate(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function formatTimestamp(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
}

function parseMissingSupabaseColumn(errorMessage = '') {
  const message = String(errorMessage || '');
  const patterns = [
    /column\s+(?:"?[a-zA-Z0-9_]+"?\.)?(?:"?raw_hubspot_contacts"?\.)?"?([a-zA-Z0-9_]+)"?\s+does not exist/i,
    /Could not find the\s+'([a-zA-Z0-9_]+)'\s+column\s+of\s+'raw_hubspot_contacts'/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function fetchHubspotContactsWithSchemaFallback(startKey) {
  const schemaWarnings = [];
  const attemptedMissingColumns = new Set();
  let selectedColumns = [...HUBSPOT_CONTACT_SELECT_COLUMNS];

  // Probe with wildcard once so missing legacy columns can be removed up front
  // instead of triggering repeated 400 retries.
  const schemaProbe = await supabase
    .from('raw_hubspot_contacts')
    .select('*')
    .limit(1);
  if (!schemaProbe.error && Array.isArray(schemaProbe.data) && schemaProbe.data.length > 0) {
    const availableColumns = new Set(Object.keys(schemaProbe.data[0] || {}));
    const missingColumns = selectedColumns.filter((columnName) => !availableColumns.has(columnName));
    const resolvedColumns = selectedColumns.filter((columnName) => availableColumns.has(columnName));
    if (resolvedColumns.length > 0) {
      selectedColumns = resolvedColumns;
    }
    missingColumns.forEach((missingColumn) => {
      attemptedMissingColumns.add(missingColumn);
      if (!HUBSPOT_OPTIONAL_COLUMNS.has(missingColumn)) {
        schemaWarnings.push(`HubSpot contacts query removed missing column \`${missingColumn}\` to continue loading.`);
      }
    });
  }

  while (selectedColumns.length > 0) {
    const result = await supabase
      .from('raw_hubspot_contacts')
      .select(selectedColumns.join(','))
      .gte('createdate', `${startKey}T00:00:00.000Z`)
      .order('createdate', { ascending: true });

    if (!result.error) return { ...result, schemaWarnings };

    const missingColumn = parseMissingSupabaseColumn(result.error?.message);
    if (!missingColumn || !selectedColumns.includes(missingColumn) || attemptedMissingColumns.has(missingColumn)) {
      return { ...result, schemaWarnings };
    }

    attemptedMissingColumns.add(missingColumn);
    selectedColumns = selectedColumns.filter((column) => column !== missingColumn);
    if (!HUBSPOT_OPTIONAL_COLUMNS.has(missingColumn)) {
      schemaWarnings.push(`HubSpot contacts query removed missing optional column \`${missingColumn}\` to continue loading.`);
    }
  }

  const wildcardResult = await supabase
    .from('raw_hubspot_contacts')
    .select('*')
    .gte('createdate', `${startKey}T00:00:00.000Z`)
    .order('createdate', { ascending: true });
  if (!wildcardResult.error) {
    schemaWarnings.push(
      'HubSpot contacts query fell back to `select(*)` because preferred projection failed. Run schema alignment to restore lean projection safely.',
    );
    return { ...wildcardResult, schemaWarnings };
  }

  return {
    data: [],
    error: { message: wildcardResult.error?.message || 'HubSpot contacts query failed after removing all selectable columns.' },
    schemaWarnings,
  };
}

function buildMatchingWindow(startKey, endKey, currentLabel, previousLabelPrefix = 'Previous matching') {
  const startDate = toUtcDate(startKey);
  const endDate = toUtcDate(endKey);
  const spanDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
  const previousEnd = addDays(startKey, -1);
  const previousStart = addDays(previousEnd, -(spanDays - 1));
  return {
    current: { start: startKey, end: endKey, label: currentLabel },
    previous: {
      start: previousStart,
      end: previousEnd,
      label: `${previousLabelPrefix} ${spanDays}-day period`,
    },
  };
}

function buildOverviewWindows(rangeType, customStart, customEnd, todayKey) {
  if (rangeType === 'this_week') {
    return buildDateRangeWindows('this_week', null, null, todayKey);
  }
  if (rangeType === 'week') {
    return buildDateRangeWindows('last_week', null, null, todayKey);
  }
  if (rangeType === 'last_month') {
    return buildDateRangeWindows('last_month', null, null, todayKey);
  }
  if (rangeType === 'last_30_days') {
    const start = addDays(todayKey, -29);
    return buildMatchingWindow(start, todayKey, 'Last 30 Days');
  }
  if (rangeType === 'last_90_days') {
    const start = addDays(todayKey, -89);
    return buildMatchingWindow(start, todayKey, 'Last 90 Days');
  }

  const fallbackStart = addDays(todayKey, -6);
  const fallbackEnd = todayKey;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(customStart || '')) ? customStart : fallbackStart;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(customEnd || '')) ? customEnd : fallbackEnd;
  const sortedStart = start <= end ? start : end;
  const sortedEnd = start <= end ? end : start;
  return buildMatchingWindow(sortedStart, sortedEnd, `${sortedStart} to ${sortedEnd}`);
}

function classifyAdFunnel(row) {
  const funnelKey = normalizeText(row?.funnel_key);
  if (funnelKey === 'phoenix') return 'phoenix';
  if (funnelKey === 'free') return 'free';

  const blob = [
    row?.campaign_name,
    row?.adset_name,
    row?.ad_name,
  ]
    .map((value) => normalizeText(value))
    .join(' ');

  return blob.includes('phoenix') ? 'phoenix' : 'free';
}

function classifyHubspotFunnel(row) {
  const blob = [
    row?.campaign,
    row?.campaign_source,
    row?.membership_s,
    row?.hs_analytics_source_data_2,
    row?.hs_latest_source_data_2,
  ]
    .map((value) => normalizeText(value))
    .join(' ');

  return blob.includes('phoenix') ? 'phoenix' : 'free';
}

function isPaidSocialContact(row) {
  const source = normalizeText(row?.hs_analytics_source || row?.hs_latest_source);
  return source.includes('paid_social') || source.includes('paid social');
}

function isActiveHubspotContact(row) {
  if (row?.is_deleted === true) return false;
  if (row?.hubspot_archived === true) return false;
  const mergedIntoRaw = row?.merged_into_hubspot_contact_id;
  const mergedIntoNumber = Number(mergedIntoRaw);
  const hasMergedInto = mergedIntoRaw !== null
    && mergedIntoRaw !== undefined
    && mergedIntoRaw !== ''
    && Number.isFinite(mergedIntoNumber)
    && mergedIntoNumber > 0;
  return !hasMergedInto;
}

function contactCreatedAtTs(row) {
  const ts = Date.parse(row?.createdate || '');
  return Number.isFinite(ts) ? ts : 0;
}

function chooseNewerContact(previous, next) {
  if (!previous) return next;
  if (!next) return previous;
  return contactCreatedAtTs(next) > contactCreatedAtTs(previous) ? next : previous;
}

function normalizeAdsRows(rows = []) {
  return rows
    .map((row) => ({
      dateKey: toDateKey(row?.date_day),
      spend: toFiniteNumber(row?.spend, 0),
      leads: toFiniteNumber(row?.leads, 0),
      funnel: classifyAdFunnel(row),
    }))
    .filter((row) => row.dateKey);
}

function normalizeHubspotContacts(rows = []) {
  const deduped = new Map();

  rows.forEach((row) => {
    if (!isActiveHubspotContact(row)) return;
    if (!isPaidSocialContact(row)) return;
    const createdDateKey = toDateKey(row?.createdate);
    if (!createdDateKey) return;

    const key = Number.isFinite(Number(row?.hubspot_contact_id)) && Number(row.hubspot_contact_id) > 0
      ? `id:${Number(row.hubspot_contact_id)}`
      : `email:${normalizeText(row?.email)}`;
    if (!key || key === 'email:') return;

    deduped.set(key, chooseNewerContact(deduped.get(key), row));
  });

  return Array.from(deduped.values())
    .map((row) => {
      const createdDateKey = toDateKey(row?.createdate);
      const qualification = evaluateLeadQualification({ revenue: row, sobrietyDate: row });
      const phoenixQual = isPhoenixQualifiedLead({ revenue: row, sobrietyDate: row });
      const revenue = parseOfficialRevenue(row);
      return {
        createdDateKey,
        funnel: classifyHubspotFunnel(row),
        qualified: qualification.qualified,
        phoenixQualified: phoenixQual,
        great: Number.isFinite(Number(revenue)) && Number(revenue) >= 1_000_000,
      };
    })
    .filter((row) => row.createdDateKey);
}

const _freeGroupNameMatcher = createMeetingNameMatcher(FREE_GROUP_INTERVIEW_MEETING_NAME);
const _freeGroupUrlMatcher = createTokenMatcher([FREE_GROUP_INTERVIEW_LEGACY_URL_TOKEN]);
const matchesFreeGroupInterview = (row) => _freeGroupNameMatcher(row) || _freeGroupUrlMatcher(row);
// Phoenix: name-based match is primary (newer records); URL tokens are fallback for older records.
const _phoenixNameMatcher = createMeetingNameMatcher(PHOENIX_FORUM_MEETING_NAME_FRAGMENT);
const _phoenixUrlMatcher = createTokenMatcher(PHOENIX_INTERVIEW_MATCH_TOKENS);
const matchesPhoenixInterview = (row) => _phoenixNameMatcher(row) || _phoenixUrlMatcher(row);

// Session classification constants — mirrors AttendanceDashboard thresholds.
const MIN_GROUP_ATTENDEES = 3;
const GROUP_CALL_MIN_ATTENDEE_SIGNAL = 5;
const GROUP_CALL_ET_MINUTES = { Tuesday: 720, Thursday: 660 }; // 12 pm Tue, 11 am Thu
const GROUP_CALL_TIME_TOLERANCE = 120; // ±2 hours primary window

function inferTitleSignal(textBlob, scheduledDayType) {
  // Mirrors AttendanceDashboard.inferGroupTypeFromTitle exactly.
  const likelyOneToOne = (
    textBlob.includes('intro meeting')
    || textBlob.includes('meeting with')
    || textBlob.includes('sober founder interview')
    || textBlob === 'lunch'
    || textBlob.startsWith('canceled:')
    || textBlob.startsWith('not canceled:')
  );
  if (textBlob.includes('tactic tuesday')) {
    return { type: 'Tuesday', strongSignal: true, likelyOneToOne: false };
  }
  if (textBlob.includes('all are welcome') || textBlob.includes("entrepreneur's big book") || textBlob.includes('big book')) {
    return { type: 'Thursday', strongSignal: true, likelyOneToOne: false };
  }
  if (textBlob.includes('mastermind') && !textBlob.includes('intro')) {
    return { type: scheduledDayType || 'Thursday', strongSignal: true, likelyOneToOne: false };
  }
  return { type: null, strongSignal: false, likelyOneToOne };
}

function normalizeHubspotAttendanceSessions(activities = [], associations = []) {
  // Builds Tue/Thu attendance sessions from raw HubSpot activities + contact
  // associations.  Classification mirrors AttendanceDashboard: title signals,
  // ET time-window, and attendee-count signals are all used so that the
  // Dashboard Section 3 numbers match the Attendance module exactly.

  // 1. Build lookup: activityId → Set of unique attendee keys
  const assocByActivity = new Map();
  associations.forEach((row) => {
    const id = String(row.hubspot_activity_id);
    const email = (row.contact_email || '').trim().toLowerCase();
    const name = [row.contact_firstname, row.contact_lastname].filter(Boolean).join(' ').trim().toLowerCase();
    const key = email && email.includes('@') ? `email:${email}` : name ? `name:${name}` : null;
    if (!key) return;
    if (!assocByActivity.has(id)) assocByActivity.set(id, new Set());
    assocByActivity.get(id).add(key);
  });

  // 2. ET-aware formatters (created once, reused per activity)
  const etWeekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET_TIMEZONE, weekday: 'short' });
  const etTimeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIMEZONE, hour12: false, hour: '2-digit', minute: '2-digit',
  });

  const sessionsByKey = new Map();

  activities.forEach((row) => {
    // Use the RAW timestamp for ET classification (not a truncated date key,
    // which creates midnight-UTC and shifts backward when converted to ET).
    const rawTs = row?.hs_timestamp || row?.created_at_hubspot;
    if (!rawTs) return;
    const ts = new Date(rawTs);
    if (Number.isNaN(ts.getTime())) return;

    // ET weekday from the actual timestamp
    const etWeekday = etWeekdayFmt.format(ts);
    const scheduledDayType = etWeekday === 'Tue' ? 'Tuesday' : etWeekday === 'Thu' ? 'Thursday' : null;

    // Title signal (same keywords as AttendanceDashboard.inferGroupTypeFromTitle)
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const textBlob = [
      row?.title, row?.body_preview,
      metadata.meeting_name, metadata.meetingName, metadata.subject, metadata.title,
      JSON.stringify(metadata),
    ].map((v) => String(v || '').toLowerCase()).join(' ');
    const title = inferTitleSignal(textBlob, scheduledDayType);

    const dayType = title.type || scheduledDayType;
    if (!dayType) return;

    // Attendee count for this activity
    const activityId = String(row.hubspot_activity_id);
    const contactKeys = assocByActivity.get(activityId);
    const attendeeCount = contactKeys ? contactKeys.size : 0;

    // ET time-window check
    const timeParts = etTimeFmt.formatToParts(ts);
    const hour = Number(timeParts.find((p) => p.type === 'hour')?.value);
    const minute = Number(timeParts.find((p) => p.type === 'minute')?.value);
    const minuteOfDay = Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : NaN;
    const expectedMinute = GROUP_CALL_ET_MINUTES[dayType];
    const inPrimaryWindow = Number.isFinite(minuteOfDay) && Number.isFinite(expectedMinute)
      && Math.abs(minuteOfDay - expectedMinute) <= GROUP_CALL_TIME_TOLERANCE;

    const hasAttendanceSignal = attendeeCount >= GROUP_CALL_MIN_ATTENDEE_SIGNAL;
    const isCallActivity = String(row?.activity_type || '').toLowerCase() === 'call';

    // Exclude likely 1-on-1 meetings unless strong counter-evidence
    if (title.likelyOneToOne && !title.strongSignal && !hasAttendanceSignal && !isCallActivity) return;

    // Include if any signal fires (mirrors AttendanceDashboard.getSessionCandidateSignals)
    const include = title.strongSignal || hasAttendanceSignal || inPrimaryWindow
      || (isCallActivity && scheduledDayType === dayType);
    if (!include) return;

    if (!contactKeys || contactKeys.size === 0) return;

    // UTC date key for grouping (same as AttendanceDashboard's dateLabel)
    const dateKey = ts.toISOString().slice(0, 10);
    const sessionKey = `${dayType}|${dateKey}`;
    if (!sessionsByKey.has(sessionKey)) {
      sessionsByKey.set(sessionKey, {
        dateKey,
        dayType,
        attendees: new Set(),
        startTs: ts.getTime(),
      });
    }

    const session = sessionsByKey.get(sessionKey);
    contactKeys.forEach((k) => session.attendees.add(k));
  });

  return Array.from(sessionsByKey.values())
    .filter((s) => s.attendees.size >= MIN_GROUP_ATTENDEES)
    .map((s) => ({
      dateKey: s.dateKey,
      dayType: s.dayType,
      attendees: Array.from(s.attendees),
      startTs: s.startTs,
    }))
    .sort((a, b) => a.startTs - b.startTs);
}

function normalizeDonationRows(rows = []) {
  return rows
    .map((row) => ({
      dateKey: toDateKey(row?.donated_at),
      amount: toFiniteNumber(row?.amount, 0),
      status: normalizeText(row?.status),
    }))
    .filter((row) => row.dateKey && row.amount > 0 && !DONATION_EXCLUDED_STATUSES.has(row.status));
}

function parseTodoDoneDate(row) {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const candidateValues = [
    metadata.done_at,
    metadata.completed_at,
    metadata.completed_time,
    metadata.status_changed_at,
    metadata.status_last_changed_at,
    metadata.doneAt,
    metadata.completedAt,
    metadata?.status_history?.done_at,
    metadata?.statusHistory?.doneAt,
    row?.last_updated_at,
    row?.created_at,
  ];

  for (const candidate of candidateValues) {
    const dateKey = toDateKey(candidate);
    if (dateKey) return dateKey;
  }
  return null;
}

function normalizeTodoRows(rows = []) {
  return rows
    .map((row) => {
      const status = normalizeText(row?.status);
      if (status !== 'done' && status !== 'completed') return null;
      const doneDateKey = parseTodoDoneDate(row);
      if (!doneDateKey) return null;
      return { doneDateKey };
    })
    .filter(Boolean);
}

function aggregateAds(rows, window, funnel) {
  return rows.reduce((acc, row) => {
    if (row.funnel !== funnel) return acc;
    if (!dateInRange(row.dateKey, window.start, window.end)) return acc;
    acc.leads += row.leads;
    acc.spend += row.spend;
    return acc;
  }, { leads: 0, spend: 0 });
}

function aggregateLeadContacts(rows, window, funnel) {
  return rows.reduce((acc, row) => {
    if (row.funnel !== funnel) return acc;
    if (!dateInRange(row.createdDateKey, window.start, window.end)) return acc;
    acc.total += 1;
    if (row.qualified) acc.qualified += 1;
    if (row.phoenixQualified) acc.phoenixQualified += 1;
    if (row.great) acc.great += 1;
    return acc;
  }, { total: 0, qualified: 0, phoenixQualified: 0, great: 0 });
}

function aggregateDonations(rows, window) {
  return rows.reduce((acc, row) => {
    if (!dateInRange(row.dateKey, window.start, window.end)) return acc;
    acc.count += 1;
    acc.amount += row.amount;
    return acc;
  }, { count: 0, amount: 0 });
}

function aggregateCompletedItems(rows, window) {
  return rows.reduce((acc, row) => {
    if (!dateInRange(row.doneDateKey, window.start, window.end)) return acc;
    return acc + 1;
  }, 0);
}

function buildAttendanceSnapshots(sessions, currentWindow, previousWindow) {
  const ROLLING_WINDOW_DAYS = 90;

  const initWindowState = () => ({
    Tuesday: { total: 0, newAttendees: 0, repeat: 0 },
    Thursday: { total: 0, newAttendees: 0, repeat: 0 },
  });
  const state = {
    current: initWindowState(),
    previous: initWindowState(),
  };

  // Track first-seen across all time for new vs repeat detection
  const seen = { Tuesday: new Set(), Thursday: new Set() };

  // Anchor rolling 90-day window to end of currentWindow so each comparison
  // period (last week, 4-week avg) gets its own correctly-scoped rolling avg.
  const anchorMs = Date.parse(currentWindow.end + 'T00:00:00Z');
  const cutoffMs = Number.isFinite(anchorMs) ? anchorMs - ROLLING_WINDOW_DAYS * 86400000 : 0;

  // Rolling 90-day window counters for avg visits
  const rolling = {
    Tuesday: { visits: 0, unique: new Set() },
    Thursday: { visits: 0, unique: new Set() },
  };

  sessions.forEach((session) => {
    const day = session.dayType;
    if (!rolling[day]) return;
    const isCurrent = dateInRange(session.dateKey, currentWindow.start, currentWindow.end);
    const isPrevious = dateInRange(session.dateKey, previousWindow.start, previousWindow.end);
    const bucketKey = isCurrent ? 'current' : (isPrevious ? 'previous' : null);
    const sessionMs = new Date(session.dateKey + 'T00:00:00Z').getTime();

    session.attendees.forEach((personKey) => {
      // Rolling 90-day window for avg visits (sessions up to window end)
      if (sessionMs >= cutoffMs && sessionMs <= anchorMs) {
        rolling[day].visits += 1;
        rolling[day].unique.add(personKey);
      }

      const isNetNew = !seen[day].has(personKey);
      if (bucketKey) {
        state[bucketKey][day].total += 1;
        if (isNetNew) {
          state[bucketKey][day].newAttendees += 1;
        } else {
          state[bucketKey][day].repeat += 1;
        }
      }
      if (isNetNew) seen[day].add(personKey);
    });
  });

  // Avg visits = rolling 90-day visits / unique people in that window
  const rollingAvg = (day) =>
    rolling[day].unique.size > 0 ? rolling[day].visits / rolling[day].unique.size : 0;

  const toSnapshot = (bucket) => ({
    totalTue: bucket.Tuesday.total,
    newTue: bucket.Tuesday.newAttendees,
    repeatTue: bucket.Tuesday.repeat,
    avgVisitsTue: rollingAvg('Tuesday'),
    totalThu: bucket.Thursday.total,
    newThu: bucket.Thursday.newAttendees,
    repeatThu: bucket.Thursday.repeat,
    avgVisitsThu: rollingAvg('Thursday'),
  });

  return {
    current: toSnapshot(state.current),
    previous: toSnapshot(state.previous),
  };
}

function buildWindowMetrics(normalizedData, window) {
  const {
    adsRows,
    contacts,
    interviewRows,
    zoomSessions,
    donationRows,
    todoRows,
  } = normalizedData;

  const freeAds = aggregateAds(adsRows, window, 'free');
  const freeLeads = aggregateLeadContacts(contacts, window, 'free');
  const phoenixAds = aggregateAds(adsRows, window, 'phoenix');
  const phoenixLeads = aggregateLeadContacts(contacts, window, 'phoenix');
  const freeInterviews = countInterviewUniqueAttendees(interviewRows, window, matchesFreeGroupInterview);
  const phoenixInterviews = countInterviewUniqueAttendees(interviewRows, window, matchesPhoenixInterview);
  const donations = aggregateDonations(donationRows, window);
  const completedItems = aggregateCompletedItems(todoRows, window);
  const attendance = buildAttendanceSnapshots(zoomSessions, window, { start: '0000-01-01', end: '0000-01-01' }).current;

  return {
    free: {
      meetings: freeAds.leads,
      qualified: freeLeads.qualified,
      phoenixQualified: freeLeads.phoenixQualified,
      great: freeLeads.great,
      cpql: safeDivide(freeAds.spend, freeLeads.qualified),
      cpgl: safeDivide(freeAds.spend, freeLeads.great),
      interviews: freeInterviews,
      spend: freeAds.spend,
    },
    phoenix: {
      leads: phoenixAds.leads,
      qualified: phoenixLeads.qualified,
      phoenixQualified: phoenixLeads.phoenixQualified,
      great: phoenixLeads.great,
      cpql: safeDivide(phoenixAds.spend, phoenixLeads.qualified),
      cpgl: safeDivide(phoenixAds.spend, phoenixLeads.great),
      interviews: phoenixInterviews,
      spend: phoenixAds.spend,
    },
    attendance,
    donations,
    operations: { completedItems },
  };
}

function flattenMetricValues(metrics) {
  return {
    freeMeetings: metrics.free.meetings,
    freeQualified: metrics.free.qualified,
    freePhoenixQualified: metrics.free.phoenixQualified,
    freeCpql: metrics.free.cpql,
    freeGreat: metrics.free.great,
    freeCpgl: metrics.free.cpgl,
    freeInterviews: metrics.free.interviews,
    phoenixLeads: metrics.phoenix.leads,
    phoenixQualified: metrics.phoenix.qualified,
    phoenixPhoenixQualified: metrics.phoenix.phoenixQualified,
    phoenixCpql: metrics.phoenix.cpql,
    phoenixInterviews: metrics.phoenix.interviews,
    attendanceTotalTue: metrics.attendance.totalTue,
    attendanceNewTue: metrics.attendance.newTue,
    attendanceRepeatTue: metrics.attendance.repeatTue,
    attendanceAvgVisitsTue: metrics.attendance.avgVisitsTue,
    attendanceTotalThu: metrics.attendance.totalThu,
    attendanceNewThu: metrics.attendance.newThu,
    attendanceRepeatThu: metrics.attendance.repeatThu,
    attendanceAvgVisitsThu: metrics.attendance.avgVisitsThu,
    donationsCount: metrics.donations.count,
    donationsAmount: metrics.donations.amount,
    operationsCompletedItems: metrics.operations.completedItems,
  };
}

function earliestDateKey(rows, field) {
  const keys = rows
    .map((row) => row?.[field])
    .filter(Boolean)
    .sort();
  return keys[0] || null;
}

function buildWeeklyComparisons(normalizedData, todayKey) {
  const { lastWeek, lastFourCompletedWeeks } = buildCompletedWeekWindows(todayKey);
  const weekMetrics = lastFourCompletedWeeks.map((window) => flattenMetricValues(buildWindowMetrics(normalizedData, window)));
  const oldestRequiredWeekStart = lastFourCompletedWeeks[lastFourCompletedWeeks.length - 1]?.start || null;

  const sourceEarliest = {
    ads: earliestDateKey(normalizedData.adsRows, 'dateKey'),
    contacts: earliestDateKey(normalizedData.contacts, 'createdDateKey'),
    interviews: earliestDateKey(normalizedData.interviewRows, 'dateKey'),
    sessions: earliestDateKey(normalizedData.zoomSessions, 'dateKey'),
    donations: earliestDateKey(normalizedData.donationRows, 'dateKey'),
    todos: earliestDateKey(normalizedData.todoRows, 'doneDateKey'),
  };

  const lastWeekByKey = {};
  const fourWeekAvgByKey = {};
  Object.values(KPI_CARD_DEFINITIONS).forEach((definition) => {
    const sourceKeys = Array.isArray(definition.source) ? definition.source : [definition.source];
    const sourceStarts = sourceKeys.map((sourceKey) => sourceEarliest[sourceKey]);
    const hasLastWeekCoverage = sourceStarts.every((startKey) => !!startKey && startKey <= lastWeek.start);
    const hasFourWeekCoverage = sourceStarts.every(
      (startKey) => !!startKey && !!oldestRequiredWeekStart && startKey <= oldestRequiredWeekStart,
    );

    if (!hasLastWeekCoverage || weekMetrics.length < 1) {
      lastWeekByKey[definition.key] = null;
    } else {
      lastWeekByKey[definition.key] = Number.isFinite(Number(weekMetrics[0]?.[definition.key]))
        ? Number(weekMetrics[0][definition.key])
        : null;
    }

    if (!hasFourWeekCoverage || weekMetrics.length < 4) {
      fourWeekAvgByKey[definition.key] = null;
      return;
    }

    const values = weekMetrics
      .map((metricRow) => metricRow[definition.key])
      .filter((value) => Number.isFinite(Number(value)));

    fourWeekAvgByKey[definition.key] = values.length === 4 ? averageFinite(values) : null;
  });

  return {
    lastWeek,
    lastWeekByKey,
    fourWeekAvgByKey,
  };
}

function buildAttendanceTrend(sessions) {
  // Build sparkline-ready data: one point per session, grouped by dayType
  const tue = [];
  const thu = [];
  sessions.forEach((s) => {
    const point = { date: s.dateKey, value: s.attendees.length };
    if (s.dayType === 'Tuesday') tue.push(point);
    else if (s.dayType === 'Thursday') thu.push(point);
  });
  return { tue, thu };
}

function computeKpiSnapshot(rawData, windows, todayKey) {
  // Interview rows are still used for interview counting (Free Group, Phoenix).
  // Attendance sessions are built separately from raw activities + associations
  // to avoid collectAttendeeKeys double-counting (email + name = 2 keys per person).
  const interviewRows = normalizeInterviewActivities(rawData.activities || []);
  const normalizedData = {
    adsRows: normalizeAdsRows(rawData.adsRows || []),
    contacts: normalizeHubspotContacts(rawData.contacts || []),
    interviewRows,
    zoomSessions: normalizeHubspotAttendanceSessions(rawData.activities || [], rawData.associations || []),
    donationRows: normalizeDonationRows(rawData.donationRows || []),
    todoRows: normalizeTodoRows(rawData.todoRows || []),
  };

  const currentMetrics = buildWindowMetrics(normalizedData, windows.current);
  const previousMetrics = buildWindowMetrics(normalizedData, windows.previous);
  const weeklyComparisons = buildWeeklyComparisons(normalizedData, todayKey);
  const attendanceTrend = buildAttendanceTrend(normalizedData.zoomSessions);

  return {
    free: {
      current: currentMetrics.free,
      previous: previousMetrics.free,
    },
    phoenix: {
      current: currentMetrics.phoenix,
      previous: previousMetrics.phoenix,
    },
    attendance: {
      current: currentMetrics.attendance,
      previous: previousMetrics.attendance,
    },
    attendanceTrend,
    donations: {
      current: currentMetrics.donations,
      previous: previousMetrics.donations,
    },
    operations: {
      current: currentMetrics.operations,
      previous: previousMetrics.operations,
    },
    metricValues: {
      current: flattenMetricValues(currentMetrics),
      previous: flattenMetricValues(previousMetrics),
    },
    weeklyComparisons,
    sourceRows: {
      ads: normalizedData.adsRows.length,
      contacts: normalizedData.contacts.length,
      interviews: normalizedData.interviewRows.length,
      sessions: normalizedData.zoomSessions.length,
      donations: normalizedData.donationRows.length,
      todos: normalizedData.todoRows.length,
    },
  };
}

function calculateDisplayChange(current, previous, direction = KPI_DIRECTION.HIGHER_IS_BETTER) {
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber)) return null;
  if (previousNumber === 0) {
    if (currentNumber === 0) return 0;
    return null;
  }
  const comparison = buildDirectionalComparison({
    label: 'tmp',
    current: currentNumber,
    baseline: previousNumber,
    format: 'decimal',
    direction,
  });
  if (!Number.isFinite(Number(comparison.pct))) return null;
  const tone = comparison.tone;
  if (tone === 'better') return Math.abs(comparison.pct);
  if (tone === 'worse') return -Math.abs(comparison.pct);
  return 0;
}

function toTrendValue(displayChange) {
  if (displayChange === null || displayChange === undefined) return 'N/A';
  return `${displayChange >= 0 ? '+' : ''}${(displayChange * 100).toFixed(1)}%`;
}

function buildCardModel({ metricKey, snapshot }) {
  const definition = KPI_CARD_DEFINITIONS[metricKey];
  if (!definition) return null;

  const current = snapshot.metricValues.current[metricKey];
  const previous = snapshot.metricValues.previous[metricKey];
  const value = formatValueByType(current, definition.format);
  const previousValue = Number.isFinite(Number(previous)) ? formatValueByType(previous, definition.format) : null;
  const rawDelta = Number.isFinite(Number(current)) && Number.isFinite(Number(previous))
    ? Number(current) - Number(previous)
    : null;
  const previousTone = directionToneForDelta(rawDelta, definition.direction);

  const lastWeekComparison = buildDirectionalComparison({
    label: 'vs Last Week',
    current,
    baseline: snapshot.weeklyComparisons.lastWeekByKey[metricKey],
    format: definition.format,
    direction: definition.direction,
  });
  const fourWeekAverageComparison = buildDirectionalComparison({
    label: 'vs 4 Week Avg',
    current,
    baseline: snapshot.weeklyComparisons.fourWeekAvgByKey[metricKey],
    format: definition.format,
    direction: definition.direction,
  });
  // trend and trendValue are derived from the period-over-period comparison
  // (current window vs prior window of the same length), NOT from lastWeekComparison.
  // Using lastWeekComparison caused the arrow to always show neutral when the selected
  // range is "week" — because current === last-week baseline in that case (same dates).
  // The "vs Last Week" and "vs 4 Week Avg" rows remain in comparisonRows for display.
  const periodPct = (rawDelta !== null && Number.isFinite(Number(previous)) && Number(previous) !== 0)
    ? rawDelta / Number(previous)
    : null;
  const trend = rawDelta === null ? 'neutral' : rawDelta > 0 ? 'up' : rawDelta < 0 ? 'down' : 'neutral';
  const trendValue = Number.isFinite(Number(periodPct)) ? toTrendValue(periodPct) : 'N/A';

  // For Total Attendance cards, show new/repeat breakdown in the subvalue
  // and attach sparkline chart data showing attendance over time.
  let subvalue = definition.note;
  let chartData = null;
  let showChart = false;
  if (metricKey === 'attendanceTotalTue') {
    const nw = snapshot.metricValues.current.attendanceNewTue ?? 0;
    const rp = snapshot.metricValues.current.attendanceRepeatTue ?? 0;
    subvalue = `New: ${nw} · Repeat: ${rp}`;
    chartData = snapshot.attendanceTrend?.tue || null;
    showChart = true;
  } else if (metricKey === 'attendanceTotalThu') {
    const nw = snapshot.metricValues.current.attendanceNewThu ?? 0;
    const rp = snapshot.metricValues.current.attendanceRepeatThu ?? 0;
    subvalue = `New: ${nw} · Repeat: ${rp}`;
    chartData = snapshot.attendanceTrend?.thu || null;
    showChart = true;
  }

  return {
    title: definition.title,
    value,
    subvalue,
    previousValue,
    previousLabel: 'Prior',
    previousTone,
    trend,
    trendValue,
    invertColor: definition.direction === KPI_DIRECTION.LOWER_IS_BETTER,
    color: definition.color,
    comparisonRows: [lastWeekComparison, fourWeekAverageComparison],
    showChart,
    chartData,
  };
}

function buildAiNarrative(snapshot) {
  const freeQualifiedRate = safeDivide(snapshot.free.current.qualified, snapshot.free.current.meetings);
  const phoenixQualifiedRate = safeDivide(snapshot.phoenix.current.qualified, snapshot.phoenix.current.leads);
  const freeInterviewRate = safeDivide(snapshot.free.current.interviews, snapshot.free.current.qualified);
  const phoenixInterviewRate = safeDivide(snapshot.phoenix.current.interviews, snapshot.phoenix.current.qualified);
  const blendedCPQL = safeDivide(
    snapshot.free.current.spend + snapshot.phoenix.current.spend,
    snapshot.free.current.qualified + snapshot.phoenix.current.qualified,
  );

  const bottlenecks = [
    { key: 'free-qualified', label: 'Free funnel lead to $250k qualified conversion', value: freeQualifiedRate },
    { key: 'phoenix-qualified', label: 'Phoenix funnel lead to $250k qualified conversion', value: phoenixQualifiedRate },
    { key: 'free-interview', label: 'Free funnel $250k qualified to interview conversion', value: freeInterviewRate },
    { key: 'phoenix-interview', label: 'Phoenix funnel $250k qualified to interview conversion', value: phoenixInterviewRate },
  ].filter((item) => Number.isFinite(Number(item.value)));

  const weakest = bottlenecks.length > 0
    ? [...bottlenecks].sort((a, b) => Number(a.value) - Number(b.value))[0]
    : null;

  const trendRows = [
    {
      label: 'Free $250k qualified leads',
      delta: calculateDisplayChange(
        snapshot.free.current.qualified,
        snapshot.free.previous.qualified,
        KPI_DIRECTION.HIGHER_IS_BETTER,
      ),
    },
    {
      label: 'Phoenix $250k qualified leads',
      delta: calculateDisplayChange(
        snapshot.phoenix.current.qualified,
        snapshot.phoenix.previous.qualified,
        KPI_DIRECTION.HIGHER_IS_BETTER,
      ),
    },
    {
      label: 'CPQL efficiency',
      delta: calculateDisplayChange(blendedCPQL, safeDivide(
        snapshot.free.previous.spend + snapshot.phoenix.previous.spend,
        snapshot.free.previous.qualified + snapshot.phoenix.previous.qualified,
      ), KPI_DIRECTION.LOWER_IS_BETTER),
    },
    {
      label: 'Donations amount',
      delta: calculateDisplayChange(
        snapshot.donations.current.amount,
        snapshot.donations.previous.amount,
        KPI_DIRECTION.HIGHER_IS_BETTER,
      ),
    },
  ];

  const improving = trendRows.filter((row) => row.delta !== null && row.delta > 0).map((row) => row.label);
  const deteriorating = trendRows.filter((row) => row.delta !== null && row.delta < 0).map((row) => row.label);

  const healthLine = `$250k qualified lead volume is ${formatInt(snapshot.free.current.qualified + snapshot.phoenix.current.qualified)} with blended CPQL ${formatCurrency(blendedCPQL)} and donation volume ${formatCurrency(snapshot.donations.current.amount)}.`;
  const bottleneckLine = weakest
    ? `Primary funnel break is ${weakest.label} at ${formatPercent(weakest.value)}.`
    : 'No single bottleneck is reliable yet because one or more funnel stages have insufficient denominator data.';
  const trendLine = [
    improving.length > 0 ? `Improving: ${improving.join(', ')}` : 'Improving: none with strong signal yet',
    deteriorating.length > 0 ? `Deteriorating: ${deteriorating.join(', ')}` : 'Deteriorating: none with strong signal yet',
  ].join('. ');

  return {
    healthLine,
    bottleneckLine,
    trendLine,
    weakestLabel: weakest?.label || '$250k Qualified conversion',
    blendedCPQL,
  };
}

function buildSectionRecommendations(snapshot, windows, aiNarrative) {
  const leadsQualifiedCurrent = snapshot.free.current.qualified + snapshot.phoenix.current.qualified;
  const leadsQualifiedPrevious = snapshot.free.previous.qualified + snapshot.phoenix.previous.qualified;
  const blendedCPQLCurrent = aiNarrative.blendedCPQL;
  const blendedCPQLPrevious = safeDivide(
    snapshot.free.previous.spend + snapshot.phoenix.previous.spend,
    snapshot.free.previous.qualified + snapshot.phoenix.previous.qualified,
  );

  return {
    Leads: [
      {
        id: 'leads-reallocate-budget',
        title: 'Reallocate budget to higher-quality campaigns',
        description: `$250k qualified leads are ${formatInt(leadsQualifiedCurrent)} vs ${formatInt(leadsQualifiedPrevious)} in the prior period. Shift spend toward ad sets with higher qualified conversion and pause low-quality segments.`,
        taskName: `Leads: reallocate spend based on $250k qualified lead conversion (${windows.current.label})`,
        priority: 'High Priority',
        definitionOfDone: 'Budget plan approved and at least two low-quality ad sets paused while top-quality sets receive additional spend.',
      },
      {
        id: 'leads-fix-cpql',
        title: 'Reduce CPQL by tightening top-of-funnel targeting',
        description: `Current blended CPQL is ${formatCurrency(blendedCPQLCurrent)} (prior ${formatCurrency(blendedCPQLPrevious)}). Prioritize creative/audience combinations with lower CPQL and stable quality.`,
        taskName: `Leads: reduce blended CPQL from ${formatCurrency(blendedCPQLCurrent)}`,
        priority: 'High Priority',
        definitionOfDone: 'At least one active campaign variant shows lower CPQL than current baseline while $250k qualified lead count is not lower.',
      },
      {
        id: 'leads-great-share',
        title: 'Increase Great lead share (>= $1M)',
        description: `Great leads are ${formatInt(snapshot.free.current.great + snapshot.phoenix.current.great)} this period. Push messaging and retargeting for $1M+ revenue segments.`,
        taskName: `Leads: improve Great lead share in ${windows.current.label}`,
        priority: 'Medium Priority',
        definitionOfDone: 'Great lead count increases versus prior equivalent period with at least one validated ad message focused on $1M+ segment.',
      },
    ],
    Attendance: [
      {
        id: 'attendance-new-attendee-activation',
        title: 'Improve next-session return rate for new attendees',
        description: `New attendees: Tue ${formatInt(snapshot.attendance.current.newTue)} / Thu ${formatInt(snapshot.attendance.current.newThu)}. Total: Tue ${formatInt(snapshot.attendance.current.totalTue)} / Thu ${formatInt(snapshot.attendance.current.totalThu)}. Add a same-day follow-up sequence for first-time attendees.`,
        taskName: `Attendance: launch same-day follow-up for net-new attendees (${windows.current.label})`,
        priority: 'High Priority',
        definitionOfDone: 'Same-day follow-up is live for all new attendees and second-visit rate is tracked daily.',
      },
      {
        id: 'attendance-tuesday-repeat',
        title: 'Raise Tuesday average visits',
        description: `Tuesday avg visits is ${formatDecimal(snapshot.attendance.current.avgVisitsTue)} (prior ${formatDecimal(snapshot.attendance.previous.avgVisitsTue)}). Test reminder cadence and host outreach scripts.`,
        taskName: 'Attendance: improve Tuesday avg visits per attendee',
        priority: 'Medium Priority',
        definitionOfDone: 'Tuesday average visits improves versus prior equivalent period.',
      },
      {
        id: 'attendance-thursday-repeat',
        title: 'Raise Thursday average visits',
        description: `Thursday avg visits is ${formatDecimal(snapshot.attendance.current.avgVisitsThu)} (prior ${formatDecimal(snapshot.attendance.previous.avgVisitsThu)}). Focus on second-visit conversion for Thursday newcomers.`,
        taskName: 'Attendance: improve Thursday avg visits per attendee',
        priority: 'Medium Priority',
        definitionOfDone: 'Thursday average visits improves versus prior equivalent period.',
      },
    ],
    Donations: [
      {
        id: 'donations-recover-lapsed',
        title: 'Recover lapsed donor momentum',
        description: `Donations amount is ${formatCurrency(snapshot.donations.current.amount)} vs ${formatCurrency(snapshot.donations.previous.amount)} previously. Run a targeted reactivation outreach to prior donors.`,
        taskName: `Donations: reactivation campaign (${windows.current.label})`,
        priority: 'High Priority',
        definitionOfDone: 'Reactivation campaign is sent and donation amount from reactivated donors is tracked in dashboard.',
      },
      {
        id: 'donations-average-gift',
        title: 'Increase average gift size',
        description: `Transactions are ${formatInt(snapshot.donations.current.count)} this period. Add a higher-anchor ask ladder to increase average contribution size.`,
        taskName: 'Donations: test higher ask ladder for average gift lift',
        priority: 'Medium Priority',
        definitionOfDone: 'Average gift value improves versus prior equivalent period.',
      },
      {
        id: 'donations-campaign-attribution',
        title: 'Strengthen donation source attribution',
        description: 'Tag campaign source consistently so donation uplift can be attributed to specific paid, referral, and organic initiatives.',
        taskName: 'Donations: enforce campaign source attribution hygiene',
        priority: 'Medium Priority',
        definitionOfDone: 'At least 95% of donation rows include valid campaign/source attribution fields.',
      },
    ],
    Operations: [
      {
        id: 'operations-throughput',
        title: 'Increase completed-item throughput',
        description: `Completed items are ${formatInt(snapshot.operations.current.completedItems)} vs ${formatInt(snapshot.operations.previous.completedItems)} in the prior period. Reduce bottlenecks in the Done handoff process.`,
        taskName: `Operations: improve Done throughput (${windows.current.label})`,
        priority: 'High Priority',
        definitionOfDone: 'At least 10 tasks are moved to Done this week and blocker owners are assigned for any stalled work.',
      },
      {
        id: 'operations-prioritize',
        title: 'Re-prioritize to one owner per KPI blocker',
        description: `Focus leadership execution on ${aiNarrative.weakestLabel} first, then sequence secondary work by impact on CPQL and $250k qualified lead volume.`,
        taskName: `Operations: assign owner + deadline for ${aiNarrative.weakestLabel}`,
        priority: 'Medium Priority',
        definitionOfDone: 'Each top KPI blocker has one owner, one due date, and one explicit next action.',
      },
      {
        id: 'operations-sla',
        title: 'Define KPI response SLAs',
        description: 'Set explicit response SLAs when $250k qualified leads, attendance, or donations fall below trend so action happens the same day.',
        taskName: 'Operations: define KPI response SLA playbook',
        priority: 'Medium Priority',
        definitionOfDone: 'SLA rules are documented and shared, with alert-to-owner routing tested end to end.',
      },
    ],
  };
}

function buildMustDoToday(snapshot, sectionRecommendations) {
  const leadsQualifiedDelta = calculateDisplayChange(
    snapshot.free.current.qualified + snapshot.phoenix.current.qualified,
    snapshot.free.previous.qualified + snapshot.phoenix.previous.qualified,
    KPI_DIRECTION.HIGHER_IS_BETTER,
  );
  const leadsCPQLDelta = calculateDisplayChange(
    safeDivide(
      snapshot.free.current.spend + snapshot.phoenix.current.spend,
      snapshot.free.current.qualified + snapshot.phoenix.current.qualified,
    ),
    safeDivide(
      snapshot.free.previous.spend + snapshot.phoenix.previous.spend,
      snapshot.free.previous.qualified + snapshot.phoenix.previous.qualified,
    ),
    KPI_DIRECTION.LOWER_IS_BETTER,
  );
  const attendanceDelta = calculateDisplayChange(
    snapshot.attendance.current.totalTue + snapshot.attendance.current.totalThu,
    snapshot.attendance.previous.totalTue + snapshot.attendance.previous.totalThu,
    KPI_DIRECTION.HIGHER_IS_BETTER,
  );
  const donationsDelta = calculateDisplayChange(
    snapshot.donations.current.amount,
    snapshot.donations.previous.amount,
    KPI_DIRECTION.HIGHER_IS_BETTER,
  );
  const operationsDelta = calculateDisplayChange(
    snapshot.operations.current.completedItems,
    snapshot.operations.previous.completedItems,
    KPI_DIRECTION.HIGHER_IS_BETTER,
  );

  // Leads gets a 1.5× boost on qualified-delta because lead generation has the
  // highest revenue impact (drives Phoenix Forum attendance → donations).
  const sectionRiskRows = [
    {
      section: 'Leads',
      score: Math.max(0, -(leadsQualifiedDelta ?? 0)) * 1.5 + Math.max(0, -(leadsCPQLDelta ?? 0)),
    },
    {
      section: 'Attendance',
      score: Math.max(0, -(attendanceDelta ?? 0)),
    },
    {
      section: 'Donations',
      score: Math.max(0, -(donationsDelta ?? 0)),
    },
    // Operations is important but should not dominate Must Do Today selection.
    {
      section: 'Operations',
      score: Math.max(0, -(operationsDelta ?? 0)) * 0.15,
    },
  ];

  const preferredSections = sectionRiskRows.filter((row) => row.section !== 'Operations');
  const topRiskSection = [...preferredSections].sort((a, b) => b.score - a.score)[0]?.section || 'Leads';
  const recommendation = (sectionRecommendations[topRiskSection] || [])[0] || null;
  if (!recommendation) return null;
  return {
    section: topRiskSection,
    ...recommendation,
  };
}

function buildNotionCreateTaskProperties(taskName, priority = 'Medium Priority') {
  return {
    'Task name': { title: [{ text: { content: taskName } }] },
    Status: { status: { name: 'Not started' } },
    Priority: { select: { name: priority } },
    'Effort level': { select: { name: 'Medium Effort' } },
  };
}

function DashboardOverview() {
  const [rangeType, setRangeType] = useState('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [rawData, setRawData] = useState({
    adsRows: [],
    contacts: [],
    activities: [],
    donationRows: [],
    todoRows: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [actionState, setActionState] = useState({});
  const [notionModal, setNotionModal] = useState({ open: false, taskName: '' });
  const [recommendationFeedback, setRecommendationFeedback] = useState({});
  const [feedbackDrafts, setFeedbackDrafts] = useState({});

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const windows = useMemo(
    () => buildOverviewWindows(rangeType, customStart, customEnd, todayKey),
    [rangeType, customStart, customEnd, todayKey],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setWarnings([]);

    const startKey = addDays(todayKey, -Math.max(LOOKBACK_DAYS_SAFE, 120));
    const nextWarnings = [];

    const [
      adsResponse,
      contactsResponse,
      activitiesResponse,
      donationsResponse,
      todosResponse,
    ] = await Promise.all([
      supabase
        .from('raw_fb_ads_insights_daily')
        .select('date_day,funnel_key,campaign_name,adset_name,ad_name,spend,leads')
        .gte('date_day', startKey)
        .order('date_day', { ascending: true }),
      fetchHubspotContactsWithSchemaFallback(startKey),
      supabase
        .from('raw_hubspot_meeting_activities')
        .select('hubspot_activity_id,activity_type,hs_timestamp,created_at_hubspot,title,body_preview,metadata')
        .or(`hs_timestamp.gte.${startKey}T00:00:00.000Z,created_at_hubspot.gte.${startKey}T00:00:00.000Z`)
        .order('hs_timestamp', { ascending: true }),
      supabase
        .from('donation_transactions_unified')
        .select('amount,status,donated_at')
        .gte('donated_at', `${startKey}T00:00:00.000Z`)
        .order('donated_at', { ascending: true }),
      supabase
        .from('notion_todos')
        .select('notion_page_id,task_title,status,last_updated_at,created_at,metadata')
        .gte('last_updated_at', `${startKey}T00:00:00.000Z`)
        .order('last_updated_at', { ascending: true }),
    ]);

    if (adsResponse.error) {
      setError(`Failed to load Meta ads data: ${adsResponse.error.message}`);
      setLoading(false);
      return;
    }
    if (contactsResponse.error) {
      setError(`Failed to load HubSpot contacts: ${contactsResponse.error.message}`);
      setLoading(false);
      return;
    }
    if (Array.isArray(contactsResponse.schemaWarnings) && contactsResponse.schemaWarnings.length > 0) {
      nextWarnings.push(...contactsResponse.schemaWarnings);
    }

    if (activitiesResponse.error) {
      nextWarnings.push(`Interviews feed unavailable: ${activitiesResponse.error.message}`);
    }
    if (donationsResponse.error) {
      nextWarnings.push(`Donations feed unavailable: ${donationsResponse.error.message}`);
    }
    if (todosResponse.error) {
      nextWarnings.push(`Operations feed unavailable: ${todosResponse.error.message}`);
    }

    // Fetch contact associations for attendance counting.
    // Stored separately so normalizeHubspotAttendanceSessions can build
    // one attendee key per contact (email preferred, name fallback) instead
    // of going through collectAttendeeKeys which double-counts.
    const activityRows = activitiesResponse.data || [];
    const activityIds = activityRows
      .map((row) => Number(row?.hubspot_activity_id))
      .filter((id) => Number.isFinite(id));

    let assocRows = [];
    if (activityIds.length > 0) {
      for (let i = 0; i < activityIds.length; i += 200) {
        const chunk = activityIds.slice(i, i + 200);
        const assocResult = await supabase
          .from('hubspot_activity_contact_associations')
          .select('hubspot_activity_id,contact_email,contact_firstname,contact_lastname')
          .in('activity_type', ['call', 'meeting'])
          .in('hubspot_activity_id', chunk);
        if (assocResult.error) {
          nextWarnings.push(`Attendance contacts unavailable: ${assocResult.error.message}`);
          break;
        }
        assocRows.push(...(assocResult.data || []));
      }
    }

    setWarnings(nextWarnings);
    setRawData({
      adsRows: adsResponse.data || [],
      contacts: contactsResponse.data || [],
      activities: activityRows,
      associations: assocRows,
      donationRows: donationsResponse.data || [],
      todoRows: todosResponse.data || [],
    });
    setLastLoadedAt(new Date().toISOString());
    setLoading(false);
  }, [todayKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('dashboard-kpi-recommendation-feedback-v1');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setRecommendationFeedback(parsed);
      }
    } catch (_) {
      // Ignore malformed cached feedback.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('dashboard-kpi-recommendation-feedback-v1', JSON.stringify(recommendationFeedback));
    } catch (_) {
      // Ignore localStorage write failures.
    }
  }, [recommendationFeedback]);

  const snapshot = useMemo(() => computeKpiSnapshot(rawData, windows, todayKey), [rawData, windows, todayKey]);
  const aiNarrative = useMemo(() => buildAiNarrative(snapshot), [snapshot]);

  const freeCards = useMemo(
    () => FREE_CARD_KEYS.map((metricKey) => buildCardModel({ metricKey, snapshot })).filter(Boolean),
    [snapshot],
  );
  const phoenixCards = useMemo(
    () => PHOENIX_CARD_KEYS.map((metricKey) => buildCardModel({ metricKey, snapshot })).filter(Boolean),
    [snapshot],
  );
  const attendanceCards = useMemo(
    () => ATTENDANCE_CARD_KEYS.map((metricKey) => buildCardModel({ metricKey, snapshot })).filter(Boolean),
    [snapshot],
  );
  const donationCards = useMemo(
    () => DONATION_CARD_KEYS.map((metricKey) => buildCardModel({ metricKey, snapshot })).filter(Boolean),
    [snapshot],
  );
  const operationCards = useMemo(
    () => OPERATIONS_CARD_KEYS.map((metricKey) => buildCardModel({ metricKey, snapshot })).filter(Boolean),
    [snapshot],
  );

  const sectionRecommendations = useMemo(
    () => buildSectionRecommendations(snapshot, windows, aiNarrative),
    [snapshot, windows, aiNarrative],
  );
  const mustDoToday = useMemo(
    () => buildMustDoToday(snapshot, sectionRecommendations),
    [snapshot, sectionRecommendations],
  );

  const runRecommendationAction = async (recommendation) => {
    setActionState((prev) => ({
      ...prev,
      [recommendation.id]: { status: 'running', message: 'Running...' },
    }));

    try {
      const result = await supabase.functions.invoke('master-sync', {
        body: {
          action: 'create_task',
          properties: buildNotionCreateTaskProperties(
            recommendation.taskName,
            recommendation.priority || 'Medium Priority',
          ),
        },
      });
      if (result?.error) throw result.error;
      setActionState((prev) => ({
        ...prev,
        [recommendation.id]: { status: 'done', message: 'Task queued' },
      }));
    } catch (actionError) {
      setActionState((prev) => ({
        ...prev,
        [recommendation.id]: {
          status: 'error',
          message: actionError?.message || 'Action failed',
        },
      }));
    }
  };

  const setRecommendationVote = (recommendationId, vote) => {
    setRecommendationFeedback((prev) => ({
      ...prev,
      [recommendationId]: {
        ...(prev[recommendationId] || {}),
        vote,
        reason: vote === 'up' ? '' : (prev[recommendationId]?.reason || ''),
      },
    }));
    if (vote === 'up') {
      setFeedbackDrafts((prev) => ({ ...prev, [recommendationId]: '' }));
    }
  };

  const saveDownvoteReason = (recommendationId) => {
    const reason = String(feedbackDrafts[recommendationId] || '').trim();
    setRecommendationFeedback((prev) => ({
      ...prev,
      [recommendationId]: {
        ...(prev[recommendationId] || {}),
        vote: 'down',
        reason,
        savedAt: new Date().toISOString(),
      },
    }));
  };

  if (loading && !lastLoadedAt) {
    return (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Loader2 size={18} className="animate-spin" />
        <p style={{ fontWeight: 700 }}>Loading KPI overview...</p>
      </div>
    );
  }

  if (error && !lastLoadedAt) {
    return (
      <div className="glass-panel" style={{ padding: '20px', border: '1px solid rgba(248,113,113,0.5)' }}>
        <p style={{ fontWeight: 700, color: '#fecaca' }}>Dashboard load failed</p>
        <p style={{ marginTop: '8px', color: 'var(--color-text-secondary)' }}>{error}</p>
        <button className="btn-glass" type="button" onClick={loadData} style={{ marginTop: '12px' }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-panel" style={{ padding: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: '28px' }}>Dashboard Overview</h3>
            <p style={{ marginTop: '6px', color: 'var(--color-text-secondary)' }}>
              Main KPI overview for leadership decisions across Leads, Attendance, Donations, and Operations.
            </p>
            <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Current period: {windows.current.label} ({windows.current.start} to {windows.current.end}) | Previous period: {windows.previous.label} ({windows.previous.start} to {windows.previous.end})
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label htmlFor="dashboard-range" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                Time Range
              </label>
              <select
                id="dashboard-range"
                className="neo-input"
                data-testid="dashboard-time-range-select"
                aria-label="Dashboard Time Range"
                value={rangeType}
                onChange={(event) => setRangeType(event.target.value)}
                style={{ minWidth: '170px' }}
              >
                {RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            {rangeType === 'custom' && (
              <>
                <div>
                  <label htmlFor="dashboard-range-start" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                    Start
                  </label>
                  <input
                    id="dashboard-range-start"
                    className="neo-input"
                    type="date"
                    value={customStart}
                    onChange={(event) => setCustomStart(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="dashboard-range-end" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                    End
                  </label>
                  <input
                    id="dashboard-range-end"
                    className="neo-input"
                    type="date"
                    value={customEnd}
                    onChange={(event) => setCustomEnd(event.target.value)}
                  />
                </div>
              </>
            )}
            <button className="btn-glass" type="button" onClick={loadData} disabled={loading} style={{ height: '40px' }}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="glass-panel" style={{ padding: '12px', border: '1px solid rgba(248,113,113,0.4)', color: '#fecaca' }}>
          <p style={{ fontWeight: 700 }}>Partial load warning</p>
          <p style={{ marginTop: '4px', color: 'var(--color-text-secondary)' }}>{error}</p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="glass-panel" style={{ padding: '12px', border: '1px solid rgba(245,158,11,0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} color="#fbbf24" />
            <p style={{ fontWeight: 700 }}>Data Quality Notes</p>
          </div>
          <ul style={{ marginTop: '8px', listStyle: 'disc', paddingLeft: '18px', color: 'var(--color-text-secondary)' }}>
            {warnings.map((warning) => (
              <li key={warning} style={{ marginTop: '4px' }}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="glass-panel" style={{ padding: '14px' }}>
        <h4 style={{ fontSize: '18px' }}>Section 1 - Phoenix Forum Funnel</h4>
        <p style={{ marginTop: '4px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          Top priority — drive Phoenix leads, interviews, and paying members.
        </p>
        <div style={{ ...cardGridStyle, marginTop: '12px' }}>
          {phoenixCards.map((card) => (
            <KPICard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '14px' }}>
        <h4 style={{ fontSize: '18px' }}>Section 2 - Free Group Funnel</h4>
        <div style={{ ...cardGridStyle, marginTop: '12px' }}>
          {freeCards.map((card) => (
            <KPICard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '14px' }}>
        <h4 style={{ fontSize: '18px' }}>Section 3 - Attendance</h4>
        <div style={{ ...cardGridStyle, marginTop: '12px' }}>
          {attendanceCards.map((card) => (
            <KPICard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '14px' }}>
        <h4 style={{ fontSize: '18px' }}>Section 4 - Donations</h4>
        <div style={{ ...cardGridStyle, marginTop: '12px' }}>
          {donationCards.map((card) => (
            <KPICard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '14px' }}>
        <h4 style={{ fontSize: '18px' }}>Section 5 - Operations</h4>
        <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          Notion database: 207b3385c3e080179ff5cd3cdfdac443
        </p>
        <div style={{ ...cardGridStyle, marginTop: '12px' }}>
          {operationCards.map((card) => (
            <KPICard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={17} />
          <h4 style={{ fontSize: '18px' }}>AI Summary</h4>
        </div>
        <ul style={{ marginTop: '10px', listStyle: 'disc', paddingLeft: '18px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          <li>{aiNarrative.healthLine}</li>
          <li>{aiNarrative.bottleneckLine}</li>
          <li>{aiNarrative.trendLine}</li>
        </ul>

        {mustDoToday && (
          <div style={{ marginTop: '14px', backgroundColor: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)', borderRadius: '12px', padding: '12px' }}>
            <p style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-warning)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Must Do Today
            </p>
            <p style={{ marginTop: '4px', fontSize: '16px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              {mustDoToday.section}: {mustDoToday.title}
            </p>
            <p style={{ marginTop: '6px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{mustDoToday.description}</p>
            {mustDoToday.definitionOfDone && (
              <p style={{ marginTop: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--color-success)' }}>
                Finished looks like: {mustDoToday.definitionOfDone}
              </p>
            )}
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: '10px', padding: '7px 12px', fontSize: '12px' }}
              onClick={() => runRecommendationAction(mustDoToday)}
              disabled={loading || actionState[mustDoToday.id]?.status === 'running'}
            >
              {actionState[mustDoToday.id]?.status === 'running' ? 'Running...' : 'Do This Now'}
            </button>
          </div>
        )}

        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
          {Object.entries(sectionRecommendations).map(([sectionName, recommendations]) => (
            <div key={sectionName} style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={15} />
                <p style={{ fontWeight: 700 }}>{sectionName} (3 Suggestions)</p>
              </div>
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recommendations.map((recommendation) => {
                  const state = actionState[recommendation.id] || {};
                  const feedback = recommendationFeedback[recommendation.id] || {};
                  const isDown = feedback.vote === 'down';
                  return (
                    <div key={recommendation.id} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '9px', backgroundColor: 'var(--color-surface-elevated)' }}>
                      <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text-primary)' }}>{recommendation.title}</p>
                      <p style={{ marginTop: '4px', color: 'var(--color-text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>{recommendation.description}</p>
                      {recommendation.definitionOfDone && (
                        <p style={{ marginTop: '4px', color: 'var(--color-success)', fontSize: '11px', fontWeight: 700, lineHeight: 1.4 }}>
                          Finished looks like: {recommendation.definitionOfDone}
                        </p>
                      )}
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => runRecommendationAction(recommendation)}
                          disabled={state.status === 'running' || loading}
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                        >
                          {state.status === 'running' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          {state.status === 'running' ? 'Running...' : 'Do This'}
                        </button>
                        <button
                          type="button"
                          className="btn-glass"
                          aria-label="Add to Notion"
                          title="Add to Notion"
                          style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--color-text-primary)', borderColor: 'var(--color-border)' }}
                          onClick={() => setNotionModal({ open: true, taskName: recommendation.taskName })}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <img
                              src={notionLogo}
                              alt=""
                              style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '4px',
                                display: 'block',
                              }}
                            />
                            <span
                              style={{
                                color: 'var(--color-text-primary)',
                                display: 'inline-block',
                                fontSize: '16px',
                                lineHeight: 1,
                                fontWeight: 800,
                              }}
                            >
                              +
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn-glass"
                          aria-label="approve suggestion"
                          style={{
                            padding: '6px 8px',
                            fontSize: '16px',
                            lineHeight: 1,
                            color: 'var(--color-success)',
                            borderColor: feedback.vote === 'up' ? 'var(--color-success)' : 'rgba(22, 163, 74, 0.3)',
                            backgroundColor: feedback.vote === 'up' ? 'var(--color-success-bg)' : 'transparent',
                          }}
                          onClick={() => setRecommendationVote(recommendation.id, 'up')}
                        >
                          👍
                        </button>
                        <button
                          type="button"
                          className="btn-glass"
                          aria-label="reject suggestion"
                          style={{
                            padding: '6px 8px',
                            fontSize: '16px',
                            lineHeight: 1,
                            color: 'var(--color-danger)',
                            borderColor: feedback.vote === 'down' ? 'var(--color-danger)' : 'rgba(220, 38, 38, 0.3)',
                            backgroundColor: feedback.vote === 'down' ? 'var(--color-danger-bg)' : 'transparent',
                          }}
                          onClick={() => setRecommendationVote(recommendation.id, 'down')}
                        >
                          👎
                        </button>
                        <span style={{ fontSize: '11px', color: state.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                          {state.message || 'Ready'}
                        </span>
                      </div>
                      {isDown && (
                        <div style={{ marginTop: '8px' }}>
                          <textarea
                            value={feedbackDrafts[recommendation.id] ?? feedback.reason ?? ''}
                            onChange={(event) => setFeedbackDrafts((prev) => ({ ...prev, [recommendation.id]: event.target.value }))}
                            placeholder="Tell us why this is a bad suggestion so we can improve."
                            style={{
                              width: '100%',
                              minHeight: '64px',
                              borderRadius: '8px',
                              border: '1px solid var(--color-border)',
                              padding: '8px',
                              fontSize: '12px',
                              color: 'var(--color-text-primary)',
                              backgroundColor: 'rgba(10, 15, 24, 0.6)',
                            }}
                          />
                          <button
                            type="button"
                            className="btn-glass"
                            style={{ marginTop: '6px', fontSize: '12px', padding: '6px 10px', color: 'var(--color-text-primary)', borderColor: 'var(--color-border)' }}
                            onClick={() => saveDownvoteReason(recommendation.id)}
                          >
                            Save Feedback
                          </button>
                          {feedback.reason && (
                            <p style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                              Saved feedback: {feedback.reason}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
          Every recommendation has 👍 / 👎 feedback. Downvotes require a reason so suggestion quality can improve over time.
        </div>
      </section>

      <div className="glass-panel" style={{ padding: '10px', fontSize: '11px', color: '#cbd5e1' }}>
        <p>Last loaded: {formatTimestamp(lastLoadedAt)}</p>
        <p style={{ marginTop: '4px' }}>
          Source rows used - Ads: {formatInt(snapshot.sourceRows.ads)}, HubSpot Contacts: {formatInt(snapshot.sourceRows.contacts)}, Interviews: {formatInt(snapshot.sourceRows.interviews)}, Attendance Sessions: {formatInt(snapshot.sourceRows.sessions)}, Donations: {formatInt(snapshot.sourceRows.donations)}, Todo Items: {formatInt(snapshot.sourceRows.todos)}
        </p>
      </div>

      <SendToNotionModal
        isOpen={notionModal.open}
        defaultTaskName={notionModal.taskName}
        onClose={() => setNotionModal({ open: false, taskName: '' })}
      />
    </div>
  );
}

export default DashboardOverview;

