import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import KPICard from '../components/KPICard';
import SendToNotionModal from '../components/SendToNotionModal';
import { supabase } from '../lib/supabaseClient';
import { DASHBOARD_LOOKBACK_DAYS } from '../lib/env';
import { evaluateLeadQualification, parseOfficialRevenue } from '../lib/leadsQualificationRules';
import {
  THURSDAY_MEETING_ID,
  TUESDAY_MEETING_ID,
  buildDateRangeWindows,
  computeChangePct,
} from '../lib/leadsGroupAnalytics';

const RANGE_OPTIONS = [
  { value: 'week', label: 'Week' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
  { value: 'custom', label: 'Custom Range' },
];

const FREE_INTERVIEW_URL = 'https://meetings.hubspot.com/andrew-lassise/interview';
const PHOENIX_INTERVIEW_URLS = [
  'https://meetings.hubspot.com/andrew-lassise/phoenix-forum-interview',
  'https://meetings.hubspot.com/andrew-lassise/phoenix-forum-learn-more',
  'https://meetings.hubspot.com/andrew-lassise/phoenix-forum-good-fit',
];

const INTERVIEW_MATCH_TOKENS = {
  free: ['meetings.hubspot.com/andrew-lassise/interview'],
  phoenix: [
    'meetings.hubspot.com/andrew-lassise/phoenix-forum-interview',
    'meetings.hubspot.com/andrew-lassise/phoenix-forum-learn-more',
    'meetings.hubspot.com/andrew-lassise/phoenix-forum-good-fit',
  ],
};

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

function toDateKey(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toUtcDate(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function addDays(dateKey, days) {
  const date = toUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function dateInRange(dateKey, start, end) {
  return !!dateKey && dateKey >= start && dateKey <= end;
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePersonKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function formatInt(value) {
  if (!Number.isFinite(Number(value))) return '0';
  return Math.round(Number(value)).toLocaleString();
}

function formatDecimal(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return '0.00';
  return Number(value).toFixed(digits);
}

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) return 'N/A';
  return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return 'N/A';
  return `${(Number(value) * 100).toFixed(1)}%`;
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

  return {
    data: [],
    error: { message: 'HubSpot contacts query failed after removing all selectable columns.' },
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
      const revenue = parseOfficialRevenue(row);
      return {
        createdDateKey,
        funnel: classifyHubspotFunnel(row),
        qualified: qualification.qualified,
        great: Number.isFinite(Number(revenue)) && Number(revenue) >= 1_000_000,
      };
    })
    .filter((row) => row.createdDateKey);
}

function normalizeInterviewRows(rows = []) {
  return rows
    .map((row, index) => {
      const dateKey = toDateKey(row?.hs_timestamp || row?.created_at_hubspot);
      if (!dateKey) return null;
      const activityId = Number.isFinite(Number(row?.hubspot_activity_id))
        ? String(Math.trunc(Number(row.hubspot_activity_id)))
        : `idx-${index}-${dateKey}`;
      const textBlob = [
        row?.title,
        row?.body_preview,
        JSON.stringify(row?.metadata || {}),
      ]
        .map((value) => normalizeText(value))
        .join(' ');
      return { dateKey, activityId, textBlob };
    })
    .filter(Boolean);
}

function detectZoomDayType(row, dateKey) {
  const groupName = normalizeText(row?.metadata?.group_name);
  if (groupName === 'tuesday') return 'Tuesday';
  if (groupName === 'thursday') return 'Thursday';

  const meetingId = String(row?.metadata?.meeting_id || row?.metadata?.zoom_meeting_id || '').trim();
  if (meetingId === TUESDAY_MEETING_ID) return 'Tuesday';
  if (meetingId === THURSDAY_MEETING_ID) return 'Thursday';

  const date = toUtcDate(dateKey);
  const weekday = date.getUTCDay();
  if (weekday === 2) return 'Tuesday';
  if (weekday === 4) return 'Thursday';
  return null;
}

function normalizeZoomSessions(rows = []) {
  const sessions = [];
  rows.forEach((row) => {
    const dateKey = toDateKey(row?.metadata?.start_time || row?.metric_date);
    if (!dateKey) return;

    const dayType = detectZoomDayType(row, dateKey);
    if (!dayType) return;

    const attendeesRaw = Array.isArray(row?.metadata?.attendees)
      ? row.metadata.attendees
      : Array.isArray(row?.metadata?.participant_names)
        ? row.metadata.participant_names
        : [];

    const attendeeSet = new Set();
    attendeesRaw.forEach((entry) => {
      const source = typeof entry === 'string'
        ? entry
        : entry?.name || entry?.display_name || entry?.email || '';
      const key = normalizePersonKey(source);
      if (key) attendeeSet.add(key);
    });

    const startTsRaw = row?.metadata?.start_time || `${dateKey}T00:00:00.000Z`;
    const startTs = Date.parse(startTsRaw);
    sessions.push({
      dateKey,
      dayType,
      attendees: Array.from(attendeeSet),
      startTs: Number.isFinite(startTs) ? startTs : Date.parse(`${dateKey}T00:00:00.000Z`),
    });
  });

  sessions.sort((a, b) => {
    if (a.startTs !== b.startTs) return a.startTs - b.startTs;
    return a.dateKey.localeCompare(b.dateKey);
  });
  return sessions;
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
    if (row.great) acc.great += 1;
    return acc;
  }, { total: 0, qualified: 0, great: 0 });
}

