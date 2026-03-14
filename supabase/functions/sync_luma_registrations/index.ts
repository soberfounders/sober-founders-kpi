import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const ET_TIMEZONE = "America/New_York";
const THURSDAY_EXPECTED_ET_MINUTES = 11 * 60;
const GROUP_CALL_TIME_TOLERANCE_MINUTES = 120;
const THURSDAY_TITLE_HINTS = [
  "mastermind",
  "all are welcome",
  "entrepreneur's big book",
  "big book",
];
const CROSS_EMAIL_NAME_MATCH_MAX_HOURS = 720;
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function mustGetEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function toDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toTimestampDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKeyDiffDays(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const left = new Date(`${a}T00:00:00.000Z`);
  const right = new Date(`${b}T00:00:00.000Z`);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return null;
  return Math.round(Math.abs(left.getTime() - right.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeName(value = "") {
  return value
    .toLowerCase()
    .replace(/['â€™]s\s*(iphone|ipad|android|galaxy|phone|pc|macbook)$/gi, "")
    .replace(/\((iphone|ipad|android|galaxy|phone)\)$/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLegacyMeetingId(urlValue: string | null | undefined) {
  const value = String(urlValue || "");
  const match = value.match(/\/j\/(\d{8,14})/i);
  return match ? match[1] : "";
}

function isThursdayEvent(startAt: string | null | undefined) {
  const parsed = toTimestampDate(startAt);
  if (!parsed) return false;
  return ET_WEEKDAY_FORMATTER.format(parsed) === "Thu";
}

function etDateKey(value: unknown): string | null {
  const parsed = toTimestampDate(value);
  return parsed ? ET_DATE_FORMATTER.format(parsed) : null;
}

function etMinuteOfDay(value: unknown): number | null {
  const parsed = toTimestampDate(value);
  if (!parsed) return null;
  const parts = ET_TIME_PARTS_FORMATTER.formatToParts(parsed);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || NaN);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || NaN);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return (hour * 60) + minute;
}

function classifyHubspotTier(revenue: unknown): "standard" | "qualified" | "great" {
  const n = Number(revenue);
  if (!Number.isFinite(n)) return "standard";
  if (n > 1_000_000) return "great";
  if (n >= 250_000 && n <= 1_000_000) return "qualified";
  return "standard";
}

function classifyFunnelFromHubspot(row: any): "free" | "phoenix" {
  const blob = [
    row?.hs_analytics_source_data_2,
    row?.campaign,
    row?.membership_s,
  ].join(" ").toLowerCase();
  return blob.includes("phoenix") ? "phoenix" : "free";
}

async function fetchLumaPage(path: string, apiKey: string, params: Record<string, string> = {}) {
  const url = new URL(`https://public-api.luma.com/v1/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const resp = await fetch(url.toString(), {
    headers: {
      "x-luma-api-key": apiKey,
    },
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Lu.ma ${path} failed: ${resp.status} ${txt}`);
  }

  return await resp.json();
}

async function fetchLumaEvents(apiKey: string) {
  const out: any[] = [];
  let cursor = "";

  while (true) {
    const json = await fetchLumaPage("calendar/list-events", apiKey, cursor ? { pagination_cursor: cursor } : {});
    const entries = Array.isArray(json?.entries) ? json.entries : [];
    out.push(...entries);

    if (!json?.has_more || !json?.next_cursor) break;
    cursor = String(json.next_cursor);
  }

  return out;
}

async function fetchLumaGuests(apiKey: string, eventApiId: string) {
  const out: any[] = [];
  let cursor = "";

  while (true) {
    const params: Record<string, string> = { event_api_id: eventApiId };
    if (cursor) params.pagination_cursor = cursor;
    const json = await fetchLumaPage("event/get-guests", apiKey, params);

    const entries = Array.isArray(json?.entries) ? json.entries : [];
    out.push(...entries);

    if (!json?.has_more || !json?.next_cursor) break;
    cursor = String(json.next_cursor);
  }

  return out;
}

function toTimestamp(value: unknown): number | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
}

function parseEmailList(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

function pickNearestByTimestamp(rows: any[], targetTs: number | null, maxHours: number | null = null) {
  if (!rows || rows.length === 0) return null;

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const maxDistanceMs = maxHours === null ? null : maxHours * 60 * 60 * 1000;

  for (const row of rows) {
    const rowTs = toTimestamp(row?.createdate);
    if (rowTs === null) continue;

    const distance = targetTs === null ? 0 : Math.abs(rowTs - targetTs);
    if (maxDistanceMs !== null && targetTs !== null && distance > maxDistanceMs) continue;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = row;
    }
  }

  return best;
}

function hubspotCandidateScore(row: any): number {
  const officialRevenue = Number(row?.annual_revenue_in_dollars__official_);
  const fallbackRevenue = Number(row?.annual_revenue_in_dollars);
  const hasOfficialRevenue = Number.isFinite(officialRevenue);
  const hasFallbackRevenue = Number.isFinite(fallbackRevenue);
  const hasSobrietyDate = row?.sobriety_date !== null && row?.sobriety_date !== undefined && row?.sobriety_date !== "";
  let score = 0;
  if (hasOfficialRevenue) score += 4;
  else if (hasFallbackRevenue) score += 2;
  if (hasSobrietyDate) score += 1;
  return score;
}

function pickBestHubspotCandidate(rows: any[], targetTs: number | null, maxHours: number | null = null) {
  if (!rows || rows.length === 0) return null;

  const maxDistanceMs = maxHours === null ? null : maxHours * 60 * 60 * 1000;
  const scoped = rows.filter((row) => {
    const rowTs = toTimestamp(row?.createdate);
    if (rowTs === null) return false;
    if (maxDistanceMs === null || targetTs === null) return true;
    return Math.abs(rowTs - targetTs) <= maxDistanceMs;
  });

  if (scoped.length === 0) return null;

  // Prefer richer merged/contact records when available, then nearest timestamp.
  const enriched = scoped.filter((row) => hubspotCandidateScore(row) > 0);
  const pool = enriched.length > 0 ? enriched : scoped;

  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const row of pool) {
    const rowTs = toTimestamp(row?.createdate);
    if (rowTs === null) continue;
    const score = hubspotCandidateScore(row);
    const distance = targetTs === null ? 0 : Math.abs(rowTs - targetTs);
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = row;
      bestScore = score;
      bestDistance = distance;
    }
  }

  return best;
}

function buildHubspotIndexes(hubspotRows: any[]) {
  const byEmail = new Map<string, any[]>();
  const byName = new Map<string, any[]>();

  for (const row of hubspotRows || []) {
    const email = String(row?.email || "").trim().toLowerCase();
    if (email) {
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email)!.push(row);
    }

    for (const extraEmail of parseEmailList(row?.hs_additional_emails)) {
      if (!byEmail.has(extraEmail)) byEmail.set(extraEmail, []);
      byEmail.get(extraEmail)!.push(row);
    }

    const full = `${String(row?.firstname || "").trim()} ${String(row?.lastname || "").trim()}`.trim();
    const normalized = normalizeName(full);
    if (normalized) {
      if (!byName.has(normalized)) byName.set(normalized, []);
      byName.get(normalized)!.push(row);
    }
  }

  return { byEmail, byName };
}

