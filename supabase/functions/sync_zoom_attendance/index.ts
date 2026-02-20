
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const DEFAULT_MEETING_IDS = [
  "84242212480", // Current Thursday
  "87199667045", // Current Tuesday
  "88955819691", // Legacy Tuesday
  "87281602709", // May 22 2025
  "84386273638", // May 15 2025
  "83545648705", // May 29, June 5 2025
  "87554664757", // June 12 2025
  "88436852895", // June 19 2025
  "87223064478", // June 26 2025
  "85628653855", // July 3 2025
  "84094690584", // July 10 2025
  "87222781690", // July 17 2025
  "84573434607", // July 24 2025
  "87903520651", // July 31 2025
  "81429877571", // Aug 7 2025
  "89976085253", // Aug 14 2025
  "88161488935", // Aug 21 2025
  "89254612704"  // Aug 28 2025
];
const BOT_KEYWORDS = ["note", "notetaker", "fireflies.ai", "fathom", "read.ai", "otter.ai"];
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

function mustGetEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizeName(value = "") {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
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

function resolveAliasChain(name = "", aliasMap: Map<string, string>) {
  const fallback = String(name || "").trim();
  let current = fallback;
  let key = normalizeName(current);
  const seen = new Set<string>();

  for (let i = 0; i < 12; i += 1) {
    if (!key || seen.has(key)) break;
    seen.add(key);

    const next = aliasMap.get(key);
    if (!next) break;

    const nextTrimmed = String(next || "").trim();
    const nextKey = normalizeName(nextTrimmed);
    if (!nextTrimmed || !nextKey || nextKey === key) break;

    current = nextTrimmed;
    key = nextKey;
  }

  return current || fallback;
}

function resolveCanonicalName(rawName = "", aliasMap: Map<string, string>) {
  const aliased = resolveAliasChain(rawName, aliasMap);
  const explicit = applyExplicitCanonicalRules(aliased);
  if (explicit) return explicit;
  const firstLast = inferFirstLastCanonical(aliased);
  if (firstLast) return firstLast;
  return String(aliased || rawName || "").trim();
}

function cleanupNameForDedupe(value = "") {
  return normalizeName(value)
    .replace(/'s\s*(iphone|ipad|android|galaxy|phone|pc|macbook)$/i, "")
    .replace(/\s+\((iphone|ipad|android|galaxy|phone)\)$/i, "")
    .trim();
}

function maybeDoubleEncodeUuid(uuid: string) {
  const once = encodeURIComponent(uuid);
  if (uuid.includes("/") || uuid.includes("+")) return encodeURIComponent(once);
  return once;
}

function isMissingTableError(error: any) {
  const code = String(error?.code ?? "").toUpperCase();
  const message = String(error?.message ?? "").toLowerCase();
  return code === "PGRST205" || (message.includes("could not find the table") && message.includes("attendee_aliases"));
}

async function getZoomAccessToken(accountId: string, clientId: string, clientSecret: string) {
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Zoom auth failed: ${res.status} ${txt}`);
  }

  const json = await res.json();
  if (!json.access_token) throw new Error("Zoom auth succeeded but access_token missing");
  return json.access_token as string;
}

async function fetchMeetingInstances(accessToken: string, meetingId: string) {
  const all: any[] = [];
  let nextPageToken = "";
  let pageCount = 0;

  while (pageCount < 50) { 
    const url = new URL(`https://api.zoom.us/v2/past_meetings/${meetingId}/instances`);
    url.searchParams.set("page_size", "300");
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) return [];
    if (!res.ok) {
      return [];
    }

    const json = await res.json();
    all.push(...(json.meetings || []).map((m: any) => ({ ...m, meeting_id: meetingId })));

    nextPageToken = json.next_page_token || "";
    if (!nextPageToken) break;
    pageCount++;
  }
  return all;
}

async function fetchMeetingParticipants(accessToken: string, uuid: string) {
  const all: any[] = [];
  let nextPageToken = "";
  const encodedUuid = maybeDoubleEncodeUuid(uuid);
  let pageCount = 0;

  while (pageCount < 50) {
    const url = new URL(`https://api.zoom.us/v2/report/meetings/${encodedUuid}/participants`);
    url.searchParams.set("page_size", "300");
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) return [];
    if (!res.ok) {
      // Just return empty if fails, let main loop handle it (will skip)
      throw new Error(`Failed fetching participants for ${uuid}: ${res.status}`);
    }

    const json = await res.json();
    all.push(...(json.participants || []));

    nextPageToken = json.next_page_token || "";
    if (!nextPageToken) break;
    pageCount++;
  }
  return all;
}

