import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const THURSDAY_ZOOM_MEETING_ID = "84242212480";
const NON_PERSON_TOKENS = new Set([
  "iphone",
  "ipad",
  "android",
  "galaxy",
  "phone",
  "zoom",
  "user",
  "guest",
  "host",
  "cohost",
  "admin",
  "desktop",
  "laptop",
  "macbook",
  "pc",
  "meeting",
]);

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

function normalizeName(value = "") {
  return value
    .toLowerCase()
    .replace(/['’]s\s*(iphone|ipad|android|galaxy|phone|pc|macbook)$/gi, "")
    .replace(/\((iphone|ipad|android|galaxy|phone)\)$/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeName(value = "") {
  return normalizeName(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
}

function toDisplayToken(token = "") {
  if (!/[a-z]/.test(token)) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function applyExplicitCanonicalRules(name = "") {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "";
  if (/^chris\s+lipper\b/i.test(trimmed)) return "Chris Lipper";
  if (/^allen\s+g(?:\b|[^a-z0-9])/i.test(trimmed) || /^allen\s+godard\b/i.test(trimmed) || /^allen\s+goddard\b/i.test(trimmed)) {
    return "Allen Goddard";
  }
  if (/^josh\s+cougler\b/i.test(trimmed)) return "Josh Cougler";
  if (/^matt\s+s\b/i.test(trimmed)) return "Matt Shiebler";
  return "";
}

function inferFirstLastCanonical(name = "") {
  const tokens = tokenizeName(name);
  if (tokens.length < 3) return "";
  const first = tokens[0] || "";
  const last = tokens[1] || "";
  if (first.length < 2 || last.length < 2) return "";
  if (!/[a-z]/.test(first) || !/[a-z]/.test(last)) return "";
  if (NON_PERSON_TOKENS.has(first) || NON_PERSON_TOKENS.has(last)) return "";
  return `${toDisplayToken(first)} ${toDisplayToken(last)}`;
}

function canonicalizeName(name = "") {
  const explicit = applyExplicitCanonicalRules(name);
  if (explicit) return explicit;
  const inferred = inferFirstLastCanonical(name);
  if (inferred) return inferred;
  return String(name || "").trim();
}

function extractZoomMeetingId(urlValue: string | null | undefined) {
  const value = String(urlValue || "");
  const match = value.match(/\/j\/(\d{8,14})/i);
  return match ? match[1] : "";
}

function isThursdayEvent(startAt: string | null | undefined) {
  if (!startAt) return false;
  const day = new Date(startAt).getUTCDay();
  return day === 4;
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

function pickNearestByDate(rows: any[], targetDateKey: string) {
  if (!rows || rows.length === 0) return null;
  const targetTs = new Date(`${targetDateKey}T00:00:00.000Z`).getTime();

  let best = rows[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const dateKey = toDateKey(row?.createdate);
    if (!dateKey) continue;
    const ts = new Date(`${dateKey}T00:00:00.000Z`).getTime();
    const distance = Math.abs(ts - targetTs);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = row;
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

    const full = `${String(row?.firstname || "").trim()} ${String(row?.lastname || "").trim()}`.trim();
    const normalized = normalizeName(full);
    if (normalized) {
      if (!byName.has(normalized)) byName.set(normalized, []);
      byName.get(normalized)!.push(row);
    }
  }

  return { byEmail, byName };
}

function buildZoomSessionIndex(zoomRows: any[]) {
  const sessions = (zoomRows || [])
    .map((row) => {
      const dateKey = toDateKey(row?.metadata?.start_time || row?.metric_date);
      const meetingId = String(row?.metadata?.meeting_id || "");
      const groupName = String(row?.metadata?.group_name || "");
      const dayType = meetingId === THURSDAY_ZOOM_MEETING_ID || groupName.toLowerCase() === "thursday"
        ? "Thursday"
        : "Other";

      const attendeesRaw = Array.isArray(row?.metadata?.attendees) ? row.metadata.attendees : [];
      const attendees = attendeesRaw
        .map((x: any) => String(x || "").trim())
        .filter(Boolean);

      const attendeeMap = new Map<string, string>();
      attendees.forEach((name: string) => {
        const canonicalName = canonicalizeName(name);
        const key = normalizeName(canonicalName);
        if (key && !attendeeMap.has(key)) attendeeMap.set(key, canonicalName);
      });

      return { dateKey, dayType, attendeeMap };
    })
    .filter((row) => !!row.dateKey && row.dayType === "Thursday")
    .sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));

  const firstSeenByName = new Map<string, string>();
  for (const session of sessions) {
    for (const key of session.attendeeMap.keys()) {
      if (!firstSeenByName.has(key)) {
        firstSeenByName.set(key, String(session.dateKey));
      }
    }
  }

  return { sessions, firstSeenByName };
}

function matchZoomThursday(
  guestName: string,
  eventDateKey: string,
  zoomIndex: ReturnType<typeof buildZoomSessionIndex>,
) {
  const normalizedGuest = normalizeName(canonicalizeName(guestName));
  if (!normalizedGuest) {
    return { matched: false, matchedDate: null, matchedName: null, matchedNetNew: false };
  }

  const candidates = zoomIndex.sessions.filter((session) => {
    if (!session.dateKey) return false;
    const diff = Math.abs(new Date(`${session.dateKey}T00:00:00.000Z`).getTime() - new Date(`${eventDateKey}T00:00:00.000Z`).getTime());
    const diffDays = Math.round(diff / (1000 * 60 * 60 * 24));
    return diffDays <= 1;
  });

  for (const session of candidates) {
    for (const [attendeeKey, attendeeName] of session.attendeeMap.entries()) {
      const minLen = Math.min(attendeeKey.length, normalizedGuest.length);
      if (minLen < 5) continue;

      const isDirect = attendeeKey === normalizedGuest;
      const isContains = attendeeKey.includes(normalizedGuest) || normalizedGuest.includes(attendeeKey);
      if (!isDirect && !isContains) continue;

      const firstSeenDate = zoomIndex.firstSeenByName.get(attendeeKey) || "";
      return {
        matched: true,
        matchedDate: session.dateKey,
        matchedName: attendeeName,
        matchedNetNew: !!firstSeenDate && firstSeenDate === session.dateKey,
      };
    }
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

        const meetingId = extractZoomMeetingId(event?.zoom_meeting_url || event?.meeting_url);
        const thursdayByDay = isThursdayEvent(event?.start_at);
        const thursdayByMeeting = meetingId === THURSDAY_ZOOM_MEETING_ID;
        return thursdayByDay || thursdayByMeeting;
      });

    const { data: hubspotRows, error: hubspotError } = await supabase
      .from("raw_hubspot_contacts")
      .select("hubspot_contact_id,createdate,email,firstname,lastname,annual_revenue_in_dollars,hs_analytics_source_data_2,campaign,membership_s")
      .gte("createdate", `${addDays(startKey, -365)}T00:00:00.000Z`)
      .lte("createdate", `${endKey}T23:59:59.999Z`)
      .order("createdate", { ascending: true });

    if (hubspotError) throw new Error(`Failed loading HubSpot contacts: ${hubspotError.message}`);

    const { data: zoomRows, error: zoomError } = await supabase
      .from("kpi_metrics")
      .select("metric_name,metric_date,metadata")
      .eq("metric_name", "Zoom Meeting Attendees")
      .gte("metric_date", addDays(startKey, -2))
      .lte("metric_date", addDays(endKey, 2))
      .order("metric_date", { ascending: true });

    if (zoomError) throw new Error(`Failed loading Zoom attendees: ${zoomError.message}`);

    const hubspotIndex = buildHubspotIndexes(hubspotRows || []);
    const zoomIndex = buildZoomSessionIndex(zoomRows || []);

    const rows: any[] = [];
    let totalGuestsFetched = 0;

    for (const event of candidateEvents) {
      const eventApiId = String(event.api_id || event.id || "");
      if (!eventApiId) continue;

      const eventDate = toDateKey(event.start_at);
      if (!eventDate) continue;

      const guests = await fetchLumaGuests(lumaApiKey, eventApiId);
      totalGuestsFetched += guests.length;

      const zoomMeetingId = extractZoomMeetingId(event.zoom_meeting_url || event.meeting_url);
      const thursdayFlag = isThursdayEvent(event.start_at) || zoomMeetingId === THURSDAY_ZOOM_MEETING_ID;

      for (const entry of guests) {
        const guest = entry?.guest || {};
        const guestApiId = String(guest.api_id || entry?.api_id || "");
        if (!guestApiId) continue;

        const guestEmail = String(guest.user_email || guest.email || "").trim().toLowerCase();
        const guestName = String(guest.user_name || guest.name || "").trim();
        const normalizedGuestName = normalizeName(guestName);

        const emailCandidates = guestEmail ? (hubspotIndex.byEmail.get(guestEmail) || []) : [];
        const nameCandidates = normalizedGuestName ? (hubspotIndex.byName.get(normalizedGuestName) || []) : [];
        const hubspotMatch = pickNearestByDate(
          emailCandidates.length > 0 ? emailCandidates : nameCandidates,
          eventDate,
        );

        const hubspotRevenue = hubspotMatch?.annual_revenue_in_dollars ?? null;
        const hubspotTier = classifyHubspotTier(hubspotRevenue);
        const funnelKey = hubspotMatch ? classifyFunnelFromHubspot(hubspotMatch) : "free";

        const zoomMatch = matchZoomThursday(guestName, eventDate, zoomIndex);

        rows.push({
          event_api_id: eventApiId,
          event_name: String(event.name || ""),
          event_url: String(event.url || ""),
          event_start_at: event.start_at || null,
          event_date: eventDate,
          event_timezone: String(event.timezone || "America/New_York"),
          zoom_meeting_id: zoomMeetingId || null,
          is_thursday: thursdayFlag,
          guest_api_id: guestApiId,
          guest_name: guestName || null,
          guest_email: guestEmail || null,
          registered_at: guest.registered_at || null,
          joined_at: guest.joined_at || null,
          approval_status: String(guest.approval_status || ""),
          custom_source: guest.custom_source || null,
          registration_answers: Array.isArray(guest.registration_answers) ? guest.registration_answers : [],
          matched_zoom: zoomMatch.matched,
          matched_zoom_date: zoomMatch.matchedDate,
          matched_zoom_name: zoomMatch.matchedName,
          matched_zoom_net_new: zoomMatch.matchedNetNew,
          matched_hubspot: !!hubspotMatch,
          matched_hubspot_contact_id: hubspotMatch?.hubspot_contact_id ?? null,
          matched_hubspot_name: hubspotMatch ? `${String(hubspotMatch.firstname || "").trim()} ${String(hubspotMatch.lastname || "").trim()}`.trim() : null,
          matched_hubspot_email: hubspotMatch?.email || null,
          matched_hubspot_revenue: hubspotRevenue,
          matched_hubspot_tier: hubspotMatch ? hubspotTier : null,
          funnel_key: funnelKey,
          event_payload: event,
          guest_payload: guest,
          updated_at: new Date().toISOString(),
        });
      }
    }

    const upserted = await upsertRows(supabase, rows);
    const approvedRows = rows.filter((row) => String(row.approval_status).toLowerCase() === "approved");

    return new Response(
      JSON.stringify({
        ok: true,
        lookback_days: lookbackDays,
        events_considered: candidateEvents.length,
        guests_fetched: totalGuestsFetched,
        rows_prepared: rows.length,
        rows_upserted: upserted,
        approved_registrations: approvedRows.length,
        zoom_matches: approvedRows.filter((row) => row.matched_zoom).length,
        zoom_net_new_matches: approvedRows.filter((row) => row.matched_zoom_net_new).length,
        hubspot_matches: approvedRows.filter((row) => row.matched_hubspot).length,
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