function countInterviewBookings(rows, window, matchTokens) {
  const matchedIds = new Set();
  rows.forEach((row) => {
    if (!dateInRange(row.dateKey, window.start, window.end)) return;
    const matched = matchTokens.some((token) => row.textBlob.includes(token));
    if (matched) matchedIds.add(row.activityId);
  });
  return matchedIds.size;
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
  const seen = {
    Tuesday: new Set(),
    Thursday: new Set(),
  };

  const initWindowState = () => ({
    Tuesday: { netNew: 0, visits: 0, unique: new Set() },
    Thursday: { netNew: 0, visits: 0, unique: new Set() },
  });
  const state = {
    current: initWindowState(),
    previous: initWindowState(),
  };

  sessions.forEach((session) => {
    const day = session.dayType;
    const isCurrent = dateInRange(session.dateKey, currentWindow.start, currentWindow.end);
    const isPrevious = dateInRange(session.dateKey, previousWindow.start, previousWindow.end);
    const bucketKey = isCurrent ? 'current' : (isPrevious ? 'previous' : null);

    session.attendees.forEach((personKey) => {
      const daySeenSet = seen[day];
      const isNetNew = !daySeenSet.has(personKey);
      if (bucketKey) {
        const bucket = state[bucketKey][day];
        bucket.visits += 1;
        bucket.unique.add(personKey);
        if (isNetNew) bucket.netNew += 1;
      }
      if (isNetNew) daySeenSet.add(personKey);
    });
  });

  const toSnapshot = (bucket) => ({
    netNewTue: bucket.Tuesday.netNew,
    avgVisitsTue: bucket.Tuesday.unique.size > 0 ? bucket.Tuesday.visits / bucket.Tuesday.unique.size : 0,
    netNewThu: bucket.Thursday.netNew,
    avgVisitsThu: bucket.Thursday.unique.size > 0 ? bucket.Thursday.visits / bucket.Thursday.unique.size : 0,
  });

  return {
    current: toSnapshot(state.current),
    previous: toSnapshot(state.previous),
  };
}

