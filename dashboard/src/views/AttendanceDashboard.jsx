import React, { useEffect, useMemo, useRef, useState } from 'react';
/* Data source priority: HubSpot call/meeting activities + associations only. */
import { supabase } from '../lib/supabaseClient';
import OutreachReviewQueue from '../components/OutreachReviewQueue';
import {
  ANTHROPIC_API_KEY,
  ATTENDANCE_BACKFILL_DAYS,
  ATTENDANCE_ENABLE_BAD_NAMES_QA,
  CLAUDE_API_KEY,
  GEMINI_API_KEY,
  HUBSPOT_PORTAL_ID,
  OPENAI_API_KEY,
} from '../lib/env';
import { resolveCanonicalAttendeeName } from '../lib/attendeeCanonicalization';
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
  ReferenceLine,
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
  Loader2,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';

const RECENT_WINDOW = 8;
const ET_TIMEZONE = 'America/New_York';
const GROUP_CALL_ET_MINUTES = {
  Tuesday: 12 * 60,
  Thursday: 11 * 60,
};
const GROUP_CALL_TIME_TOLERANCE_MINUTES = 120;
const MIN_GROUP_ATTENDEES = 3;
const EXPECTED_ZERO_GROUP_SESSION_KEYS = new Set(['Thursday|2025-12-25']);
const SCHEDULE_GAP_AUDIT_LOOKBACK_WEEKS = 8;
const GROUP_CALL_TIME_FALLBACK_TOLERANCE_MINUTES = 240;
const GROUP_CALL_MIN_ATTENDEE_SIGNAL = 5;
let expectedZeroWeekKeysByDayCache = null;

function normalizeName(name = '') {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
}

function canonicalizeAttendanceDisplayName(rawName = '', aliasMap = new Map()) {
  const aliased = resolveAliasTarget(rawName, aliasMap);
  const canonical = resolveCanonicalAttendeeName(aliased || rawName, aliasMap);
  return String(canonical || aliased || rawName || '').trim();
}

function buildAttendanceIdentityKey(rawName = '', attendeeObj = {}, aliasMap = new Map()) {
  const contactId = Number(attendeeObj?.hubspotContactId ?? attendeeObj?.hubspot_contact_id);
  if (Number.isFinite(contactId) && contactId > 0) return `hubspot:${contactId}`;

  const fallbackName = attendeeObj?.hubspotName && attendeeObj.hubspotName !== 'Not Found'
    ? attendeeObj.hubspotName
    : (attendeeObj?.name || rawName);
  const canonicalName = canonicalizeAttendanceDisplayName(fallbackName, aliasMap);
  const normalized = normalizeName(canonicalName);
  return normalized ? `name:${normalized}` : '';
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


const ATTENDANCE_HUBSPOT_CONTACT_REQUIRED_COLUMNS = [
  'hubspot_contact_id',
  'createdate',
  'firstname',
  'lastname',
  'email',
  'hs_additional_emails',
  'merged_into_hubspot_contact_id',
  'hs_merged_object_ids',
];

const ATTENDANCE_HUBSPOT_CONTACT_OPTIONAL_COLUMNS = [
  'hs_analytics_source',
  'annual_revenue_in_dollars',
  'annual_revenue_in_usd_official',
  'annual_revenue_in_dollars__official_',
  'annual_revenue',
  'sobriety_date',
  'sobriety_date__official_',
  'sober_date',
  'clean_date',
  'sobrietydate',
  'lastmodifieddate',
  'hs_lastmodifieddate',
  'updated_at',
  'hubspot_updated_at',
  'last_synced_at',
  'sync_source',
];

const ATTENDANCE_HUBSPOT_CONTACT_SILENT_FALLBACK_COLUMNS = new Set([
  // Legacy aliases absent in some environments.
  'annual_revenue_in_usd_official',
  'sobriety_date__official_',
  'annual_revenue',
  'sober_date',
  'clean_date',
  'sobrietydate',
  'lastmodifieddate',
  'hs_lastmodifieddate',
  'updated_at',
]);

function extractMissingRawHubspotContactsColumn(message = '') {
  const text = String(message || '');
  const patterns = [
    /column\s+(?:"?[a-zA-Z0-9_]+"?\.)?(?:"?raw_hubspot_contacts"?\.)?"?([a-zA-Z0-9_]+)"?\s+does not exist/i,
    /Could not find the\s+'([a-zA-Z0-9_]+)'\s+column\s+of\s+'raw_hubspot_contacts'/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function resolveAttendanceHubspotContactSelectColumns() {
  const requestedColumns = [
    ...ATTENDANCE_HUBSPOT_CONTACT_REQUIRED_COLUMNS,
    ...ATTENDANCE_HUBSPOT_CONTACT_OPTIONAL_COLUMNS,
  ];
  const schemaWarnings = [];
  let selectedColumns = [...requestedColumns];
  const attemptedMissingColumns = new Set();

  // Probe once with wildcard so we can drop unavailable projection columns
  // up front and avoid a long chain of 400 retries.
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
      if (!ATTENDANCE_HUBSPOT_CONTACT_SILENT_FALLBACK_COLUMNS.has(missingColumn)) {
        schemaWarnings.push(
          `Attendance HubSpot contacts query auto-recovered from missing optional column \`${missingColumn}\`.`,
        );
      }
    });
  }

  while (selectedColumns.length > 0) {
    const probe = await supabase
      .from('raw_hubspot_contacts')
      .select(selectedColumns.join(','))
      .limit(1);

    if (!probe.error) return { columns: selectedColumns, schemaWarnings };

    const missingColumn = extractMissingRawHubspotContactsColumn(probe.error?.message || probe.error?.details || '');
    if (!missingColumn || !selectedColumns.includes(missingColumn) || attemptedMissingColumns.has(missingColumn)) break;
    attemptedMissingColumns.add(missingColumn);
    selectedColumns = selectedColumns.filter((columnName) => columnName !== missingColumn);
    if (!ATTENDANCE_HUBSPOT_CONTACT_SILENT_FALLBACK_COLUMNS.has(missingColumn)) {
      schemaWarnings.push(
        `Attendance HubSpot contacts query auto-recovered from missing optional column \`${missingColumn}\`.`,
      );
    }
  }

  const wildcardProbe = await supabase
    .from('raw_hubspot_contacts')
    .select('*')
    .limit(1);
  if (!wildcardProbe.error) {
    schemaWarnings.push(
      'Attendance HubSpot contacts query fell back to `select(*)` because preferred projection failed. Run schema alignment to restore lean projection safely.',
    );
    return { columns: ['*'], schemaWarnings };
  }

  return { columns: [...ATTENDANCE_HUBSPOT_CONTACT_REQUIRED_COLUMNS], schemaWarnings };
}
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

async function selectAllRows(buildQuery, options = {}) {
  const pageSize = Math.max(100, Number(options.pageSize) || 1000);
  const maxPages = Math.max(1, Number(options.maxPages) || 200);
  const rows = [];

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const result = await buildQuery(from, to);
    if (result?.error) {
      return { data: rows, error: result.error };
    }

    const pageRows = Array.isArray(result?.data) ? result.data : [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) {
      return { data: rows, error: null };
    }
  }

  return {
    data: rows,
    error: new Error(`Pagination maxPages (${maxPages}) reached before dataset completed.`),
  };
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

const etWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ET_TIMEZONE,
  weekday: 'short',
});

const etTimePartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ET_TIMEZONE,
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
});

const etDatePartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ET_TIMEZONE,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const ET_WEEKDAY_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function etScheduleInfo(dateLike) {
  const d = safeDate(dateLike);
  if (!d) return null;

  const weekdayShort = etWeekdayFormatter.format(d);
  const dayType = weekdayShort === 'Tue' ? 'Tuesday' : (weekdayShort === 'Thu' ? 'Thursday' : null);
  if (!dayType) return null;

  const parts = etTimePartsFormatter.formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || NaN);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || NaN);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const minuteOfDay = hour * 60 + minute;
  const expectedMinute = GROUP_CALL_ET_MINUTES[dayType];
  const minutesFromExpected = Math.abs(minuteOfDay - expectedMinute);
  return {
    dayType,
    minuteOfDay,
    minutesFromExpected,
    inPrimaryWindow: minutesFromExpected <= GROUP_CALL_TIME_TOLERANCE_MINUTES,
    inFallbackWindow: minutesFromExpected <= GROUP_CALL_TIME_FALLBACK_TOLERANCE_MINUTES,
  };
}

function etWeekStartKey(dateLike) {
  const d = safeDate(dateLike);
  if (!d) return '';

  const parts = etDatePartsFormatter.formatToParts(d);
  const year = Number(parts.find((p) => p.type === 'year')?.value || NaN);
  const month = Number(parts.find((p) => p.type === 'month')?.value || NaN);
  const day = Number(parts.find((p) => p.type === 'day')?.value || NaN);
  const weekdayShort = parts.find((p) => p.type === 'weekday')?.value || '';

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return '';
  const weekdayIndex = ET_WEEKDAY_TO_INDEX[weekdayShort];
  if (weekdayIndex === undefined) return '';

  const backToMonday = (weekdayIndex + 6) % 7;
  const mondayUtc = new Date(Date.UTC(year, month - 1, day) - (backToMonday * 86400000));
  return mondayUtc.toISOString().slice(0, 10);
}

function getExpectedZeroWeekKeysByDay() {
  if (expectedZeroWeekKeysByDayCache) return expectedZeroWeekKeysByDayCache;
  const byDay = {
    Tuesday: new Set(),
    Thursday: new Set(),
  };
  EXPECTED_ZERO_GROUP_SESSION_KEYS.forEach((key) => {
    const [type, dateLabel] = String(key || '').split('|');
    if (!type || !dateLabel || !byDay[type]) return;
    const d = safeDate(`${dateLabel}T00:00:00.000Z`);
    const weekKey = d ? etWeekStartKey(d) : '';
    if (weekKey) byDay[type].add(weekKey);
  });
  expectedZeroWeekKeysByDayCache = byDay;
  return byDay;
}

function inferGroupTypeFromTitle(titleRaw = '', scheduledDayType = null) {
  const title = String(titleRaw || '').toLowerCase();
  const likelyOneToOne = (
    title.includes('intro meeting')
    || title.includes('meeting with')
    || title.includes('sober founder interview')
    || title === 'lunch'
    || title.startsWith('canceled:')
    || title.startsWith('not canceled:')
  );

  if (title.includes('tactic tuesday')) {
    return { type: 'Tuesday', strongSignal: true, likelyOneToOne: false };
  }
  if (
    title.includes('all are welcome')
    || title.includes("entrepreneur's big book")
    || title.includes('big book')
  ) {
    return { type: 'Thursday', strongSignal: true, likelyOneToOne: false };
  }
  if (title.includes('mastermind') && !title.includes('intro')) {
    return { type: scheduledDayType || 'Thursday', strongSignal: true, likelyOneToOne: false };
  }

  return { type: null, strongSignal: false, likelyOneToOne };
}