function matchHubspotContact(
  guestEmail: string,
  normalizedGuestName: string,
  registeredAt: string | null | undefined,
  eventDateKey: string,
  hubspotIndex: ReturnType<typeof buildHubspotIndexes>,
) {
  const referenceTs =
    toTimestamp(registeredAt) ??
    toTimestamp(`${eventDateKey}T00:00:00.000Z`);

  const emailCandidates = guestEmail
    ? (hubspotIndex.byEmail.get(guestEmail) || [])
    : [];
  const emailMatch = pickBestHubspotCandidate(emailCandidates, referenceTs);
  if (emailMatch) {
    return {
      row: emailMatch,
      reason: "email_exact",
      isCrossEmail: false,
    };
  }

  if (!normalizedGuestName) {
    return { row: null, reason: "none", isCrossEmail: false };
  }

  const nameCandidates = hubspotIndex.byName.get(normalizedGuestName) || [];
  const strictNameCandidates = nameCandidates.filter((candidate) => {
    const full = `${String(candidate?.firstname || "").trim()} ${String(candidate?.lastname || "").trim()}`.trim();
    return normalizeName(full) === normalizedGuestName;
  });
  const nameMatch = pickBestHubspotCandidate(
    strictNameCandidates,
    referenceTs,
    CROSS_EMAIL_NAME_MATCH_MAX_HOURS,
  );
  if (!nameMatch) {
    return { row: null, reason: "none", isCrossEmail: false };
  }

  const matchedEmail = String(nameMatch?.email || "").trim().toLowerCase();
  const isCrossEmail = !!guestEmail && !!matchedEmail && matchedEmail !== guestEmail;

  return {
    row: nameMatch,
    reason: "name_72h",
    isCrossEmail,
  };
}

