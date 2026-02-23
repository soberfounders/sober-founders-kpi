import React, { useEffect, useMemo, useState } from 'react';
/* -- DATA SOURCE: HubSpot Calls only. Do not add Zoom data as a fallback or supplement. See audit performed 2026-02-23. */
import { supabase } from '../lib/supabaseClient';
import { resolveCanonicalAttendeeName } from '../lib/attendeeCanonicalization';
import { getZoomAttributionOverride } from '../lib/zoomAttributionOverrides';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import {
  Calendar,
  Users,
  ShieldCheck,
  TrendingUp,
  UserRoundCheck,
  AlertTriangle,
  Brain,
  Download,
  Sparkles,
} from 'lucide-react';

const TUE_MEETING_ID = '87199667045';
const THU_MEETING_ID = '84242212480';
const RECENT_WINDOW = 8;
const HUBSPOT_PORTAL_ID = String(import.meta.env.VITE_HUBSPOT_PORTAL_ID || '45070276').trim();

function normalizeName(name = '') {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
}

function parseAdditionalEmails(value = '') {
  return String(value || '')
    .split(',')
    .map((v) => normalizeEmail(v))
    .filter(Boolean);
}

function fullNameFromHubspot(row = {}) {
  if (!row) return '';
  return `${String(row.firstname || '').trim()} ${String(row.lastname || '').trim()}`.trim();
}

const HUBSPOT_REVENUE_FIELDS = [
  'annual_revenue_in_usd_official',
  'annual_revenue_in_dollars__official_',
  'annual_revenue_in_dollars',
  'annual_revenue',
];

const HUBSPOT_SOBRIETY_FIELDS = [
  'sobriety_date',
  'sobriety_date__official_',
  'sober_date',
  'clean_date',
  'sobrietydate',
];

