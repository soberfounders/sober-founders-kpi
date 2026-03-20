import { computeChangePct } from './leadsGroupAnalytics.js';

export const KPI_DIRECTION = {
  HIGHER_IS_BETTER: 'higher_is_better',
  LOWER_IS_BETTER: 'lower_is_better',
};

export const DONATION_EXCLUDED_STATUSES = Object.freeze([
  'refunded', 'refund', 'failed', 'void', 'voided', 'canceled', 'cancelled',
]);

const _donationExcludedSet = new Set(DONATION_EXCLUDED_STATUSES);

export function isDonationExcludedStatus(status) {
  return _donationExcludedSet.has(normalizeText(status));
}

export function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizePersonKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function toDateKey(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toUtcDate(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function addDays(dateKey, days) {
  const date = toUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

export function mondayOfWeek(dateKey) {
  const date = toUtcDate(dateKey);
  const day = date.getUTCDay();
  const offsetToMon = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offsetToMon);
  return toDateKey(date);
}

export function dateInRange(dateKey, startKey, endKey) {
  return !!dateKey && dateKey >= startKey && dateKey <= endKey;
}

export function formatInt(value) {
  if (!Number.isFinite(Number(value))) return 'N/A';
  return Math.round(Number(value)).toLocaleString();
}

export function formatDecimal(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return 'N/A';
  return Number(value).toFixed(digits);
}

export function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return 'N/A';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

export function formatValueByType(value, format) {
  if (format === 'currency') return formatCurrency(value);
  if (format === 'decimal') return formatDecimal(value);
  if (format === 'percent') return formatPercent(value);
  return formatInt(value);
}

export function directionToneForDelta(delta, direction) {
  if (!Number.isFinite(Number(delta)) || Number(delta) === 0) return 'neutral';
  const isImprovement = direction === KPI_DIRECTION.LOWER_IS_BETTER
    ? Number(delta) < 0
    : Number(delta) > 0;
  return isImprovement ? 'better' : 'worse';
}

function formatSignedNumber(raw, digits = 1) {
  if (!Number.isFinite(Number(raw))) return 'N/A';
  const value = Number(raw);
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function formatSignedDelta(value, format) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'N/A';

  if (format === 'currency') {
    const abs = formatCurrency(Math.abs(numeric));
    return `${numeric >= 0 ? '+' : '-'}${abs}`;
  }
  if (format === 'decimal') {
    return `${numeric >= 0 ? '+' : ''}${formatDecimal(numeric)}`;
  }
  if (format === 'percent') {
    return `${numeric >= 0 ? '+' : ''}${formatPercent(numeric)}`;
  }
  return `${numeric >= 0 ? '+' : ''}${formatInt(numeric)}`;
}

export function buildDirectionalComparison({ label, current, baseline, format, direction }) {
  const currentNumber = Number(current);
  const baselineNumber = Number(baseline);

  if (!Number.isFinite(currentNumber) || !Number.isFinite(baselineNumber)) {
    return {
      label,
      delta: null,
      pct: null,
      tone: 'neutral',
      display: 'N/A',
    };
  }

  const delta = currentNumber - baselineNumber;
  const pct = baselineNumber === 0
    ? (currentNumber === 0 ? 0 : null)
    : computeChangePct(currentNumber, baselineNumber)?.pct;
  const tone = directionToneForDelta(delta, direction);
  const deltaText = formatSignedDelta(delta, format);
  const pctText = pct === null || pct === undefined ? '' : ` (${formatSignedNumber(pct * 100)})`;

  return {
    label,
    delta,
    pct,
    tone,
    display: `${deltaText}${pctText}`.trim(),
  };
}

export function buildCompletedWeekWindows(todayKey) {
  const currentWeekStart = mondayOfWeek(todayKey);
  const lastWeekEnd = addDays(currentWeekStart, -1);
  const lastWeekStart = mondayOfWeek(lastWeekEnd);

  const completedWeeks = [];
  let cursorStart = lastWeekStart;
  for (let idx = 0; idx < 4; idx += 1) {
    const start = cursorStart;
    const end = addDays(start, 6);
    completedWeeks.push({
      start,
      end,
      label: `Week of ${start}`,
    });
    cursorStart = addDays(start, -7);
  }

  return {
    lastWeek: completedWeeks[0],
    lastFourCompletedWeeks: completedWeeks,
  };
}

export function averageFinite(values = []) {
  const numbers = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function addAttendeeKey(keys, value) {
  if (value === null || value === undefined || value === '') return;
  const raw = String(value).trim();
  if (!raw) return;
  const normalizedEmail = raw.toLowerCase();
  if (normalizedEmail.includes('@')) {
    keys.add(`email:${normalizedEmail}`);
    return;
  }
  const personKey = normalizePersonKey(raw);
  if (personKey) keys.add(`name:${personKey}`);
}

function addAttendeeKeysFromEntry(keys, entry) {
  if (entry === null || entry === undefined) return;
  if (typeof entry === 'string') {
    addAttendeeKey(keys, entry);
    return;
  }
  if (typeof entry !== 'object') return;

  const directCandidates = [
    entry.name,
    entry.full_name,
    entry.display_name,
    entry.email,
    entry.contact_email,
    entry.person,
    entry.value,
    entry.hs_object_id,
    entry.contact_id,
    entry.hubspot_contact_id,
  ];
  directCandidates.forEach((candidate) => addAttendeeKey(keys, candidate));

  const nestedProperties = entry.properties && typeof entry.properties === 'object'
    ? entry.properties
    : null;
  if (nestedProperties) {
    [
      nestedProperties.firstname && nestedProperties.lastname
        ? `${nestedProperties.firstname} ${nestedProperties.lastname}`
        : null,
      nestedProperties.firstname,
      nestedProperties.lastname,
      nestedProperties.email,
      nestedProperties.hs_object_id,
      nestedProperties.contact_id,
      nestedProperties.hubspot_contact_id,
    ].forEach((candidate) => addAttendeeKey(keys, candidate));
  }
}

function inferAttendeeNameFromTitle(title) {
  const raw = String(title || '').trim();
  if (!raw) return null;
  const marker = 'sober founders intro meeting';
  const lowered = raw.toLowerCase();
  if (!lowered.includes(marker)) return null;

  const markerIndex = lowered.indexOf(marker);
  const prefix = raw.slice(0, markerIndex).trim();
  const suffix = raw.slice(markerIndex + marker.length).trim();
  const candidate = prefix || suffix;
  if (!candidate) return null;
  const cleaned = candidate.replace(/^[\s\-:|]+|[\s\-:|]+$/g, '').trim();
  return cleaned || null;
}

function collectAttendeeKeys(row) {
  const keys = new Set();
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};

  const arrayCandidates = [
    metadata.attendees,
    metadata.participants,
    metadata.participant_names,
    metadata.contact_names,
    metadata.contacts,
    metadata.associations,
    metadata.invitees,
  ];

  arrayCandidates.forEach((candidate) => {
    if (!Array.isArray(candidate)) return;
    candidate.forEach((entry) => addAttendeeKeysFromEntry(keys, entry));
  });

  const scalarCandidates = [
    metadata.contact_name,
    metadata.contact_email,
    metadata.email,
    metadata.participant_name,
    metadata.full_name,
    metadata.firstname && metadata.lastname ? `${metadata.firstname} ${metadata.lastname}` : null,
    metadata.firstname,
    metadata.lastname,
    metadata.contact_id,
    metadata.hubspot_contact_id,
  ];
  scalarCandidates.forEach((candidate) => addAttendeeKey(keys, candidate));

  const inferredName = inferAttendeeNameFromTitle(row?.title);
  addAttendeeKey(keys, inferredName);

  return Array.from(keys);
}

export function normalizeInterviewActivities(rows = []) {
  return rows
    .map((row, index) => {
      // Use booking date (created_at_hubspot) so interviews count in the week
      // they were booked, not the week the meeting is scheduled to occur.
      const dateKey = toDateKey(row?.created_at_hubspot || row?.hs_timestamp);
      if (!dateKey) return null;

      const activityId = Number.isFinite(Number(row?.hubspot_activity_id))
        ? String(Math.trunc(Number(row.hubspot_activity_id)))
        : `idx-${index}-${dateKey}`;

      const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const meetingNameCandidates = [
        metadata.meeting_name,
        metadata.meetingName,
        metadata.meeting_title,
        metadata.meetingTitle,
        metadata.subject,
        metadata.title,
        row?.title,
      ]
        .map((candidate) => String(candidate || '').trim())
        .filter(Boolean);

      const meetingName = meetingNameCandidates[0] || '';
      const textBlob = [
        row?.title,
        row?.body_preview,
        meetingName,
        JSON.stringify(metadata || {}),
      ]
        .map((value) => normalizeText(value))
        .join(' ');

      const attendeeKeys = collectAttendeeKeys(row);

      return {
        dateKey,
        activityId,
        textBlob,
        meetingName: normalizeText(meetingName),
        attendeeKeys,
      };
    })
    .filter(Boolean);
}

export function countInterviewUniqueAttendees(rows, window, matcher) {
  const uniqueAttendees = new Set();
  rows.forEach((row) => {
    if (!dateInRange(row.dateKey, window.start, window.end)) return;
    if (!matcher(row)) return;
    if (row.attendeeKeys.length === 0) {
      uniqueAttendees.add(`activity:${row.activityId}`);
      return;
    }
    row.attendeeKeys.forEach((key) => uniqueAttendees.add(key));
  });
  return uniqueAttendees.size;
}

export function createMeetingNameMatcher(meetingNameFragment) {
  const normalized = normalizeText(meetingNameFragment);
  return (row) => row.meetingName.includes(normalized) || row.textBlob.includes(normalized);
}

export function createTokenMatcher(tokens = []) {
  const normalizedTokens = tokens.map((token) => normalizeText(token)).filter(Boolean);
  return (row) => normalizedTokens.some((token) => row.textBlob.includes(token));
}