function classifyHubspotThursdaySession(activity: any) {
  const activityId = Number(activity?.hubspot_activity_id);
  const activityType = String(activity?.activity_type || "").toLowerCase();
  if (!Number.isFinite(activityId) || (activityType !== "call" && activityType !== "meeting")) return null;

  const timestamp = toTimestampDate(activity?.hs_timestamp || activity?.created_at_hubspot || activity?.created_at);
  if (!timestamp) return null;

  const title = String(activity?.title || "").toLowerCase();
  const dayShort = ET_WEEKDAY_FORMATTER.format(timestamp);
  const minuteOfDay = etMinuteOfDay(timestamp);
  const titleLooksThursday = THURSDAY_TITLE_HINTS.some((token) => title.includes(token)) && !title.includes("intro");

  if (!titleLooksThursday) {
    if (dayShort !== "Thu") return null;
    if (!Number.isFinite(minuteOfDay)) return null;
    if (Math.abs(Number(minuteOfDay) - THURSDAY_EXPECTED_ET_MINUTES) > GROUP_CALL_TIME_TOLERANCE_MINUTES) {
      return null;
    }
  }

  const dateKey = etDateKey(timestamp);
  if (!dateKey) return null;

  return {
    activityId,
    activityType,
    dateKey,
    title: String(activity?.title || ""),
  };
}

type ThursdayAttendanceSession = {
  activityId: number;
  activityType: string;
  dateKey: string;
  title: string;
  contactIds: Set<number>;
  emails: Set<string>;
};

function buildThursdayHubspotAttendanceIndex(activityRows: any[], associationRows: any[]) {
  const assocByActivityKey = new Map<string, { contactIds: Set<number>; emails: Set<string> }>();

  for (const row of associationRows || []) {
    const activityId = Number(row?.hubspot_activity_id);
    const activityType = String(row?.activity_type || "").toLowerCase();
    if (!Number.isFinite(activityId) || (activityType !== "call" && activityType !== "meeting")) continue;

    const key = `${activityType}:${activityId}`;
    if (!assocByActivityKey.has(key)) {
      assocByActivityKey.set(key, { contactIds: new Set<number>(), emails: new Set<string>() });
    }
    const bucket = assocByActivityKey.get(key)!;

    const contactId = Number(row?.hubspot_contact_id);
    if (Number.isFinite(contactId) && contactId > 0) bucket.contactIds.add(contactId);

    const email = String(row?.contact_email || "").trim().toLowerCase();
    if (email) bucket.emails.add(email);
  }

  const sessions: ThursdayAttendanceSession[] = (activityRows || [])
    .map((row) => {
      const classified = classifyHubspotThursdaySession(row);
      if (!classified) return null;
      const key = `${classified.activityType}:${classified.activityId}`;
      const assoc = assocByActivityKey.get(key);
      if (!assoc) return null;
      if (assoc.contactIds.size === 0 && assoc.emails.size === 0) return null;
      return {
        ...classified,
        contactIds: assoc.contactIds,
        emails: assoc.emails,
      };
    })
    .filter((row): row is ThursdayAttendanceSession => !!row)
    .sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));

  const firstSeenByContactId = new Map<number, string>();
  const firstSeenByEmail = new Map<string, string>();
  for (const session of sessions) {
    for (const contactId of session.contactIds) {
      if (!firstSeenByContactId.has(contactId)) firstSeenByContactId.set(contactId, session.dateKey);
    }
    for (const email of session.emails) {
      if (!firstSeenByEmail.has(email)) firstSeenByEmail.set(email, session.dateKey);
    }
  }

  return { sessions, firstSeenByContactId, firstSeenByEmail };
}