function firstPresentHubspotField(row = {}, fieldNames = []) {
  if (!row || !Array.isArray(fieldNames)) return null;
  for (const fieldName of fieldNames) {
    const value = row?.[fieldName];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function resolveHubspotRevenueValue(row = {}) {
  const raw = firstPresentHubspotField(row, HUBSPOT_REVENUE_FIELDS);
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveHubspotSobrietyValue(row = {}) {
  return firstPresentHubspotField(row, HUBSPOT_SOBRIETY_FIELDS);
}

function hubspotEnrichmentRowScore(row = {}) {
  let score = 0;
  if (normalizeEmail(row?.email)) score += 2;
  if (resolveHubspotRevenueValue(row) !== null) score += 4;
  if (resolveHubspotSobrietyValue(row)) score += 2;
  if (row?.hs_analytics_source) score += 1;
  if (row?.hs_additional_emails) score += 1;
  return score;
}

function hubspotRowTimestamp(row = {}) {
  const candidates = [
    row?.hs_lastmodifieddate,
    row?.lastmodifieddate,
    row?.updated_at,
    row?.createdate,
  ];
  for (const candidate of candidates) {
    const ts = Date.parse(candidate || '');
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
}

function pickBetterHubspotEnrichmentRow(existing, candidate) {
  if (!existing) return candidate || null;
  if (!candidate) return existing;
  const existingScore = hubspotEnrichmentRowScore(existing);
  const candidateScore = hubspotEnrichmentRowScore(candidate);
  if (candidateScore !== existingScore) return candidateScore > existingScore ? candidate : existing;
  const existingTs = hubspotRowTimestamp(existing);
  const candidateTs = hubspotRowTimestamp(candidate);
  if (candidateTs !== existingTs) return candidateTs > existingTs ? candidate : existing;
  return existing;
}

function buildHubspotContactUrl(contactId, explicitUrl = '') {
  if (explicitUrl) return explicitUrl;
  const id = Number(contactId);
  if (!Number.isFinite(id) || id <= 0) return '';
  if (!HUBSPOT_PORTAL_ID) return '';
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-1/${id}`;
}

function dateKeyDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function chunkArray(items = [], chunkSize = 200) {
  const normalizedSize = Math.max(1, Number(chunkSize) || 200);
  const chunks = [];
  for (let i = 0; i < items.length; i += normalizedSize) {
    chunks.push(items.slice(i, i + normalizedSize));
  }
  return chunks;
}

function tokenizeName(name = '') {
  return normalizeName(name)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(' ')
    .map((x) => x.trim())
    .filter(Boolean);
}

const DEVICE_NAME_PATTERNS = [
  /^ipad$/i,
  /^iphone$/i,
  /^android$/i,
  /^tablet$/i,
  /^phone$/i,
  /^\d+$/,          // Only numbers
  /^[a-zA-Z]$/,     // Single character
];

function isLikelyDeviceName(name = '') {
  const n = name.trim();
  return DEVICE_NAME_PATTERNS.some((re) => re.test(n));
}

const NON_PERSON_TOKENS = new Set([
  'iphone',
  'ipad',
  'android',
  'galaxy',
  'phone',
  'zoom',
  'user',
  'guest',
  'host',
  'cohost',
  'admin',
  'desktop',
  'laptop',
  'macbook',
  'pc',
  'meeting',
]);

function isLikelyNoiseToken(token = '') {
  return NON_PERSON_TOKENS.has(String(token || '').toLowerCase());
}

function hasLikelyFirstLastName(name = '') {
  const tokens = tokenizeName(name).filter((t) => /[a-z]/.test(t));
  if (tokens.length < 2) return false;
  const first = tokens[0];
  const second = tokens[1];
  if (!first || !second) return false;
  if (first.length < 2 || second.length < 2) return false;
  if (isLikelyNoiseToken(second)) return false;
  return true;
}

function uniqueStrings(values = []) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function detectSuspiciousPersonName({ firstName = '', lastName = '', fullName = '', email = '' } = {}) {
  const reasons = [];
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  const full = String(fullName || '').trim();
  const fullNorm = normalizeName(full);
  const emailNorm = normalizeEmail(email);
  const emailLocal = emailNorm.includes('@') ? emailNorm.split('@')[0] : '';

  if (!full) reasons.push('Missing first/last name');
  if (/@/.test(full)) reasons.push('Contains email text');
  if (/\.(com|net|org|io|co|ai|biz|me)\b/i.test(full)) reasons.push('Contains domain text');
  if (/\d/.test(full)) reasons.push('Contains digits');
  if (full && isLikelyDeviceName(full)) reasons.push('Looks like device name');

  if (first && first.length === 1) reasons.push('1-char first name');
  if (last && last.length === 1) reasons.push('1-char last name');

  if (emailLocal && fullNorm) {
    const compactName = fullNorm.replace(/\s+/g, '');
    const compactLocal = String(emailLocal || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      compactLocal
      && compactName
      && compactLocal !== compactName
      && compactLocal.includes(compactName)
      && (compactLocal.length - compactName.length) >= 6
    ) {
      reasons.push('Name resembles email local-part');
    }
  }

  return uniqueStrings(reasons);
}

function getNameParts(name = '') {
  const tokens = tokenizeName(name).filter((t) => /[a-z]/.test(t));
  const first = tokens[0] || '';
  const second = tokens[1] || '';
  const last = tokens[tokens.length - 1] || '';
  return {
    tokens,
    first,
    second,
    last,
    isFirstOnly: tokens.length === 1,
    isFirstPlusInitial: tokens.length >= 2 && second.length === 1,
    hasFirstLast: hasLikelyFirstLastName(name),
  };
}

function isShortAliasOfFullName(fullName = '', maybeAlias = '') {
  const full = getNameParts(fullName);
  const alias = getNameParts(maybeAlias);
  if (!full.hasFirstLast || !full.first || alias.first !== full.first) return false;

  if (alias.isFirstOnly) return true;
  if (alias.isFirstPlusInitial && alias.second && full.last.startsWith(alias.second)) return true;

  const aliasHasLikelyNoiseTail =
    alias.tokens.length >= 2
    && alias.tokens.slice(1).every((t) => isLikelyNoiseToken(t) || t.length <= 1);
  if (aliasHasLikelyNoiseTail) return true;

  return false;
}

function duplicateScore(a = '', b = '') {
  const an = normalizeName(a);
  const bn = normalizeName(b);
  if (!an || !bn || an === bn) return 0;

  const at = tokenizeName(a);
  const bt = tokenizeName(b);
  if (!at.length || !bt.length) return 0;

  if (an.startsWith(`${bn} `) || bn.startsWith(`${an} `)) {
    const shortTokens = Math.min(at.length, bt.length);
    if (shortTokens >= 2) return 96;
    if (shortTokens === 1 && at[0] === bt[0]) return 94;
  }

  if (at.length === 1 || bt.length === 1) {
    const single = at.length === 1 ? at[0] : bt[0];
    const multi = at.length === 1 ? bt : at;
    const multiLast = multi[multi.length - 1] || '';

    if (single === multi[0]) return 94;
    if (single === multiLast) return 0;

    if (single.length >= 3 && multi[0].startsWith(single)) return 72;
    if (multi[0].length >= 3 && single.startsWith(multi[0])) return 70;
    return 0;
  }

  if (at[0] === bt[0] && at[1] === bt[1]) return 96;
  if (at[0] === bt[0] && at[1] && bt[1] && at[1][0] === bt[1][0]) return 82;
  if (at[0] === bt[0]) {
    if (hasLikelyFirstLastName(a) || hasLikelyFirstLastName(b)) return 70;
    return 58;
  }

  return 0;
}

function findPotentialDuplicates(name = '', allNames = [], limit = 5) {
  return allNames
    .map((candidate) => ({ candidate, score: duplicateScore(name, candidate) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
    .slice(0, limit)
    .map((x) => x.candidate);
}

function findSessionPriorityDuplicates(name = '', allNames = [], inSessionSet = new Set()) {
  const row = getNameParts(name);

  const ranked = allNames
    .map((candidate) => ({
      candidate,
      score: duplicateScore(name, candidate),
      inSession: inSessionSet.has(normalizeName(candidate)),
    }))
    .filter((x) => x.score > 0 && normalizeName(x.candidate) !== normalizeName(name))
    .filter((x) => {
      const candidate = x.candidate;
      const c = getNameParts(candidate);

      // If the row is already a likely full name, only show in-session short aliases
      // that share the same first name (e.g. Andrew -> Andrew Lassise).
      if (row.hasFirstLast) {
        if (!x.inSession) return false;
        return isShortAliasOfFullName(name, candidate);
      }

      // For short names, constrain suggestions to same first name.
      if (row.first && c.first && row.first !== c.first) return false;

      // For first+initial forms, target full names whose last name matches that initial.
      if (row.isFirstPlusInitial && c.hasFirstLast && row.second && !c.last.startsWith(row.second)) {
        return false;
      }

      return true;
    })
    .sort((a, b) => Number(b.inSession) - Number(a.inSession) || b.score - a.score || a.candidate.localeCompare(b.candidate));

  if (row.hasFirstLast) {
    return ranked.slice(0, 3).map((x) => x.candidate);
  }

  const sameSession = ranked.filter((x) => x.inSession);
  if (sameSession.length > 0) {
    return sameSession.slice(0, 6).map((x) => x.candidate);
  }

  return ranked.slice(0, 4).map((x) => x.candidate);
}

function resolveAliasTarget(rawName = '', aliasMap = new Map()) {
  const fallback = String(rawName || '').trim();
  let current = fallback;
  let currentKey = normalizeName(current);
  const seen = new Set();

  for (let i = 0; i < 10; i += 1) {
    if (!currentKey || seen.has(currentKey)) break;
    seen.add(currentKey);

    const next = aliasMap.get(currentKey);
    if (!next) break;

    const nextTrimmed = String(next || '').trim();
    const nextKey = normalizeName(nextTrimmed);
    if (!nextTrimmed || !nextKey || nextKey === currentKey) break;

    current = nextTrimmed;
    currentKey = nextKey;
  }

  return current || fallback;
}

function canonicalNameScore(name = '', visits = 0) {
  const normalized = normalizeName(name);
  if (!normalized) return -Infinity;

  const tokens = tokenizeName(name);
  const alphaTokens = tokens.filter((t) => /[a-z]/.test(t));
  const cleanLength = normalized.length;
  const hasDeviceNoise = /(iphone|ipad|android|galaxy|phone|zoom user|guest)\b/i.test(normalized);

  let score = 0;
  if (alphaTokens.length === 1) score -= 25;
  if (alphaTokens.length === 2) score += 40;
  if (alphaTokens.length === 3) score += 30;
  if (alphaTokens.length >= 4) score += 15;

  score += Math.min(cleanLength, 36);
  if (/:/.test(name)) score -= 45;
  if (/\s-\s/.test(name)) score -= 12;
  if (/,/.test(name)) score -= 8;
  if (alphaTokens.length > 4) score -= 18;
  if (hasDeviceNoise) score -= 30;

  score += Math.min(Number(visits || 0), 60) * 0.5;
  return score;
}

function pickPreferredCanonicalName(a = '', b = '', visitsByName = new Map()) {
  const aHasFullName = hasLikelyFirstLastName(a);
  const bHasFullName = hasLikelyFirstLastName(b);
  if (aHasFullName !== bHasFullName) return aHasFullName ? a : b;

  const visitsA = Number(visitsByName.get(normalizeName(a)) || 0);
  const visitsB = Number(visitsByName.get(normalizeName(b)) || 0);
  const scoreA = canonicalNameScore(a, visitsA);
  const scoreB = canonicalNameScore(b, visitsB);

  if (scoreA === scoreB) {
    const tokenCountA = tokenizeName(a).length;
    const tokenCountB = tokenizeName(b).length;
    if (tokenCountA !== tokenCountB) return tokenCountA > tokenCountB ? a : b;
    return normalizeName(a).length >= normalizeName(b).length ? a : b;
  }

  return scoreA > scoreB ? a : b;
}

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatChangePct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  const pct = (Number(value) * 100).toFixed(1);
  return `${Number(value) >= 0 ? '+' : ''}${pct}%`;
}

function formatCurrencyMaybe(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function utcDateOnly(dateLike) {
  const d = safeDate(dateLike);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addYearsUtc(dateObj, years) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
  const y = dateObj.getUTCFullYear() + Number(years || 0);
  const m = dateObj.getUTCMonth();
  const day = dateObj.getUTCDate();
  // Handle Feb 29 for non-leap years by clamping to last valid day in the month.
  const candidate = new Date(Date.UTC(y, m, day));
  if (candidate.getUTCMonth() !== m) {
    return new Date(Date.UTC(y, m + 1, 0));
  }
  return candidate;
}

function diffYearsMonthsUtc(startDateLike, endDateLike = new Date()) {
  const start = utcDateOnly(startDateLike);
  const end = utcDateOnly(endDateLike);
  if (!start || !end || end < start) return null;

  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return null;
  return { years, months };
}

function daysBetweenUtc(startDateLike, endDateLike) {
  const start = utcDateOnly(startDateLike);
  const end = utcDateOnly(endDateLike);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function sobrietyMilestoneInfo(sobrietyDateLike, today = new Date()) {
  const sobrietyDate = utcDateOnly(sobrietyDateLike);
  const todayDate = utcDateOnly(today);
  if (!sobrietyDate || !todayDate || todayDate < sobrietyDate) return null;

  const elapsed = diffYearsMonthsUtc(sobrietyDate, todayDate);
  if (!elapsed) return null;

  const nextAnniversaryYears = elapsed.years + 1;
  const nextAnniversaryDate = addYearsUtc(sobrietyDate, nextAnniversaryYears);
  const daysUntilNextAnniversary = nextAnniversaryDate ? daysBetweenUtc(todayDate, nextAnniversaryDate) : null;
  const isSoon = Number.isFinite(daysUntilNextAnniversary) && daysUntilNextAnniversary >= 0 && daysUntilNextAnniversary <= 45;

  return {
    sobrietyDate,
    elapsed,
    nextAnniversaryYears,
    nextAnniversaryDate,
    daysUntilNextAnniversary,
    isSoon,
    durationLabel: `${elapsed.years} year${elapsed.years === 1 ? '' : 's'} and ${elapsed.months} month${elapsed.months === 1 ? '' : 's'}`,
    soonLabel: isSoon ? `*${nextAnniversaryYears} Year Anniversary Is Soon*` : '',
  };
}

/** Format date as MM/DD/YYYY (e.g., "02/12/2026") */
function formatDateMMDDYY(dateLike) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  if (isNaN(d.getTime())) return String(dateLike);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const y = d.getUTCFullYear();
  return `${m}/${day}/${y}`;
}

/** Get day name from date */
function getDayName(dateLike) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[d.getUTCDay()] || '';
}

function monthStartUTC(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonthsUTC(monthStartDate, months) {
  if (!(monthStartDate instanceof Date) || Number.isNaN(monthStartDate.getTime())) return null;
  return new Date(Date.UTC(monthStartDate.getUTCFullYear(), monthStartDate.getUTCMonth() + months, 1));
}

function monthKeyUTC(monthStartDate) {
  if (!(monthStartDate instanceof Date) || Number.isNaN(monthStartDate.getTime())) return '';
  return monthStartDate.toISOString().slice(0, 10);
}

function formatMonthLabelUTC(monthStartDate) {
  if (!(monthStartDate instanceof Date) || Number.isNaN(monthStartDate.getTime())) return '';
  return monthStartDate.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function safeDate(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Export cleaned attendance data as CSV */
function exportAttendanceCSV(sessions) {
  const rows = [['canonical_name', 'session_date', 'group', 'is_net_new']];
  for (const session of sessions) {
    const dateFormatted = formatDateMMDDYY(session.dateLabel);
    for (const name of session.attendees) {
      const isNew = (session.newNames || []).includes(name);
      rows.push([name, dateFormatted, session.type, isNew ? 'Yes' : 'No']);
    }
  }
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zoom_attendance_export_${formatDateMMDDYY(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function isMissingTableError(error) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '').toUpperCase();
  return code === 'PGRST205' || msg.includes('could not find the table');
}

function dayTypeFromMetric(metric) {
  const meetingId = metric?.metadata?.meeting_id ? String(metric.metadata.meeting_id) : '';
  if (meetingId === TUE_MEETING_ID) return 'Tuesday';
  if (meetingId === THU_MEETING_ID) return 'Thursday';
  const d = safeDate(metric?.metadata?.start_time || metric?.metric_date);
  if (!d) return 'Other';
  const day = d.getUTCDay();
  if (day === 2) return 'Tuesday';
  if (day === 4) return 'Thursday';
  return 'Other';
}

function buildPlan(analytics) {
  if (!analytics) return [];
  const { atRiskCount, oneTimeShareTue, oneTimeShareThu, repeatRateTue, repeatRateThu, lowRecentShowRatePeople } = analytics;

  return [
    {
      id: 'auto-risk-list',
      owner: 'Autonomous',
      title: 'Build weekly at-risk attendee list',
      detail: `Flag repeat attendees missing 3+ group-specific sessions (${atRiskCount} currently).`,
      proceed: true,
    },
    {
      id: 'auto-retention-summary',
      owner: 'Autonomous',
      title: 'Publish Monday retention summary',
      detail: `Track repeat rate — Tue: ${formatPct(repeatRateTue)}, Thu: ${formatPct(repeatRateThu)}.`,
      proceed: true,
    },
    {
      id: 'auto-low-show-alert',
      owner: 'Autonomous',
      title: 'Alert on low personal show-up rate',
      detail: `${lowRecentShowRatePeople} attendees are below 25% show-up in their group's last ${RECENT_WINDOW} sessions.`,
      proceed: lowRecentShowRatePeople > 0,
    },
    {
      id: 'human-welcome-owner',
      owner: 'Human',
      title: 'Assign meeting welcome owner',
      detail: 'Choose 1 host to greet first-timers by name in first 5 minutes.',
      proceed: true,
    },
    {
      id: 'human-followup-script',
      owner: 'Human',
      title: 'Approve no-show follow-up script',
      detail: 'Create a 2-message sequence for people absent 2+ sessions.',
      proceed: true,
    },
    {
      id: 'human-topic-test',
      owner: 'Human',
      title: 'Run topic A/B test for Thursday',
      detail: 'Test two subject lines and compare next-week show-up by cohort.',
      proceed: repeatRateThu < 0.55,
    },
  ];
}

/** Build cohort buckets for a set of people based on their day-specific visit counts */
function buildCohortBuckets(peopleArr, visitKey) {
  const buckets = [
    { label: '1 visit', min: 1, max: 1 },
    { label: '2–3 visits', min: 2, max: 3 },
    { label: '4–6 visits', min: 4, max: 6 },
    { label: '7–10 visits', min: 7, max: 10 },
    { label: '11+ visits', min: 11, max: Infinity },
  ];
  const colors = ['#f97316', '#06b6d4', '#2563eb', '#7c3aed', '#0f766e'];
  const total = peopleArr.filter(p => p[visitKey] > 0).length;
  return buckets.map((b, i) => {
    const count = peopleArr.filter(p => p[visitKey] >= b.min && p[visitKey] <= b.max).length;
    return {
      label: b.label,
      count,
      pct: total > 0 ? count / total : 0,
      color: colors[i],
    };
  });
}

function buildCombinedAvgTimeline(avgTrendTue = [], avgTrendThu = []) {
  const byDate = new Map();

  (avgTrendTue || []).forEach((row) => {
    const fullDate = row?.fullDate || '';
    if (!fullDate) return;
    const next = byDate.get(fullDate) || {
      fullDate,
      date: formatDateMMDDYY(fullDate),
      dayName: getDayName(fullDate),
      tuesdayAvg: null,
      thursdayAvg: null,
    };
    const parsed = Number(row.avgVisits);
    if (!Number.isNaN(parsed)) {
      next.tuesdayAvg = parsed;
    }
    byDate.set(fullDate, next);
  });

  (avgTrendThu || []).forEach((row) => {
    const fullDate = row?.fullDate || '';
    if (!fullDate) return;
    const next = byDate.get(fullDate) || {
      fullDate,
      date: formatDateMMDDYY(fullDate),
      dayName: getDayName(fullDate),
      tuesdayAvg: null,
      thursdayAvg: null,
    };
    const parsed = Number(row.avgVisits);
    if (!Number.isNaN(parsed)) {
      next.thursdayAvg = parsed;
    }
    byDate.set(fullDate, next);
  });

  const sorted = Array.from(byDate.values()).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  let lastTuesday = null;
  let lastThursday = null;

  return sorted.map((row) => {
    if (row.tuesdayAvg !== null && row.tuesdayAvg !== undefined && !Number.isNaN(row.tuesdayAvg)) {
      lastTuesday = row.tuesdayAvg;
    }
    if (row.thursdayAvg !== null && row.thursdayAvg !== undefined && !Number.isNaN(row.thursdayAvg)) {
      lastThursday = row.thursdayAvg;
    }

    return {
      ...row,
      tuesdayHoverAvg: lastTuesday,
      thursdayHoverAvg: lastThursday,
    };
  });
}

function buildMonthlyAverageSeries(sessions = [], groupType = 'Tuesday') {
  const groupSessions = (sessions || [])
    .filter((s) => s?.type === groupType && s?.date instanceof Date && !Number.isNaN(s.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (groupSessions.length === 0) {
    return { series: [], summary: null };
  }

  const firstSessionMonth = monthStartUTC(groupSessions[0].date);
  let cursor = addMonthsUTC(firstSessionMonth, 1);
  const latestSessionDate = groupSessions[groupSessions.length - 1].date;
  const now = new Date();
  const maxDate = latestSessionDate.getTime() > now.getTime() ? latestSessionDate : now;
  const endMonth = monthStartUTC(maxDate);

  if (!cursor || !endMonth || cursor.getTime() > endMonth.getTime()) {
    return { series: [], summary: null };
  }

  let sessionIdx = 0;
  let cumulativeVisits = 0;
  const cumulativePeople = new Set();
  const series = [];

  while (cursor.getTime() <= endMonth.getTime()) {
    while (sessionIdx < groupSessions.length && groupSessions[sessionIdx].date.getTime() < cursor.getTime()) {
      const session = groupSessions[sessionIdx];
      cumulativeVisits += Number(session.derivedCount || 0);
      (session.attendees || []).forEach((name) => {
        const key = normalizeName(name);
        if (key) cumulativePeople.add(key);
      });
      sessionIdx += 1;
    }

    const uniqueCount = cumulativePeople.size;
    const avgVisits = uniqueCount > 0 ? cumulativeVisits / uniqueCount : 0;

    series.push({
      monthKey: monthKeyUTC(cursor),
      monthLabel: formatMonthLabelUTC(cursor),
      avgVisits: Number(avgVisits.toFixed(2)),
      totalVisits: cumulativeVisits,
      uniquePeople: uniqueCount,
      momChange: null,
      yoyChange: null,
    });

    cursor = addMonthsUTC(cursor, 1);
  }

  if (series.length === 0) {
    return { series: [], summary: null };
  }

  const byMonthKey = new Map(series.map((row) => [row.monthKey, row]));

  series.forEach((row, idx) => {
    if (idx > 0) {
      const prev = series[idx - 1];
      row.momChange = prev.avgVisits > 0 ? (row.avgVisits - prev.avgVisits) / prev.avgVisits : null;
    }

    const currentMonth = new Date(`${row.monthKey}T00:00:00.000Z`);
    const prevYearMonth = addMonthsUTC(currentMonth, -12);
    const prevYear = byMonthKey.get(monthKeyUTC(prevYearMonth));
    row.yoyChange = prevYear && prevYear.avgVisits > 0
      ? (row.avgVisits - prevYear.avgVisits) / prevYear.avgVisits
      : null;
  });

  const latest = series[series.length - 1];
  const prevMonth = series.length > 1 ? series[series.length - 2] : null;
  const prevYearMonth = addMonthsUTC(new Date(`${latest.monthKey}T00:00:00.000Z`), -12);
  const prevYear = byMonthKey.get(monthKeyUTC(prevYearMonth)) || null;

  return {
    series,
    summary: {
      asOfMonth: latest.monthLabel,
      avgVisits: latest.avgVisits,
      momChange: latest.momChange,
      yoyChange: latest.yoyChange,
      prevMonthAvg: prevMonth ? prevMonth.avgVisits : null,
      prevYearAvg: prevYear ? prevYear.avgVisits : null,
      hasYoY: !!prevYear,
    },
  };
}

/**
 * HUBSPOT-ONLY: Build sessions from HubSpot meeting activity logs
 * (raw_hubspot_meeting_activities + hubspot_activity_contact_associations).
 * 
 * -- DATA SOURCE: HubSpot Calls only. Do not add Zoom data as a fallback or supplement.
 * Audited 2026-02-23.
 */
function computeAnalytics(aliases, hubspotActivities = [], hubspotContactAssocs = [], hubspotContactMap = new Map()) {
  const aliasMap = new Map(
    (aliases || []).map((a) => [normalizeName(a.original_name), a.target_name?.trim() || a.original_name]),
  );

  // ── Helpers to classify session type from HubSpot activity title or day/size heuristic ──
  function getSessionType(activity, attendeeCount) {
    const title = (activity.title || '').toLowerCase();
    const start = safeDate(activity.hs_timestamp || activity.created_at_hubspot);
    if (!start) return null;

    const day = start.getUTCDay(); // 0=Sun, 2=Tue, 4=Thu

    // Explicit title match
    if (title.includes('tactic tuesday')) return 'Tuesday';
    if (title.includes('mastermind on zoom') || title.includes('all are welcome')) return 'Thursday';
    if (title.includes("entrepreneur's big book") || title.includes('big book')) return 'Thursday';
    if (title.includes('sober founders mastermind') && !title.includes('intro')) return 'Thursday';

    // Heuristic: Tuesdays/Thursdays with > 4 attendees likely are the group sessions
    // This catches generic titles like "Call with unknown contact" (Bug 1 fix)
    if (attendeeCount >= 5) {
      if (day === 2) return 'Tuesday';
      if (day === 4) return 'Thursday';
    }

    return null;
  }

  // ── 1. Build sessions from HubSpot call activities (authoritative source) ──
  const assocsByActivity = new Map();
  (hubspotContactAssocs || []).forEach(assoc => {
    const aid = String(assoc.hubspot_activity_id || '');
    if (!aid) return;
    if (!assocsByActivity.has(aid)) assocsByActivity.set(aid, []);
    assocsByActivity.get(aid).push(assoc);
  });

  let sessions = [];

  (hubspotActivities || []).forEach(activity => {
    const activityId = String(activity.hubspot_activity_id || '');
    const assocs = assocsByActivity.get(activityId) || [];

    const type = getSessionType(activity, assocs.length);
    if (!type) return;

    const start = safeDate(activity.hs_timestamp || activity.created_at_hubspot);
    if (!start) return;

    const dateLabel = start.toISOString().slice(0, 10);
    const dateFormatted = formatDateMMDDYY(start);

    // Build attendees from contact associations
    const seenIds = new Set();
    const matchedEntries = assocs
      .filter(a => {
        const contactId = Number(a.hubspot_contact_id);

        // Enrichment
        const enriched = contactId ? hubspotContactMap.get(contactId) : null;
        const firstName = String(a.contact_firstname || enriched?.firstname || '').trim();
        const lastName = String(a.contact_lastname || enriched?.lastname || '').trim();
        const fullName = [firstName, lastName].filter(Boolean).join(' ');

        // Safeguard filter: Exclude "iPad", "iPhone", or single-character noise (Bug 2 fix)
        // Only exclude if NOT matched to a real contact, as per requirement
        if (!contactId && isLikelyDeviceName(fullName || a.contact_email || '')) return false;

        // Anti-Duplicate for matched contacts
        if (contactId) {
          if (seenIds.has(contactId)) return false;
          seenIds.add(contactId);
        }

        return true;
      })
      .map(a => {
        const contactId = Number(a.hubspot_contact_id);
        const enriched = contactId ? (hubspotContactMap.get(contactId) || {}) : {};
        // Prefer the current HubSpot contact name so renames in HubSpot backfill
        // historical attendance rows in the dashboard (association snapshots can be stale/noisy).
        const firstName = String(enriched.firstname || a.contact_firstname || '').trim();
        const lastName = String(enriched.lastname || a.contact_lastname || '').trim();
        const displayName = [firstName, lastName].filter(Boolean).join(' ') || (a.contact_email) || `Contact ${contactId || 'Unknown'}`;

        return {
          name: displayName,
          hubspotContactId: contactId || null,
          hubspotEmail: normalizeEmail(a.contact_email || enriched.email || ''),
          hubspotName: contactId ? displayName : 'Not Found',
          hubspotMatched: !!contactId,
          identityMappingSource: contactId ? 'hubspot_call_activity' : 'unmatched_call_assoc',
          identityMappingConfidence: contactId ? 'High' : 'None',
          identityMappingNote: contactId ? `Verified via HubSpot call activity ${activityId}` : 'No linked contact ID found in association',
          hubspotSource: enriched.hs_analytics_source || 'Not Found',
          hubspotUrl: contactId ? buildHubspotContactUrl(contactId) : null,
        };
      });

    sessions.push({
      id: activityId || `${dateLabel}-${type}`,
      type,
      date: start,
      dateLabel,
      dateFormatted,
      meetingId: activityId,
      startTimeIso: activity.hs_timestamp || null,
      title: activity.title || '',
      attendees: matchedEntries.map(a => a.name),
      attendeeObjects: matchedEntries,
      derivedCount: matchedEntries.length,
      sourceCount: assocs.length,
      mismatch: false,
      dataSource: 'hubspot',
    });
  });

  sessions = sessions.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

  // 2. Identify New vs Repeat — SEPARATELY per day
  const seenTuesday = new Set();
  const seenThursday = new Set();
  const groupStats = {
    Tuesday: { visits: 0, unique: new Set(), trend: [] },
    Thursday: { visits: 0, unique: new Set(), trend: [] }
  };

  sessions = sessions.map(session => {
    const seenPeople = session.type === 'Tuesday' ? seenTuesday : seenThursday;
    const newNames = [];
    session.attendees.forEach(name => {
      const key = normalizeName(name);
      if (!seenPeople.has(key)) {
        seenPeople.add(key);
        newNames.push(name);
      }
    });

    const newCount = newNames.length;
    const repeatCount = session.derivedCount - newCount;

    // Update Group Running Stats
    const gs = groupStats[session.type];
    if (gs) {
      gs.visits += session.derivedCount;
      session.attendees.forEach(a => gs.unique.add(normalizeName(a)));

      const uniqueCount = gs.unique.size;
      const avg = uniqueCount > 0 ? gs.visits / uniqueCount : 0;

      gs.trend.push({
        date: session.dateFormatted,
        fullDate: session.dateLabel,
        avgVisits: Number(avg.toFixed(2)),
      });
    }

    return {
      ...session,
      newNames,
      newCount,
      repeatCount
    };
  });

  // 3. Build People Stats (for Cohorts & KPI Cards)
  const people = new Map();
  let mismatches = 0;
  let totalAppearances = 0;

  sessions.forEach((session, idx) => {
    if (session.mismatch) mismatches += 1;
    totalAppearances += session.derivedCount;

    const attendeeObjByName = new Map(
      (session.attendeeObjects || []).map((obj) => [normalizeName(obj?.name || ''), obj]),
    );

    session.attendees.forEach((name) => {
      if (!people.has(name)) {
        people.set(name, {
          name,
          visits: 0,
          tueVisits: 0,
          thuVisits: 0,
          sessionIndexes: [],
          firstSeen: session.dateLabel,
          lastSeen: session.dateLabel,
          primaryGroup: session.type,
          hubspotMatched: false,
          hubspotContactId: null,
          hubspotName: '',
          hubspotEmail: '',
          hubspotUrl: '',
          identityMappingSource: '',
          identityMappingConfidence: '',
          hubspotSource: '',
          hubspotContactIdsSeen: [],
        });
      }

      const p = people.get(name);
      const attendeeObj = attendeeObjByName.get(normalizeName(name));
      p.visits += 1;
      if (session.type === 'Tuesday') p.tueVisits += 1;
      if (session.type === 'Thursday') p.thuVisits += 1;
      p.sessionIndexes.push(idx);
      p.lastSeen = session.dateLabel;

      if (attendeeObj?.hubspotContactId) {
        const currentIds = new Set(Array.isArray(p.hubspotContactIdsSeen) ? p.hubspotContactIdsSeen : []);
        currentIds.add(Number(attendeeObj.hubspotContactId));
        p.hubspotContactIdsSeen = Array.from(currentIds);

        // Prefer direct HubSpot call activity identity over later fuzzy/name fallback resolvers.
        p.hubspotMatched = true;
        p.hubspotContactId = Number(attendeeObj.hubspotContactId) || p.hubspotContactId || null;
        p.hubspotName = attendeeObj.hubspotName || attendeeObj.name || p.hubspotName || '';
        p.hubspotEmail = attendeeObj.hubspotEmail || p.hubspotEmail || '';
        p.hubspotUrl = attendeeObj.hubspotUrl || p.hubspotUrl || '';
        p.identityMappingSource = attendeeObj.identityMappingSource || 'hubspot_call_activity';
        p.identityMappingConfidence = attendeeObj.identityMappingConfidence || 'High';
        p.hubspotSource = attendeeObj.hubspotSource || p.hubspotSource || '';
      }

      if (normalizeName(name).includes('chris lipper')) {
        p.primaryGroup = 'Thursday';
      } else {
        p.primaryGroup = p.tueVisits >= p.thuVisits ? 'Tuesday' : 'Thursday';
      }
    });
  });

  const peopleArr = Array.from(people.values()).map((p) => {
    const groupSessions = sessions.filter(s => s.type === p.primaryGroup);
    const attendedSessionIds = new Set(
      (p.sessionIndexes || [])
        .map((i) => sessions[i])
        .filter(Boolean)
        .map((s) => s.id),
    );
    const attendedInGroup = groupSessions.filter((gs) => attendedSessionIds.has(gs.id));

    const recentGroupSessions = groupSessions.slice(-RECENT_WINDOW);
    const recentGroupShows = recentGroupSessions.filter((gs) => attendedSessionIds.has(gs.id)).length;

    const recentWindowCount = recentGroupSessions.length;
    const recentShowRate = recentWindowCount ? recentGroupShows / recentWindowCount : 0;

    const last3GroupSessions = groupSessions.slice(-3);
    const last3GroupShows = last3GroupSessions.filter((gs) => attendedSessionIds.has(gs.id));

    let missedInRow = 0;
    for (let i = groupSessions.length - 1; i >= 0; i -= 1) {
      if (attendedSessionIds.has(groupSessions[i].id)) break;
      missedInRow += 1;
    }

    const groupVisits = p.primaryGroup === 'Tuesday' ? p.tueVisits : p.thuVisits;
    const lastAttendedGroupSession = attendedInGroup[attendedInGroup.length - 1] || null;
    let atRiskRule = '';
    if (groupVisits === 1 && missedInRow >= 1) {
      atRiskRule = 'one_and_done_missed_next';
    } else if (groupVisits > 1 && missedInRow >= 2) {
      atRiskRule = 'repeat_missed_two_in_row';
    }
    const isAtRisk = !!atRiskRule;

    return {
      ...p,
      groupVisits,
      recentShows: recentGroupShows,
      recentShowRate,
      isAtRisk,
      atRiskRule,
      missedInRow,
      lastAttendedGroupDateLabel: lastAttendedGroupSession?.dateLabel || '',
      lastAttendedGroupDateFormatted: lastAttendedGroupSession?.dateFormatted || '',
      last3GroupShowsCount: last3GroupShows.length,
    };
  });

  const uniqueTue = peopleArr.filter(p => p.tueVisits > 0).length;
  const uniqueThu = peopleArr.filter(p => p.thuVisits > 0).length;

  const repeatersTue = peopleArr.filter(p => p.tueVisits > 1).length;
  const repeatersThu = peopleArr.filter(p => p.thuVisits > 1).length;
  const oneTimersTue = peopleArr.filter(p => p.tueVisits === 1).length;
  const oneTimersThu = peopleArr.filter(p => p.thuVisits === 1).length;

  const repeatRateTue = uniqueTue ? repeatersTue / uniqueTue : 0;
  const repeatRateThu = uniqueThu ? repeatersThu / uniqueThu : 0;
  const oneTimeShareTue = uniqueTue ? oneTimersTue / uniqueTue : 0;
  const oneTimeShareThu = uniqueThu ? oneTimersThu / uniqueThu : 0;

  const lowRecentShowRatePeople = peopleArr.filter((p) => p.recentShowRate < 0.25).length;
  const allCanonicalNames = peopleArr.map((p) => p.name);
  const duplicateCandidatesByName = {};
  allCanonicalNames.forEach((name) => {
    duplicateCandidatesByName[name] = findPotentialDuplicates(name, allCanonicalNames);
  });

  const trendDataTue = sessions.filter(s => s.type === 'Tuesday').map((s) => ({
    date: s.dateFormatted,
    fullDate: s.dateLabel,
    sessionKey: `${s.type}|${s.dateLabel}`,
    dayName: getDayName(s.dateLabel),
    newCount: s.newCount,
    repeatCount: s.repeatCount,
    total: s.derivedCount,
    newNames: s.newNames
  }));
  const trendDataThu = sessions.filter(s => s.type === 'Thursday').map((s) => ({
    date: s.dateFormatted,
    fullDate: s.dateLabel,
    sessionKey: `${s.type}|${s.dateLabel}`,
    dayName: getDayName(s.dateLabel),
    newCount: s.newCount,
    repeatCount: s.repeatCount,
    total: s.derivedCount,
    newNames: s.newNames
  }));

  // Welcome New: keep top-of-page focused to 2 Tuesday + 2 Thursday sessions.
  const welcomeNewSessionsTue = sessions
    .filter((s) => s.type === 'Tuesday' && s.newNames && s.newNames.length > 0)
    .slice(-2)
    .reverse();
  const welcomeNewSessionsThu = sessions
    .filter((s) => s.type === 'Thursday' && s.newNames && s.newNames.length > 0)
    .slice(-2)
    .reverse();

  // Cohort data — separated by day
  const cohortDataTue = buildCohortBuckets(peopleArr, 'tueVisits');
  const cohortDataThu = buildCohortBuckets(peopleArr, 'thuVisits');
  const avgTimelineCombined = buildCombinedAvgTimeline(groupStats.Tuesday.trend, groupStats.Thursday.trend);
  const monthlyAvgTue = buildMonthlyAverageSeries(sessions, 'Tuesday');
  const monthlyAvgThu = buildMonthlyAverageSeries(sessions, 'Thursday');
  const atRiskPeople = peopleArr
    .filter((p) => p.isAtRisk)
    .sort((a, b) =>
      (b.lastAttendedGroupDateLabel || '').localeCompare(a.lastAttendedGroupDateLabel || '')
      || Number(b.atRiskRule === 'repeat_missed_two_in_row') - Number(a.atRiskRule === 'repeat_missed_two_in_row')
      || a.missedInRow - b.missedInRow
      || b.groupVisits - a.groupVisits
      || b.visits - a.visits
      || a.name.localeCompare(b.name)
    );
  const atRiskBreakdown = {
    oneAndDoneMissedNext: atRiskPeople.filter((p) => p.atRiskRule === 'one_and_done_missed_next').length,
    repeatMissedTwoInRow: atRiskPeople.filter((p) => p.atRiskRule === 'repeat_missed_two_in_row').length,
  };

  return {
    sessions,
    people: peopleArr,
    stats: {
      sessions: sessions.length,
      uniqueTue,
      uniqueThu,
      repeatRateTue,
      repeatRateThu,
      oneTimeShareTue,
      oneTimeShareThu,
      atRiskCount: atRiskPeople.length,
      atRiskOneTimers: atRiskBreakdown.oneAndDoneMissedNext,
      atRiskRepeaters: atRiskBreakdown.repeatMissedTwoInRow,
      lowRecentShowRatePeople,
    },
    trendDataTue,
    trendDataThu,
    avgTrendTue: groupStats.Tuesday.trend,
    avgTrendThu: groupStats.Thursday.trend,
    avgTimelineCombined,
    monthlyAvgTrendTue: monthlyAvgTue.series,
    monthlyAvgTrendThu: monthlyAvgThu.series,
    monthlyAvgSummaryTue: monthlyAvgTue.summary,
    monthlyAvgSummaryThu: monthlyAvgThu.summary,
    cohortDataTue,
    cohortDataThu,
    topRepeaters: [...peopleArr].sort((a, b) => b.visits - a.visits).slice(0, 10),
    atRiskPeople,
    atRiskBreakdown,
    welcomeNewSessions: [...welcomeNewSessionsTue, ...welcomeNewSessionsThu],
    welcomeNewSessionsTue,
    welcomeNewSessionsThu,
    duplicateCandidatesByName,
  };
}

function buildAttendanceHubspotResolver({ rawHubspot = [], rawLuma = [], attendeeHubspotMappings = [] }) {
  const hubspotById = new Map();
  const hubspotByExactName = new Map();
  const hubspotByFirstLastInitial = new Map();
  const hubspotByEmail = new Map();

  const addIndexRow = (map, key, row) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  };

  const hubspotScore = (row) => {
    let s = 0;
    if (row?.email) s += 2;
    if (row?.hs_analytics_source) s += 1;
    if (resolveHubspotRevenueValue(row) !== null) s += 1;
    if (resolveHubspotSobrietyValue(row)) s += 1;
    return s;
  };

  const pickBestHubspot = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return [...rows].sort((a, b) => {
      const scoreDiff = hubspotScore(b) - hubspotScore(a);
      if (scoreDiff) return scoreDiff;
      const aTs = Date.parse(a?.createdate || '') || 0;
      const bTs = Date.parse(b?.createdate || '') || 0;
      return aTs - bTs; // older first is better for attribution anchoring
    })[0] || rows[0];
  };

  const buildInitialKey = (name) => {
    const tokens = normalizeName(name).split(' ').filter(Boolean);
    if (tokens.length < 2) return '';
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    const lastInitial = last?.[0] || '';
    return first && lastInitial ? `${first}|${lastInitial}` : '';
  };

  (rawHubspot || []).forEach((row) => {
    const id = Number(row?.hubspot_contact_id);
    if (Number.isFinite(id)) hubspotById.set(id, row);

    const full = fullNameFromHubspot(row);
    const nameKey = normalizeName(full);
    if (nameKey) addIndexRow(hubspotByExactName, nameKey, row);

    const initKey = buildInitialKey(full);
    if (initKey) addIndexRow(hubspotByFirstLastInitial, initKey, row);

    const primaryEmail = normalizeEmail(row?.email);
    if (primaryEmail) addIndexRow(hubspotByEmail, primaryEmail, row);
    parseAdditionalEmails(row?.hs_additional_emails).forEach((email) => addIndexRow(hubspotByEmail, email, row));
  });

  const lumaByName = new Map();
  const lumaByEmail = new Map();
  const pickBestLuma = (existing, candidate) => {
    if (!existing) return candidate;
    const score = (row) => {
      let s = 0;
      if (row?.matched_hubspot_contact_id) s += 5;
      if (row?.matched_hubspot_email) s += 4;
      if (row?.matched_hubspot) s += 3;
      if (row?.matched_zoom) s += 2;
      if (row?.guest_email) s += 1;
      return s;
    };
    return score(candidate) > score(existing) ? candidate : existing;
  };

  (rawLuma || []).forEach((row) => {
    const approval = String(row?.approval_status || 'approved').toLowerCase();
    if (approval && approval !== 'approved') return;
    const nameKey = normalizeName(row?.guest_name || '');
    const emailKey = normalizeEmail(row?.guest_email || '');
    if (nameKey) lumaByName.set(nameKey, pickBestLuma(lumaByName.get(nameKey), row));
    if (emailKey) lumaByEmail.set(emailKey, pickBestLuma(lumaByEmail.get(emailKey), row));
  });

  const attendeeMappingsBySessionAndName = new Map();
  (attendeeHubspotMappings || []).forEach((row) => {
    const dateKey = String(row?.session_date || '').slice(0, 10);
    const meetingId = String(row?.meeting_id || '');
    const nameKey = normalizeName(row?.zoom_attendee_canonical_name || row?.zoom_attendee_raw_name || '');
    if (!dateKey || !nameKey) return;
    const key = `${dateKey}|${meetingId}|${nameKey}`;
    attendeeMappingsBySessionAndName.set(key, row);
  });

  const resolveFromHubspotRow = (contact, source, note = '') => {
    if (!contact) return null;
    const id = Number(contact?.hubspot_contact_id);
    return {
      matched: true,
      hubspotContactId: Number.isFinite(id) ? id : null,
      hubspotName: fullNameFromHubspot(contact) || 'Not Found',
      hubspotEmail: normalizeEmail(contact?.email) || 'Not Found',
      hubspotUrl: buildHubspotContactUrl(id),
      identityMappingSource: source,
      identityMappingConfidence: source === 'hubspot_meeting_activity' ? 'High' : source.includes('exact') ? 'High' : 'Medium',
      identityMappingNote: note || '',
      hubspotSource: contact?.hs_analytics_source || 'Not Found',
      missingIdentityReason: '',
    };
  };

  const resolveAttendee = (attendeeName, session = null) => {
    const nameKey = normalizeName(attendeeName || '');
    if (!nameKey) {
      return {
        matched: false,
        hubspotContactId: null,
        hubspotName: 'Not Found',
        hubspotEmail: 'Not Found',
        hubspotUrl: '',
        identityMappingSource: 'none',
        identityMappingConfidence: 'Low',
        identityMappingNote: '',
        hubspotSource: 'Not Found',
        missingIdentityReason: 'Empty attendee name after normalization',
      };
    }

    const manualOverride = getZoomAttributionOverride(attendeeName);
    if (manualOverride) {
      const manualContactId = Number(manualOverride?.hubspotContactId);
      const manualContact = Number.isFinite(manualContactId) ? (hubspotById.get(manualContactId) || null) : null;
      const luma = lumaByName.get(nameKey) || null;
      const bestEmail = normalizeEmail(manualContact?.email) || normalizeEmail(luma?.guest_email) || normalizeEmail(luma?.matched_hubspot_email) || 'Not Found';
      return {
        matched: !!manualOverride?.hubspotContactId || !!manualContact,
        hubspotContactId: Number.isFinite(manualContactId) ? manualContactId : (Number(manualContact?.hubspot_contact_id) || null),
        hubspotName: manualOverride?.canonicalHubspotName || (manualContact ? fullNameFromHubspot(manualContact) : '') || String(attendeeName || '').trim() || 'Not Found',
        hubspotEmail: bestEmail,
        hubspotUrl: buildHubspotContactUrl(manualContactId, manualOverride?.hubspotUrl || ''),
        identityMappingSource: 'manual_override',
        identityMappingConfidence: 'High',
        identityMappingNote: manualOverride?.note || 'User-confirmed HubSpot mapping override',
        hubspotSource: manualOverride?.originalTrafficSource || manualContact?.hs_analytics_source || 'Not Found',
        missingIdentityReason: '',
      };
    }

    const sessionDateKey = session?.dateLabel || '';
    const sessionMeetingId = String(session?.meetingId || '');
    const sessionMapKey = sessionDateKey ? `${sessionDateKey}|${sessionMeetingId}|${nameKey}` : '';
    const sessionMap = sessionMapKey ? attendeeMappingsBySessionAndName.get(sessionMapKey) : null;
    if (sessionMap) {
      const mappedId = Number(sessionMap?.hubspot_contact_id);
      const mappedContact = Number.isFinite(mappedId) ? (hubspotById.get(mappedId) || null) : null;
      if (mappedContact) {
        return resolveFromHubspotRow(mappedContact, 'hubspot_meeting_activity', sessionMap?.mapping_reason || sessionMap?.match_note || '');
      }
      return {
        matched: true,
        hubspotContactId: Number.isFinite(mappedId) ? mappedId : null,
        hubspotName: String(sessionMap?.hubspot_name || '').trim() || 'Not Found',
        hubspotEmail: normalizeEmail(sessionMap?.hubspot_email) || 'Not Found',
        hubspotUrl: buildHubspotContactUrl(mappedId),
        identityMappingSource: 'hubspot_meeting_activity',
        identityMappingConfidence: 'High',
        identityMappingNote: sessionMap?.mapping_reason || sessionMap?.match_note || '',
        hubspotSource: 'Not Found',
        missingIdentityReason: '',
      };
    }

    const exactMatch = pickBestHubspot(hubspotByExactName.get(nameKey) || []);
    if (exactMatch) {
      return resolveFromHubspotRow(exactMatch, 'hubspot_exact_name', 'Exact normalized full-name match in raw HubSpot cache');
    }

    const initKey = buildInitialKey(attendeeName);
    const initialCandidates = hubspotByFirstLastInitial.get(initKey) || [];
    if (initKey && initialCandidates.length === 1) {
      return resolveFromHubspotRow(initialCandidates[0], 'hubspot_first_last_initial', 'Unique first name + last initial match in raw HubSpot cache');
    }

    const lumaEvidence = lumaByName.get(nameKey) || null;
    if (lumaEvidence) {
      const matchedId = Number(lumaEvidence?.matched_hubspot_contact_id);
      const matchedContact = Number.isFinite(matchedId) ? (hubspotById.get(matchedId) || null) : null;
      if (matchedContact) {
        return resolveFromHubspotRow(matchedContact, 'luma_matched_hubspot_bridge', 'Mapped through Lu.ma matched_hubspot contact');
      }

      const lumaEmail = normalizeEmail(lumaEvidence?.matched_hubspot_email || lumaEvidence?.guest_email);
      const emailContact = pickBestHubspot(hubspotByEmail.get(lumaEmail) || []);
      if (emailContact) {
        return resolveFromHubspotRow(emailContact, 'luma_email_bridge', 'Matched through Lu.ma registration email to raw HubSpot cache');
      }

      return {
        matched: false,
        hubspotContactId: Number.isFinite(matchedId) ? matchedId : null,
        hubspotName: String(lumaEvidence?.matched_hubspot_name || '').trim() || 'Not Found',
        hubspotEmail: lumaEmail || 'Not Found',
        hubspotUrl: buildHubspotContactUrl(matchedId),
        identityMappingSource: 'luma_unresolved_bridge',
        identityMappingConfidence: 'Medium',
        identityMappingNote: 'Lu.ma registration exists for this attendee name but HubSpot cache row is missing (likely sync coverage gap)',
        hubspotSource: 'Not Found',
        missingIdentityReason: 'Lu.ma attendee found, but matching HubSpot contact is missing from raw_hubspot_contacts cache',
      };
    }

    return {
      matched: false,
      hubspotContactId: null,
      hubspotName: 'Not Found',
      hubspotEmail: 'Not Found',
      hubspotUrl: '',
      identityMappingSource: 'none',
      identityMappingConfidence: 'Low',
      identityMappingNote: '',
      hubspotSource: 'Not Found',
      missingIdentityReason: initialCandidates.length > 1
        ? 'Ambiguous HubSpot candidates by first name + last initial; needs HubSpot meeting activity mapping or manual cleanup'
        : 'No HubSpot or Lu.ma identity bridge found for attendee name',
    };
  };

  return {
    resolveAttendee,
    stats: {
      hubspotContactsCached: rawHubspot.length,
      lumaRegistrationsCached: rawLuma.length,
      meetingActivityMappingsCached: attendeeHubspotMappings.length,
    },
  };
}

const cardStyle = {
  backgroundColor: 'white',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
};

const AttendanceDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aliasWarning, setAliasWarning] = useState('');
  const [aliases, setAliases] = useState([]);
  const [rawHubspotContacts, setRawHubspotContacts] = useState([]);
  const [rawLumaRegistrations, setRawLumaRegistrations] = useState([]);
  const [attendeeHubspotMappings, setAttendeeHubspotMappings] = useState([]);
  // HubSpot-first data source: group call activities + their contact associations
  const [hubspotActivities, setHubspotActivities] = useState([]);
  const [hubspotContactAssocs, setHubspotContactAssocs] = useState([]);
  const [identityWarning, setIdentityWarning] = useState('');
  const [planState, setPlanState] = useState({});
  const [selectedSessionKey, setSelectedSessionKey] = useState('');
  const [selectedRepeaterName, setSelectedRepeaterName] = useState('');
  const [selectedRepeaterSessionKey, setSelectedRepeaterSessionKey] = useState('');
  const [detailMessage, setDetailMessage] = useState('');
  const [mergingAliasKey, setMergingAliasKey] = useState('');
  const [humanTaskWorkflow, setHumanTaskWorkflow] = useState({});

  // Build raw_hubspot_contacts lookup map for enrichment (revenue, source etc.)
  const hubspotContactMap = useMemo(() => {
    const m = new Map();
    (rawHubspotContacts || []).forEach(c => {
      const id = Number(c?.hubspot_contact_id);
      if (!Number.isFinite(id) || id <= 0) return;
      m.set(id, pickBetterHubspotEnrichmentRow(m.get(id), c));
    });
    return m;
  }, [rawHubspotContacts]);

  const analytics = useMemo(
    () => computeAnalytics(aliases, hubspotActivities, hubspotContactAssocs, hubspotContactMap),
    [aliases, hubspotActivities, hubspotContactAssocs, hubspotContactMap],
  );
  const attendanceHubspotResolver = useMemo(
    () => buildAttendanceHubspotResolver({
      rawHubspot: rawHubspotContacts,
      rawLuma: rawLumaRegistrations,
      attendeeHubspotMappings,
    }),
    [rawHubspotContacts, rawLumaRegistrations, attendeeHubspotMappings],
  );
  const planItems = useMemo(() => buildPlan(analytics?.stats), [analytics]);

  useEffect(() => {
    const defaultState = {};
    planItems.forEach((item) => {
      defaultState[item.id] = planState[item.id] ?? item.proceed;
    });
    setPlanState(defaultState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planItems.length]);

  useEffect(() => {
    loadAll(true);
  }, []);

  useEffect(() => {
    if (!analytics?.sessions?.length || selectedSessionKey) return;

    const targetDate = '2026-02-19';
    const targetSession = analytics.sessions.find((s) => s.type === 'Thursday' && s.dateLabel === targetDate);
    const fallbackThursday = [...analytics.sessions].reverse().find((s) => s.type === 'Thursday');
    const fallbackAny = analytics.sessions[analytics.sessions.length - 1];
    const selected = targetSession || fallbackThursday || fallbackAny;

    if (selected) {
      setSelectedSessionKey(`${selected.type}|${selected.dateLabel}`);
      if (!targetSession) {
        setDetailMessage(`No attendance row found for 02/19/2026 yet. Showing ${selected.type} ${selected.dateFormatted} for validation.`);
      }
    }
  }, [analytics, selectedSessionKey]);

  const selectedSessionDetail = useMemo(() => {
    if (!analytics?.sessions?.length || !selectedSessionKey) return null;
    const sessions = analytics.sessions;
    const selectedIndex = sessions.findIndex((s) => `${s.type}|${s.dateLabel}` === selectedSessionKey);
    if (selectedIndex < 0) return null;

    const session = sessions[selectedIndex];
    const totalVisitsByName = new Map();
    const groupVisitsByName = new Map();

    sessions.slice(0, selectedIndex + 1).forEach((s) => {
      (s.attendees || []).forEach((name) => {
        totalVisitsByName.set(name, (totalVisitsByName.get(name) || 0) + 1);
        if (s.type === session.type) {
          groupVisitsByName.set(name, (groupVisitsByName.get(name) || 0) + 1);
        }
      });
    });

    const newSet = new Set(session.newNames || []);
    const visitsByName = new Map(
      (analytics.people || []).map((p) => [normalizeName(p.name), Number(p.visits || 0)]),
    );
    const allKnownNames = (analytics.people || []).map((p) => p.name).filter(Boolean);
    const inSessionSet = new Set((session.attendees || []).map((n) => normalizeName(n)));
    // Build attendee objects map for fast lookup (name → hubspot pre-resolved data)
    const attendeeObjByName = new Map();
    (session.attendeeObjects || []).forEach(obj => {
      attendeeObjByName.set(normalizeName(obj.name || ''), obj);
    });

    const attendeeRows = (session.attendees || [])
      .map((name) => {
        // For HubSpot-sourced sessions, use the pre-resolved data directly.
        // For Zoom-only sessions, fall back to the resolver (name matching).
        const preResolved = attendeeObjByName.get(normalizeName(name));
        const hubspotIdentity = preResolved
          ? { matched: true, ...preResolved }
          : attendanceHubspotResolver.resolveAttendee(name, session);
        const resolvedHubspotContactId = Number(hubspotIdentity?.hubspotContactId);
        const hubspotContact = Number.isFinite(resolvedHubspotContactId)
          ? (hubspotContactMap.get(resolvedHubspotContactId) || null)
          : null;
        const revenue = resolveHubspotRevenueValue(hubspotContact);
        const sobrietyDate = resolveHubspotSobrietyValue(hubspotContact) || null;
        const sobrietyInfo = sobrietyMilestoneInfo(sobrietyDate, new Date());

        const rawCandidates = findSessionPriorityDuplicates(name, allKnownNames, inSessionSet);
        const dedupe = new Set();
        const duplicateActions = rawCandidates
          .map((candidate) => {
            const preferred = pickPreferredCanonicalName(name, candidate, visitsByName);
            const source = preferred === name ? candidate : name;
            const target = preferred === name ? name : candidate;
            const key = `${normalizeName(source)}->${normalizeName(target)}`;
            if (normalizeName(source) === normalizeName(target) || dedupe.has(key)) return null;
            dedupe.add(key);
            return {
              source,
              target,
              key,
              label: `Merge ${source} into ${target}`,
            };
          })
          .filter(Boolean);

        return {
          name,
          displayName: hubspotIdentity?.hubspotName && hubspotIdentity.hubspotName !== 'Not Found' ? hubspotIdentity.hubspotName : name,
          isNew: newSet.has(name),
          groupVisitsIncludingThisSession: groupVisitsByName.get(name) || 0,
          totalVisitsIncludingThisSession: totalVisitsByName.get(name) || 0,
          hubspotMatched: preResolved ? true : !!hubspotIdentity?.matched,
          hubspotContactId: hubspotIdentity?.hubspotContactId || null,
          hubspotName: hubspotIdentity?.hubspotName || 'Not Found',
          hubspotEmail: hubspotIdentity?.hubspotEmail || 'Not Found',
          hubspotUrl: hubspotIdentity?.hubspotUrl || '',
          hubspotSource: hubspotIdentity?.hubspotSource || 'Not Found',
          identityMappingSource: hubspotIdentity?.identityMappingSource || 'none',
          identityMappingConfidence: hubspotIdentity?.identityMappingConfidence || 'Low',
          identityMappingNote: hubspotIdentity?.identityMappingNote || '',
          missingIdentityReason: preResolved ? '' : (hubspotIdentity?.missingIdentityReason || ''),
          dataSource: session.dataSource || 'zoom',
          revenue,
          sobrietyDate,
          sobrietyDurationLabel: sobrietyInfo?.durationLabel || '',
          sobrietySoonLabel: sobrietyInfo?.soonLabel || '',
          sobrietyYears: sobrietyInfo?.elapsed?.years ?? null,
          sobrietyMonths: sobrietyInfo?.elapsed?.months ?? null,
          duplicateActions,
        };
      })
      .sort((a, b) =>
        Number(b.isNew) - Number(a.isNew)
        || (a.isNew && b.isNew ? a.displayName.localeCompare(b.displayName) : 0)
        || (!a.isNew && !b.isNew
          ? (
              a.groupVisitsIncludingThisSession - b.groupVisitsIncludingThisSession
              || a.totalVisitsIncludingThisSession - b.totalVisitsIncludingThisSession
              || a.displayName.localeCompare(b.displayName)
            )
          : 0)
        || a.displayName.localeCompare(b.displayName)
      );

    return {
      session,
      attendeeRows,
      hasTargetDate: session.dateLabel === '2026-02-19',
    };
  }, [analytics, selectedSessionKey, attendanceHubspotResolver, hubspotContactMap]);

  const selectedRepeaterDetail = useMemo(() => {
    if (!analytics?.sessions?.length || !selectedRepeaterName) return null;

    const person = (analytics.people || []).find(
      (p) => normalizeName(p.name) === normalizeName(selectedRepeaterName),
    );
    if (!person) return null;
    const personIdentity = person?.hubspotContactId
      ? {
          matched: true,
          hubspotContactId: person.hubspotContactId,
          hubspotName: person.hubspotName || person.name,
          hubspotEmail: person.hubspotEmail || 'Not Found',
          hubspotUrl: person.hubspotUrl || buildHubspotContactUrl(person.hubspotContactId),
          identityMappingSource: person.identityMappingSource || 'hubspot_call_activity',
          identityMappingConfidence: person.identityMappingConfidence || 'High',
          hubspotSource: person.hubspotSource || 'Not Found',
        }
      : attendanceHubspotResolver.resolveAttendee(person.name, null);

    const attendedSessions = (person.sessionIndexes || [])
      .map((idx) => analytics.sessions[idx])
      .filter(Boolean)
      .map((session) => ({
        sessionKey: `${session.type}|${session.dateLabel}`,
        type: session.type,
        dateLabel: session.dateLabel,
        dateFormatted: session.dateFormatted,
        derivedCount: Number(session.derivedCount || 0),
        attendees: Array.isArray(session.attendees) ? session.attendees : [],
        newNames: Array.isArray(session.newNames) ? session.newNames : [],
      }))
      .sort((a, b) => a.dateLabel.localeCompare(b.dateLabel));

    if (attendedSessions.length === 0) {
      return {
        person,
        personIdentity,
        attendedSessions: [],
        selectedSessionKey: '',
        selectedSession: null,
        otherAttendees: [],
      };
    }

    const hasSelected = attendedSessions.some((session) => session.sessionKey === selectedRepeaterSessionKey);
    const activeSessionKey = hasSelected
      ? selectedRepeaterSessionKey
      : attendedSessions[attendedSessions.length - 1].sessionKey;
    const selectedSession = attendedSessions.find((session) => session.sessionKey === activeSessionKey) || null;

    const otherAttendees = (selectedSession?.attendees || [])
      .filter((name) => normalizeName(name) !== normalizeName(person.name))
      .map((name) => ({
        name,
        isNew: (selectedSession?.newNames || []).includes(name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      person,
      personIdentity,
      attendedSessions,
      selectedSessionKey: activeSessionKey,
      selectedSession,
      otherAttendees,
    };
  }, [analytics, selectedRepeaterName, selectedRepeaterSessionKey, attendanceHubspotResolver]);

  const atRiskOutreachRows = useMemo(() => {
    return (analytics.atRiskPeople || []).map((person) => {
      const identity = person?.hubspotContactId
        ? {
            matched: true,
            hubspotContactId: person.hubspotContactId,
            hubspotName: person.hubspotName || person.name,
            hubspotEmail: person.hubspotEmail || 'Not Found',
            hubspotUrl: person.hubspotUrl || buildHubspotContactUrl(person.hubspotContactId),
            identityMappingSource: person.identityMappingSource || 'hubspot_call_activity',
          }
        : attendanceHubspotResolver.resolveAttendee(person.name, null);
      return {
        ...person,
        hubspotMatched: !!identity?.matched,
        hubspotName: identity?.hubspotName || person.name,
        hubspotEmail: identity?.hubspotEmail || 'Not Found',
        hubspotUrl: identity?.hubspotUrl || '',
        identityMappingSource: identity?.identityMappingSource || 'none',
      };
    });
  }, [analytics, attendanceHubspotResolver]);

  const badNameQa = useMemo(() => {
    const sessionActivityIds = new Set(
      (analytics?.sessions || [])
        .map((s) => String(s?.meetingId || ''))
        .filter(Boolean),
    );
    const activityDateById = new Map(
      (hubspotActivities || []).map((a) => [
        String(a?.hubspot_activity_id || ''),
        String(a?.hs_timestamp || a?.created_at_hubspot || ''),
      ]),
    );

    const byContactId = new Map();
    let suspiciousUnmatchedAssocCount = 0;

    (hubspotContactAssocs || []).forEach((assoc) => {
      const activityId = String(assoc?.hubspot_activity_id || '');
      if (!activityId || !sessionActivityIds.has(activityId)) return;

      const contactId = Number(assoc?.hubspot_contact_id);
      const assocEmail = normalizeEmail(assoc?.contact_email || '');
      const snapshotFirst = String(assoc?.contact_firstname || '').trim();
      const snapshotLast = String(assoc?.contact_lastname || '').trim();
      const snapshotName = [snapshotFirst, snapshotLast].filter(Boolean).join(' ').trim();

      if (!Number.isFinite(contactId) || contactId <= 0) {
        const unmatchedReasons = detectSuspiciousPersonName({
          firstName: snapshotFirst,
          lastName: snapshotLast,
          fullName: snapshotName,
          email: assocEmail,
        });
        if (unmatchedReasons.length > 0) suspiciousUnmatchedAssocCount += 1;
        return;
      }

      const contact = hubspotContactMap.get(contactId) || {};
      const currentFirst = String(contact?.firstname || '').trim();
      const currentLast = String(contact?.lastname || '').trim();
      const currentName = [currentFirst, currentLast].filter(Boolean).join(' ').trim();
      const currentEmail = normalizeEmail(contact?.email || assocEmail || '');
      const currentReasons = detectSuspiciousPersonName({
        firstName: currentFirst,
        lastName: currentLast,
        fullName: currentName,
        email: currentEmail,
      });
      const snapshotReasons = detectSuspiciousPersonName({
        firstName: snapshotFirst,
        lastName: snapshotLast,
        fullName: snapshotName,
        email: assocEmail || currentEmail,
      });
      const combinedReasons = uniqueStrings([
        ...currentReasons.map((r) => `Current: ${r}`),
        ...snapshotReasons.map((r) => `Call snapshot: ${r}`),
      ]);

      if (combinedReasons.length === 0) return;

      const existing = byContactId.get(contactId) || {
        hubspotContactId: contactId,
        hubspotUrl: buildHubspotContactUrl(contactId),
        currentName: currentName || `Contact ${contactId}`,
        currentEmail: currentEmail || 'Not Found',
        snapshotNames: new Set(),
        reasons: new Set(),
        associationRows: 0,
        lastSeenIso: '',
      };

      if (snapshotName) existing.snapshotNames.add(snapshotName);
      combinedReasons.forEach((reason) => existing.reasons.add(reason));
      existing.associationRows += 1;
      const seenIso = activityDateById.get(activityId) || '';
      if (seenIso && (!existing.lastSeenIso || seenIso > existing.lastSeenIso)) {
        existing.lastSeenIso = seenIso;
      }

      // Prefer freshest current HubSpot name/email while preserving contact id.
      existing.currentName = currentName || existing.currentName;
      existing.currentEmail = currentEmail || existing.currentEmail;
      existing.hubspotUrl = buildHubspotContactUrl(contactId) || existing.hubspotUrl;

      byContactId.set(contactId, existing);
    });

    const rows = Array.from(byContactId.values())
      .map((row) => {
        const lastSeenDate = safeDate(row.lastSeenIso);
        return {
          hubspotContactId: row.hubspotContactId,
          hubspotUrl: row.hubspotUrl,
          currentName: row.currentName,
          currentEmail: row.currentEmail,
          snapshotNames: Array.from(row.snapshotNames).sort((a, b) => a.localeCompare(b)),
          reasons: Array.from(row.reasons),
          associationRows: row.associationRows,
          lastSeenIso: row.lastSeenIso,
          lastSeenDateFormatted: lastSeenDate ? formatDateMMDDYY(lastSeenDate) : '',
        };
      })
      .sort((a, b) =>
        (b.lastSeenIso || '').localeCompare(a.lastSeenIso || '')
        || b.associationRows - a.associationRows
        || a.currentName.localeCompare(b.currentName)
      );

    return {
      rows,
      counts: {
        suspiciousContacts: rows.length,
        suspiciousUnmatchedAssocCount,
      },
    };
  }, [analytics, hubspotActivities, hubspotContactAssocs, hubspotContactMap]);

  const attendanceAiInsight = useMemo(() => {
    const rows = selectedSessionDetail?.attendeeRows || [];
    const returningRows = rows.filter((r) => !r.isNew);
    const matchedRows = rows.filter((r) => r.hubspotMatched);
    const unmatchedRows = rows.filter((r) => !r.hubspotMatched);
    const medianOf = (nums = []) => {
      const values = (nums || []).filter(Number.isFinite).sort((a, b) => a - b);
      if (!values.length) return null;
      const mid = Math.floor(values.length / 2);
      if (values.length % 2 === 1) return values[mid];
      return (values[mid - 1] + values[mid]) / 2;
    };

    const returningVisits = returningRows
      .map((r) => Number(r.groupVisitsIncludingThisSession || 0))
      .filter(Number.isFinite);
    const avgReturningTenure = returningVisits.length
      ? returningVisits.reduce((sum, n) => sum + n, 0) / returningVisits.length
      : null;
    const medianReturningTenure = medianOf(returningVisits);

    const selectedGroupType = selectedSessionDetail?.session?.type || '';
    const groupSessionRepeatCounts = (analytics?.sessions || [])
      .filter((s) => s?.type === selectedGroupType)
      .map((s) => Number(s?.repeatCount || 0))
      .filter(Number.isFinite);
    const recentGroupRepeatCounts = groupSessionRepeatCounts.slice(-8);
    const repeatCountComparisonSet = recentGroupRepeatCounts.length > 0 ? recentGroupRepeatCounts : groupSessionRepeatCounts;
    const avgRepeatShowups = repeatCountComparisonSet.length
      ? repeatCountComparisonSet.reduce((sum, n) => sum + n, 0) / repeatCountComparisonSet.length
      : null;
    const medianRepeatShowups = medianOf(repeatCountComparisonSet);
    const lowVisitReturning = returningRows.filter((r) => Number(r.groupVisitsIncludingThisSession || 0) <= 2);
    const soonMilestones = rows.filter((r) => !!r.sobrietySoonLabel);
    const missingRevenue = matchedRows.filter((r) => !Number.isFinite(r.revenue));
    const missingSobriety = matchedRows.filter((r) => !r.sobrietyDate);
    const highValueLowVisit = rows.filter((r) => Number.isFinite(r.revenue) && r.revenue >= 250000 && Number(r.groupVisitsIncludingThisSession || 0) <= 2);

    const summaryBullets = [];
    if (selectedSessionDetail?.session) {
      summaryBullets.push(
        `${selectedSessionDetail.session.type} ${selectedSessionDetail.session.dateFormatted}: ${rows.length} show-ups (${selectedSessionDetail.session.newCount} new, ${selectedSessionDetail.session.repeatCount} returning).`,
      );
    }
    if (avgRepeatShowups !== null) {
      summaryBullets.push(`Recent ${selectedGroupType || 'group'} sessions average ${avgRepeatShowups.toFixed(1)} returning show-ups (median ${medianRepeatShowups}).`);
    }
    if (avgReturningTenure !== null) {
      summaryBullets.push(`In this session, returning attendees have attended this meeting type ${avgReturningTenure.toFixed(1)} times on average (median ${medianReturningTenure}).`);
    }
    if (lowVisitReturning.length > 0) {
      summaryBullets.push(`${lowVisitReturning.length} returning attendee${lowVisitReturning.length === 1 ? '' : 's'} are still early-stage (2 or fewer visits) and are prime repeat-attendance growth targets.`);
    }

    const opportunities = [];
    if (lowVisitReturning.length > 0) {
      opportunities.push(`Run a light-touch “good to see you again” follow-up for ${lowVisitReturning.length} early repeaters to increase next-week attendance.`);
    }
    if ((analytics.atRiskBreakdown?.oneAndDoneMissedNext || 0) > 0) {
      opportunities.push(`Prioritize Rule A at-risk attendees (${analytics.atRiskBreakdown.oneAndDoneMissedNext}) for immediate win-back outreach within 48 hours.`);
    }
    if (soonMilestones.length > 0) {
      opportunities.push(`${soonMilestones.length} attendee${soonMilestones.length === 1 ? '' : 's'} have sobriety anniversaries approaching; milestone callouts can drive stronger retention and referrals.`);
    }
    if (highValueLowVisit.length > 0) {
      opportunities.push(`${highValueLowVisit.length} high-revenue attendee${highValueLowVisit.length === 1 ? '' : 's'} are still low-frequency in this group; white-glove retention outreach is likely worth it.`);
    }

    const blindSpots = [];
    if (unmatchedRows.length > 0) blindSpots.push(`${unmatchedRows.length} attendee row${unmatchedRows.length === 1 ? '' : 's'} are not matched to HubSpot, limiting email/revenue-based retention actions.`);
    if (missingRevenue.length > 0) blindSpots.push(`${missingRevenue.length} matched attendee${missingRevenue.length === 1 ? '' : 's'} are missing revenue in HubSpot.`);
    if (missingSobriety.length > 0) blindSpots.push(`${missingSobriety.length} matched attendee${missingSobriety.length === 1 ? '' : 's'} are missing sobriety dates, reducing milestone retention targeting.`);
    if ((badNameQa.counts?.suspiciousContacts || 0) > 0) blindSpots.push(`${badNameQa.counts.suspiciousContacts} HubSpot contacts used in Attendance still have suspicious name data.`);

    const providerStatuses = [
      { key: 'openai', label: 'OpenAI', configured: !!String(import.meta.env.VITE_OPENAI_API_KEY || '').trim(), note: 'Frontend placeholder only; prefer Supabase Edge Function secrets' },
      { key: 'gemini', label: 'Gemini', configured: !!String(import.meta.env.VITE_GEMINI_API_KEY || '').trim(), note: 'Frontend placeholder only; prefer Supabase Edge Function secrets' },
      { key: 'claude', label: 'Claude', configured: !!String(import.meta.env.VITE_CLAUDE_API_KEY || import.meta.env.VITE_ANTHROPIC_API_KEY || '').trim(), note: 'Frontend placeholder only; prefer Supabase Edge Function secrets' },
    ];

    const autonomousWorkflow = [
      { id: 'winback-email', title: 'Win-back campaign email', delivery: 'Mailchimp API sync (planned)', actionLabel: 'Generate + Sync (Soon)' },
      { id: 'outreach-csv', title: 'At-risk outreach list export', delivery: 'Download CSV / Notion sync (planned)', actionLabel: 'Build deliverable (Soon)' },
      { id: 'tag-rules', title: 'Retention tagging rules', delivery: 'CRM / ESP automation rule sync (planned)', actionLabel: 'Create rule (Soon)' },
    ];

    return {
      headline: rows.length
        ? 'Focus on converting net new attendees into second-session repeaters and protecting early repeaters before they slip into the at-risk queue.'
        : 'Select a session in Show-Up Drilldown to generate session-specific retention insights.',
      summaryBullets,
      opportunities,
      blindSpots,
      providerStatuses,
      autonomousWorkflow,
    };
  }, [selectedSessionDetail, analytics, badNameQa]);

  async function readAliasesFromTable() {
    const { data, error } = await supabase
      .from('attendee_aliases')
      .select('id, original_name, target_name');
    return { data: data || [], error };
  }

  async function readAliasesViaFunction() {
    const { data, error } = await supabase.functions.invoke('manage_attendee_aliases', {
      method: 'POST',
      body: { action: 'list' },
    });

    if (error) return { data: [], error };
    if (data?.ok === false) return { data: [], error: new Error(data?.error || 'Alias function failed.') };
    return { data: Array.isArray(data?.aliases) ? data.aliases : [], error: null };
  }

  async function hasAuthenticatedSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) return false;
    return !!data?.session;
  }

  async function loadAliasesForDashboard() {
    const functionResult = await readAliasesViaFunction();
    if (!functionResult.error) {
      return { aliases: functionResult.data, warning: '' };
    }

    const functionMessage = functionResult.error?.message || 'function read failed';
    const hasSession = await hasAuthenticatedSession();
    if (!hasSession) {
      return {
        aliases: [],
        warning: `Alias rules unavailable: ${functionMessage}. Deploy/manage manage_attendee_aliases or sign in for direct table access.`,
      };
    }

    const tableResult = await readAliasesFromTable();
    if (!tableResult.error) {
      return { aliases: tableResult.data, warning: '' };
    }

    if (isMissingTableError(tableResult.error)) {
      return {
        aliases: [],
        warning: 'Alias table is missing. Analytics still loaded using raw attendee names.',
      };
    }

    const tableMessage = tableResult.error?.message || 'table read failed';
    return {
      aliases: [],
      warning: `Alias rules unavailable: ${tableMessage}. Fallback failed: ${functionMessage}.`,
    };
  }

  async function mergeAliasViaTable(source, target) {
    const sourceNorm = normalizeName(source);
    const targetNorm = normalizeName(target);
    const rowsToDelete = (aliases || []).filter((row) => {
      const originalNorm = normalizeName(row.original_name);
      return originalNorm === sourceNorm || originalNorm === targetNorm;
    });

    for (const row of rowsToDelete) {
      const deleteQuery = row.id
        ? supabase.from('attendee_aliases').delete().eq('id', row.id)
        : supabase.from('attendee_aliases').delete().eq('original_name', row.original_name);
      const { error: deleteErr } = await deleteQuery;
      if (deleteErr) throw deleteErr;
    }

    const { error: insertErr } = await supabase
      .from('attendee_aliases')
      .insert({ original_name: source, target_name: target });
    if (insertErr) throw insertErr;

    const tableReload = await readAliasesFromTable();
    if (tableReload.error) throw tableReload.error;
    return tableReload.data;
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    setAliasWarning('');
    setIdentityWarning('');

    const aliasResult = await loadAliasesForDashboard();
    if (aliasResult.warning) {
      setAliasWarning(aliasResult.warning);
    }

    const identityWarnings = [];
    const identityStartDate = dateKeyDaysAgo(730);

    // ── PRIMARY: HubSpot meeting activity groups (call-type, group sessions) ──
    const [
      hsActivitiesResult,
      hsAssocsResult,
      hubspotContactsResult,
      lumaResult,
      attendeeMappingsResult,
    ] = await Promise.all([
      // HubSpot group call activities (the sessions themselves)
      supabase
        .from('raw_hubspot_meeting_activities')
        .select('hubspot_activity_id,activity_type,hs_timestamp,created_at_hubspot,title,body_preview,metadata')
        .eq('activity_type', 'call')
        .gte('hs_timestamp', `${identityStartDate}T00:00:00.000Z`)
        .order('hs_timestamp', { ascending: false })
        .limit(5000),
      // Contact associations for those activities
      supabase
        .from('hubspot_activity_contact_associations')
        .select('hubspot_activity_id,activity_type,hubspot_contact_id,contact_email,contact_firstname,contact_lastname')
        .eq('activity_type', 'call')
        .limit(50000),
      // HubSpot contact enrichment (revenue, source, email, etc.)
      supabase
        .from('raw_hubspot_contacts')
        .select('*')
        .order('createdate', { ascending: false })
        .limit(20000),
      // Lu.ma registrations (kept for fallback resolver)
      supabase
        .from('raw_luma_registrations')
        .select('event_date,guest_name,guest_email,approval_status,is_thursday,matched_zoom,matched_hubspot,matched_hubspot_contact_id,matched_hubspot_name,matched_hubspot_email')
        .gte('event_date', identityStartDate)
        .order('event_date', { ascending: false })
        .limit(20000),
      // zoom_attendee_hubspot_mappings (kept for resolver on Zoom-only sessions if needed)
      supabase
        .from('zoom_attendee_hubspot_mappings')
        .select('session_date,meeting_id,zoom_attendee_raw_name,zoom_attendee_canonical_name,hubspot_contact_id,hubspot_name,hubspot_email,mapping_source,mapping_reason,mapping_confidence,match_note,hubspot_activity_id')
        .gte('session_date', identityStartDate)
        .order('session_date', { ascending: false })
        .limit(50000),
    ]);

    if (hsActivitiesResult.error) {
      identityWarnings.push(`HubSpot activity feed unavailable: ${hsActivitiesResult.error.message || 'read failed'}`);
      setHubspotActivities([]);
    } else {
      setHubspotActivities(hsActivitiesResult.data || []);
    }

    if (hsAssocsResult.error) {
      identityWarnings.push(`HubSpot contact associations unavailable: ${hsAssocsResult.error.message || 'read failed'}`);
      setHubspotContactAssocs([]);
    } else {
      setHubspotContactAssocs(hsAssocsResult.data || []);
    }

    let hubspotContactsData = [];
    if (hubspotContactsResult.error) {
      identityWarnings.push(`HubSpot contacts cache unavailable: ${hubspotContactsResult.error.message || 'read failed'}`);
    } else {
      hubspotContactsData = hubspotContactsResult.data || [];
    }

    // Backfill any contact IDs referenced by the loaded HubSpot call sessions but missing from the
    // capped base contact query (old contacts often fall outside the newest-N limit).
    if (!hsActivitiesResult.error && !hsAssocsResult.error) {
      const sessionActivityIds = new Set(
        (hsActivitiesResult.data || [])
          .map((row) => String(row?.hubspot_activity_id || ''))
          .filter(Boolean),
      );
      const neededContactIds = Array.from(new Set(
        (hsAssocsResult.data || [])
          .filter((row) => sessionActivityIds.has(String(row?.hubspot_activity_id || '')))
          .map((row) => Number(row?.hubspot_contact_id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ));
      const loadedContactIds = new Set(
        hubspotContactsData
          .map((row) => Number(row?.hubspot_contact_id))
          .filter((id) => Number.isFinite(id) && id > 0),
      );
      const missingContactIds = neededContactIds.filter((id) => !loadedContactIds.has(id));

      if (missingContactIds.length > 0) {
        const backfillRows = [];
        const backfillErrors = [];
        for (const idChunk of chunkArray(missingContactIds, 200)) {
          const backfillResult = await supabase
            .from('raw_hubspot_contacts')
            .select('*')
            .in('hubspot_contact_id', idChunk);
          if (backfillResult.error) {
            backfillErrors.push(backfillResult.error.message || 'read failed');
            continue;
          }
          backfillRows.push(...(backfillResult.data || []));
        }

        if (backfillRows.length > 0) {
          hubspotContactsData = [...hubspotContactsData, ...backfillRows];
        }

        const finalContactIdSet = new Set(
          hubspotContactsData
            .map((row) => Number(row?.hubspot_contact_id))
            .filter((id) => Number.isFinite(id) && id > 0),
        );
        const stillMissingCount = missingContactIds.filter((id) => !finalContactIdSet.has(id)).length;

        if (backfillErrors.length > 0) {
          identityWarnings.push(`HubSpot contacts enrichment backfill had ${backfillErrors.length} error(s); some revenue/sobriety fields may be missing.`);
        }
        if (stillMissingCount > 0) {
          identityWarnings.push(`${stillMissingCount} HubSpot call-linked contact(s) were not found in raw_hubspot_contacts cache; refresh contact sync to fill enrichment fields.`);
        }
      }
    }

    setRawHubspotContacts(hubspotContactsData);

    if (lumaResult.error) {
      setRawLumaRegistrations([]);
    } else {
      setRawLumaRegistrations(lumaResult.data || []);
    }

    if (attendeeMappingsResult.error) {
      setAttendeeHubspotMappings([]);
    } else {
      setAttendeeHubspotMappings(attendeeMappingsResult.data || []);
    }

    if (identityWarnings.length > 0) {
      setIdentityWarning(identityWarnings.join(' | '));
    }

    setAliases(aliasResult.aliases || []);
    setLoading(false);
  }

  function handleShowUpBarClick(eventState) {
    const payload = eventState?.activePayload?.[0]?.payload || eventState?.payload || null;
    const key = payload?.sessionKey;
    if (!key) return;
    setSelectedSessionKey(key);
    setDetailMessage('');
  }

  function handleTopRepeaterClick(name) {
    setSelectedRepeaterName(name);
    setSelectedRepeaterSessionKey('');
  }

  function handleTopRepeaterSessionClick(sessionKey) {
    setSelectedRepeaterSessionKey(sessionKey);
  }

  async function handleMergeAlias(sourceName, targetName) {
    const source = String(sourceName || '').trim();
    const target = String(targetName || '').trim();
    if (!source || !target) return;

    if (normalizeName(source) === normalizeName(target)) {
      setDetailMessage(`Merge skipped: "${source}" and "${target}" are the same normalized name.`);
      return;
    }

    const existingAlias = (aliases || []).find(
      (row) => normalizeName(row.original_name) === normalizeName(source),
    );
    if (existingAlias && normalizeName(existingAlias.target_name) === normalizeName(target)) {
      setDetailMessage(`Alias already exists: "${existingAlias.original_name}" -> "${existingAlias.target_name}".`);
      return;
    }

    const mergeKey = `${normalizeName(source)}->${normalizeName(target)}`;
    setMergingAliasKey(mergeKey);

    let managedErrorMessage = '';
    try {
      const managed = await supabase.functions.invoke('manage_attendee_aliases', {
        method: 'POST',
        body: { action: 'merge', source_name: source, target_name: target },
      });

      if (!managed.error && managed.data?.ok) {
        setAliases(Array.isArray(managed.data?.aliases) ? managed.data.aliases : []);
        setAliasWarning('');
        setDetailMessage(`Merged "${source}" into "${target}".`);
        return;
      }

      managedErrorMessage = managed.error?.message || managed.data?.error || '';
      const hasSession = await hasAuthenticatedSession();
      if (!hasSession) {
        throw new Error(
          `${managedErrorMessage || 'Alias function unavailable.'} Direct table fallback requires an authenticated dashboard session.`,
        );
      }

      const nextAliases = await mergeAliasViaTable(source, target);
      setAliases(nextAliases);
      if (managedErrorMessage) {
        setAliasWarning('Managed alias endpoint unavailable; used direct table write fallback.');
      }
      setDetailMessage(`Merged "${source}" into "${target}".`);
    } catch (mergeErr) {
      if (isMissingTableError(mergeErr)) {
        setAliasWarning('Alias table is missing. Analytics still loaded using raw attendee names.');
        setDetailMessage('Could not save merge because attendee_aliases is missing.');
      } else {
        const details = [mergeErr?.message, managedErrorMessage].filter(Boolean).join(' | ');
        setDetailMessage(`Failed to merge "${source}" into "${target}": ${details || 'Unknown error'}`);
      }
    } finally {
      setMergingAliasKey('');
    }
  }

  async function createNotionTodoFromPlanItem(item) {
    const title = `[Attendance] ${item.title}`;
    const statusNamesToTry = ['Pending', 'To Do'];
    let lastErr = null;

    for (const statusName of statusNamesToTry) {
      const { data, error: createErr } = await supabase.functions.invoke('sync-metrics', {
        method: 'POST',
        headers: { 'x-pathname': '/tasks' },
        body: {
          properties: {
            Name: { title: [{ text: { content: title } }] },
            Status: { status: { name: statusName } },
          },
        },
      });

      if (!createErr) {
        return { data, statusName };
      }
      lastErr = createErr;
    }

    throw lastErr || new Error('Failed to create Notion task');
  }

  async function handleAddHumanTaskToNotion(item) {
    if (!item?.id) return;
    setHumanTaskWorkflow((prev) => ({
      ...prev,
      [item.id]: {
        ...(prev[item.id] || {}),
        addToDo: true,
        skipped: false,
        syncStatus: 'saving',
        error: '',
      },
    }));

    try {
      const { data, statusName } = await createNotionTodoFromPlanItem(item);
      setHumanTaskWorkflow((prev) => ({
        ...prev,
        [item.id]: {
          ...(prev[item.id] || {}),
          addToDo: true,
          skipped: false,
          syncStatus: 'saved',
          error: '',
          notionTaskStatus: statusName,
          notionPageId: data?.id || '',
          notionUrl: data?.url || '',
        },
      }));
      supabase.functions.invoke('sync-metrics', {
        method: 'GET',
        queryString: { trigger_refresh: 'true' },
      }).catch(() => {});
    } catch (todoErr) {
      setHumanTaskWorkflow((prev) => ({
        ...prev,
        [item.id]: {
          ...(prev[item.id] || {}),
          addToDo: false,
          skipped: false,
          syncStatus: 'error',
          error: todoErr?.message || 'Notion sync failed',
        },
      }));
    }
  }

  function handleSkipHumanTask(item) {
    if (!item?.id) return;
    setHumanTaskWorkflow((prev) => ({
      ...prev,
      [item.id]: {
        ...(prev[item.id] || {}),
        skipped: true,
        addToDo: false,
        syncStatus: 'skipped',
        error: '',
      },
    }));
  }

  const selectedCount = Object.values(planState).filter(Boolean).length;
  const autonomousTasks = planItems.filter((p) => p.owner === 'Autonomous');
  const humanTasks = planItems.filter((p) => p.owner === 'Human');

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Loading attendance analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, color: '#b91c1c' }}>
        <p style={{ fontWeight: 700 }}>Attendance load failed</p>
        <p style={{ marginTop: '8px' }}>{error}</p>
      </div>
    );
  }

  /** Shared tooltip renderer for show-up bar charts */
  const showUpTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div style={{ backgroundColor: 'white', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
          <p style={{ fontWeight: 700, marginBottom: '6px' }}>{label}</p>
          <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
            <span style={{ color: '#22c55e', fontWeight: 600 }}>New: {d.newCount}</span>
            <span style={{ color: '#64748b', fontWeight: 600 }}>Return: {d.repeatCount}</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>Total: {d.total}</span>
          </div>
          {d.newNames && d.newNames.length > 0 && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Welcome New:</p>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#334155' }}>
                {d.newNames.map(n => <li key={n}>{n}</li>)}
              </ul>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  /** Render a cohort breakdown for one day */
  const CohortBreakdown = ({ title, data, accentColor }) => (
    <div>
      <h4 style={{ fontSize: '15px', fontWeight: 700, color: accentColor, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {data.map((bucket) => (
          <div key={bucket.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '110px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>{bucket.label}</div>
            <div style={{ flex: 1, height: '24px', backgroundColor: '#f1f5f9', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                width: `${Math.max(bucket.pct * 100, 1)}%`,
                height: '100%',
                backgroundColor: bucket.color,
                borderRadius: '6px',
                transition: 'width 0.3s ease',
                opacity: 0.85,
              }} />
            </div>
            <div style={{ width: '90px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
              {bucket.count} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({(bucket.pct * 100).toFixed(0)}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const monthlyTrendTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload || {};
    return (
      <div style={{ backgroundColor: 'white', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
        <p style={{ fontWeight: 700, marginBottom: '6px' }}>{label}</p>
        <p style={{ fontSize: '13px', color: '#0f172a', margin: 0 }}>Avg Visits: <strong>{row.avgVisits ?? '-'}</strong></p>
        <p style={{ fontSize: '12px', color: '#475569', margin: '4px 0 0 0' }}>MoM: {formatChangePct(row.momChange)}</p>
        <p style={{ fontSize: '12px', color: '#475569', margin: '2px 0 0 0' }}>YoY: {formatChangePct(row.yoyChange)}</p>
      </div>
    );
  };

  const avgTimelineTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload || {};
    const fullDate = row.dayName && row.date ? `${row.dayName} ${row.date}` : label;
    const tue = row.tuesdayHoverAvg ?? row.tuesdayAvg ?? '-';
    const thu = row.thursdayHoverAvg ?? row.thursdayAvg ?? '-';

    return (
      <div style={{ backgroundColor: 'white', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
        <p style={{ fontWeight: 700, marginBottom: '6px' }}>{fullDate}</p>
        <p style={{ fontSize: '13px', color: '#0ea5e9', margin: 0 }}>Tuesday Avg Visits: <strong>{tue}</strong></p>
        <p style={{ fontSize: '13px', color: '#6366f1', margin: '4px 0 0 0' }}>Thursday Avg Visits: <strong>{thu}</strong></p>
      </div>
    );
  };

  const MonthlyAverageCard = ({ title, color, series, summary }) => (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <TrendingUp size={17} color={color} />
        <h3 style={{ fontSize: '18px' }}>{title}</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(110px, 1fr))', gap: '10px', marginBottom: '12px' }}>
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
          <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Current</p>
          <p style={{ marginTop: '4px', fontSize: '20px', fontWeight: 700, color }}>{summary ? summary.avgVisits : '-'}</p>
          <p style={{ marginTop: '2px', fontSize: '11px', color: '#64748b' }}>{summary?.asOfMonth || 'N/A'}</p>
        </div>
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
          <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Vs Last Month</p>
          <p style={{ marginTop: '4px', fontSize: '20px', fontWeight: 700, color: summary?.momChange === null || summary?.momChange === undefined ? '#475569' : (summary?.momChange >= 0 ? '#15803d' : '#b91c1c') }}>
            {formatChangePct(summary?.momChange)}
          </p>
          <p style={{ marginTop: '2px', fontSize: '11px', color: '#64748b' }}>{summary?.prevMonthAvg ?? '-'} prior avg</p>
        </div>
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
          <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Vs Previous Year</p>
          <p style={{ marginTop: '4px', fontSize: '20px', fontWeight: 700, color: summary?.yoyChange === null || summary?.yoyChange === undefined ? '#475569' : (summary?.yoyChange >= 0 ? '#15803d' : '#b91c1c') }}>
            {formatChangePct(summary?.yoyChange)}
          </p>
          <p style={{ marginTop: '2px', fontSize: '11px', color: '#64748b' }}>{summary?.hasYoY ? `${summary?.prevYearAvg} prior avg` : 'Not available yet'}</p>
        </div>
      </div>
      <div style={{ height: '240px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="monthLabel" tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis domain={[1, 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} />
            <Tooltip content={monthlyTrendTooltip} />
            <Line type="monotone" dataKey="avgVisits" name="Avg Visits / Person" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {aliasWarning && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
          <p style={{ color: '#92400e', fontWeight: 700 }}>Alias Warning</p>
          <p style={{ marginTop: '6px', color: '#92400e' }}>{aliasWarning}</p>
        </div>
      )}

      {identityWarning && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
          <p style={{ color: '#92400e', fontWeight: 700 }}>Identity Mapping Warning</p>
          <p style={{ marginTop: '6px', color: '#92400e' }}>{identityWarning}</p>
          <p style={{ marginTop: '6px', color: '#92400e', fontSize: '12px' }}>
            Attendance counts remain valid. HubSpot contact/email enrichment is partial until caches and mapping tables are synced.
          </p>
        </div>
      )}

      <div
        style={{
          ...cardStyle,
          background: 'linear-gradient(120deg, #0f766e 0%, #155e75 45%, #1e3a8a 100%)',
          color: 'white',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div>
          <p style={{ fontSize: '13px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.08em' }}>HubSpot</p>
          <h2 style={{ fontSize: '30px', lineHeight: 1.1, marginTop: '6px' }}>Attendance Intelligence Dashboard</h2>
          <p style={{ marginTop: '8px', opacity: 0.9 }}>
            Accurate attendee counts, repeat behavior, and execution plan — Tuesday and Thursday tracked independently.
          </p>
          <p style={{ marginTop: '6px', opacity: 0.85, fontSize: '12px' }}>
            Data source: {hubspotActivities.length} verified HubSpot group sessions · {hubspotContactAssocs.length} attendee associations · {rawHubspotContacts.length} HubSpot contacts enriched
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => exportAttendanceCSV(analytics.sessions)}
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: 'white',
              borderRadius: '10px',
              padding: '10px 14px',
              border: '1px solid rgba(255,255,255,0.3)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Welcome New Section */}
      {(analytics.welcomeNewSessionsTue?.length > 0 || analytics.welcomeNewSessionsThu?.length > 0) && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Sparkles size={20} color="#0f766e" />
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Welcome New</h3>
            <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>
              2 latest Tuesday sessions on left and 2 latest Thursday sessions on right
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', minWidth: '920px' }}>
              {[...(analytics.welcomeNewSessionsTue || []), ...(analytics.welcomeNewSessionsThu || [])].map((session, idx) => {
                const isTuesday = session.type === 'Tuesday';
                return (
                  <div
                    key={`welcome-${session.type}-${session.dateLabel}-${idx}`}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '14px',
                      backgroundColor: isTuesday ? '#f0fdf4' : '#fff7ed',
                      borderLeft: `4px solid ${isTuesday ? '#0ea5e9' : '#f97316'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <p style={{ fontWeight: 700, fontSize: '14px', color: isTuesday ? '#0369a1' : '#c2410c' }}>
                        Welcome New - {session.type} {session.dateFormatted}
                      </p>
                      <span
                        style={{
                          backgroundColor: isTuesday ? '#dcfce7' : '#ffedd5',
                          color: isTuesday ? '#166534' : '#9a3412',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {session.newNames.length} new
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {session.newNames.map((name, nIdx) => (
                        <span
                          key={`welcome-name-${idx}-${nIdx}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            backgroundColor: 'white',
                            border: `1px solid ${isTuesday ? '#bbf7d0' : '#fdba74'}`,
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#334155',
                          }}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {/* KPI Stats — Separated by Day */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Unique Tue</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#0ea5e9' }}>{analytics.stats.uniqueTue}</p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Tactic Tuesday
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Unique Thu</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#6366f1' }}>{analytics.stats.uniqueThu}</p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            SF Mastermind
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Repeat Rate Tue</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#0ea5e9' }}>
            {formatPct(analytics.stats.repeatRateTue)}
          </p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Tue Retention
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Repeat Rate Thu</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#6366f1' }}>
            {formatPct(analytics.stats.repeatRateThu)}
          </p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Thu Retention
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Sessions</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#0f766e' }}>
            {analytics.stats.sessions}
          </p>
          <p style={{ marginTop: '10px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Total analyzed
          </p>
        </div>
      </div>

      {/* ─── Show-Up Charts (Tue & Thu separate) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <TrendingUp size={17} color="#0ea5e9" />
            <h3 style={{ fontSize: '18px' }}>Tuesday Show-Ups</h3>
          </div>
          <div style={{ height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.trendDataTue} onClick={handleShowUpBarClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip content={showUpTooltip} />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="newCount" name="New (Tue)" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} cursor="pointer" onClick={handleShowUpBarClick} />
                <Bar dataKey="repeatCount" name="Returning (Tue)" stackId="a" fill="#93c5fd" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleShowUpBarClick} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <TrendingUp size={17} color="#6366f1" />
            <h3 style={{ fontSize: '18px' }}>Thursday Show-Ups</h3>
          </div>
          <div style={{ height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.trendDataThu} onClick={handleShowUpBarClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip content={showUpTooltip} />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="newCount" name="New (Thu)" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} cursor="pointer" onClick={handleShowUpBarClick} />
                <Bar dataKey="repeatCount" name="Returning (Thu)" stackId="a" fill="#c4b5fd" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleShowUpBarClick} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Show-Up Drilldown */}
      <div style={{ ...cardStyle, borderLeft: '5px solid #0f766e' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: '18px' }}>Show-Up Drilldown</h3>
            <p style={{ marginTop: '4px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              Click any Tuesday/Thursday bar to inspect attendees, visit counts including that meeting, and possible duplicates.
            </p>
          </div>
          {selectedSessionDetail && (
            <div style={{ padding: '6px 10px', borderRadius: '999px', backgroundColor: '#ecfeff', color: '#0f766e', fontSize: '12px', fontWeight: 700 }}>
              {selectedSessionDetail.session.type} {selectedSessionDetail.session.dateFormatted}
            </div>
          )}
        </div>

        {detailMessage && (
          <div style={{ marginTop: '10px', borderRadius: '10px', padding: '10px 12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: '13px' }}>
            {detailMessage}
          </div>
        )}

        {!selectedSessionDetail && (
          <p style={{ marginTop: '12px', color: 'var(--color-text-secondary)' }}>
            No session selected yet. Click a bar in Tuesday or Thursday show-ups.
          </p>
        )}

        {selectedSessionDetail && (
          <>
            {!selectedSessionDetail.hasTargetDate && (
              <div style={{ marginTop: '10px', borderRadius: '10px', padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '13px' }}>
                Validation target is Thursday 02/19/2026. Click that bar when it appears to verify this workflow there first.
              </div>
            )}

            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Total Show-Ups</p>
                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>{selectedSessionDetail.session.derivedCount}</p>
              </div>
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: '#166534', textTransform: 'uppercase' }}>Net New</p>
                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: '#166534' }}>{selectedSessionDetail.session.newCount}</p>
              </div>
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Returning</p>
                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: '#334155' }}>{selectedSessionDetail.session.repeatCount}</p>
              </div>
            </div>

            <div style={{ marginTop: '14px', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '1320px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Display Name</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Revenue</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Sobriety Date</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Times Visited Meeting</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Total Visits</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>Email Address</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>HubSpot Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSessionDetail.attendeeRows.map((row) => (
                    <tr key={row.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{row.displayName || row.name}</span>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                fontSize: '10px',
                                fontWeight: 700,
                                backgroundColor: row.isNew ? '#dcfce7' : '#e2e8f0',
                                color: row.isNew ? '#166534' : '#334155',
                                textTransform: 'uppercase',
                              }}
                            >
                              {row.isNew ? 'Net New' : 'Returning'}
                            </span>
                          </div>
                          {normalizeName(row.displayName || '') !== normalizeName(row.name || '') && (
                            <span style={{ fontSize: '11px', color: '#64748b' }}>Attendance row name: {row.name}</span>
                          )}
                          {!row.hubspotMatched && row.missingIdentityReason ? (
                            <span style={{ fontSize: '10px', color: '#b45309' }}>{row.missingIdentityReason}</span>
                          ) : null}
                          {row.duplicateActions.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                              {row.duplicateActions.map((action) => {
                                const mergeKey = `${normalizeName(action.source)}->${normalizeName(action.target)}`;
                                const isBusy = mergingAliasKey === mergeKey;
                                return (
                                  <button
                                    key={mergeKey}
                                    onClick={() => handleMergeAlias(action.source, action.target)}
                                    disabled={!!mergingAliasKey}
                                    style={{
                                      border: '1px solid #cbd5e1',
                                      backgroundColor: '#f8fafc',
                                      color: '#1e293b',
                                      borderRadius: '999px',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      padding: '3px 8px',
                                      cursor: 'pointer',
                                      opacity: !!mergingAliasKey && !isBusy ? 0.55 : 1,
                                    }}
                                  >
                                    {isBusy ? 'Merging...' : action.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px', fontSize: '12px', textAlign: 'right', color: Number.isFinite(row.revenue) ? '#0f172a' : '#94a3b8', fontWeight: Number.isFinite(row.revenue) ? 700 : 500 }}>
                        {formatCurrencyMaybe(row.revenue)}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {row.sobrietyDate ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: 600 }}>
                              {formatDateMMDDYY(row.sobrietyDate)}{row.sobrietyDurationLabel ? ` (${row.sobrietyDurationLabel})` : ''}
                            </span>
                            {row.sobrietySoonLabel ? (
                              <span style={{ fontSize: '10px', color: '#b45309', fontWeight: 700 }}>{row.sobrietySoonLabel}</span>
                            ) : null}
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Not Found</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', fontSize: '13px', color: '#334155', textAlign: 'right', fontWeight: 700 }}>
                        {row.groupVisitsIncludingThisSession}
                      </td>
                      <td style={{ padding: '10px', fontSize: '13px', color: '#334155', textAlign: 'right', fontWeight: 700 }}>
                        {row.totalVisitsIncludingThisSession}
                      </td>
                      <td style={{ padding: '10px', fontSize: '12px', color: row.hubspotEmail !== 'Not Found' ? '#0f172a' : '#94a3b8' }}>
                        {row.hubspotEmail || 'Not Found'}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              width: 'fit-content',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              fontSize: '10px',
                              fontWeight: 700,
                              backgroundColor: row.hubspotMatched ? '#dcfce7' : '#fee2e2',
                              color: row.hubspotMatched ? '#166534' : '#991b1b',
                              textTransform: 'uppercase',
                            }}
                          >
                            {row.hubspotMatched ? 'Matched' : 'Missing'}
                          </span>
                          <span style={{ fontSize: '12px', color: '#334155', fontWeight: 600 }}>{row.hubspotName || 'Not Found'}</span>
                          {row.hubspotUrl ? (
                            <a
                              href={row.hubspotUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 700, textDecoration: 'underline' }}
                            >
                              Open in HubSpot
                            </a>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>No HubSpot link</span>
                          )}
                          {row.hubspotContactId ? (
                            <span style={{ fontSize: '10px', color: '#64748b' }}>ID: {row.hubspotContactId}</span>
                          ) : null}
                          <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>
                            {row.identityMappingSource === 'hubspot_call_activity' ? 'HubSpot Session' : (row.identityMappingSource || 'none')}
                          </span>
                          {row.identityMappingSource !== 'hubspot_call_activity' && (
                            <span style={{ fontSize: '10px', color: '#64748b' }}>
                              Confidence: {row.identityMappingConfidence || 'Low'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {selectedSessionDetail.attendeeRows.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '14px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                        No attendees found for this session.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <TrendingUp size={17} color="#2563eb" />
          <h3 style={{ fontSize: '18px' }}>Average Visits per Person (Trend)</h3>
          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>Unified timeline by actual meeting date</span>
        </div>
        <div style={{ height: '260px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.avgTimelineCombined}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" allowDuplicatedCategory={false} tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis domain={[1, 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip content={avgTimelineTooltip} />
              <Legend />
              <Line type="monotone" connectNulls dataKey="tuesdayAvg" name="Tuesday Avg Visits" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              <Line type="monotone" connectNulls dataKey="thursdayAvg" name="Thursday Avg Visits" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <MonthlyAverageCard
          title="Tuesday Monthly Avg Visits (MoM / YoY)"
          color="#0ea5e9"
          series={analytics.monthlyAvgTrendTue}
          summary={analytics.monthlyAvgSummaryTue}
        />
        <MonthlyAverageCard
          title="Thursday Monthly Avg Visits (MoM / YoY)"
          color="#6366f1"
          series={analytics.monthlyAvgTrendThu}
          summary={analytics.monthlyAvgSummaryThu}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Users size={17} color="#0ea5e9" />
            <h3 style={{ fontSize: '18px' }}>Tuesday Cohorts</h3>
          </div>
          <CohortBreakdown title="Tuesday" data={analytics.cohortDataTue} accentColor="#0ea5e9" />
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Users size={17} color="#6366f1" />
            <h3 style={{ fontSize: '18px' }}>Thursday Cohorts</h3>
          </div>
          <CohortBreakdown title="Thursday" data={analytics.cohortDataThu} accentColor="#6366f1" />
        </div>
      </div>
      {/* ─── Top Repeaters & At-Risk ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <UserRoundCheck size={17} color="#0f766e" />
            <h3 style={{ fontSize: '18px' }}>Top Repeat Attendees</h3>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
            Click a name to see all meetings they attended, then click a meeting to view the other attendees.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {analytics.topRepeaters.map((p) => (
              <div
                key={p.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: '10px',
                  alignItems: 'center',
                  backgroundColor: '#f8fafc',
                  borderRadius: '10px',
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button
                    onClick={() => handleTopRepeaterClick(p.name)}
                    style={{
                      textAlign: 'left',
                      border: 'none',
                      backgroundColor: 'transparent',
                      padding: 0,
                      margin: 0,
                      fontWeight: 700,
                      fontSize: '14px',
                      color: normalizeName(selectedRepeaterName) === normalizeName(p.name) ? '#0f766e' : '#0f172a',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                    }}
                  >
                    {p.name}
                  </button>
                  <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>
                    Tue: {p.tueVisits} · Thu: {p.thuVisits}
                  </span>
                </div>
                <span style={{ fontSize: '13px', color: '#0f766e', fontWeight: 700 }}>{p.visits} total</span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{formatPct(p.recentShowRate)}</span>
              </div>
            ))}
            {analytics.topRepeaters.length === 0 && <p style={{ color: 'var(--color-text-secondary)' }}>No attendee rows yet.</p>}
          </div>

          {selectedRepeaterDetail && (
            <div style={{ marginTop: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  Attendance History: {selectedRepeaterDetail.person.name}
                </p>
                <p style={{ fontSize: '12px', color: '#0f766e', fontWeight: 700 }}>
                  Total Show-Ups: {selectedRepeaterDetail.attendedSessions.length}
                </p>
              </div>
              <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  HubSpot Name: <strong style={{ color: '#0f172a' }}>{selectedRepeaterDetail.personIdentity?.hubspotName || 'Not Found'}</strong>
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  HubSpot Email: <strong style={{ color: '#0f172a' }}>{selectedRepeaterDetail.personIdentity?.hubspotEmail || 'Not Found'}</strong>
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Mapping: <strong style={{ color: '#0f172a' }}>{selectedRepeaterDetail.personIdentity?.identityMappingSource || 'none'}</strong>
                </span>
                {selectedRepeaterDetail.personIdentity?.hubspotUrl ? (
                  <a href={selectedRepeaterDetail.personIdentity.hubspotUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 700, textDecoration: 'underline' }}>
                    Open in HubSpot
                  </a>
                ) : null}
              </div>
              {selectedRepeaterDetail.personIdentity?.hubspotName
                && normalizeName(selectedRepeaterDetail.personIdentity.hubspotName) !== normalizeName(selectedRepeaterDetail.person.name) && (
                  <p style={{ marginTop: '6px', fontSize: '11px', color: '#b45309', fontWeight: 600 }}>
                    Dashboard attendee name differs from HubSpot contact name. Use the HubSpot name as source of truth for outreach.
                  </p>
                )}

              <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 1.5fr', gap: '10px' }}>
                <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedRepeaterDetail.attendedSessions.map((session) => {
                    const isSelected = session.sessionKey === selectedRepeaterDetail.selectedSessionKey;
                    return (
                      <button
                        key={session.sessionKey}
                        onClick={() => handleTopRepeaterSessionClick(session.sessionKey)}
                        style={{
                          border: `1px solid ${isSelected ? '#0f766e' : '#cbd5e1'}`,
                          backgroundColor: isSelected ? '#ecfeff' : 'white',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <p style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                          {session.type} {session.dateFormatted}
                        </p>
                        <p style={{ marginTop: '3px', fontSize: '11px', color: '#64748b' }}>
                          {session.derivedCount} attendees
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', backgroundColor: 'white' }}>
                  {selectedRepeaterDetail.selectedSession && (
                    <>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                        Other Attendees in {selectedRepeaterDetail.selectedSession.type} {selectedRepeaterDetail.selectedSession.dateFormatted}
                      </p>
                      <p style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                        {selectedRepeaterDetail.otherAttendees.length} attendee{selectedRepeaterDetail.otherAttendees.length === 1 ? '' : 's'} besides {selectedRepeaterDetail.person.name}
                      </p>
                      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                        {selectedRepeaterDetail.otherAttendees.map((attendee) => (
                          <span
                            key={`${selectedRepeaterDetail.selectedSession.sessionKey}-${attendee.name}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '999px',
                              border: '1px solid #e2e8f0',
                              backgroundColor: attendee.isNew ? '#dcfce7' : '#f8fafc',
                              color: attendee.isNew ? '#166534' : '#334155',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            {attendee.name}
                          </span>
                        ))}
                        {selectedRepeaterDetail.otherAttendees.length === 0 && (
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>No other attendees recorded for this meeting.</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ ...cardStyle, borderLeft: '5px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#b45309" />
                <h3 style={{ fontSize: '18px' }}>At-Risk Outreach Queue</h3>
              </div>
              <p style={{ fontSize: '12px', color: '#92400e', marginTop: '4px' }}>
                Rule A: attended once and missed the next session. Rule B: attended 2+ times and missed 2 in a row (within their primary Tuesday/Thursday group).
              </p>
              <p style={{ fontSize: '11px', color: '#b45309', marginTop: '4px' }}>
                Open the HubSpot contact and send a missed-session check-in template asking for feedback and whether it was scheduling or they are not planning to return.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ padding: '6px 10px', borderRadius: '999px', backgroundColor: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', fontSize: '11px', fontWeight: 700 }}>
                Rule A: {analytics.atRiskBreakdown?.oneAndDoneMissedNext || 0}
              </span>
              <span style={{ padding: '6px 10px', borderRadius: '999px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: '11px', fontWeight: 700 }}>
                Rule B: {analytics.atRiskBreakdown?.repeatMissedTwoInRow || 0}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto', marginTop: '10px' }}>
            {atRiskOutreachRows.map((p) => {
              const isRuleA = p.atRiskRule === 'one_and_done_missed_next';
              const ruleLabel = isRuleA ? 'Rule A - Missed next session' : 'Rule B - Missed 2+ in a row';
              const groupWord = p.primaryGroup === 'Tuesday' ? 'Tuesday' : 'Thursday';
              return (
                <div
                  key={p.name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '10px',
                    alignItems: 'start',
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fcd34d',
                    padding: '10px 12px',
                    borderRadius: '10px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#92400e' }}>{p.name}</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '10px',
                          fontWeight: 700,
                          backgroundColor: isRuleA ? '#ffedd5' : '#fef3c7',
                          color: isRuleA ? '#9a3412' : '#92400e',
                          textTransform: 'uppercase',
                        }}
                      >
                        {ruleLabel}
                      </span>
                      <span style={{ fontSize: '10px', color: '#78350f', fontWeight: 700, textTransform: 'uppercase' }}>
                        {groupWord}
                      </span>
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#92400e' }}>
                      Attended {p.groupVisits} {groupWord.toLowerCase()} time{p.groupVisits === 1 ? '' : 's'} ({p.visits} total)
                    </div>
                    <div style={{ marginTop: '2px', fontSize: '12px', color: '#92400e' }}>
                      Missed in a row: <strong>{p.missedInRow}</strong>
                      {p.lastAttendedGroupDateFormatted ? ` | Last ${groupWord} attendance: ${p.lastAttendedGroupDateFormatted}` : ''}
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#b45309' }}>
                      HubSpot Email: <strong style={{ color: '#92400e' }}>{p.hubspotEmail || 'Not Found'}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    {p.hubspotUrl ? (
                      <a
                        href={p.hubspotUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid #93c5fd',
                          backgroundColor: '#eff6ff',
                          color: '#1d4ed8',
                          fontSize: '11px',
                          fontWeight: 700,
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Open in HubSpot
                      </a>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#92400e' }}>No HubSpot link</span>
                    )}
                    <span style={{ fontSize: '10px', color: '#b45309', textTransform: 'uppercase' }}>
                      {p.hubspotMatched ? (p.identityMappingSource || 'matched') : 'unmatched'}
                    </span>
                  </div>
                </div>
              );
            })}
            {atRiskOutreachRows.length === 0 && (
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                No at-risk attendees detected by the current outreach rules.
              </span>
            )}
          </div>
        </div>
      </div>
      <div style={{ ...cardStyle, borderLeft: '5px solid #ef4444' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: '18px', color: '#991b1b' }}>Bad Names QA (HubSpot Contacts)</h3>
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#7f1d1d' }}>
              Flags suspicious HubSpot contact names attached to Tuesday/Thursday HubSpot call attendance (email text in name, device-like names, digits, or missing names).
            </p>
            <p style={{ marginTop: '4px', fontSize: '11px', color: '#991b1b' }}>
              Rename in HubSpot, refresh data, and matched Attendance rows should backfill to the updated HubSpot contact name.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ padding: '6px 10px', borderRadius: '999px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '11px', fontWeight: 700 }}>
              Suspicious HubSpot Contacts: {badNameQa.counts?.suspiciousContacts || 0}
            </span>
            <span style={{ padding: '6px 10px', borderRadius: '999px', backgroundColor: '#fff1f2', border: '1px solid #fda4af', color: '#9f1239', fontSize: '11px', fontWeight: 700 }}>
              Suspicious Unmatched Call Rows: {badNameQa.counts?.suspiciousUnmatchedAssocCount || 0}
            </span>
          </div>
        </div>

        <div style={{ marginTop: '10px', border: '1px solid #fee2e2', borderRadius: '12px', overflowX: 'auto', maxHeight: '360px' }}>
          <table style={{ width: '100%', minWidth: '1120px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#fef2f2', borderBottom: '1px solid #fee2e2' }}>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', color: '#7f1d1d', textTransform: 'uppercase' }}>Current HubSpot Name</th>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', color: '#7f1d1d', textTransform: 'uppercase' }}>Call Snapshot Name(s)</th>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', color: '#7f1d1d', textTransform: 'uppercase' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', color: '#7f1d1d', textTransform: 'uppercase' }}>Reason(s)</th>
                <th style={{ textAlign: 'right', padding: '10px', fontSize: '11px', color: '#7f1d1d', textTransform: 'uppercase' }}>Group Call Rows</th>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', color: '#7f1d1d', textTransform: 'uppercase' }}>Last Seen</th>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '11px', color: '#7f1d1d', textTransform: 'uppercase' }}>HubSpot</th>
              </tr>
            </thead>
            <tbody>
              {badNameQa.rows.slice(0, 100).map((row) => (
                <tr key={`bad-name-${row.hubspotContactId}`} style={{ borderBottom: '1px solid #fef2f2' }}>
                  <td style={{ padding: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#111827', fontWeight: 700 }}>{row.currentName || 'Not Found'}</span>
                      <span style={{ fontSize: '10px', color: '#6b7280' }}>ID: {row.hubspotContactId}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px', fontSize: '11px', color: '#374151' }}>
                    {row.snapshotNames.length > 0 ? row.snapshotNames.join(' | ') : 'None'}
                  </td>
                  <td style={{ padding: '10px', fontSize: '11px', color: '#111827' }}>{row.currentEmail || 'Not Found'}</td>
                  <td style={{ padding: '10px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {row.reasons.map((reason) => (
                        <span
                          key={`${row.hubspotContactId}-${reason}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            backgroundColor: '#fff1f2',
                            border: '1px solid #fecdd3',
                            color: '#9f1239',
                            fontSize: '10px',
                            fontWeight: 700,
                          }}
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#111827' }}>{row.associationRows}</td>
                  <td style={{ padding: '10px', fontSize: '11px', color: '#374151' }}>{row.lastSeenDateFormatted || 'Unknown'}</td>
                  <td style={{ padding: '10px' }}>
                    {row.hubspotUrl ? (
                      <a href={row.hubspotUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 700, textDecoration: 'underline' }}>
                        Open in HubSpot
                      </a>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>No link</span>
                    )}
                  </td>
                </tr>
              ))}
              {badNameQa.rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>
                    No suspicious HubSpot contact names detected in current Tuesday/Thursday HubSpot call attendance rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...cardStyle, borderLeft: '5px solid #8b5cf6', background: 'linear-gradient(180deg, #faf5ff 0%, #ffffff 75%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="#7c3aed" />
            <h3 style={{ fontSize: '18px', margin: 0, color: '#5b21b6' }}>AI Insight (Retention Focus)</h3>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {attendanceAiInsight.providerStatuses.map((provider) => (
              <span
                key={provider.key}
                style={{
                  padding: '6px 10px',
                  borderRadius: '999px',
                  border: `1px solid ${provider.configured ? '#86efac' : '#d8b4fe'}`,
                  backgroundColor: provider.configured ? '#f0fdf4' : '#faf5ff',
                  color: provider.configured ? '#166534' : '#6d28d9',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
                title={provider.note}
              >
                {provider.label}: {provider.configured ? 'Configured' : 'Placeholder'}
              </span>
            ))}
          </div>
        </div>

        <p style={{ marginTop: '10px', marginBottom: 0, fontSize: '13px', color: '#4c1d95', lineHeight: 1.5 }}>
          {attendanceAiInsight.headline}
        </p>

        <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
          <div style={{ border: '1px solid #e9d5ff', borderRadius: '12px', backgroundColor: 'white', padding: '12px' }}>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#7c3aed' }}>Session Summary</p>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {attendanceAiInsight.summaryBullets.map((bullet, idx) => (
                <p key={`ai-summary-${idx}`} style={{ margin: 0, fontSize: '13px', color: '#334155' }}>{bullet}</p>
              ))}
              {attendanceAiInsight.summaryBullets.length === 0 && (
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Click a session bar to generate session-specific retention insights.</p>
              )}
            </div>
          </div>

          <div style={{ border: '1px solid #ede9fe', borderRadius: '12px', backgroundColor: '#faf5ff', padding: '12px' }}>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#6d28d9' }}>Blind Spots</p>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {attendanceAiInsight.blindSpots.map((item, idx) => (
                <p key={`ai-blind-${idx}`} style={{ margin: 0, fontSize: '12px', color: '#5b21b6' }}>{item}</p>
              ))}
              {attendanceAiInsight.blindSpots.length === 0 && (
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>No major blind spots detected in the currently selected session.</p>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '12px', border: '1px solid #ddd6fe', borderRadius: '12px', backgroundColor: 'white', padding: '12px' }}>
          <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#6d28d9' }}>Opportunities To Raise Repeat Attendance</p>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {attendanceAiInsight.opportunities.map((item, idx) => (
              <p key={`ai-oppty-${idx}`} style={{ margin: 0, fontSize: '13px', color: '#334155' }}>{idx + 1}. {item}</p>
            ))}
            {attendanceAiInsight.opportunities.length === 0 && (
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Select a session to surface targeted retention opportunities.</p>
            )}
          </div>
        </div>

        <div style={{ marginTop: '12px', border: '1px solid #e5e7eb', borderRadius: '12px', backgroundColor: '#f8fafc', padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>Autonomous Workflow (Planned)</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Delivery modes can be file downloads or direct software syncs (Mailchimp/CRM/Notion) after provider + API actions are wired.
              </p>
            </div>
            <button
              type="button"
              disabled
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#e2e8f0', color: '#64748b', fontSize: '12px', fontWeight: 700, cursor: 'not-allowed' }}
              title="Hook this to Supabase AI orchestration + provider APIs"
            >
              Generate AI Insight + Tasks (Soon)
            </button>
          </div>
          <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
            {attendanceAiInsight.autonomousWorkflow.map((task) => (
              <div key={task.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: 'white', padding: '10px' }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{task.title}</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748b' }}>{task.delivery}</p>
                <button type="button" disabled style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '11px', fontWeight: 700, cursor: 'not-allowed' }}>
                  {task.actionLabel}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* ─── Action Plan ─── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Brain size={18} color="#1d4ed8" />
            <h3 style={{ fontSize: '20px' }}>Action Plan: Human + Autonomous</h3>
          </div>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '999px',
              backgroundColor: '#eff6ff',
              color: '#1e3a8a',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            {selectedCount}/{planItems.length} marked proceed
          </div>
        </div>

        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {[{ title: 'Autonomous', items: autonomousTasks, icon: Calendar }, { title: 'Human', items: humanTasks, icon: Users }].map(
            (group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.title} style={{ border: '1px solid var(--color-border)', borderRadius: '12px', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <GroupIcon size={16} color="#0f766e" />
                    <h4 style={{ fontSize: '16px' }}>{group.title}</h4>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {group.items.map((item) => {
                      const isHumanGroup = group.title === 'Human';
                      const workflow = humanTaskWorkflow[item.id] || {};
                      const addToDoChecked = !!workflow.addToDo;
                      const isSavingTodo = workflow.syncStatus === 'saving';
                      const isTodoSaved = workflow.syncStatus === 'saved';
                      const isSkipped = workflow.syncStatus === 'skipped' || !!workflow.skipped;
                      return (
                        <div
                          key={item.id}
                          style={{
                            border: '1px solid #e2e8f0',
                            backgroundColor: isSkipped ? '#f8fafc' : ' #f8fafc',
                            borderRadius: '10px',
                            padding: '10px',
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            alignItems: 'start',
                            gap: '10px',
                          }}
                        >
                          <div>
                            <p style={{ fontSize: '14px', fontWeight: 700 }}>{item.title}</p>
                            <p style={{ marginTop: '4px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>{item.detail}</p>

                            {isHumanGroup && (
                              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                                  <input
                                    type="checkbox"
                                    checked={addToDoChecked}
                                    disabled={isSavingTodo || isTodoSaved}
                                    onChange={(e) => {
                                      if (e.target.checked) handleAddHumanTaskToNotion(item);
                                      else {
                                        setHumanTaskWorkflow((prev) => ({
                                          ...prev,
                                          [item.id]: {
                                            ...(prev[item.id] || {}),
                                            addToDo: false,
                                            skipped: false,
                                            syncStatus: 'idle',
                                            error: '',
                                          },
                                        }));
                                      }
                                    }}
                                  />
                                  <span>{isSavingTodo ? 'Adding To Do...' : 'Add To Do'}</span>
                                </label>

                                <button
                                  type="button"
                                  onClick={() => handleSkipHumanTask(item)}
                                  disabled={isSavingTodo}
                                  style={{
                                    border: '1px solid #cbd5e1',
                                    backgroundColor: isSkipped ? '#e2e8f0' : 'white',
                                    color: '#334155',
                                    borderRadius: '8px',
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: isSavingTodo ? 'not-allowed' : 'pointer',
                                    opacity: isSavingTodo ? 0.65 : 1,
                                  }}
                                >
                                  {isSkipped ? 'Skipped' : 'Skip'}
                                </button>

                                {isTodoSaved && (
                                  <span style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>
                                    Synced to Notion ({workflow.notionTaskStatus || 'Saved'})
                                  </span>
                                )}
                                {workflow.error && (
                                  <span style={{ fontSize: '11px', color: '#991b1b', fontWeight: 700 }}>
                                    {workflow.error}
                                  </span>
                                )}
                                {workflow.notionUrl ? (
                                  <a href={workflow.notionUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 700, textDecoration: 'underline' }}>
                                    Open Notion Task
                                  </a>
                                ) : null}
                              </div>
                            )}
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={!!planState[item.id]}
                              onChange={(e) => setPlanState((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                            />
                            <span style={{ fontSize: '13px', fontWeight: 700 }}>Proceed</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceDashboard;