async function getHubSpotSource(token: string, email: string) {
  if (!token) return { source: "Unknown (Missing Token)" };
  if (!email) return { source: "No Email" };

  try {
    const searchUrl = "https://api.hubapi.com/crm/v3/objects/contacts/search";
    const res = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: "email",
            operator: "EQ",
            value: email
          }]
        }],
        properties: ["hs_analytics_source", "hs_analytics_source_data_1", "hs_analytics_source_data_2"],
        limit: 1
      })
    });

    if (!res.ok) return { source: `API Error ${res.status}` };

    const data = await res.json();
    if (data.results && data.results.length > 0) {
       const props = data.results[0].properties;
       const source = props.hs_analytics_source || "Unknown";
       const detail = props.hs_analytics_source_data_1 || "";
       return { 
         source, 
         detail,
         full_source: detail ? `${source} (${detail})` : source
       };
    }
    return { source: "Not Found" };
  } catch (err) {
    console.error("HubSpot lookup error:", err);
    return { source: "Lookup Error" };
  }
}

function dedupeParticipants(participants: any[], aliasMap: Map<string, string>): Array<{ name: string; email?: string }> {
  if (!participants) return [];
  const winnerByKey = new Map<string, { name: string; email?: string; quality: number }>();

  for (const p of participants) {
    const rawName = String(p?.name ?? "").trim();
    const rawEmail = String(p?.user_email ?? "").trim().toLowerCase();
    if (!rawName) continue;

    const normalizedRaw = normalizeName(rawName);
    if (!normalizedRaw) continue;
    if (BOT_KEYWORDS.some((k) => normalizedRaw.includes(k))) continue;

    const aliasedName = resolveCanonicalName(rawName, aliasMap);
    const cleaned = cleanupNameForDedupe(aliasedName);
    if (!cleaned) continue;

    const key = rawEmail ? `email:${rawEmail}` : `name:${cleaned}`;
    const quality = (rawEmail ? 2 : 0) + (cleaned.length >= 5 ? 1 : 0);
    const candidate = { name: aliasedName.trim(), email: rawEmail || undefined, quality };
    const existing = winnerByKey.get(key);

    if (!existing || candidate.quality > existing.quality || (candidate.quality === existing.quality && candidate.name.length > existing.name.length)) {
      winnerByKey.set(key, candidate);
    }
  }

  const results = Array.from(winnerByKey.values());
  const byCanonical = new Map<string, { name: string; email?: string }>();
  for (const item of results) {
    const canonical = normalizeName(item.name);
    const existing = byCanonical.get(canonical);
    if (!existing || (!existing.email && item.email) || item.name.length > (existing.name || "").length) {
      byCanonical.set(canonical, item);
    }
  }

  return Array.from(byCanonical.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function writeZoomMetrics(supabase: any, rows: any[]) {
  if (!rows || rows.length === 0) return;
  const metricNames = [
    "Zoom Meeting Attendees", 
    "Zoom Total Attendees", 
    "Zoom New Attendees",
    "Zoom Net Attendees - Tuesday",
    "Zoom Net Attendees - Thursday",
    "Zoom New Attendees - Tuesday",
    "Zoom New Attendees - Thursday"
  ];
  await supabase.from("kpi_metrics").delete().eq("source_slug", "zoom").in("metric_name", metricNames);
  
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await supabase.from("kpi_metrics").insert(chunk);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = mustGetEnv("SUPABASE_URL");
    const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const accountId = mustGetEnv("ZOOM_ACCOUNT_ID");
    const clientId = mustGetEnv("ZOOM_CLIENT_ID");
    const clientSecret = mustGetEnv("ZOOM_CLIENT_SECRET");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const url = new URL(req.url);
    const requestedMeetingIds = (url.searchParams.get("meeting_ids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const meetingIds = requestedMeetingIds.length > 0
      ? requestedMeetingIds
      : DEFAULT_MEETING_IDS;

    const { data: aliasesData } = await supabase.from("attendee_aliases").select("original_name,target_name");
    const aliasMap = new Map<string, string>();
    (aliasesData || []).forEach((row: any) => {
      aliasMap.set(normalizeName(row.original_name || ""), String(row.target_name || "").trim());
    });

    const accessToken = await getZoomAccessToken(accountId, clientId, clientSecret);

    let allInstances: any[] = [];
    for (const meetingId of meetingIds) {
      try {
        const instances = await fetchMeetingInstances(accessToken, meetingId);
        allInstances.push(...instances);
      } catch (err: any) {
        console.error(`Skipping meeting ID ${meetingId} due to error: ${err.message}`);
      }
    }

    const instancesByGroupDate = new Map<string, any[]>();
    for (const meeting of allInstances) {
        const startTime = String(meeting.start_time || "");
        if (!startTime) continue;
        const dayOfWeek = new Date(startTime).getDay(); 
        let groupName = 'Other';
        if (["87199667045", "88955819691"].includes(String(meeting.meeting_id))) groupName = 'Tuesday';
        else if (String(meeting.meeting_id) === '84242212480') groupName = 'Thursday';
        else {
            if (dayOfWeek === 2) groupName = 'Tuesday';
            if (dayOfWeek === 4) groupName = 'Thursday';
        }

        let participants: any[] = [];
        try {
            participants = await fetchMeetingParticipants(accessToken, String(meeting.uuid || ""));
        } catch (err: any) {
             console.error(`Skipping participants for uuid ${meeting.uuid}: ${err.message}`);
             continue; 
        }
        const attendees = dedupeParticipants(participants, aliasMap);
        
        meeting.processedAttendees = attendees;
        meeting.processedParticipantsRaw = participants;
        meeting.groupName = groupName;
        meeting.dateStr = startTime.slice(0, 10);
        
        const key = `${meeting.dateStr}-${groupName}`;
        if (!instancesByGroupDate.has(key)) instancesByGroupDate.set(key, []);
        instancesByGroupDate.get(key)!.push(meeting);
    }

    const selectedInstances: any[] = [];
    for (const [key, candidates] of instancesByGroupDate.entries()) {
        candidates.sort((a: any, b: any) => (b.processedAttendees?.length || 0) - (a.processedAttendees?.length || 0));
        const winner = candidates[0];
        if (winner && winner.processedAttendees && winner.processedAttendees.length >= 2) {
            selectedInstances.push(winner);
        }
    }
    selectedInstances.sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    const hubspotToken = Deno.env.get("HUBSPOT_PRIVATE_APP_TOKEN") || "";
    const seenPeopleTuesday = new Set<string>();
    const seenPeopleThursday = new Set<string>();
    const rows: any[] = [];

    for (const meeting of selectedInstances) {
      const groupName = meeting.groupName;
      const metricDate = meeting.dateStr;
      const seenPeople = groupName === 'Tuesday' ? seenPeopleTuesday : seenPeopleThursday;
      const attendeesObj = meeting.processedAttendees as Array<{ name: string; email?: string }>;
      
      const newAttendeeDetails: any[] = [];
      let newAttendeesCount = 0;
      for (const person of attendeesObj) {
        const key = normalizeName(person.name);
        if (!seenPeople.has(key)) {
          seenPeople.add(key);
          newAttendeesCount += 1;
          let sourceInfo: any = { source: "New (Lookup Pending)" };
          if (person.email) sourceInfo = await getHubSpotSource(hubspotToken, person.email);
          newAttendeeDetails.push({ name: person.name, email: person.email, ...sourceInfo });
        }
      }

      const attendeeNames = attendeesObj.map(a => a.name);
      // const newAttendeeNamesMerged = newAttendeeDetails.map(d => d.full_source ? `${d.name} (${d.full_source})` : d.name);

      const sharedMetadata = {
        meeting_id: String(meeting.meeting_id),
        meeting_uuid: String(meeting.uuid),
        meeting_topic: String(meeting.topic),
        start_time: meeting.start_time,
        group_name: groupName,
        attendees: attendeeNames,
        total_participants_raw: (meeting.rawParticipants || []).length,
        new_attendee_names: newAttendeeDetails.map(d => d.name), // Simplify
        new_attendee_details: newAttendeeDetails
      };

      rows.push({
        source_slug: "zoom",
        metric_name: "Zoom Meeting Attendees",
        metric_value: attendeeNames.length,
        metric_date: metricDate,
        period: "daily",
        metadata: sharedMetadata,
      });
      if (groupName !== 'Other') {
          rows.push({
            source_slug: "zoom",
            metric_name: `Zoom Net Attendees - ${groupName}`,
            metric_value: attendeeNames.length,
            metric_date: metricDate,
            period: "daily",
            metadata: sharedMetadata,
          });
      }
      rows.push({
        source_slug: "zoom",
        metric_name: "Zoom New Attendees",
        metric_value: newAttendeesCount,
        metric_date: metricDate,
        period: "daily",
        metadata: { ...sharedMetadata, new_attendees: newAttendeesCount },
      });
      if (groupName !== 'Other') {
          rows.push({
            source_slug: "zoom",
            metric_name: `Zoom New Attendees - ${groupName}`,
            metric_value: newAttendeesCount,
            metric_date: metricDate,
            period: "daily",
            metadata: { ...sharedMetadata, new_attendees: newAttendeesCount },
          });
      }
    }

    await writeZoomMetrics(supabase, rows);

    return new Response(
      JSON.stringify({
        ok: true,
        sessions_processed: selectedInstances.length,
        rows_written: rows.length
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (e: any) {
    console.error("sync_zoom_attendance error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