function sessionCandidateStrength(session = {}) {
  const sourceCount = Number(session?.sourceCount || 0);
  const derivedCount = Number(session?.derivedCount || 0);
  const minutesFromExpected = Number.isFinite(Number(session?.minutesFromExpected))
    ? Number(session.minutesFromExpected)
    : 999;

  return (
    (session?.isCallActivity ? 500000 : 0)
    + (session?.hasAttendanceSignal ? 200000 : 0)
    + (session?.inPrimaryWindow ? 120000 : 0)
    + (session?.inFallbackWindow ? 40000 : 0)
    + (session?.strongTitleSignal ? 30000 : 0)
    + (sourceCount * 5000)
    + (derivedCount * 500)
    - (minutesFromExpected * 10)
  );
}

function pickStrongerSessionCandidate(existing, candidate) {
  if (!existing) return candidate || null;
  if (!candidate) return existing;

  const existingScore = sessionCandidateStrength(existing);
  const candidateScore = sessionCandidateStrength(candidate);
  if (candidateScore !== existingScore) return candidateScore > existingScore ? candidate : existing;

  const existingTs = existing?.date?.getTime?.() || 0;
  const candidateTs = candidate?.date?.getTime?.() || 0;
  if (candidateTs !== existingTs) return candidateTs > existingTs ? candidate : existing;
  return existing;
}

function listMissingWeekKeys(
  sessions = [],
  dayType = 'Tuesday',
  { anchorWeekKey = '', lookbackWeeks = SCHEDULE_GAP_AUDIT_LOOKBACK_WEEKS } = {},
) {
  const weekKeys = (sessions || [])
    .filter((s) => s?.type === dayType && s?.weekKey)
    .map((s) => s.weekKey)
    .sort();
  if (!weekKeys.length) return [];

  const uniqueWeekKeys = Array.from(new Set(weekKeys));
  const firstTrackedWeekKey = uniqueWeekKeys[0];
  const anchorKey = anchorWeekKey || uniqueWeekKeys[uniqueWeekKeys.length - 1];
  const anchorDate = safeDate(`${anchorKey}T00:00:00.000Z`);
  if (!anchorDate) return [];

  const expectedWeeks = [];
  for (let i = 0; i < lookbackWeeks; i += 1) {
    const key = new Date(anchorDate.getTime() - (i * 7 * 86400000)).toISOString().slice(0, 10);
    if (key >= firstTrackedWeekKey) expectedWeeks.push(key);
  }

  const existing = new Set(uniqueWeekKeys);
  const knownExpectedZeroWeeks = getExpectedZeroWeekKeysByDay()[dayType] || new Set();
  return expectedWeeks
    .filter((key) => !existing.has(key) && !knownExpectedZeroWeeks.has(key))
    .sort();
}

