import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const DEFAULT_MEETING_IDS = ["84242212480", "87199667045"];
const BOT_KEYWORDS = ["note", "notetaker", "fireflies.ai", "fathom", "read.ai", "otter.ai"];

function mustGetEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizeName(value = "") {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
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

  while (true) {
    const url = new URL(`https://api.zoom.us/v2/past_meetings/${meetingId}/instances`);
    url.searchParams.set("page_size", "300");
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) return [];
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Failed fetching instances for ${meetingId}: ${res.status} ${txt}`);
    }

    const json = await res.json();
    all.push(...(json.meetings || []).map((m: any) => ({ ...m, meeting_id: meetingId })));

    nextPageToken = json.next_page_token || "";
    if (!nextPageToken) break;
  }

  return all;
}

async function fetchMeetingParticipants(accessToken: string, uuid: string) {
  const all: any[] = [];
  let nextPageToken = "";
  const encodedUuid = maybeDoubleEncodeUuid(uuid);

  while (true) {
    const url = new URL(`https://api.zoom.us/v2/report/meetings/${encodedUuid}/participants`);
    url.searchParams.set("page_size", "300");
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) return [];
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Failed fetching participants for ${uuid}: ${res.status} ${txt}`);
    }

    const json = await res.json();
    all.push(...(json.participants || []));

    nextPageToken = json.next_page_token || "";
    if (!nextPageToken) break;
  }

  return all;
}

function dedupeParticipants(participants: any[], aliasMap: Map<string, string>) {
  const winnerByKey = new Map<string, { name: string; quality: number }>();

  for (const p of participants) {
    const rawName = String(p?.name ?? "").trim();
    const rawEmail = String(p?.user_email ?? "").trim().toLowerCase();
    if (!rawName) continue;

    const normalizedRaw = normalizeName(rawName);
    if (!normalizedRaw) continue;
    if (BOT_KEYWORDS.some((k) => normalizedRaw.includes(k))) continue;

    const aliasedName = aliasMap.get(normalizedRaw) || rawName;
    const cleaned = cleanupNameForDedupe(aliasedName);
    if (!cleaned) continue;

    const key = rawEmail ? `email:${rawEmail}` : `name:${cleaned}`;
    const quality = (rawEmail ? 2 : 0) + (cleaned.length >= 5 ? 1 : 0);
    const candidate = { name: aliasedName.trim(), quality };
    const existing = winnerByKey.get(key);

    if (!existing || candidate.quality > existing.quality || (candidate.quality === existing.quality && candidate.name.length > existing.name.length)) {
      winnerByKey.set(key, candidate);
    }
  }

  const names = Array.from(winnerByKey.values())
    .map((x) => x.name)
    .filter(Boolean);

  // Secondary de-duplication by normalized canonical name after aliasing.
  const byCanonical = new Map<string, string>();
  for (const name of names) {
    const canonical = normalizeName(name);
    if (!byCanonical.has(canonical) || name.length > (byCanonical.get(canonical) || "").length) {
      byCanonical.set(canonical, name);
    }
  }

  return Array.from(byCanonical.values()).sort((a, b) => a.localeCompare(b));
}

async function writeZoomMetrics(supabase: any, rows: any[]) {
  const metricNames = [
    "Zoom Meeting Attendees", 
    "Zoom Total Attendees", 
    "Zoom New Attendees",
    "Zoom Net Attendees - Tuesday",
    "Zoom Net Attendees - Thursday",
    "Zoom New Attendees - Tuesday",
    "Zoom New Attendees - Thursday"
  ];
  const { error: deleteError } = await supabase
    .from("kpi_metrics")
    .delete()
    .eq("source_slug", "zoom")
    .in("metric_name", metricNames);

  if (deleteError) {
    throw new Error(`Failed deleting existing Zoom metrics: ${deleteError.message}`);
  }

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("kpi_metrics").insert(chunk);
    if (error) throw new Error(`Failed inserting Zoom metrics: ${error.message}`);
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
    const maxInstances = Number(url.searchParams.get("max_instances") || "120");
    const requestedMeetingIds = (url.searchParams.get("meeting_ids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const meetingIds = requestedMeetingIds.length > 0
      ? requestedMeetingIds
      : ((Deno.env.get("ZOOM_ATTENDANCE_MEETING_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean).length > 0
        ? (Deno.env.get("ZOOM_ATTENDANCE_MEETING_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean)
        : DEFAULT_MEETING_IDS);

    const { data: aliasesData, error: aliasesError } = await supabase
      .from("attendee_aliases")
      .select("original_name,target_name");

    if (aliasesError && !isMissingTableError(aliasesError)) {
      throw new Error(`Failed loading attendee aliases: ${aliasesError.message}`);
    }

    const aliasMap = new Map<string, string>();
    (aliasesData || []).forEach((row: any) => {
      aliasMap.set(normalizeName(row.original_name || ""), String(row.target_name || "").trim());
    });

    const accessToken = await getZoomAccessToken(accountId, clientId, clientSecret);

    let allInstances: any[] = [];
    for (const meetingId of meetingIds) {
      const instances = await fetchMeetingInstances(accessToken, meetingId);
      allInstances.push(...instances);
    }

    // 1. Fetch, Dedupe, and Select Best Instances
    const instancesByGroupDate = new Map<string, any[]>();

    for (const meeting of allInstances) {
        const startTime = String(meeting.start_time || "");
        if (!startTime) continue;
        
        // Determine Group EARLY to group correctly
        const dayOfWeek = new Date(startTime).getDay(); 
        let groupName = 'Other';
        if (meeting.meeting_id === '87199667045' || dayOfWeek === 2) groupName = 'Tuesday';
        else if (meeting.meeting_id === '84242212480' || dayOfWeek === 4) groupName = 'Thursday';

        // Fetch participants to get count for selection
        const participants = await fetchMeetingParticipants(accessToken, String(meeting.uuid || ""));
        const attendees = dedupeParticipants(participants, aliasMap);
        
        // Tag with processed data for later
        meeting.processedAttendees = attendees;
        meeting.processedParticipantsRaw = participants;
        meeting.groupName = groupName;
        meeting.dateStr = startTime.slice(0, 10);
        
        const key = `${meeting.dateStr}-${groupName}`;
        if (!instancesByGroupDate.has(key)) instancesByGroupDate.set(key, []);
        instancesByGroupDate.get(key).push(meeting);
    }

    const selectedInstances: any[] = [];
    
    // Select best instance per group/date
    for (const [key, candidates] of instancesByGroupDate.entries()) {
        // Sort by attendee count descending
        candidates.sort((a, b) => b.processedAttendees.length - a.processedAttendees.length);
        
        const winner = candidates[0];
        
        // Filter out low-quality meetings (e.g. just host waiting)
        // CRITERIA: At least 2 unique attendees
        if (winner.processedAttendees.length >= 2) {
            selectedInstances.push(winner);
        } else {
            console.log(`Skipping low-quality meeting: ${key} (Attendees: ${winner.processedAttendees.length})`);
        }
    }

    // Sort chronologically for processing
    selectedInstances.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    
    // Replace allInstances logic with selectedInstances
    const allInstancesToProcess = selectedInstances;

    const seenPeople = new Set<string>();
    const rows: any[] = [];
    let processedSessions = 0;

    for (const meeting of allInstancesToProcess) {
      const startTime = String(meeting.start_time || "");
      const attendees = meeting.processedAttendees;
      const participants = meeting.processedParticipantsRaw;
      const groupName = meeting.groupName;
      const metricDate = meeting.dateStr;
      
      const newAttendeeNames: string[] = [];
      let newAttendees = 0;
      for (const name of attendees) {
        const key = normalizeName(name);
        if (!seenPeople.has(key)) {
          seenPeople.add(key);
          newAttendees += 1;
          newAttendeeNames.push(name);
        }
      }



      const sharedMetadata = {
        meeting_id: String(meeting.meeting_id || ""),
        meeting_uuid: String(meeting.uuid || ""),
        meeting_topic: String(meeting.topic || ""),
        start_time: startTime,
        group_name: groupName,
        attendees,
        total_participants_raw: participants.length,
      };

      // Base Metric (Net Show Ups)
      rows.push({
        source_slug: "zoom",
        metric_name: "Zoom Meeting Attendees",
        metric_value: attendees.length,
        metric_date: metricDate,
        period: "daily",
        metadata: sharedMetadata,
      });

      // Split Net Metrics
      if (groupName !== 'Other') {
          rows.push({
            source_slug: "zoom",
            metric_name: `Zoom Net Attendees - ${groupName}`,
            metric_value: attendees.length,
            metric_date: metricDate,
            period: "daily",
            metadata: sharedMetadata,
          });
      }

      // New Attendees Logic (Global New)
      // Note: This counts if they are new to the *entire ecosystem*, not just the group
      rows.push({
        source_slug: "zoom",
        metric_name: "Zoom New Attendees",
        metric_value: newAttendees,
        metric_date: metricDate,
        period: "daily",
        metadata: {
          ...sharedMetadata,
          new_attendees: newAttendees,
          new_attendee_names: newAttendeeNames,
        },
      });

      // Split New Attendees
      if (groupName !== 'Other') {
          rows.push({
            source_slug: "zoom",
            metric_name: `Zoom New Attendees - ${groupName}`,
            metric_value: newAttendees,
            metric_date: metricDate,
            period: "daily",
            metadata: {
              ...sharedMetadata,
              new_attendees: newAttendees,
              new_attendee_names: newAttendeeNames,
            },
          });
      }

      processedSessions += 1;
    }

    await writeZoomMetrics(supabase, rows);

    return new Response(
      JSON.stringify({
        ok: true,
        meeting_ids: meetingIds,
        sessions_found: selectedInstances.length,
        sessions_processed: processedSessions,
        rows_written: rows.length,
        aliases_loaded: aliasMap.size,
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