function matchThursdayAttendance(
  input: {
    guestEmail: string;
    eventDateKey: string;
    hubspotContactId: number | null;
    lumaMarkedAttended: boolean;
  },
  attendanceIndex: ReturnType<typeof buildThursdayHubspotAttendanceIndex>,
) {
  const email = String(input.guestEmail || "").trim().toLowerCase();
  const contactId = Number(input.hubspotContactId);
  const hasContactId = Number.isFinite(contactId) && contactId > 0;

  const nearbySessions = attendanceIndex.sessions.filter((session) => {
    const diffDays = dateKeyDiffDays(session.dateKey, input.eventDateKey);
    return Number.isFinite(diffDays) && Number(diffDays) <= 1;
  });

  for (const session of nearbySessions) {
    if (hasContactId && session.contactIds.has(contactId)) {
      const firstSeenDate = attendanceIndex.firstSeenByContactId.get(contactId);
      return {
        matched: true,
        matchedDate: session.dateKey,
        matchedName: "HubSpot call association",
        matchedNetNew: !!firstSeenDate && firstSeenDate === session.dateKey,
      };
    }
    if (email && session.emails.has(email)) {
      const firstSeenDate = attendanceIndex.firstSeenByEmail.get(email);
      return {
        matched: true,
        matchedDate: session.dateKey,
        matchedName: "HubSpot call attendee email",
        matchedNetNew: !!firstSeenDate && firstSeenDate === session.dateKey,
      };
    }
  }

  if (input.lumaMarkedAttended) {
    return {
      matched: true,
      matchedDate: input.eventDateKey,
      matchedName: "Lu.ma attended flag",
      matchedNetNew: false,
    };
  }

  return { matched: false, matchedDate: null, matchedName: null, matchedNetNew: false };
}