function computeKpiSnapshot(rawData, windows) {
  const adsRows = normalizeAdsRows(rawData.adsRows || []);
  const contacts = normalizeHubspotContacts(rawData.contacts || []);
  const interviewRows = normalizeInterviewRows(rawData.activities || []);
  const zoomSessions = normalizeZoomSessions(rawData.zoomRows || []);
  const donationRows = normalizeDonationRows(rawData.donationRows || []);
  const todoRows = normalizeTodoRows(rawData.todoRows || []);

  const freeAdsCurrent = aggregateAds(adsRows, windows.current, 'free');
  const freeAdsPrevious = aggregateAds(adsRows, windows.previous, 'free');
  const freeLeadsCurrent = aggregateLeadContacts(contacts, windows.current, 'free');
  const freeLeadsPrevious = aggregateLeadContacts(contacts, windows.previous, 'free');

  const phoenixAdsCurrent = aggregateAds(adsRows, windows.current, 'phoenix');
  const phoenixAdsPrevious = aggregateAds(adsRows, windows.previous, 'phoenix');
  const phoenixLeadsCurrent = aggregateLeadContacts(contacts, windows.current, 'phoenix');
  const phoenixLeadsPrevious = aggregateLeadContacts(contacts, windows.previous, 'phoenix');

  const freeInterviewCurrent = countInterviewBookings(interviewRows, windows.current, INTERVIEW_MATCH_TOKENS.free);
  const freeInterviewPrevious = countInterviewBookings(interviewRows, windows.previous, INTERVIEW_MATCH_TOKENS.free);
  const phoenixInterviewCurrent = countInterviewBookings(interviewRows, windows.current, INTERVIEW_MATCH_TOKENS.phoenix);
  const phoenixInterviewPrevious = countInterviewBookings(interviewRows, windows.previous, INTERVIEW_MATCH_TOKENS.phoenix);

  const attendance = buildAttendanceSnapshots(zoomSessions, windows.current, windows.previous);
  const donationsCurrent = aggregateDonations(donationRows, windows.current);
  const donationsPrevious = aggregateDonations(donationRows, windows.previous);
  const completedItemsCurrent = aggregateCompletedItems(todoRows, windows.current);
  const completedItemsPrevious = aggregateCompletedItems(todoRows, windows.previous);

  return {
    free: {
      current: {
        meetings: freeAdsCurrent.leads,
        qualified: freeLeadsCurrent.qualified,
        great: freeLeadsCurrent.great,
        cpql: safeDivide(freeAdsCurrent.spend, freeLeadsCurrent.qualified),
        cpgl: safeDivide(freeAdsCurrent.spend, freeLeadsCurrent.great),
        interviews: freeInterviewCurrent,
        spend: freeAdsCurrent.spend,
      },
      previous: {
        meetings: freeAdsPrevious.leads,
        qualified: freeLeadsPrevious.qualified,
        great: freeLeadsPrevious.great,
        cpql: safeDivide(freeAdsPrevious.spend, freeLeadsPrevious.qualified),
        cpgl: safeDivide(freeAdsPrevious.spend, freeLeadsPrevious.great),
        interviews: freeInterviewPrevious,
        spend: freeAdsPrevious.spend,
      },
    },
    phoenix: {
      current: {
        leads: phoenixAdsCurrent.leads,
        qualified: phoenixLeadsCurrent.qualified,
        great: phoenixLeadsCurrent.great,
        cpql: safeDivide(phoenixAdsCurrent.spend, phoenixLeadsCurrent.qualified),
        cpgl: safeDivide(phoenixAdsCurrent.spend, phoenixLeadsCurrent.great),
        interviews: phoenixInterviewCurrent,
        spend: phoenixAdsCurrent.spend,
      },
      previous: {
        leads: phoenixAdsPrevious.leads,
        qualified: phoenixLeadsPrevious.qualified,
        great: phoenixLeadsPrevious.great,
        cpql: safeDivide(phoenixAdsPrevious.spend, phoenixLeadsPrevious.qualified),
        cpgl: safeDivide(phoenixAdsPrevious.spend, phoenixLeadsPrevious.great),
        interviews: phoenixInterviewPrevious,
        spend: phoenixAdsPrevious.spend,
      },
    },
    attendance,
    donations: {
      current: donationsCurrent,
      previous: donationsPrevious,
    },
    operations: {
      current: { completedItems: completedItemsCurrent },
      previous: { completedItems: completedItemsPrevious },
    },
    sourceRows: {
      ads: adsRows.length,
      contacts: contacts.length,
      interviews: interviewRows.length,
      sessions: zoomSessions.length,
      donations: donationRows.length,
      todos: todoRows.length,
    },
  };
}