function scheduledDateKeyFromWeekKey(weekKey, dayType = 'Tuesday') {
  const weekStart = safeDate(`${weekKey}T00:00:00.000Z`);
  if (!weekStart) return '';
  const dayOffset = dayType === 'Thursday' ? 3 : 1;
  const sessionDate = new Date(weekStart.getTime() + (dayOffset * 86400000));
  return sessionDate.toISOString().slice(0, 10);
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
  a.download = `hubspot_attendance_export_${formatDateMMDDYY(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function isMissingTableError(error) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '').toUpperCase();
  return code === 'PGRST205' || msg.includes('could not find the table');
}

function buildPlan(analytics) {
  if (!analytics) return [];
  const { atRiskCount, repeatRateTue, repeatRateThu, lowRecentShowRatePeople } = analytics;

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

  const ROLLING_WINDOW_MS = 90 * 86400000;
  let sessionIdx = 0;
  const series = [];

  while (cursor.getTime() <= endMonth.getTime()) {
    while (sessionIdx < groupSessions.length && groupSessions[sessionIdx].date.getTime() < cursor.getTime()) {
      sessionIdx += 1;
    }

    // Rolling 90-day window: only count sessions in [cursor - 90d, cursor)
    const cutoffMs = cursor.getTime() - ROLLING_WINDOW_MS;
    let windowVisits = 0;
    const windowPeople = new Set();
    for (let i = 0; i < sessionIdx; i++) {
      if (groupSessions[i].date.getTime() >= cutoffMs) {
        windowVisits += Number(groupSessions[i].derivedCount || 0);
        (groupSessions[i].attendees || []).forEach((name) => {
          const key = normalizeName(name);
          if (key) windowPeople.add(key);
        });
      }
    }

    const uniqueCount = windowPeople.size;
    const avgVisits = uniqueCount > 0 ? windowVisits / uniqueCount : 0;

    series.push({
      monthKey: monthKeyUTC(cursor),
      monthLabel: formatMonthLabelUTC(cursor),
      avgVisits: Number(avgVisits.toFixed(2)),
      totalVisits: windowVisits,
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
 * Build attendance sessions from HubSpot call/meeting activity logs + contact associations.
 */
function computeAnalytics(
  aliases,
  hubspotActivities = [],
  hubspotContactAssocs = [],
  hubspotContactMap = new Map(),
) {
  const aliasMap = new Map(
    (aliases || []).map((a) => [normalizeName(a.original_name), a.target_name?.trim() || a.original_name]),
  );
  const activityAssocKey = (activityId, activityType) => `${String(activityType || '').toLowerCase()}:${String(activityId || '')}`;

  // ── Helpers to classify session type from HubSpot activity title or day/size heuristic ──
  function getSessionCandidateSignals(activity, attendeeCount) {
    const start = safeDate(activity.hs_timestamp || activity.created_at_hubspot);
    if (!start) return null;

    const activityType = String(activity?.activity_type || '').toLowerCase();
    const schedule = etScheduleInfo(start);
    const titleSignal = inferGroupTypeFromTitle(activity?.title || '', schedule?.dayType || null);
    const type = titleSignal.type || schedule?.dayType || null;
    if (!type) return null;

    const scheduleAligned = !!schedule && schedule.dayType === type;
    const inPrimaryWindow = !!(scheduleAligned && schedule.inPrimaryWindow);
    const inFallbackWindow = !!(scheduleAligned && schedule.inFallbackWindow);
    const hasAttendanceSignal = attendeeCount >= GROUP_CALL_MIN_ATTENDEE_SIGNAL;
    const isCallActivity = activityType === 'call';

    if (titleSignal.likelyOneToOne && !titleSignal.strongSignal && !hasAttendanceSignal && !isCallActivity) {
      return null;
    }

    const includeCandidate = (
      titleSignal.strongSignal
      || hasAttendanceSignal
      || inPrimaryWindow
      || (isCallActivity && inFallbackWindow)
    );
    if (!includeCandidate) return null;

    const weekKey = etWeekStartKey(start);
    if (!weekKey) return null;

    return {
      type,
      weekKey,
      inPrimaryWindow,
      inFallbackWindow,
      hasAttendanceSignal,
      strongTitleSignal: titleSignal.strongSignal,
      likelyOneToOneTitle: titleSignal.likelyOneToOne,
      minutesFromExpected: scheduleAligned ? schedule.minutesFromExpected : null,
      isCallActivity,
    };
  }

  // ── Build merged-contact redirect map so old (merged-away) contact IDs resolve
  //    to the surviving canonical contact, preventing duplicates from HubSpot merges. ──
  const mergedContactRedirect = new Map();
  // Strategy 1: victim-side — merged_into_hubspot_contact_id points victim → survivor.
  hubspotContactMap.forEach((row, id) => {
    const mergedInto = Number(row?.merged_into_hubspot_contact_id);
    if (Number.isFinite(mergedInto) && mergedInto > 0 && mergedInto !== id) {
      mergedContactRedirect.set(id, mergedInto);
    }
  });
  // Strategy 2: survivor-side — hs_merged_object_ids on the survivor lists victim IDs.
  // This covers the common case where the sync hasn't yet propagated
  // merged_into_hubspot_contact_id onto the victim row.
  hubspotContactMap.forEach((row, survivorId) => {
    const raw = String(row?.hs_merged_object_ids || '');
    if (!raw) return;
    raw.split(';').forEach((tok) => {
      const victimId = Number(tok.trim());
      if (Number.isFinite(victimId) && victimId > 0 && victimId !== survivorId) {
        // Only set if not already redirected (victim-side is more authoritative).
        if (!mergedContactRedirect.has(victimId)) {
          mergedContactRedirect.set(victimId, survivorId);
        }
      }
    });
  });
  // Resolve redirect chains up to 5 levels deep (A→B→C becomes A→C).
  const resolveCanonicalContactId = (rawId) => {
    let id = rawId;
    for (let depth = 0; depth < 5; depth++) {
      const next = mergedContactRedirect.get(id);
      if (!next || next === id) break;
      id = next;
    }
    return id;
  };

  // ── 1. Build sessions from HubSpot call/meeting activities (authoritative source) ──
  const assocsByActivity = new Map();
  (hubspotContactAssocs || []).forEach(assoc => {
    const aid = String(assoc.hubspot_activity_id || '');
    const aType = String(assoc?.activity_type || '').toLowerCase();
    const key = activityAssocKey(aid, aType);
    if (!aid) return;
    if (!assocsByActivity.has(key)) assocsByActivity.set(key, []);
    assocsByActivity.get(key).push(assoc);
  });

  let sessions = [];

  (hubspotActivities || []).forEach(activity => {
    const activityId = String(activity.hubspot_activity_id || '');
    const activityType = String(activity?.activity_type || '').toLowerCase();
    const assocs = assocsByActivity.get(activityAssocKey(activityId, activityType)) || [];

    const start = safeDate(activity.hs_timestamp || activity.created_at_hubspot);
    if (!start) return;
    const candidateSignals = getSessionCandidateSignals(activity, assocs.length);
    if (!candidateSignals) return;
    const type = candidateSignals.type;

    const dateLabel = start.toISOString().slice(0, 10);
    const dateFormatted = formatDateMMDDYY(start);

    // Build attendees from contact associations
    const seenIds = new Set();
    const seenEmails = new Set();
    const matchedEntries = assocs
      .filter(a => {
        const rawContactId = Number(a.hubspot_contact_id);

        // HubSpot-only attendance rule:
        // only keep attendees with an explicit HubSpot contact id from call associations.
        if (!rawContactId) return false;

        // Resolve merged contacts: if this contact was merged into another,
        // use the surviving canonical ID for dedup so the same person isn't counted twice.
        const contactId = resolveCanonicalContactId(rawContactId);

        // Anti-Duplicate for matched contacts (using canonical post-merge ID)
        if (seenIds.has(contactId)) return false;
        seenIds.add(contactId);

        // Safety-net: dedup by email even if contact IDs differ and merge data is
        // missing — covers edge cases where the sync hasn't propagated merge markers yet.
        const email = normalizeEmail(a.contact_email);
        if (email && seenEmails.has(email)) return false;
        if (email) seenEmails.add(email);

        // Stash the resolved canonical ID back onto the association object so downstream
        // mapping uses the surviving contact's enrichment data.
        a._resolvedContactId = contactId;

        return true;
      })
      .map(a => {
        const contactId = a._resolvedContactId || Number(a.hubspot_contact_id);
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
      weekKey: candidateSignals.weekKey,
      inPrimaryWindow: candidateSignals.inPrimaryWindow,
      inFallbackWindow: candidateSignals.inFallbackWindow,
      hasAttendanceSignal: candidateSignals.hasAttendanceSignal,
      strongTitleSignal: candidateSignals.strongTitleSignal,
      likelyOneToOneTitle: candidateSignals.likelyOneToOneTitle,
      minutesFromExpected: candidateSignals.minutesFromExpected,
      isCallActivity: candidateSignals.isCallActivity,
    });
  });

  sessions = sessions.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

  const hubspotSessionsByGroupWeek = new Map();
  sessions.forEach((session) => {
    const key = `${session.type}|${session.weekKey || session.dateLabel}`;
    const existing = hubspotSessionsByGroupWeek.get(key);
    hubspotSessionsByGroupWeek.set(key, pickStrongerSessionCandidate(existing, session));
  });
  const canonicalHubspotSessions = Array.from(hubspotSessionsByGroupWeek.values())
    .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

  const sessionsByGroupWeek = new Map();
  canonicalHubspotSessions.forEach((session) => {
    const key = `${session.type}|${session.weekKey || session.dateLabel}`;
    const existing = sessionsByGroupWeek.get(key);
    sessionsByGroupWeek.set(key, pickStrongerSessionCandidate(existing, session));
  });

  // Known holiday exception: Thursday 2025-12-25 had no group attendance.
  const holidayWeekKey = '2025-12-22';
  const holidayKey = `Thursday|${holidayWeekKey}`;
  if (!sessionsByGroupWeek.has(holidayKey)) {
    const holidayDate = safeDate('2025-12-25T16:00:00.000Z');
    if (holidayDate) {
      sessionsByGroupWeek.set(holidayKey, {
        id: 'holiday-thursday-2025-12-25',
        type: 'Thursday',
        date: holidayDate,
        dateLabel: holidayDate.toISOString().slice(0, 10),
        dateFormatted: formatDateMMDDYY(holidayDate),
        meetingId: '',
        startTimeIso: holidayDate.toISOString(),
        title: 'Christmas Holiday (No Group Session)',
        attendees: [],
        attendeeObjects: [],
        derivedCount: 0,
        sourceCount: 0,
        mismatch: false,
        dataSource: 'holiday_exception',
        weekKey: holidayWeekKey,
        inPrimaryWindow: true,
        inFallbackWindow: true,
        hasAttendanceSignal: false,
        strongTitleSignal: false,
        likelyOneToOneTitle: false,
        minutesFromExpected: 0,
        isCallActivity: false,
      });
    }
  }

  sessions = Array.from(sessionsByGroupWeek.values())
    .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

  sessions = sessions.filter((session) => Number(session?.derivedCount || 0) >= MIN_GROUP_ATTENDEES);
  EXPECTED_ZERO_GROUP_SESSION_KEYS.forEach((key) => {
    const [type, dateLabel] = key.split('|');
    const d = safeDate(`${dateLabel}T00:00:00.000Z`);
    if (!d) return;
    sessions.push({
      id: key,
      type,
      date: d,
      dateLabel,
      dateFormatted: formatDateMMDDYY(d),
      meetingId: key,
      startTimeIso: `${dateLabel}T00:00:00.000Z`,
      title: 'Holiday (no session)',
      attendees: [],
      attendeeObjects: [],
      derivedCount: 0,
      sourceCount: 0,
      mismatch: false,
      dataSource: 'holiday_expected_zero',
      mergedActivityIds: [],
      newNames: [],
      newCount: 0,
      repeatCount: 0,
    });
  });
  sessions = sessions.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

  // Normalize attendee identity keys across all source types so first-time/repeat
  // logic stays consistent between historical snapshots and HubSpot call rows.
  sessions = sessions.map((session) => {
    const seedObjects = (Array.isArray(session?.attendeeObjects) && session.attendeeObjects.length > 0)
      ? session.attendeeObjects
      : (Array.isArray(session?.attendees) ? session.attendees.map((name) => ({ name })) : []);
    const mergedByIdentity = new Map();

    seedObjects.forEach((rawObj, idx) => {
      const rawName = String(rawObj?.name || session?.attendees?.[idx] || '').trim();
      if (!rawName) return;
      const canonicalName = canonicalizeAttendanceDisplayName(rawName, aliasMap);
      const preferredName = (
        rawObj?.hubspotName
        && rawObj.hubspotName !== 'Not Found'
      )
        ? String(rawObj.hubspotName).trim()
        : canonicalName;

      // Resolve merged contact ID before building identity key so that
      // merged-away contacts always map to the surviving canonical ID.
      const rawContactId = Number(rawObj?.hubspotContactId);
      const resolvedContactId = (Number.isFinite(rawContactId) && rawContactId > 0)
        ? resolveCanonicalContactId(rawContactId)
        : null;
      const mergeResolved = resolvedContactId
        ? { ...rawObj, hubspotContactId: resolvedContactId }
        : rawObj;

      const identityKey = buildAttendanceIdentityKey(preferredName, mergeResolved || {}, aliasMap);
      if (!identityKey) return;

      const normalized = {
        ...mergeResolved,
        name: preferredName,
        hubspotContactId: resolvedContactId || null,
        hubspotMatched: !!rawObj?.hubspotMatched || Number.isFinite(resolvedContactId),
        identityKey,
      };

      const existing = mergedByIdentity.get(identityKey);
      if (!existing) {
        mergedByIdentity.set(identityKey, normalized);
        return;
      }
      const existingHasHubspot = Number.isFinite(Number(existing?.hubspotContactId));
      const candidateHasHubspot = Number.isFinite(Number(normalized?.hubspotContactId));
      if (candidateHasHubspot && !existingHasHubspot) {
        mergedByIdentity.set(identityKey, { ...existing, ...normalized });
        return;
      }
      const existingQuality = Number(existing?.hubspotMatched) + Number(Boolean(existing?.hubspotEmail && existing.hubspotEmail !== 'Not Found'));
      const candidateQuality = Number(normalized?.hubspotMatched) + Number(Boolean(normalized?.hubspotEmail && normalized.hubspotEmail !== 'Not Found'));
      if (candidateQuality > existingQuality || String(normalized?.name || '').length > String(existing?.name || '').length) {
        mergedByIdentity.set(identityKey, { ...existing, ...normalized });
      }
    });

    const attendeeObjects = Array.from(mergedByIdentity.values());
    return {
      ...session,
      attendeeObjects,
      attendees: attendeeObjects.map((row) => row.name),
    };
  });

  // Attendance charts and KPIs should only reflect sessions that already occurred.
  const nowTs = Date.now();
  sessions = sessions.filter((s) => (s?.date?.getTime?.() || 0) <= nowTs);

  // 2. Identify New vs Repeat — SEPARATELY per day
  const seenTuesday = new Set();
  const seenThursday = new Set();
  const ROLLING_WINDOW_MS = 90 * 86400000;
  const groupStats = {
    Tuesday: { sessionHistory: [], trend: [] },
    Thursday: { sessionHistory: [], trend: [] }
  };

  sessions = sessions.map(session => {
    const seenPeople = session.type === 'Tuesday' ? seenTuesday : seenThursday;
    const newNames = [];
    const newIdentityKeys = [];
    const attendeeEntries = (Array.isArray(session?.attendeeObjects) && session.attendeeObjects.length > 0)
      ? session.attendeeObjects
      : (Array.isArray(session?.attendees) ? session.attendees.map((name) => ({ name })) : []);
    attendeeEntries.forEach((attendee) => {
      const displayName = String(attendee?.name || '').trim();
      if (!displayName) return;
      const identityKey = attendee?.identityKey || buildAttendanceIdentityKey(displayName, attendee, aliasMap);
      if (!identityKey) return;
      if (!seenPeople.has(identityKey)) {
        seenPeople.add(identityKey);
        newNames.push(displayName);
        newIdentityKeys.push(identityKey);
      }
    });

    const newCount = newNames.length;
    const repeatCount = Math.max(Number(session.derivedCount || 0) - newCount, 0);

    // Update Group Running Stats (rolling 90-day window)
    const gs = groupStats[session.type];
    if (gs) {
      const attendeeKeys = [];
      attendeeEntries.forEach((attendee) => {
        const displayName = String(attendee?.name || '').trim();
        if (!displayName) return;
        const identityKey = attendee?.identityKey || buildAttendanceIdentityKey(displayName, attendee, aliasMap);
        if (!identityKey) return;
        attendeeKeys.push(identityKey);
      });
      gs.sessionHistory.push({
        dateMs: session.date.getTime(),
        derivedCount: session.derivedCount,
        attendeeKeys,
      });

      // Compute rolling 90-day window average
      const cutoffMs = session.date.getTime() - ROLLING_WINDOW_MS;
      let windowVisits = 0;
      const windowUnique = new Set();
      for (const hist of gs.sessionHistory) {
        if (hist.dateMs >= cutoffMs) {
          windowVisits += hist.derivedCount;
          hist.attendeeKeys.forEach((k) => windowUnique.add(k));
        }
      }

      const uniqueCount = windowUnique.size;
      const avg = uniqueCount > 0 ? windowVisits / uniqueCount : 0;

      gs.trend.push({
        date: session.dateFormatted,
        fullDate: session.dateLabel,
        avgVisits: Number(avg.toFixed(2)),
      });
    }

    return {
      ...session,
      newNames,
      newIdentityKeys,
      newCount,
      repeatCount
    };
  });

  // 3. Build People Stats (for Cohorts & KPI Cards)
  const people = new Map();

  sessions.forEach((session, idx) => {
    const attendeeEntries = (Array.isArray(session?.attendeeObjects) && session.attendeeObjects.length > 0)
      ? session.attendeeObjects
      : (Array.isArray(session?.attendees) ? session.attendees.map((name) => ({ name })) : []);

    attendeeEntries.forEach((attendeeObj) => {
      const rawName = String(attendeeObj?.name || '').trim();
      if (!rawName) return;
      const identityKey = attendeeObj?.identityKey || buildAttendanceIdentityKey(rawName, attendeeObj, aliasMap);
      if (!identityKey) return;
      const name = canonicalizeAttendanceDisplayName(rawName, aliasMap);

      if (!people.has(identityKey)) {
        people.set(identityKey, {
          name,
          identityKey,
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

      const p = people.get(identityKey);
      p.visits += 1;
      if (session.type === 'Tuesday') p.tueVisits += 1;
      if (session.type === 'Thursday') p.thuVisits += 1;
      p.sessionIndexes.push(idx);
      p.lastSeen = session.dateLabel;

      // Prefer richer display names when we learn them later.
      if (
        hasLikelyFirstLastName(name)
        && (!hasLikelyFirstLastName(p.name) || String(name).length > String(p.name || '').length)
      ) {
        p.name = name;
      }

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
  const sessionsMissingMarkedAttendees = sessions
    .filter((s) => Number(s?.sourceCount || 0) === 0)
    .map((s) => ({
      id: s.id,
      type: s.type,
      dateLabel: s.dateLabel,
      dateFormatted: s.dateFormatted,
      title: s.title,
    }));
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
  const allObservedWeekKeys = sessions
    .map((s) => s?.weekKey || etWeekStartKey(s?.date || s?.dateLabel))
    .filter(Boolean)
    .sort();
  const latestObservedWeekKey = allObservedWeekKeys.length
    ? allObservedWeekKeys[allObservedWeekKeys.length - 1]
    : '';
  const missingTuesdayWeeks = listMissingWeekKeys(sessions, 'Tuesday', {
    anchorWeekKey: latestObservedWeekKey,
  });
  const missingThursdayWeeks = listMissingWeekKeys(sessions, 'Thursday', {
    anchorWeekKey: latestObservedWeekKey,
  });

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
      sessionsMissingMarkedAttendees: sessionsMissingMarkedAttendees.length,
      missingTuesdayWeeks: missingTuesdayWeeks.length,
      missingThursdayWeeks: missingThursdayWeeks.length,
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
    sessionsMissingMarkedAttendees,
    scheduleCoverage: {
      lookbackWeeks: SCHEDULE_GAP_AUDIT_LOOKBACK_WEEKS,
      anchorWeekKey: latestObservedWeekKey,
      missingTuesdayWeeks,
      missingThursdayWeeks,
    },
    duplicateCandidatesByName,
  };
}

function buildAttendanceHubspotResolver({ rawHubspot = [] }) {
  const hubspotByExactName = new Map();
  const hubspotByFirstLastInitial = new Map();

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
    const full = fullNameFromHubspot(row);
    const nameKey = normalizeName(full);
    if (nameKey) addIndexRow(hubspotByExactName, nameKey, row);

    const initKey = buildInitialKey(full);
    if (initKey) addIndexRow(hubspotByFirstLastInitial, initKey, row);
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

  const resolveAttendee = (attendeeName) => {
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

    const exactMatch = pickBestHubspot(hubspotByExactName.get(nameKey) || []);
    if (exactMatch) {
      return resolveFromHubspotRow(exactMatch, 'hubspot_exact_name', 'Exact normalized full-name match in raw HubSpot cache');
    }

    const initKey = buildInitialKey(attendeeName);
    const initialCandidates = hubspotByFirstLastInitial.get(initKey) || [];
    if (initKey && initialCandidates.length === 1) {
      return resolveFromHubspotRow(initialCandidates[0], 'hubspot_first_last_initial', 'Unique first name + last initial match in raw HubSpot cache');
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
        ? 'Ambiguous HubSpot candidates by first name + last initial; needs contact cleanup in HubSpot.'
        : 'No HubSpot contact match by name in raw_hubspot_contacts cache',
    };
  };

  return {
    resolveAttendee,
    stats: {
      hubspotContactsCached: rawHubspot.length,
    },
  };
}

const cardStyle = {
  backgroundColor: 'var(--color-card)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
};
const MOBILE_BREAKPOINT = 900;

const AttendanceDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false),
  );
  const [aliasWarning, setAliasWarning] = useState('');
  const [aliases, setAliases] = useState([]);
  const [rawHubspotContacts, setRawHubspotContacts] = useState([]);
  const [donationRows, setDonationRows] = useState([]);
  const [donationAttendeeOverrides, setDonationAttendeeOverrides] = useState([]);
  // Attendance source inputs: HubSpot activity rows + HubSpot contact associations.
  const [hubspotActivities, setHubspotActivities] = useState([]);
  const [hubspotContactAssocs, setHubspotContactAssocs] = useState([]);
  const [identityWarning, setIdentityWarning] = useState('');
  const [contactEnrichmentStatus, setContactEnrichmentStatus] = useState('idle');
  // Guards against stale contact enrichment results when loadAll is re-triggered.
  const contactEnrichmentInvocationRef = useRef(0);
  const [planState, setPlanState] = useState({});
  const [selectedSessionKey, setSelectedSessionKey] = useState('');
  const [selectedRepeaterName, setSelectedRepeaterName] = useState('');
  const [selectedRepeaterSessionKey, setSelectedRepeaterSessionKey] = useState('');
  const [detailMessage, setDetailMessage] = useState('');
  const [mergingAliasKey, setMergingAliasKey] = useState('');
  const [humanTaskWorkflow, setHumanTaskWorkflow] = useState({});
  const [syncNowState, setSyncNowState] = useState({
    status: 'idle',
    message: '',
    lastRunAtIso: '',
  });
  const [outreachHealth, setOutreachHealth] = useState({ status: 'loading', message: '' });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (event) => setIsMobile(event.matches);
    setIsMobile(media.matches);
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

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

  const attendanceHubspotResolver = useMemo(
    () => buildAttendanceHubspotResolver({
      rawHubspot: rawHubspotContacts,
    }),
    [rawHubspotContacts],
  );
  const analytics = useMemo(
    () => computeAnalytics(
      aliases,
      hubspotActivities,
      hubspotContactAssocs,
      hubspotContactMap,
    ),
    [aliases, hubspotActivities, hubspotContactAssocs, hubspotContactMap],
  );
  const planItems = useMemo(() => buildPlan(analytics?.stats), [analytics]);
  const hostAttendanceDataWarning = useMemo(() => {
    const recentCutoff = dateKeyDaysAgo(21);
    const gaps = (analytics?.sessionsMissingMarkedAttendees || [])
      .filter((s) => s?.dateLabel && s.dateLabel >= recentCutoff)
      .sort((a, b) => (b?.dateLabel || '').localeCompare(a?.dateLabel || ''));

    if (!gaps.length) return '';

    const examples = gaps
      .slice(0, 4)
      .map((s) => `${s.type} ${s.dateFormatted || s.dateLabel}`)
      .join(', ');
    const extraCount = gaps.length > 4 ? ` (+${gaps.length - 4} more)` : '';
    return `Incomplete HubSpot attendance data for ${examples}${extraCount}. Sync is running, but attendee rows are missing because the host did not mark attendees in the HubSpot call/meeting record. Mark attendees in HubSpot, then click Sync Now.`;
  }, [analytics]);
  const scheduleCoverageWarning = useMemo(() => {
    const tueMissing = analytics?.scheduleCoverage?.missingTuesdayWeeks || [];
    const thuMissing = analytics?.scheduleCoverage?.missingThursdayWeeks || [];
    const lookbackWeeks = Number(analytics?.scheduleCoverage?.lookbackWeeks || SCHEDULE_GAP_AUDIT_LOOKBACK_WEEKS);
    if (!tueMissing.length && !thuMissing.length) return '';

    const fmtExamples = (rows, dayType) => rows
      .slice(0, 3)
      .map((weekKey) => {
        const dateKey = scheduledDateKeyFromWeekKey(weekKey, dayType);
        return formatDateMMDDYY(dateKey || weekKey);
      })
      .join(', ');
    const tueText = tueMissing.length
      ? `Tuesday missing weeks: ${tueMissing.length}${fmtExamples(tueMissing, 'Tuesday') ? ` (meeting dates: ${fmtExamples(tueMissing, 'Tuesday')})` : ''}`
      : '';
    const thuText = thuMissing.length
      ? `Thursday missing weeks: ${thuMissing.length}${fmtExamples(thuMissing, 'Thursday') ? ` (meeting dates: ${fmtExamples(thuMissing, 'Thursday')})` : ''}`
      : '';
    return `Recent ${lookbackWeeks}-week audit: ${[tueText, thuText].filter(Boolean).join(' | ')}`;
  }, [analytics]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outreach email health check — surfaces Mandrill/delivery failures
  useEffect(() => {
    (async () => {
      try {
        // Check for recent outreach failures in recovery_events metadata
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: recentEvents, error: evError } = await supabase
          .from('recovery_events')
          .select('event_type,metadata,delivered_at')
          .gte('delivered_at', sevenDaysAgo)
          .order('delivered_at', { ascending: false })
          .limit(20);

        if (evError) {
          // Table may not exist yet — not a blocking error
          setOutreachHealth({ status: 'unknown', message: '' });
          return;
        }

        const failures = (recentEvents || []).filter(
          (e) => e.metadata?.mandrill_error || e.metadata?.delivery_failed
        );

        if (failures.length > 0) {
          const latestError = failures[0].metadata?.mandrill_error || failures[0].metadata?.delivery_failed || 'Unknown delivery failure';
          setOutreachHealth({
            status: 'error',
            message: `Outreach email delivery is broken — ${failures.length} failed in the last 7 days. Latest error: ${latestError}. Check MANDRILL_API_KEY in Supabase secrets and domain verification in Mandrill.`,
          });
          return;
        }

        // Check if any outreach has ever run (no events = agents may not be active)
        const { count } = await supabase
          .from('recovery_events')
          .select('id', { count: 'exact', head: true });

        if (count === 0) {
          setOutreachHealth({
            status: 'warning',
            message: 'No outreach emails have been sent yet. All 4 outreach agents (no-show, at-risk, streak-break, winback) are likely still in dry-run mode. Flip to live when ready.',
          });
          return;
        }

        setOutreachHealth({ status: 'ok', message: '' });
      } catch {
        setOutreachHealth({ status: 'unknown', message: '' });
      }
    })();
  }, []);

  useEffect(() => {
    if (!analytics?.sessions?.length || selectedSessionKey) return;

    const latestThursday = [...analytics.sessions]
      .filter((s) => s.type === 'Thursday')
      .sort((a, b) => (a.date?.getTime?.() || 0) - (b.date?.getTime?.() || 0))
      .pop();
    const fallbackAny = analytics.sessions[analytics.sessions.length - 1];
    const selected = latestThursday || fallbackAny;

    if (selected) {
      setSelectedSessionKey(`${selected.type}|${selected.dateLabel}`);
    }
  }, [analytics, selectedSessionKey]);

  const selectedSessionDetail = useMemo(() => {
    if (!analytics?.sessions?.length || !selectedSessionKey) return null;
    const sessions = analytics.sessions;
    const selectedIndex = sessions.findIndex((s) => `${s.type}|${s.dateLabel}` === selectedSessionKey);
    if (selectedIndex < 0) return null;

    const session = sessions[selectedIndex];
    const sessionAttendeeEntries = (s) => {
      if (Array.isArray(s?.attendeeObjects) && s.attendeeObjects.length > 0) return s.attendeeObjects;
      return (s?.attendees || []).map((name) => ({
        name,
        identityKey: `name:${normalizeName(name)}`,
      }));
    };
    const totalVisitsByIdentity = new Map();
    const groupVisitsByIdentity = new Map();

    sessions.slice(0, selectedIndex + 1).forEach((s) => {
      sessionAttendeeEntries(s).forEach((attendee) => {
        const displayName = String(attendee?.name || '').trim();
        if (!displayName) return;
        const identityKey = attendee?.identityKey || buildAttendanceIdentityKey(displayName, attendee);
        if (!identityKey) return;
        totalVisitsByIdentity.set(identityKey, (totalVisitsByIdentity.get(identityKey) || 0) + 1);
        if (s.type === session.type) {
          groupVisitsByIdentity.set(identityKey, (groupVisitsByIdentity.get(identityKey) || 0) + 1);
        }
      });
    });

    const newIdentitySet = new Set(session.newIdentityKeys || []);
    const visitsByName = new Map(
      (analytics.people || []).map((p) => [normalizeName(p.name), Number(p.visits || 0)]),
    );
    const allKnownNames = (analytics.people || []).map((p) => p.name).filter(Boolean);
    const sessionEntries = sessionAttendeeEntries(session);
    const inSessionSet = new Set(sessionEntries.map((entry) => normalizeName(entry?.name || '')));
    // Build attendee objects map for fast lookup (name → hubspot pre-resolved data)
    const attendeeRows = sessionEntries
      .map((entry) => {
        const name = String(entry?.name || '').trim();
        if (!name) return null;
        // Use pre-resolved HubSpot association identity whenever available.
        // Fallback resolver is name-only for unresolved historical rows.
        const preResolved = entry && Object.keys(entry).length > 0 ? entry : null;
        const hubspotIdentity = preResolved?.hubspotContactId
          ? { matched: true, ...preResolved }
          : attendanceHubspotResolver.resolveAttendee(name, session);
        const resolvedHubspotContactId = Number(hubspotIdentity?.hubspotContactId);
        const hubspotContact = Number.isFinite(resolvedHubspotContactId)
          ? (hubspotContactMap.get(resolvedHubspotContactId) || null)
          : null;
        const revenue = resolveHubspotRevenueValue(hubspotContact);
        const sobrietyDate = resolveHubspotSobrietyValue(hubspotContact) || null;
        const sobrietyInfo = sobrietyMilestoneInfo(sobrietyDate, new Date());
        const identityKey = entry?.identityKey || buildAttendanceIdentityKey(name, hubspotIdentity || entry);

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
          identityKey,
          displayName: hubspotIdentity?.hubspotName && hubspotIdentity.hubspotName !== 'Not Found' ? hubspotIdentity.hubspotName : name,
          isNew: !!identityKey && newIdentitySet.has(identityKey),
          groupVisitsIncludingThisSession: identityKey ? (groupVisitsByIdentity.get(identityKey) || 0) : 0,
          totalVisitsIncludingThisSession: identityKey ? (totalVisitsByIdentity.get(identityKey) || 0) : 0,
          hubspotMatched: !!hubspotIdentity?.matched || Number.isFinite(Number(hubspotIdentity?.hubspotContactId)),
          hubspotContactId: hubspotIdentity?.hubspotContactId || null,
          hubspotName: hubspotIdentity?.hubspotName || 'Not Found',
          hubspotEmail: hubspotIdentity?.hubspotEmail || 'Not Found',
          hubspotUrl: hubspotIdentity?.hubspotUrl || '',
          hubspotSource: hubspotIdentity?.hubspotSource || 'Not Found',
          identityMappingSource: hubspotIdentity?.identityMappingSource || 'none',
          identityMappingConfidence: hubspotIdentity?.identityMappingConfidence || 'Low',
          identityMappingNote: hubspotIdentity?.identityMappingNote || '',
          missingIdentityReason: (hubspotIdentity?.matched || Number.isFinite(Number(hubspotIdentity?.hubspotContactId)))
            ? ''
            : (hubspotIdentity?.missingIdentityReason || ''),
          dataSource: session.dataSource || 'hubspot',
          revenue,
          sobrietyDate,
          sobrietyDurationLabel: sobrietyInfo?.durationLabel || '',
          sobrietySoonLabel: sobrietyInfo?.soonLabel || '',
          sobrietyYears: sobrietyInfo?.elapsed?.years ?? null,
          sobrietyMonths: sobrietyInfo?.elapsed?.months ?? null,
          duplicateActions,
        };
      })
      .filter(Boolean)
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

    // ── Match donations to attendees within 24 hours of session start ──
    const sessionStartMs = session.date?.getTime?.() || 0;
    const DONATION_WINDOW_MS = 24 * 60 * 60 * 1000;
    const windowDonations = (donationRows || []).filter((d) => {
      const donatedMs = new Date(d.donated_at).getTime();
      return donatedMs >= sessionStartMs && donatedMs < sessionStartMs + DONATION_WINDOW_MS;
    });

    // Build attendee email sets for matching (primary + hs_additional_emails)
    const attendeeEmailIndex = new Map(); // email → row index
    const attendeeNameIndex = new Map(); // normalized name → row index
    attendeeRows.forEach((row, idx) => {
      // Primary email
      const primary = normalizeEmail(row.hubspotEmail);
      if (primary && primary !== 'not found') attendeeEmailIndex.set(primary, idx);
      // Additional emails from HubSpot contact
      const contactId = Number(row.hubspotContactId);
      if (Number.isFinite(contactId) && contactId > 0) {
        const contact = hubspotContactMap.get(contactId);
        const additional = String(contact?.hs_additional_emails || '');
        if (additional) {
          additional.split(';').forEach((e) => {
            const norm = normalizeEmail(e);
            if (norm) attendeeEmailIndex.set(norm, idx);
          });
        }
      }
      // Name index
      const normName = normalizeName(row.displayName || row.name || '');
      if (normName) attendeeNameIndex.set(normName, idx);
    });

    // Build override map: donor_email → normalized attendee name (for household/spousal donations)
    const donorOverrideMap = new Map();
    (donationAttendeeOverrides || []).forEach((o) => {
      const email = normalizeEmail(o.donor_email);
      if (email) donorOverrideMap.set(email, normalizeName(o.attendee_display_name || ''));
    });

    // Match each donation to an attendee (email → additional email → name → override)
    const donationsByAttendeeIdx = new Map(); // idx → [donation, ...]
    const matchedDonations = [];
    windowDonations.forEach((d) => {
      const donorEmail = normalizeEmail(d.donor_email);
      const donorName = normalizeName(d.donor_name || '');
      let matchIdx = donorEmail ? attendeeEmailIndex.get(donorEmail) : undefined;
      if (matchIdx === undefined && donorName) matchIdx = attendeeNameIndex.get(donorName);
      // Tier 3: manual override (household/spousal donations)
      if (matchIdx === undefined && donorEmail) {
        const overrideName = donorOverrideMap.get(donorEmail);
        if (overrideName) matchIdx = attendeeNameIndex.get(overrideName);
      }
      if (matchIdx !== undefined) {
        if (!donationsByAttendeeIdx.has(matchIdx)) donationsByAttendeeIdx.set(matchIdx, []);
        donationsByAttendeeIdx.get(matchIdx).push(d);
        matchedDonations.push(d);
      }
    });

    // Annotate attendee rows with donation info
    attendeeRows.forEach((row, idx) => {
      const donations = donationsByAttendeeIdx.get(idx) || [];
      row.sessionDonations = donations;
      row.donated = donations.length > 0;
      row.donatedRecurring = donations.some((d) => !!d.is_recurring);
      row.donationAmount = donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    });

    // Session-level donation summary
    const donationSummary = {
      count: matchedDonations.length,
      totalAmount: matchedDonations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
      oneTimeAmount: matchedDonations.filter((d) => !d.is_recurring).reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
      recurringAmount: matchedDonations.filter((d) => !!d.is_recurring).reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
      oneTimeCount: matchedDonations.filter((d) => !d.is_recurring).length,
      recurringCount: matchedDonations.filter((d) => !!d.is_recurring).length,
    };

    return {
      session,
      attendeeRows,
      donationSummary,
      hasTargetDate: session.dateLabel === '2026-02-19',
    };
  }, [analytics, selectedSessionKey, attendanceHubspotResolver, hubspotContactMap, donationRows, donationAttendeeOverrides]);

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
        attendeeObjects: Array.isArray(session.attendeeObjects) ? session.attendeeObjects : [],
        newIdentityKeys: Array.isArray(session.newIdentityKeys) ? session.newIdentityKeys : [],
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

    const selectedNewIdentitySet = new Set(selectedSession?.newIdentityKeys || []);
    const selectedEntries = (selectedSession?.attendeeObjects || []).length > 0
      ? (selectedSession?.attendeeObjects || [])
      : (selectedSession?.attendees || []).map((name) => ({ name, identityKey: `name:${normalizeName(name)}` }));
    const personIdentityKey = person?.identityKey || `name:${normalizeName(person.name || '')}`;
    const otherAttendees = selectedEntries
      .filter((entry) => {
        const entryIdentityKey = entry?.identityKey || `name:${normalizeName(entry?.name || '')}`;
        return entryIdentityKey !== personIdentityKey;
      })
      .map((entry) => {
        const name = String(entry?.name || '').trim();
        const identityKey = entry?.identityKey || `name:${normalizeName(name)}`;
        return {
          name,
          identityKey,
          isNew: selectedNewIdentitySet.has(identityKey),
        };
      })
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
    if (!ATTENDANCE_ENABLE_BAD_NAMES_QA) {
      return { rows: [], counts: { suspiciousContacts: 0, suspiciousUnmatchedAssocCount: 0 } };
    }
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
      { key: 'openai', label: 'OpenAI', configured: !!OPENAI_API_KEY, note: 'Frontend placeholder only; prefer Supabase Edge Function secrets' },
      { key: 'gemini', label: 'Gemini', configured: !!GEMINI_API_KEY, note: 'Frontend placeholder only; prefer Supabase Edge Function secrets' },
      { key: 'claude', label: 'Claude', configured: !!(CLAUDE_API_KEY || ANTHROPIC_API_KEY), note: 'Frontend placeholder only; prefer Supabase Edge Function secrets' },
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

  async function handleSyncNow() {
    setSyncNowState((prev) => ({
      ...prev,
      status: 'running',
      message: 'Syncing HubSpot attendance now...',
    }));

    try {
      let syncData = null;
      const primary = await supabase.functions.invoke('sync_attendance_from_hubspot', {
        method: 'POST',
        body: { days: ATTENDANCE_BACKFILL_DAYS },
      });

      if (!primary.error) {
        syncData = primary.data || null;
      } else {
        const fallbackHubspot = await supabase.functions.invoke('sync_hubspot_meeting_activities', {
          method: 'POST',
          body: { days: ATTENDANCE_BACKFILL_DAYS, include_calls: true, include_meetings: true },
        });
        if (fallbackHubspot.error) throw fallbackHubspot.error;

        syncData = {
          ok: true,
          fallback: true,
          host_data_warning_summary: '',
          non_fatal_step_errors: [],
        };
      }

      await loadAll();

      const warningSummary = String(syncData?.host_data_warning_summary || '').trim();
      const nonFatalCount = Array.isArray(syncData?.non_fatal_step_errors)
        ? syncData.non_fatal_step_errors.length
        : 0;
      const successMessage = warningSummary
        ? `${warningSummary}${nonFatalCount > 0 ? ` (${nonFatalCount} non-fatal sync warning(s))` : ''}`
        : `HubSpot attendance sync completed.${nonFatalCount > 0 ? ` (${nonFatalCount} non-fatal sync warning(s))` : ''}`;

      if (warningSummary) {
        setIdentityWarning((prev) => {
          if (!prev) return warningSummary;
          if (String(prev).includes(warningSummary)) return prev;
          return `${prev} | ${warningSummary}`;
        });
      }

      setSyncNowState({
        status: 'success',
        message: successMessage,
        lastRunAtIso: new Date().toISOString(),
      });
    } catch (syncError) {
      const message = syncError?.message || 'HubSpot attendance sync failed.';
      setSyncNowState((prev) => ({
        ...prev,
        status: 'error',
        message,
      }));
      setDetailMessage(message);
    }
  }

  function appendIdentityWarnings(nextWarnings = []) {
    const clean = (nextWarnings || []).map((w) => String(w || '').trim()).filter(Boolean);
    if (clean.length === 0) return;
    setIdentityWarning((prev) => {
      const merged = Array.from(new Set([
        ...String(prev || '').split('|').map((s) => s.trim()).filter(Boolean),
        ...clean,
      ]));
      return merged.join(' | ');
    });
  }

  async function loadHubspotContactEnrichment({ identityStartIso, hsActivityRows, hsAssocRows, myInvocation }) {
    setContactEnrichmentStatus('loading');
    const identityWarnings = [];
    const {
      columns: contactSelectColumns,
      schemaWarnings: contactSchemaWarnings = [],
    } = await resolveAttendanceHubspotContactSelectColumns();
    if (contactSchemaWarnings.length > 0) identityWarnings.push(...contactSchemaWarnings);
    const contactSelectClause = contactSelectColumns.join(',');

    const hubspotContactsResult = await selectAllRows((from, to) => (
      supabase
        .from('raw_hubspot_contacts')
        .select(contactSelectClause)
        .gte('createdate', identityStartIso)
        .order('createdate', { ascending: false })
        .range(from, to)
    ), { pageSize: 1000, maxPages: 120 });

    let hubspotContactsData = [];
    if (hubspotContactsResult.error) {
      identityWarnings.push(`HubSpot contacts cache unavailable: ${hubspotContactsResult.error.message || 'read failed'}`);
    } else {
      hubspotContactsData = hubspotContactsResult.data || [];
    }

    // Backfill any contact IDs referenced by loaded HubSpot call/meeting sessions but missing from the
    // scoped contact query.
    const sessionActivityIds = new Set(
      (hsActivityRows || [])
        .map((row) => String(row?.hubspot_activity_id || ''))
        .filter(Boolean),
    );
    const neededContactIds = Array.from(new Set(
      (hsAssocRows || [])
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
          .select(contactSelectClause)
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
        identityWarnings.push(`${stillMissingCount} HubSpot activity-linked contact(s) were not found in raw_hubspot_contacts cache; refresh contact sync to fill enrichment fields.`);
      }
    }

    // Discard results if a newer loadAll call has already superseded this invocation.
    if (contactEnrichmentInvocationRef.current !== myInvocation) return;

    setRawHubspotContacts(hubspotContactsData);
    const enrichmentFailed = identityWarnings.length > 0 && hubspotContactsData.length === 0;
    setContactEnrichmentStatus(enrichmentFailed ? 'error' : 'ready');
    appendIdentityWarnings(identityWarnings);
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    setAliasWarning('');
    setIdentityWarning('');
    setContactEnrichmentStatus('idle');
    setRawHubspotContacts([]);

    const aliasResult = await loadAliasesForDashboard();
    if (aliasResult.warning) {
      setAliasWarning(aliasResult.warning);
    }

    const identityWarnings = [];
    const identityStartDate = dateKeyDaysAgo(ATTENDANCE_BACKFILL_DAYS);
    const identityStartIso = `${identityStartDate}T00:00:00.000Z`;

    // ── PRIMARY: HubSpot meeting activity groups (call-type, group sessions) ──
    const hsActivitiesResult = await selectAllRows((from, to) => (
      supabase
        .from('raw_hubspot_meeting_activities')
        .select('hubspot_activity_id,activity_type,hs_timestamp,created_at_hubspot,title,body_preview,metadata')
        .in('activity_type', ['call', 'meeting'])
        .or(`hs_timestamp.gte.${identityStartDate},created_at_hubspot.gte.${identityStartDate}`)
        .order('hs_timestamp', { ascending: false })
        .range(from, to)
    ), { pageSize: 1000, maxPages: 120 });

    const hsActivityRows = hsActivitiesResult.data || [];
    if (hsActivitiesResult.error) {
      identityWarnings.push(`HubSpot activity feed unavailable: ${hsActivitiesResult.error.message || 'read failed'}`);
      setHubspotActivities([]);
    } else {
      setHubspotActivities(hsActivityRows);
    }

    let hsAssocRows = [];
    let hsAssocsLoadError = null;
    if (!hsActivitiesResult.error && hsActivityRows.length > 0) {
      const recentActivityIds = Array.from(new Set(
        hsActivityRows
          .map((row) => Number(row?.hubspot_activity_id))
          .filter((id) => Number.isFinite(id)),
      ));

      for (const idChunk of chunkArray(recentActivityIds, 200)) {
        const assocResult = await supabase
          .from('hubspot_activity_contact_associations')
          .select('hubspot_activity_id,activity_type,hubspot_contact_id,contact_email,contact_firstname,contact_lastname')
          .in('activity_type', ['call', 'meeting'])
          .in('hubspot_activity_id', idChunk);

        if (assocResult.error) {
          hsAssocsLoadError = assocResult.error;
          break;
        }

        hsAssocRows.push(...(assocResult.data || []));
      }
    }

    if (hsAssocsLoadError) {
      identityWarnings.push(`HubSpot contact associations unavailable: ${hsAssocsLoadError.message || 'read failed'}`);
      setHubspotContactAssocs([]);
      hsAssocRows = [];
    } else {
      setHubspotContactAssocs(hsAssocRows);
    }

    if (identityWarnings.length > 0) {
      appendIdentityWarnings(identityWarnings);
    }

    // ── Load Zeffy donation transactions for session-level donation matching ──
    const donationsResult = await selectAllRows((from, to) => (
      supabase
        .from('donation_transactions_unified')
        .select('donor_name,donor_email,amount,donated_at,is_recurring,status')
        .gte('donated_at', identityStartIso)
        .order('donated_at', { ascending: false })
        .range(from, to)
    ), { pageSize: 1000, maxPages: 20 });
    setDonationRows(donationsResult.data || []);

    // Load manual donor→attendee overrides (household/spousal donations)
    const overridesResult = await supabase
      .from('donation_attendee_overrides')
      .select('donor_email,attendee_display_name');
    setDonationAttendeeOverrides(overridesResult.data || []);

    setAliases(aliasResult.aliases || []);
    setLoading(false);

    // Hydrate HubSpot contact enrichment in the background so attendance KPIs paint faster.
    // Only skip if activities themselves failed (contacts are independent of association load success).
    // If hsAssocsLoadError is set, hsAssocRows will be [] and the backfill step is safely skipped.
    contactEnrichmentInvocationRef.current += 1;
    const myInvocation = contactEnrichmentInvocationRef.current;
    if (!hsActivitiesResult.error) {
      void loadHubspotContactEnrichment({ identityStartIso, hsActivityRows, hsAssocRows, myInvocation });
    } else {
      setContactEnrichmentStatus('error');
    }
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
      }).catch(() => { });
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
        <p style={{ color: '#64748b', fontWeight: 600 }}>Loading attendance analytics...</p>
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
        <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', boxShadow: '0 8px 24px rgb(0 0 0 / 0.4)', minWidth: '180px' }}>
          <p style={{ fontWeight: 700, marginBottom: '8px', color: '#f1f5f9', fontSize: '14px', letterSpacing: '0.01em' }}>{label}</p>
          <div style={{ display: 'flex', gap: '14px', fontSize: '13px' }}>
            <span style={{ color: '#4ade80', fontWeight: 600 }}>New: {d.newCount}</span>
            <span style={{ color: '#a78bfa', fontWeight: 600 }}>Return: {d.repeatCount}</span>
            <span style={{ color: '#ffffff', fontWeight: 700 }}>Total: {d.total}</span>
          </div>
          {d.newNames && d.newNames.length > 0 && (
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <p style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px', letterSpacing: '0.06em' }}>Welcome New:</p>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#e2e8f0' }}>
                {d.newNames.map(n => <li key={n} style={{ marginBottom: '2px' }}>{n}</li>)}
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
      <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', boxShadow: '0 8px 24px rgb(0 0 0 / 0.4)' }}>
        <p style={{ fontWeight: 700, marginBottom: '6px', color: '#f1f5f9', fontSize: '14px' }}>{label}</p>
        <p style={{ fontSize: '13px', color: '#e2e8f0', margin: 0 }}>Avg Visits: <strong style={{ color: '#ffffff' }}>{row.avgVisits ?? '-'}</strong></p>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>MoM: {formatChangePct(row.momChange)}</p>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0 0' }}>YoY: {formatChangePct(row.yoyChange)}</p>
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
      <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', boxShadow: '0 8px 24px rgb(0 0 0 / 0.4)' }}>
        <p style={{ fontWeight: 700, marginBottom: '6px', color: '#f1f5f9', fontSize: '14px' }}>{fullDate}</p>
        <p style={{ fontSize: '13px', color: '#38bdf8', margin: 0 }}>Tuesday Avg Visits: <strong style={{ color: '#7dd3fc' }}>{tue}</strong></p>
        <p style={{ fontSize: '13px', color: '#a78bfa', margin: '4px 0 0 0' }}>Thursday Avg Visits: <strong style={{ color: '#c4b5fd' }}>{thu}</strong></p>
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
            <YAxis domain={[0, 13]} tick={{ fill: '#64748b', fontSize: 10 }} />
            <Tooltip content={monthlyTrendTooltip} />
            <ReferenceLine y={13} stroke="#94a3b8" strokeDasharray="6 3" label={{ value: 'Perfect (13)', position: 'right', fill: '#94a3b8', fontSize: 10 }} />
            <Line type="monotone" dataKey="avgVisits" name="Avg Visits / Person" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Outreach review queue — manual send approval */}
      <OutreachReviewQueue />

      {aliasWarning && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
          <p style={{ color: '#92400e', fontWeight: 700 }}>Alias Warning</p>
          <p style={{ marginTop: '6px', color: '#92400e' }}>{aliasWarning}</p>
        </div>
      )}

      {contactEnrichmentStatus === 'loading' && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #2563eb', backgroundColor: '#eff6ff' }}>
          <p style={{ color: '#1d4ed8', fontWeight: 700 }}>Loading Contact Enrichment</p>
          <p style={{ marginTop: '6px', color: '#1e40af' }}>
            Core attendance KPIs are loaded. HubSpot contact details (email/revenue/sobriety enrichment) are still hydrating.
          </p>
        </div>
      )}

      {identityWarning && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
          <p style={{ color: '#92400e', fontWeight: 700 }}>Identity Mapping Warning</p>
          <p style={{ marginTop: '6px', color: '#92400e' }}>{identityWarning}</p>
          <p style={{ marginTop: '6px', color: '#92400e', fontSize: '12px' }}>
            Attendance counts remain valid. HubSpot contact/email enrichment is partial until contact caches and associations finish syncing.
          </p>
        </div>
      )}

      {hostAttendanceDataWarning && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #dc2626', backgroundColor: '#fef2f2' }}>
          <p style={{ color: '#991b1b', fontWeight: 700 }}>HubSpot Attendee Marking Required</p>
          <p style={{ marginTop: '6px', color: '#991b1b' }}>{hostAttendanceDataWarning}</p>
          <p style={{ marginTop: '6px', color: '#991b1b', fontSize: '12px' }}>
            This is not a sync outage. Attendance cannot be reconstructed when attendees are not marked on the HubSpot call/meeting record.
          </p>
        </div>
      )}

      {scheduleCoverageWarning && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
          <p style={{ color: '#92400e', fontWeight: 700 }}>Weekly Schedule Gap Audit</p>
          <p style={{ marginTop: '6px', color: '#92400e' }}>{scheduleCoverageWarning}</p>
          <p style={{ marginTop: '6px', color: '#92400e', fontSize: '12px' }}>
            The dashboard now anchors sessions to Tuesday 12pm ET and Thursday 11am ET windows and flags missing source weeks immediately.
          </p>
        </div>
      )}

      {outreachHealth.status === 'error' && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #dc2626', backgroundColor: '#fef2f2' }}>
          <p style={{ color: '#991b1b', fontWeight: 700 }}>Outreach Email Delivery Broken</p>
          <p style={{ marginTop: '6px', color: '#991b1b' }}>{outreachHealth.message}</p>
        </div>
      )}

      {outreachHealth.status === 'warning' && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }}>
          <p style={{ color: '#92400e', fontWeight: 700 }}>Outreach Agents Not Active</p>
          <p style={{ marginTop: '6px', color: '#92400e' }}>{outreachHealth.message}</p>
        </div>
      )}

      {(syncNowState.status === 'success' || syncNowState.status === 'error') && (
        <div
          style={{
            ...cardStyle,
            borderLeft: syncNowState.status === 'success' ? '4px solid #16a34a' : '4px solid #dc2626',
            backgroundColor: syncNowState.status === 'success' ? '#f0fdf4' : '#fef2f2',
          }}
        >
          <p style={{ color: syncNowState.status === 'success' ? '#166534' : '#991b1b', fontWeight: 700 }}>
            {syncNowState.status === 'success' ? 'Sync Complete' : 'Sync Failed'}
          </p>
          <p style={{ marginTop: '6px', color: syncNowState.status === 'success' ? '#166534' : '#991b1b' }}>
            {syncNowState.message || (syncNowState.status === 'success' ? 'HubSpot attendance sync completed.' : 'HubSpot attendance sync failed.')}
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
            Data source: {analytics?.sessions?.length || 0} selected Tue/Thu sessions · {hubspotActivities.length} HubSpot activities · {hubspotContactAssocs.length} attendee associations · {rawHubspotContacts.length} HubSpot contacts enriched
          </p>
          {syncNowState.lastRunAtIso && (
            <p style={{ marginTop: '4px', opacity: 0.85, fontSize: '12px' }}>
              Last manual sync: {new Date(syncNowState.lastRunAtIso).toLocaleString()}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleSyncNow}
            disabled={syncNowState.status === 'running'}
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
              cursor: syncNowState.status === 'running' ? 'not-allowed' : 'pointer',
              opacity: syncNowState.status === 'running' ? 0.8 : 1,
            }}
          >
            {syncNowState.status === 'running' ? <Loader2 size={16} /> : <RefreshCcw size={16} />}
            {syncNowState.status === 'running' ? 'Syncing...' : 'Sync Now'}
          </button>
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

          <div style={{ overflowX: isMobile ? 'visible' : 'auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                gap: '12px',
                minWidth: isMobile ? 'auto' : '920px',
              }}
            >
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
                            backgroundColor: 'var(--color-surface-elevated)',
                            border: `1px solid ${isTuesday ? '#bbf7d0' : '#fdba74'}`,
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--color-text-primary)',
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
          <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Unique Tue</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#0ea5e9' }}>{analytics.stats.uniqueTue}</p>
          <p style={{ marginTop: '10px', color: '#64748b', fontSize: '13px' }}>
            Tactic Tuesday
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Unique Thu</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#6366f1' }}>{analytics.stats.uniqueThu}</p>
          <p style={{ marginTop: '10px', color: '#64748b', fontSize: '13px' }}>
            SF Mastermind
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Repeat Rate Tue</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#0ea5e9' }}>
            {formatPct(analytics.stats.repeatRateTue)}
          </p>
          <p style={{ marginTop: '10px', color: '#64748b', fontSize: '13px' }}>
            Tue Retention
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Repeat Rate Thu</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#6366f1' }}>
            {formatPct(analytics.stats.repeatRateThu)}
          </p>
          <p style={{ marginTop: '10px', color: '#64748b', fontSize: '13px' }}>
            Thu Retention
          </p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Sessions</p>
          <p style={{ fontSize: '28px', fontWeight: 700, marginTop: '8px', color: '#0f766e' }}>
            {analytics.stats.sessions}
          </p>
          <p style={{ marginTop: '10px', color: '#64748b', fontSize: '13px' }}>
            Total analyzed
          </p>
        </div>
      </div>

      {/* ─── Show-Up Charts (Tue & Thu separate) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
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
      <div
        style={{
          ...cardStyle,
          borderLeft: '5px solid var(--color-info)',
          backgroundColor: 'var(--color-surface-contrast)',
          color: 'var(--color-text-primary)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: '18px' }}>Show-Up Drilldown</h3>
            <p style={{ marginTop: '4px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              Click any Tuesday/Thursday bar to inspect attendees, visit counts including that meeting, and possible duplicates.
            </p>
          </div>
          {selectedSessionDetail && (
            <div
              style={{
                padding: '6px 10px',
                borderRadius: '999px',
                backgroundColor: 'var(--color-info-bg)',
                border: '1px solid var(--color-info)',
                color: 'var(--color-info)',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {selectedSessionDetail.session.type} {selectedSessionDetail.session.dateFormatted}
            </div>
          )}
        </div>

        {detailMessage && (
          <div
            style={{
              marginTop: '10px',
              borderRadius: '10px',
              padding: '10px 12px',
              backgroundColor: 'var(--color-info-bg)',
              border: '1px solid var(--color-info)',
              color: 'var(--color-text-primary)',
              fontSize: '13px',
            }}
          >
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
              <div
                style={{
                  marginTop: '10px',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  backgroundColor: 'var(--color-warning-bg)',
                  border: '1px solid var(--color-warning)',
                  color: 'var(--color-warning)',
                  fontSize: '13px',
                }}
              >
                Validation target is Thursday 02/19/2026. Click that bar when it appears to verify this workflow there first.
              </div>
            )}

            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
              <div style={{ backgroundColor: 'var(--color-surface-contrast-alt)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Total Show-Ups</p>
                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{selectedSessionDetail.session.derivedCount}</p>
              </div>
              <div style={{ backgroundColor: 'var(--color-success-bg)', border: '1px solid var(--color-success)', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: 'var(--color-success)', textTransform: 'uppercase' }}>Net New</p>
                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: 'var(--color-success)' }}>{selectedSessionDetail.session.newCount}</p>
              </div>
              <div style={{ backgroundColor: 'var(--color-surface-contrast-alt)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Returning</p>
                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{selectedSessionDetail.session.repeatCount}</p>
              </div>
              <div style={{ backgroundColor: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: '#fbbf24', textTransform: 'uppercase' }}>Donations</p>
                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: '#fbbf24' }}>{selectedSessionDetail.donationSummary?.count || 0}</p>
              </div>
              <div style={{ backgroundColor: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: '#fbbf24', textTransform: 'uppercase' }}>Donation Amount</p>
                <p style={{ marginTop: '4px', fontSize: '22px', fontWeight: 700, color: '#fbbf24' }}>${selectedSessionDetail.donationSummary?.totalAmount?.toLocaleString() || '0'}</p>
                {(selectedSessionDetail.donationSummary?.totalAmount > 0) && (
                  <div style={{ marginTop: '4px', display: 'flex', gap: '8px', fontSize: '11px' }}>
                    {selectedSessionDetail.donationSummary.oneTimeAmount > 0 && (
                      <span style={{ color: 'var(--color-text-secondary)' }}>One-Time: ${selectedSessionDetail.donationSummary.oneTimeAmount.toLocaleString()}</span>
                    )}
                    {selectedSessionDetail.donationSummary.recurringAmount > 0 && (
                      <span style={{ color: 'var(--color-text-secondary)' }}>Monthly: ${selectedSessionDetail.donationSummary.recurringAmount.toLocaleString()}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {isMobile ? (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {selectedSessionDetail.attendeeRows.map((row) => (
                  <div key={row.identityKey || row.name} style={{ border: '1px solid var(--color-border)', borderRadius: '12px', padding: '10px', backgroundColor: 'var(--color-surface-contrast-alt)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: 700 }}>{row.displayName || row.name}</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '10px',
                          fontWeight: 700,
                          backgroundColor: row.isNew ? 'var(--color-success-bg)' : 'var(--color-neutral-bg)',
                          color: row.isNew ? 'var(--color-success)' : 'var(--color-neutral)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {row.isNew ? 'Net New' : 'Returning'}
                      </span>
                      {row.donated && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '10px',
                            fontWeight: 700,
                            backgroundColor: 'rgba(251, 191, 36, 0.15)',
                            color: '#fbbf24',
                            textTransform: 'uppercase',
                          }}
                        >
                          {row.donatedRecurring ? `Donated Monthly $${row.donationAmount}` : `Donated $${row.donationAmount}`}
                        </span>
                      )}
                    </div>

                    <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                      <div>
                        <p style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Revenue</p>
                        <p style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 700 }}>{formatCurrencyMaybe(row.revenue)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Meeting Visits</p>
                        <p style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 700 }}>{row.groupVisitsIncludingThisSession} (total {row.totalVisitsIncludingThisSession})</p>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <p style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>HubSpot</p>
                        <p style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 600 }}>{row.hubspotName || 'Not Found'}</p>
                        <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{row.hubspotEmail || 'Not Found'}</p>
                        {row.hubspotUrl ? (
                          <a href={row.hubspotUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--color-info)', fontWeight: 700, textDecoration: 'underline' }}>
                            Open in HubSpot
                          </a>
                        ) : null}
                      </div>
                    </div>

                    {row.duplicateActions.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {row.duplicateActions.map((action) => {
                          const mergeKey = `${normalizeName(action.source)}->${normalizeName(action.target)}`;
                          const isBusy = mergingAliasKey === mergeKey;
                          return (
                            <button
                              key={mergeKey}
                              onClick={() => handleMergeAlias(action.source, action.target)}
                              disabled={!!mergingAliasKey}
                              style={{
                                border: '1px solid var(--color-border)',
                                backgroundColor: 'var(--color-surface-contrast)',
                                color: 'var(--color-text-primary)',
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
                ))}
                {selectedSessionDetail.attendeeRows.length === 0 && (
                  <div style={{ padding: '14px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: '10px', backgroundColor: 'var(--color-surface-contrast-alt)' }}>
                    No attendees found for this session.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: '14px', border: '1px solid var(--color-border)', borderRadius: '12px', overflowX: 'auto', backgroundColor: 'var(--color-surface-contrast-alt)' }}>
                <table style={{ width: '100%', minWidth: '1320px', borderCollapse: 'collapse', color: 'var(--color-text-primary)' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-surface-contrast-header)', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Display Name</th>
                      <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Revenue</th>
                      <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Sobriety Date</th>
                      <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Times Visited Meeting</th>
                      <th style={{ textAlign: 'right', padding: '10px', fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Total Visits</th>
                      <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Email Address</th>
                      <th style={{ textAlign: 'left', padding: '10px', fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>HubSpot Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSessionDetail.attendeeRows.map((row, rowIndex) => (
                      <tr
                        key={row.identityKey || row.name}
                        style={{
                          borderBottom: '1px solid var(--color-border)',
                          backgroundColor: rowIndex % 2 === 0 ? 'var(--color-surface-contrast-alt)' : 'var(--color-surface-contrast)',
                        }}
                      >
                        <td style={{ padding: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: 700 }}>{row.displayName || row.name}</span>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  backgroundColor: row.isNew ? 'var(--color-success-bg)' : 'var(--color-neutral-bg)',
                                  color: row.isNew ? 'var(--color-success)' : 'var(--color-neutral)',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {row.isNew ? 'Net New' : 'Returning'}
                              </span>
                              {row.donated && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    backgroundColor: 'rgba(251, 191, 36, 0.15)',
                                    color: '#fbbf24',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {row.donatedRecurring ? `Donated Monthly $${row.donationAmount}` : `Donated $${row.donationAmount}`}
                                </span>
                              )}
                            </div>
                            {normalizeName(row.displayName || '') !== normalizeName(row.name || '') && (
                              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Attendance row name: {row.name}</span>
                            )}
                            {!row.hubspotMatched && row.missingIdentityReason ? (
                              <span style={{ fontSize: '10px', color: 'var(--color-warning)' }}>{row.missingIdentityReason}</span>
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
                                        border: '1px solid var(--color-border)',
                                        backgroundColor: 'var(--color-surface-contrast-alt)',
                                        color: 'var(--color-text-primary)',
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
                        <td style={{ padding: '10px', fontSize: '12px', textAlign: 'right', color: Number.isFinite(row.revenue) ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontWeight: Number.isFinite(row.revenue) ? 700 : 500 }}>
                          {formatCurrencyMaybe(row.revenue)}
                        </td>
                        <td style={{ padding: '10px' }}>
                          {row.sobrietyDate ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <span style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                                {formatDateMMDDYY(row.sobrietyDate)}{row.sobrietyDurationLabel ? ` (${row.sobrietyDurationLabel})` : ''}
                              </span>
                              {row.sobrietySoonLabel ? (
                                <span style={{ fontSize: '10px', color: 'var(--color-warning)', fontWeight: 700 }}>{row.sobrietySoonLabel}</span>
                              ) : null}
                            </div>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Not Found</span>
                          )}
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px', color: 'var(--color-text-primary)', textAlign: 'right', fontWeight: 700 }}>
                          {row.groupVisitsIncludingThisSession}
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px', color: 'var(--color-text-primary)', textAlign: 'right', fontWeight: 700 }}>
                          {row.totalVisitsIncludingThisSession}
                        </td>
                        <td style={{ padding: '10px', fontSize: '12px', color: row.hubspotEmail !== 'Not Found' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
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
                                backgroundColor: row.hubspotMatched ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                                color: row.hubspotMatched ? 'var(--color-success)' : 'var(--color-danger)',
                                textTransform: 'uppercase',
                              }}
                            >
                              {row.hubspotMatched ? 'Matched' : 'Missing'}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 600 }}>{row.hubspotName || 'Not Found'}</span>
                            {row.hubspotUrl ? (
                              <a
                                href={row.hubspotUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: '11px', color: 'var(--color-info)', fontWeight: 700, textDecoration: 'underline' }}
                              >
                                Open in HubSpot
                              </a>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>No HubSpot link</span>
                            )}
                            {row.hubspotContactId ? (
                              <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>ID: {row.hubspotContactId}</span>
                            ) : null}
                            <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                              {row.identityMappingSource === 'hubspot_call_activity' ? 'HubSpot Session' : (row.identityMappingSource || 'none')}
                            </span>
                            {row.identityMappingSource !== 'hubspot_call_activity' && (
                              <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                                Confidence: {row.identityMappingConfidence || 'Low'}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {selectedSessionDetail.attendeeRows.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: '14px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                          No attendees found for this session.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <TrendingUp size={17} color="#2563eb" />
          <h3 style={{ fontSize: '18px' }}>Avg Visits per Person – Rolling 90 Days</h3>
          <span
            title="Perfect score ≈ 13 (90 days / 7 = ~12.86 sessions). That means every person who attended at least once came to every single session in the window.&#10;&#10;~1–2 = most try once and leave&#10;~3–4 = decent mix of regulars + churn&#10;~6–7 = strong core, ~every other week&#10;~10+ = very sticky weekly regulars&#10;13 = perfection"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#e2e8f0', color: '#475569', fontSize: '11px', fontWeight: 700, cursor: 'help', flexShrink: 0 }}
          >?</span>
          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>Unified timeline by actual meeting date</span>
        </div>
        <div style={{ height: '260px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.avgTimelineCombined}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" allowDuplicatedCategory={false} tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis domain={[0, 13]} tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip content={avgTimelineTooltip} />
              <Legend />
              <ReferenceLine y={13} stroke="#94a3b8" strokeDasharray="6 3" label={{ value: 'Perfect (13)', position: 'right', fill: '#94a3b8', fontSize: 10 }} />
              <Line type="monotone" connectNulls dataKey="tuesdayAvg" name="Tuesday Avg Visits" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              <Line type="monotone" connectNulls dataKey="thursdayAvg" name="Thursday Avg Visits" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
        <MonthlyAverageCard
          title="Tuesday Avg Visits – Rolling 90d (MoM / YoY)"
          color="#0ea5e9"
          series={analytics.monthlyAvgTrendTue}
          summary={analytics.monthlyAvgSummaryTue}
        />
        <MonthlyAverageCard
          title="Thursday Avg Visits – Rolling 90d (MoM / YoY)"
          color="#6366f1"
          series={analytics.monthlyAvgTrendThu}
          summary={analytics.monthlyAvgSummaryThu}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
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
                key={p.identityKey || p.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr auto auto',
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
                <span style={{ fontSize: '12px', color: '#64748b' }}>{formatPct(p.recentShowRate)}</span>
              </div>
            ))}
            {analytics.topRepeaters.length === 0 && <p style={{ color: '#64748b' }}>No attendee rows yet.</p>}
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

              <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(220px, 1fr) 1.5fr', gap: '10px' }}>
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

                <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '10px', backgroundColor: 'var(--color-card)' }}>
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
                            key={`${selectedRepeaterDetail.selectedSession.sessionKey}-${attendee.identityKey || attendee.name}`}
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
                  key={p.identityKey || p.name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
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
              <span style={{ color: '#64748b', fontSize: '14px' }}>
                No at-risk attendees detected by the current outreach rules.
              </span>
            )}
          </div>
        </div>
      </div>
      {ATTENDANCE_ENABLE_BAD_NAMES_QA && (
      <div style={{ ...cardStyle, borderLeft: '5px solid #ef4444' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: '18px', color: '#991b1b' }}>Bad Names QA (HubSpot Contacts)</h3>
            <p style={{ marginTop: '4px', fontSize: '12px', color: '#7f1d1d' }}>
              Flags suspicious HubSpot contact names attached to Tuesday/Thursday HubSpot call/meeting attendance (email text in name, device-like names, digits, or missing names).
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

        {isMobile ? (
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {badNameQa.rows.slice(0, 100).map((row) => (
              <div key={`bad-name-${row.hubspotContactId}`} style={{ border: '1px solid #fecaca', borderRadius: '10px', backgroundColor: '#fffafa', padding: '10px' }}>
                <p style={{ fontSize: '12px', color: '#111827', fontWeight: 700 }}>{row.currentName || 'Not Found'}</p>
                <p style={{ marginTop: '2px', fontSize: '10px', color: '#6b7280' }}>ID: {row.hubspotContactId}</p>
                <p style={{ marginTop: '6px', fontSize: '11px', color: '#374151' }}>Email: {row.currentEmail || 'Not Found'}</p>
                <p style={{ marginTop: '4px', fontSize: '11px', color: '#374151' }}>
                  Snapshot names: {row.snapshotNames.length > 0 ? row.snapshotNames.join(' | ') : 'None'}
                </p>
                <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
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
                <p style={{ marginTop: '6px', fontSize: '11px', color: '#374151' }}>
                  Group rows: <strong>{row.associationRows}</strong> · Last seen: {row.lastSeenDateFormatted || 'Unknown'}
                </p>
                {row.hubspotUrl ? (
                  <a href={row.hubspotUrl} target="_blank" rel="noreferrer" style={{ marginTop: '4px', display: 'inline-block', fontSize: '11px', color: '#1d4ed8', fontWeight: 700, textDecoration: 'underline' }}>
                    Open in HubSpot
                  </a>
                ) : (
                  <span style={{ marginTop: '4px', display: 'inline-block', fontSize: '11px', color: '#9ca3af' }}>No link</span>
                )}
              </div>
            ))}
            {badNameQa.rows.length === 0 && (
              <div style={{ padding: '12px', fontSize: '12px', color: '#6b7280', border: '1px solid #fee2e2', borderRadius: '10px' }}>
                No suspicious HubSpot contact names detected in current Tuesday/Thursday HubSpot call/meeting attendance rows.
              </div>
            )}
          </div>
        ) : (
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
                      No suspicious HubSpot contact names detected in current Tuesday/Thursday HubSpot call/meeting attendance rows.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

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

        <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: '12px' }}>
          <div style={{ border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '12px', backgroundColor: 'var(--color-card)', padding: '12px' }}>
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

        <div style={{ marginTop: '12px', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '12px', backgroundColor: 'var(--color-card)', padding: '12px' }}>
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
              <div key={task.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', padding: '10px' }}>
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
            <Brain size={18} color="var(--color-dark-green)" />
            <h3 style={{ fontSize: '20px', color: 'var(--color-text-primary)' }}>Action Plan: Human + Autonomous</h3>
          </div>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '999px',
              backgroundColor: 'rgba(3,218,198,0.14)',
              border: '1px solid var(--color-border-glow)',
              color: 'var(--color-dark-green)',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            {selectedCount}/{planItems.length} marked proceed
          </div>
        </div>

        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
          {[{ title: 'Autonomous', items: autonomousTasks, icon: Calendar }, { title: 'Human', items: humanTasks, icon: Users }].map(
            (group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.title} style={{ border: '1px solid var(--color-border)', borderRadius: '12px', padding: '12px', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <GroupIcon size={16} color="var(--color-dark-green)" />
                    <h4 style={{ fontSize: '16px', color: 'var(--color-text-primary)' }}>{group.title}</h4>
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
                            border: '1px solid var(--color-border)',
                            backgroundColor: isSkipped ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                            borderRadius: '10px',
                            padding: '10px',
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
                            alignItems: 'start',
                            gap: '10px',
                          }}
                        >
                          <div>
                            <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{item.title}</p>
                            <p style={{ marginTop: '4px', color: '#64748b', fontSize: '13px' }}>{item.detail}</p>

                            {isHumanGroup && (
                              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
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
                                    border: '1px solid var(--color-border)',
                                    backgroundColor: isSkipped ? 'rgba(148,163,184,0.2)' : 'rgba(255,255,255,0.08)',
                                    color: 'var(--color-text-primary)',
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
                                  <a href={workflow.notionUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--color-dark-green)', fontWeight: 700, textDecoration: 'underline' }}>
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
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Proceed</span>
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






