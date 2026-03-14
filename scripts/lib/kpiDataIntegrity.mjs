import {
  evaluateLeadQualification,
  extractRevenueSignals,
  leadQualityTierFromOfficialRevenue,
  parseSobrietyDate,
} from "../../dashboard/src/lib/leadsQualificationRules.js";

const ET_TIMEZONE = "America/New_York";
const GROUP_CALL_ET_MINUTES = Object.freeze({
  Tuesday: 12 * 60,
  Thursday: 11 * 60,
});
const GROUP_CALL_TIME_TOLERANCE_MINUTES = 120;

const ET_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIMEZONE,
  weekday: "short",
});

const ET_TIME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIMEZONE,
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

const ET_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: ET_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parseDateOrNull(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toDateKeyUtc(value) {
  const parsed = parseDateOrNull(value);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
}

export function dateDiffDays(referenceDate, valueDate) {
  const ref = parseDateOrNull(referenceDate);
  const value = parseDateOrNull(valueDate);
  if (!ref || !value) return null;
  const refUtc = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  const valueUtc = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  return Math.floor((refUtc - valueUtc) / 86400000);
}

function normalizeWindowList(windows = [7, 30, 90]) {
  const normalized = (Array.isArray(windows) ? windows : [7, 30, 90])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value));
  if (!normalized.length) return [7, 30, 90];
  return Array.from(new Set(normalized)).sort((a, b) => a - b);
}

function buildWindowBuckets(windows = [7, 30, 90]) {
  const windowList = normalizeWindowList(windows);
  const buckets = new Map();
  for (const windowDays of windowList) {
    buckets.set(windowDays, {
      window_days: windowDays,
      total_count: 0,
      qualified_count: 0,
      official_qualified_count: 0,
      fallback_qualified_count: 0,
      good_count: 0,
      great_count: 0,
      missing_revenue_count: 0,
      missing_sobriety_count: 0,
    });
  }
  return buckets;
}

export function summarizeLeadsIntegrity(rows = [], options = {}) {
  const referenceDate = parseDateOrNull(options.referenceDate) || new Date();
  const buckets = buildWindowBuckets(options.windows);
  const leadRows = Array.isArray(rows) ? rows : [];

  for (const row of leadRows) {
    const createdDate = parseDateOrNull(row?.createdate ?? row?.created_at ?? row?.createdAt);
    const dayDelta = dateDiffDays(referenceDate, createdDate);
    if (!Number.isFinite(dayDelta) || dayDelta < 0) continue;

    const revenueInput = {
      annual_revenue_in_dollars__official_: row?.annual_revenue_in_dollars__official_,
      annual_revenue_in_usd_official: row?.annual_revenue_in_usd_official,
      annual_revenue_in_dollars: row?.annual_revenue_in_dollars,
      annual_revenue: row?.annual_revenue,
      revenue: row?.revenue,
    };
    const sobrietyInput = {
      sobriety_date__official_: row?.sobriety_date__official_,
      sobriety_date: row?.sobriety_date,
      sober_date: row?.sober_date,
      clean_date: row?.clean_date,
    };

    const qualification = evaluateLeadQualification({
      revenue: revenueInput,
      sobrietyDate: sobrietyInput,
      referenceDate,
    });
    const revenueSignals = extractRevenueSignals(revenueInput);
    const sobrietyDate = parseSobrietyDate(sobrietyInput);
    const tier = leadQualityTierFromOfficialRevenue(revenueInput);

    for (const bucket of buckets.values()) {
      if (dayDelta >= bucket.window_days) continue;

      bucket.total_count += 1;
      if (qualification.qualified) bucket.qualified_count += 1;
      if (qualification.qualificationBasis === "official") bucket.official_qualified_count += 1;
      if (qualification.qualificationBasis === "fallback") bucket.fallback_qualified_count += 1;
      if (tier === "good") bucket.good_count += 1;
      if (tier === "great") bucket.great_count += 1;
      if (revenueSignals.officialRevenue === null && revenueSignals.fallbackRevenue === null) {
        bucket.missing_revenue_count += 1;
      }
      if (!sobrietyDate) bucket.missing_sobriety_count += 1;
    }
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    qualified_pct: bucket.total_count > 0 ? bucket.qualified_count / bucket.total_count : null,
    fallback_share_pct: bucket.qualified_count > 0
      ? bucket.fallback_qualified_count / bucket.qualified_count
      : null,
    missing_revenue_pct: bucket.total_count > 0
      ? bucket.missing_revenue_count / bucket.total_count
      : null,
    missing_sobriety_pct: bucket.total_count > 0
      ? bucket.missing_sobriety_count / bucket.total_count
      : null,
  }));
}

function etWeekdayGroupFromDate(dateLike) {
  const parsed = parseDateOrNull(dateLike);
  if (!parsed) return null;
  const weekdayShort = ET_WEEKDAY_FORMATTER.format(parsed);
  if (weekdayShort === "Tue") return "Tuesday";
  if (weekdayShort === "Thu") return "Thursday";
  return null;
}

function etMinuteOfDay(dateLike) {
  const parsed = parseDateOrNull(dateLike);
  if (!parsed) return null;
  const parts = ET_TIME_PARTS_FORMATTER.formatToParts(parsed);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || NaN);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || NaN);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return (hour * 60) + minute;
}

function etDateKey(dateLike) {
  const parsed = parseDateOrNull(dateLike);
  return parsed ? ET_DATE_FORMATTER.format(parsed) : null;
}