function calculateDisplayChange(current, previous, invertColor = false) {
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber)) return null;
  if (previousNumber === 0) {
    if (currentNumber === 0) return 0;
    return null;
  }
  const { pct } = computeChangePct(currentNumber, previousNumber);
  if (pct === null || pct === undefined) return null;
  return invertColor ? -pct : pct;
}

function toTrendDirection(displayChange) {
  if (displayChange === null || displayChange === undefined) return 'neutral';
  if (displayChange > 0) return 'up';
  if (displayChange < 0) return 'down';
  return 'neutral';
}

function toTrendValue(displayChange) {
  if (displayChange === null || displayChange === undefined) return 'N/A';
  return `${displayChange >= 0 ? '+' : ''}${(displayChange * 100).toFixed(1)}%`;
}

function buildCardModel({ title, current, previous, format, note, color, invertColor = false }) {
  const displayChange = calculateDisplayChange(current, previous, invertColor);
  const trend = toTrendDirection(displayChange);
  const trendValue = toTrendValue(displayChange);

  let value = 'N/A';
  if (format === 'currency') value = formatCurrency(current);
  else if (format === 'decimal') value = formatDecimal(current);
  else if (format === 'percent') value = formatPercent(current);
  else value = formatInt(current);

  return {
    title,
    value,
    subvalue: note,
    trend,
    trendValue,
    invertColor,
    color,
    chartData: [
      { name: 'Prior', value: Number.isFinite(Number(previous)) ? Number(previous) : 0 },
      { name: 'Current', value: Number.isFinite(Number(current)) ? Number(current) : 0 },
    ],
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
    { key: 'free-qualified', label: 'Free funnel lead to qualified conversion', value: freeQualifiedRate },
    { key: 'phoenix-qualified', label: 'Phoenix funnel lead to qualified conversion', value: phoenixQualifiedRate },
    { key: 'free-interview', label: 'Free funnel qualified to interview conversion', value: freeInterviewRate },
    { key: 'phoenix-interview', label: 'Phoenix funnel qualified to interview conversion', value: phoenixInterviewRate },
  ].filter((item) => Number.isFinite(Number(item.value)));

  const weakest = bottlenecks.length > 0
    ? [...bottlenecks].sort((a, b) => Number(a.value) - Number(b.value))[0]
    : null;

  const trendRows = [
    {
      label: 'Free qualified leads',
      delta: calculateDisplayChange(snapshot.free.current.qualified, snapshot.free.previous.qualified, false),
    },
    {
      label: 'Phoenix qualified leads',
      delta: calculateDisplayChange(snapshot.phoenix.current.qualified, snapshot.phoenix.previous.qualified, false),
    },
    {
      label: 'CPQL efficiency',
      delta: calculateDisplayChange(blendedCPQL, safeDivide(
        snapshot.free.previous.spend + snapshot.phoenix.previous.spend,
        snapshot.free.previous.qualified + snapshot.phoenix.previous.qualified,
      ), true),
    },
    {
      label: 'Donations amount',
      delta: calculateDisplayChange(snapshot.donations.current.amount, snapshot.donations.previous.amount, false),
    },
  ];

  const improving = trendRows.filter((row) => row.delta !== null && row.delta > 0).map((row) => row.label);
  const deteriorating = trendRows.filter((row) => row.delta !== null && row.delta < 0).map((row) => row.label);

  const healthLine = `Qualified lead volume is ${formatInt(snapshot.free.current.qualified + snapshot.phoenix.current.qualified)} with blended CPQL ${formatCurrency(blendedCPQL)} and donation volume ${formatCurrency(snapshot.donations.current.amount)}.`;
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
    weakestLabel: weakest?.label || 'Qualified conversion',
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
    zoomRows: [],
    donationRows: [],
    todoRows: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [actionState, setActionState] = useState({});
  const [notionModal, setNotionModal] = useState({ open: false, taskName: '' });

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
      zoomResponse,
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
        .from('kpi_metrics')
        .select('metric_date,metadata')
        .eq('metric_name', 'Zoom Meeting Attendees')
        .gte('metric_date', startKey)
        .order('metric_date', { ascending: true }),
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
    if (zoomResponse.error) {
      nextWarnings.push(`Attendance feed unavailable: ${zoomResponse.error.message}`);
    }
    if (donationsResponse.error) {
      nextWarnings.push(`Donations feed unavailable: ${donationsResponse.error.message}`);
    }
    if (todosResponse.error) {
      nextWarnings.push(`Operations feed unavailable: ${todosResponse.error.message}`);
    }

    setWarnings(nextWarnings);
    setRawData({
      adsRows: adsResponse.data || [],
      contacts: contactsResponse.data || [],
      activities: activitiesResponse.data || [],
      zoomRows: zoomResponse.data || [],
      donationRows: donationsResponse.data || [],
      todoRows: todosResponse.data || [],
    });
    setLastLoadedAt(new Date().toISOString());
    setLoading(false);
  }, [todayKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const snapshot = useMemo(() => computeKpiSnapshot(rawData, windows), [rawData, windows]);
  const aiNarrative = useMemo(() => buildAiNarrative(snapshot), [snapshot]);

  const freeCards = useMemo(() => ([
    buildCardModel({
      title: 'Free Meetings',
      current: snapshot.free.current.meetings,
      previous: snapshot.free.previous.meetings,
      format: 'count',
      note: 'Meta free-group lead form submissions',
      color: '#0f766e',
    }),
    buildCardModel({
      title: 'New Qualified Leads',
      current: snapshot.free.current.qualified,
      previous: snapshot.free.previous.qualified,
      format: 'count',
      note: 'Revenue >= $250k and sobriety > 1 year',
      color: '#166534',
    }),
    buildCardModel({
      title: 'Cost Per Qualified Lead (CPQL)',
      current: snapshot.free.current.cpql,
      previous: snapshot.free.previous.cpql,
      format: 'currency',
      note: 'Free Group Ad Spend / New Qualified Leads',
      color: '#0369a1',
      invertColor: true,
    }),
    buildCardModel({
      title: 'New Great Leads',
      current: snapshot.free.current.great,
      previous: snapshot.free.previous.great,
      format: 'count',
      note: 'Revenue >= $1M',
      color: '#4f46e5',
    }),
    buildCardModel({
      title: 'Cost Per Great Lead (CPGL)',
      current: snapshot.free.current.cpgl,
      previous: snapshot.free.previous.cpgl,
      format: 'currency',
      note: 'Free Group Ad Spend / New Great Leads',
      color: '#7c3aed',
      invertColor: true,
    }),
    buildCardModel({
      title: 'Free Group Interviews',
      current: snapshot.free.current.interviews,
      previous: snapshot.free.previous.interviews,
      format: 'count',
      note: 'Bookings on the Free Group interview link',
      color: '#0ea5e9',
    }),
  ]), [snapshot.free]);

  const phoenixCards = useMemo(() => ([
    buildCardModel({
      title: 'Phoenix Forum Leads',
      current: snapshot.phoenix.current.leads,
      previous: snapshot.phoenix.previous.leads,
      format: 'count',
      note: 'Campaign name contains "Phoenix"',
      color: '#0f766e',
    }),
    buildCardModel({
      title: 'Phoenix Qualified Leads',
      current: snapshot.phoenix.current.qualified,
      previous: snapshot.phoenix.previous.qualified,
      format: 'count',
      note: 'Revenue >= $250k and sobriety > 1 year',
      color: '#166534',
    }),
    buildCardModel({
      title: 'Phoenix Great Leads',
      current: snapshot.phoenix.current.great,
      previous: snapshot.phoenix.previous.great,
      format: 'count',
      note: 'Revenue >= $1M',
      color: '#4f46e5',
    }),
    buildCardModel({
      title: 'Phoenix CPQL',
      current: snapshot.phoenix.current.cpql,
      previous: snapshot.phoenix.previous.cpql,
      format: 'currency',
      note: 'Phoenix Ad Spend / Phoenix Qualified Leads',
      color: '#0369a1',
      invertColor: true,
    }),
    buildCardModel({
      title: 'Phoenix CPGL',
      current: snapshot.phoenix.current.cpgl,
      previous: snapshot.phoenix.previous.cpgl,
      format: 'currency',
      note: 'Phoenix Ad Spend / Phoenix Great Leads',
      color: '#7c3aed',
      invertColor: true,
    }),
    buildCardModel({
      title: 'Phoenix Forum Interviews',
      current: snapshot.phoenix.current.interviews,
      previous: snapshot.phoenix.previous.interviews,
      format: 'count',
      note: 'Bookings across all Phoenix Forum interview links',
      color: '#0ea5e9',
    }),
  ]), [snapshot.phoenix]);

  const attendanceCards = useMemo(() => ([
    buildCardModel({
      title: 'Net New Attendees (Tuesday)',
      current: snapshot.attendance.current.netNewTue,
      previous: snapshot.attendance.previous.netNewTue,
      format: 'count',
      note: 'First-time Tuesday attendees in selected range',
      color: '#0ea5e9',
    }),
    buildCardModel({
      title: 'Avg Visits (Tuesday)',
      current: snapshot.attendance.current.avgVisitsTue,
      previous: snapshot.attendance.previous.avgVisitsTue,
      format: 'decimal',
      note: 'Total Tuesday visits / unique Tuesday attendees',
      color: '#38bdf8',
    }),
    buildCardModel({
      title: 'Net New Attendees (Thursday)',
      current: snapshot.attendance.current.netNewThu,
      previous: snapshot.attendance.previous.netNewThu,
      format: 'count',
      note: 'First-time Thursday attendees in selected range',
      color: '#6366f1',
    }),
    buildCardModel({
      title: 'Avg Visits (Thursday)',
      current: snapshot.attendance.current.avgVisitsThu,
      previous: snapshot.attendance.previous.avgVisitsThu,
      format: 'decimal',
      note: 'Total Thursday visits / unique Thursday attendees',
      color: '#818cf8',
    }),
  ]), [snapshot.attendance]);

  const donationCards = useMemo(() => ([
    buildCardModel({
      title: '# Donations',
      current: snapshot.donations.current.count,
      previous: snapshot.donations.previous.count,
      format: 'count',
      note: 'Total donation transactions in selected range',
      color: '#15803d',
    }),
    buildCardModel({
      title: '$ Donations',
      current: snapshot.donations.current.amount,
      previous: snapshot.donations.previous.amount,
      format: 'currency',
      note: 'Total donated amount in selected range',
      color: '#16a34a',
    }),
  ]), [snapshot.donations]);

  const operationCards = useMemo(() => ([
    buildCardModel({
      title: 'Completed Items',
      current: snapshot.operations.current.completedItems,
      previous: snapshot.operations.previous.completedItems,
      format: 'count',
      note: 'Notion To-Do status moved to Done in selected range',
      color: '#ea580c',
    }),
  ]), [snapshot.operations]);

  const aiActions = useMemo(() => ([
    {
      id: 'sync-all-sources',
      title: 'Refresh Source Pipelines',
      description: 'Trigger HubSpot, Meta, attendance, and KPI sync before decision review.',
      run: async () => supabase.functions.invoke('master-sync', {
        method: 'GET',
        queryString: { trigger_refresh: 'true' },
      }),
    },
    {
      id: 'queue-campaign-optimization-task',
      title: 'Queue Campaign Optimization Task',
      description: `Create a Notion task to improve ${aiNarrative.weakestLabel}.`,
      run: async () => supabase.functions.invoke('master-sync', {
        body: {
          action: 'create_task',
          properties: buildNotionCreateTaskProperties(
            `Optimize campaign strategy: ${aiNarrative.weakestLabel} (${windows.current.label})`,
            'High Priority',
          ),
        },
      }),
    },
    {
      id: 'queue-followup-workflow-task',
      title: 'Queue Follow-up Workflow Task',
      description: 'Create a Notion task for outreach/follow-up workflow updates from KPI trends.',
      run: async () => supabase.functions.invoke('master-sync', {
        body: {
          action: 'create_task',
          properties: buildNotionCreateTaskProperties(
            `Build follow-up workflow from KPI trends (${windows.current.label})`,
            'Medium Priority',
          ),
        },
      }),
    },
  ]), [aiNarrative.weakestLabel, windows]);

  const humanActions = useMemo(() => ([
    {
      id: 'human-budget-shift',
      text: `Approve budget reallocation by comparing Free vs Phoenix CPQL and CPGL for ${windows.current.label}.`,
      notionTask: `Leadership decision: reallocate budget based on CPQL/CPGL (${windows.current.label})`,
    },
    {
      id: 'human-interview-review',
      text: 'Review interview scheduling friction for the weakest funnel stage and choose one owner for correction.',
      notionTask: `Review interview funnel friction and assign owner (${aiNarrative.weakestLabel})`,
    },
    {
      id: 'human-ops-throughput',
      text: 'Validate completed-item throughput from Notion and remove blockers delaying Done transitions.',
      notionTask: 'Audit operations throughput and resolve Done-state blockers',
    },
  ]), [aiNarrative.weakestLabel, windows]);

  const runAiAction = async (action) => {
    setActionState((prev) => ({
      ...prev,
      [action.id]: { status: 'running', message: 'Running...' },
    }));

    try {
      const result = await action.run();
      if (result?.error) throw result.error;
      setActionState((prev) => ({
        ...prev,
        [action.id]: { status: 'done', message: 'Completed' },
      }));
    } catch (actionError) {
      setActionState((prev) => ({
        ...prev,
        [action.id]: {
          status: 'error',
          message: actionError?.message || 'Action failed',
        },
      }));
    }
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
        <h4 style={{ fontSize: '18px' }}>Section 1 - Free Group Funnel</h4>
        <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          Interview link: <a href={FREE_INTERVIEW_URL} target="_blank" rel="noreferrer">{FREE_INTERVIEW_URL}</a>
        </p>
        <div style={{ ...cardGridStyle, marginTop: '12px' }}>
          {freeCards.map((card) => (
            <KPICard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="glass-panel" style={{ padding: '14px' }}>
        <h4 style={{ fontSize: '18px' }}>Section 2 - Phoenix Forum Funnel</h4>
        <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          Interview links: {PHOENIX_INTERVIEW_URLS.map((url) => (
            <span key={url} style={{ marginRight: '8px' }}>
              <a href={url} target="_blank" rel="noreferrer">{url}</a>
            </span>
          ))}
        </p>
        <div style={{ ...cardGridStyle, marginTop: '12px' }}>
          {phoenixCards.map((card) => (
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

        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={15} />
              <p style={{ fontWeight: 700 }}>AI Can Execute (Top 3)</p>
            </div>
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {aiActions.map((action) => {
                const state = actionState[action.id] || {};
                return (
                  <div key={action.id} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '8px' }}>
                    <p style={{ fontWeight: 700, fontSize: '13px' }}>{action.title}</p>
                    <p style={{ marginTop: '4px', color: 'var(--color-text-secondary)', fontSize: '12px' }}>{action.description}</p>
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => runAiAction(action)}
                        disabled={state.status === 'running' || loading}
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                      >
                        {state.status === 'running' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        {state.status === 'running' ? 'Running...' : 'Do This'}
                      </button>
                      <span style={{ fontSize: '11px', color: state.status === 'error' ? '#fca5a5' : 'var(--color-text-muted)' }}>
                        {state.message || 'Ready'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={15} />
              <p style={{ fontWeight: 700 }}>Human Actions (Top 3)</p>
            </div>
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {humanActions.map((action) => (
                <div key={action.id} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '8px' }}>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>{action.text}</p>
                  <button
                    type="button"
                    className="btn-glass"
                    style={{ marginTop: '8px', padding: '6px 10px', fontSize: '12px' }}
                    onClick={() => setNotionModal({ open: true, taskName: action.notionTask })}
                  >
                    Add to Notion
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="glass-panel" style={{ padding: '10px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
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