async function upsertRows(supabase: any, rows: any[]) {
  if (rows.length === 0) return 0;

  const chunkSize = 250;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("raw_luma_registrations")
      .upsert(chunk, { onConflict: "event_api_id,guest_api_id" })
      .select("id");

    if (error) throw new Error(`Failed upserting raw_luma_registrations: ${error.message}`);
    upserted += Array.isArray(data) ? data.length : 0;
  }

  return upserted;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = mustGetEnv("SUPABASE_URL");
    const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const lumaApiKey = mustGetEnv("LUMA_API_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const lookbackDays = Number(url.searchParams.get("lookback_days") || "120");
    const todayKey = new Date().toISOString().slice(0, 10);
    const startKey = addDays(todayKey, -(lookbackDays - 1));
    const endKey = addDays(todayKey, 7);

    const lumaEvents = await fetchLumaEvents(lumaApiKey);
    const candidateEvents = lumaEvents
      .map((entry) => entry?.event)
      .filter(Boolean)
      .filter((event) => {
        const dateKey = toDateKey(event?.start_at);
        if (!dateKey) return false;
        if (dateKey < startKey || dateKey > endKey) return false;
        return isThursdayEvent(event?.start_at);
      });

    const { data: hubspotRows, error: hubspotError } = await supabase
      .from("raw_hubspot_contacts")
      .select("hubspot_contact_id,createdate,email,hs_additional_emails,firstname,lastname,annual_revenue_in_dollars,annual_revenue_in_dollars__official_,sobriety_date,hs_analytics_source_data_2,campaign,membership_s")
      .gte("createdate", `${addDays(startKey, -365)}T00:00:00.000Z`)
      .lte("createdate", `${endKey}T23:59:59.999Z`)
      .order("createdate", { ascending: true });

    if (hubspotError) throw new Error(`Failed loading HubSpot contacts: ${hubspotError.message}`);

    const { data: hubspotActivityRows, error: hubspotActivityError } = await supabase
      .from("raw_hubspot_meeting_activities")
      .select("hubspot_activity_id,activity_type,hs_timestamp,created_at_hubspot,title")
      .gte("created_at_hubspot", `${addDays(startKey, -365)}T00:00:00.000Z`)
      .lte("created_at_hubspot", `${addDays(endKey, 2)}T23:59:59.999Z`)
      .order("created_at_hubspot", { ascending: true });

    if (hubspotActivityError) {
      throw new Error(`Failed loading HubSpot meeting activities: ${hubspotActivityError.message}`);
    }

    const activityIds = Array.from(new Set((hubspotActivityRows || [])
      .map((row: any) => Number(row?.hubspot_activity_id))
      .filter((value) => Number.isFinite(value) && value > 0)));
    const associationRows: any[] = [];
    const assocChunkSize = 500;
    for (let idx = 0; idx < activityIds.length; idx += assocChunkSize) {
      const chunk = activityIds.slice(idx, idx + assocChunkSize);
      const { data: assocChunkRows, error: assocError } = await supabase
        .from("raw_hubspot_activity_contact_associations")
        .select("hubspot_activity_id,activity_type,hubspot_contact_id,contact_email")
        .in("hubspot_activity_id", chunk)
        .in("activity_type", ["call", "meeting"]);
      if (assocError) {
        throw new Error(`Failed loading HubSpot activity associations: ${assocError.message}`);
      }
      associationRows.push(...(assocChunkRows || []));
    }

    const hubspotIndex = buildHubspotIndexes(hubspotRows || []);
    const attendanceIndex = buildThursdayHubspotAttendanceIndex(hubspotActivityRows || [], associationRows);
    const warnings: string[] = [];

    const rows: any[] = [];
    let totalGuestsFetched = 0;
    let hubspotEmailMatches = 0;
    let hubspotNameMatches72h = 0;
    let hubspotCrossEmailMatches = 0;

    for (const event of candidateEvents) {
      const eventApiId = String(event.api_id || event.id || "");
      if (!eventApiId) continue;

      const eventDate = toDateKey(event.start_at);
      if (!eventDate) continue;

      const guests = await fetchLumaGuests(lumaApiKey, eventApiId);
      totalGuestsFetched += guests.length;

      const legacyMeetingId = extractLegacyMeetingId(event.zoom_meeting_url || event.meeting_url);
      const thursdayFlag = isThursdayEvent(event.start_at);

      for (const entry of guests) {
        const guest = entry?.guest || {};
        const guestApiId = String(guest.api_id || entry?.api_id || "");
        if (!guestApiId) continue;

        const guestEmail = String(guest.user_email || guest.email || "").trim().toLowerCase();
        const guestName = String(guest.user_name || guest.name || "").trim();
        const normalizedGuestName = normalizeName(guestName);
        const hubspotMatchMeta = matchHubspotContact(
          guestEmail,
          normalizedGuestName,
          guest.registered_at || null,
          eventDate,
          hubspotIndex,
        );
        const hubspotMatch = hubspotMatchMeta.row;
        if (hubspotMatchMeta.reason === "email_exact") hubspotEmailMatches += 1;
        if (hubspotMatchMeta.reason === "name_72h") hubspotNameMatches72h += 1;
        if (hubspotMatchMeta.isCrossEmail) hubspotCrossEmailMatches += 1;

        const hubspotRevenue =
          hubspotMatch?.annual_revenue_in_dollars__official_ ??
          hubspotMatch?.annual_revenue_in_dollars ??
          null;
        const hubspotTier = classifyHubspotTier(hubspotRevenue);
        const funnelKey = hubspotMatch ? classifyFunnelFromHubspot(hubspotMatch) : "free";

        const matchedHubspotContactIdRaw = Number(hubspotMatch?.hubspot_contact_id);
        const matchedHubspotContactId = Number.isFinite(matchedHubspotContactIdRaw) && matchedHubspotContactIdRaw > 0
          ? matchedHubspotContactIdRaw
          : null;
        const lumaMarkedAttended = !!toTimestamp(guest.joined_at || guest.checked_in_at || guest.attended_at);
        const attendanceMatch = matchThursdayAttendance(
          {
            guestEmail,
            eventDateKey: eventDate,
            hubspotContactId: matchedHubspotContactId,
            lumaMarkedAttended,
          },
          attendanceIndex,
        );

        rows.push({
          event_api_id: eventApiId,
          event_name: String(event.name || ""),
          event_url: String(event.url || ""),
          event_start_at: event.start_at || null,
          event_date: eventDate,
          event_timezone: String(event.timezone || "America/New_York"),
          zoom_meeting_id: legacyMeetingId || null,
          is_thursday: thursdayFlag,
          guest_api_id: guestApiId,
          guest_name: guestName || null,
          guest_email: guestEmail || null,
          registered_at: guest.registered_at || null,
          joined_at: guest.joined_at || null,
          approval_status: String(guest.approval_status || ""),
          custom_source: guest.custom_source || null,
          registration_answers: Array.isArray(guest.registration_answers) ? guest.registration_answers : [],
          matched_attendance: attendanceMatch.matched,
          matched_attendance_date: attendanceMatch.matchedDate,
          matched_attendance_name: attendanceMatch.matchedName,
          matched_attendance_net_new: attendanceMatch.matchedNetNew,
          matched_zoom: attendanceMatch.matched,
          matched_zoom_date: attendanceMatch.matchedDate,
          matched_zoom_name: attendanceMatch.matchedName,
          matched_zoom_net_new: attendanceMatch.matchedNetNew,
          matched_hubspot: !!hubspotMatch,
          matched_hubspot_contact_id: matchedHubspotContactId,
          matched_hubspot_name: hubspotMatch ? `${String(hubspotMatch.firstname || "").trim()} ${String(hubspotMatch.lastname || "").trim()}`.trim() : null,
          matched_hubspot_email: hubspotMatch?.email || null,
          matched_hubspot_revenue: hubspotRevenue,
          matched_hubspot_tier: hubspotMatch ? hubspotTier : null,
          funnel_key: funnelKey,
          event_payload: event,
          guest_payload: {
            ...guest,
            _hubspot_match_reason: hubspotMatchMeta.reason,
            _hubspot_cross_email: hubspotMatchMeta.isCrossEmail,
          },
          updated_at: new Date().toISOString(),
        });
      }
    }

    const upserted = await upsertRows(supabase, rows);
    const approvedRows = rows.filter((row) => String(row.approval_status).toLowerCase() === "approved");
    const attendanceMatches = approvedRows.filter((row) => row.matched_attendance ?? row.matched_zoom).length;
    const attendanceNetNewMatches = approvedRows.filter((row) => row.matched_attendance_net_new ?? row.matched_zoom_net_new).length;

    return new Response(
      JSON.stringify({
        ok: true,
        lookback_days: lookbackDays,
        events_considered: candidateEvents.length,
        guests_fetched: totalGuestsFetched,
        rows_prepared: rows.length,
        rows_upserted: upserted,
        approved_registrations: approvedRows.length,
        attendance_matches: attendanceMatches,
        attendance_net_new_matches: attendanceNetNewMatches,
        zoom_matches: attendanceMatches,
        zoom_net_new_matches: attendanceNetNewMatches,
        hubspot_matches: approvedRows.filter((row) => row.matched_hubspot).length,
        hubspot_email_matches: hubspotEmailMatches,
        hubspot_name_matches_72h: hubspotNameMatches72h,
        hubspot_cross_email_matches: hubspotCrossEmailMatches,
        warnings,
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (e: any) {
    console.error("sync_luma_registrations error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