function classifyHubspotGroupSession(activity = {}) {
  const timestamp = parseDateOrNull(activity?.hs_timestamp || activity?.created_at_hubspot || activity?.created_at);
  if (!timestamp) return null;

  const title = String(activity?.title || "").toLowerCase();
  if (title.includes("tactic tuesday")) {
    return { group_type: "Tuesday", date_key: etDateKey(timestamp), is_near_scheduled: true };
  }
  if (
    (title.includes("mastermind") && !title.includes("intro"))
    || title.includes("all are welcome")
    || title.includes("entrepreneur's big book")
    || title.includes("big book")
  ) {
    return { group_type: "Thursday", date_key: etDateKey(timestamp), is_near_scheduled: true };
  }

  const groupType = etWeekdayGroupFromDate(timestamp);
  if (!groupType) return null;
  const minuteOfDay = etMinuteOfDay(timestamp);
  if (!Number.isFinite(minuteOfDay)) return null;
  const expectedMinute = GROUP_CALL_ET_MINUTES[groupType];
  const minutesFromExpected = Math.abs(minuteOfDay - expectedMinute);
  const isNearScheduled = minutesFromExpected <= GROUP_CALL_TIME_TOLERANCE_MINUTES;
  if (!isNearScheduled) return null;

  return {
    group_type: groupType,
    date_key: etDateKey(timestamp),
    is_near_scheduled: true,
  };
}

export function summarizeAttendanceIntegrity(
  activities = [],
  associations = [],
  options = {},
) {
  const referenceDate = parseDateOrNull(options.referenceDate) || new Date();
  const buckets = buildWindowBuckets(options.windows);
  const activityRows = Array.isArray(activities) ? activities : [];
  const associationRows = Array.isArray(associations) ? associations : [];
  const assocsByActivity = new Map();

  for (const row of associationRows) {
    const activityId = Number(row?.hubspot_activity_id);
    const activityType = String(row?.activity_type || "").toLowerCase();
    const contactId = Number(row?.hubspot_contact_id);
    if (!Number.isFinite(activityId) || !Number.isFinite(contactId)) continue;
    if (activityType !== "call" && activityType !== "meeting") continue;
    const key = `${activityType}:${activityId}`;
    if (!assocsByActivity.has(key)) assocsByActivity.set(key, new Set());
    assocsByActivity.get(key).add(contactId);
  }

  const sessions = [];
  for (const activity of activityRows) {
    const activityId = Number(activity?.hubspot_activity_id);
    const activityType = String(activity?.activity_type || "").toLowerCase();
    if (!Number.isFinite(activityId)) continue;
    if (activityType !== "call" && activityType !== "meeting") continue;
    const classification = classifyHubspotGroupSession(activity);
    if (!classification?.group_type || !classification?.date_key) continue;
    const assocKey = `${activityType}:${activityId}`;
    const contactIds = assocsByActivity.get(assocKey) || new Set();
    if (!contactIds.size) continue;

    sessions.push({
      group_type: classification.group_type,
      date_key: classification.date_key,
      contact_ids: [...contactIds],
    });
  }

  for (const bucket of buckets.values()) {
    const firstSeenByContact = new Map();
    const uniqueTue = new Set();
    const uniqueThu = new Set();
    let attendanceEvents = 0;
    let tuesdaySessions = 0;
    let thursdaySessions = 0;

    for (const session of sessions) {
      const dayDelta = dateDiffDays(referenceDate, `${session.date_key}T00:00:00.000Z`);
      if (!Number.isFinite(dayDelta) || dayDelta < 0 || dayDelta >= bucket.window_days) continue;

      if (session.group_type === "Tuesday") tuesdaySessions += 1;
      if (session.group_type === "Thursday") thursdaySessions += 1;

      attendanceEvents += session.contact_ids.length;
      for (const contactId of session.contact_ids) {
        if (session.group_type === "Tuesday") uniqueTue.add(contactId);
        if (session.group_type === "Thursday") uniqueThu.add(contactId);
        const previous = firstSeenByContact.get(contactId);
        if (!previous || session.date_key < previous) firstSeenByContact.set(contactId, session.date_key);
      }
    }

    const distinctContacts = new Set([...uniqueTue, ...uniqueThu]);
    bucket.attendance_tuesday_session_count = tuesdaySessions;
    bucket.attendance_thursday_session_count = thursdaySessions;
    bucket.attendance_tuesday_unique_contacts = uniqueTue.size;
    bucket.attendance_thursday_unique_contacts = uniqueThu.size;
    bucket.attendance_total_events = attendanceEvents;
    bucket.attendance_distinct_contacts = distinctContacts.size;
    bucket.attendance_new_attendees_count = firstSeenByContact.size;
    bucket.attendance_avg_per_person = distinctContacts.size > 0
      ? attendanceEvents / distinctContacts.size
      : null;
  }

  return Array.from(buckets.values()).map((bucket) => ({
    window_days: bucket.window_days,
    tuesday_session_count: bucket.attendance_tuesday_session_count || 0,
    thursday_session_count: bucket.attendance_thursday_session_count || 0,
    tuesday_unique_contacts: bucket.attendance_tuesday_unique_contacts || 0,
    thursday_unique_contacts: bucket.attendance_thursday_unique_contacts || 0,
    total_attendance_events: bucket.attendance_total_events || 0,
    distinct_contacts: bucket.attendance_distinct_contacts || 0,
    new_attendees_count: bucket.attendance_new_attendees_count || 0,
    avg_attendance_per_person: bucket.attendance_avg_per_person,
  }));
}

export function compareNumberWithTolerance(a, b, tolerance = 0.0001) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= tolerance;
}
