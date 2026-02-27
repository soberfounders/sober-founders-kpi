import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dateDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return isoDateOnly(d);
}

function readBoolFlag(url: URL, body: any, key: string, defaultValue: boolean) {
  const qs = url.searchParams.get(key);
  if (qs !== null) return String(qs).toLowerCase() !== "false";
  if (body && Object.prototype.hasOwnProperty.call(body, key)) {
    const raw = body[key];
    if (typeof raw === "boolean") return raw;
    return String(raw).toLowerCase() !== "false";
  }
  return defaultValue;
}

function safeDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateMMDDYYYY(dateLike: any): string {
  const d = safeDate(dateLike);
  if (!d) return "unknown date";
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function classifyGroupCall(activity: any): "Tuesday" | "Thursday" | null {
  const title = String(activity?.title || "").toLowerCase();
  const start = safeDate(activity?.hs_timestamp || activity?.created_at_hubspot);
  if (!start) return null;

  if (title.includes("tactic tuesday")) return "Tuesday";
  if (title.includes("mastermind on zoom") || title.includes("all are welcome")) return "Thursday";
  if (title.includes("entrepreneur's big book") || title.includes("big book")) return "Thursday";
  if (title.includes("sober founders mastermind") && !title.includes("intro")) return "Thursday";

  const day = start.getUTCDay();
  if (day === 2) return "Tuesday";
  if (day === 4) return "Thursday";
  return null;
}

async function invokeEdgeFunction(
  supabaseUrl: string,
  edgeInvokeKey: string,
  fnName: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: any;
  } = {},
) {
  const method = options.method || (options.body ? "POST" : "GET");
  const fnUrl = new URL(`${supabaseUrl}/functions/v1/${fnName}`);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    fnUrl.searchParams.set(key, String(value));
  });

  const resp = await fetch(fnUrl.toString(), {
    method,
    headers: {
      authorization: `Bearer ${edgeInvokeKey}`,
      apikey: edgeInvokeKey,
      "content-type": "application/json",
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await resp.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }

  if (!resp.ok) {
    const errMessage =
      (typeof data === "object" && data && (data.error?.message || data.error)) ||
      (typeof data === "string" && data) ||
      `HTTP ${resp.status}`;
    throw new Error(`${fnName} failed (${resp.status}): ${errMessage}`);
  }

  if (typeof data === "object" && data && data.ok === false) {
    throw new Error(`${fnName} returned ok=false: ${data.error || "unknown error"}`);
  }

  return data;
}

async function fetchAssociationCountByActivity(
  supabase: any,
  activityRefs: Array<{ hubspotActivityId: number; activityType: "call" | "meeting" }>,
) {
  const counts = new Map<string, number>();
  if (!activityRefs.length) return counts;

  const activityTypes = Array.from(
    new Set(
      activityRefs
        .map((row) => String(row?.activityType || "").toLowerCase())
        .filter((v) => v === "call" || v === "meeting"),
    ),
  );
  const activityIds = Array.from(
    new Set(
      activityRefs
        .map((row) => Number(row?.hubspotActivityId))
        .filter((id) => Number.isFinite(id)),
    ),
  );

  if (!activityTypes.length || !activityIds.length) return counts;

  for (let i = 0; i < activityIds.length; i += 200) {
    const chunk = activityIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("hubspot_activity_contact_associations")
      .select("hubspot_activity_id,activity_type")
      .in("activity_type", activityTypes)
      .in("hubspot_activity_id", chunk);

    if (error) throw new Error(`Failed loading HubSpot activity associations: ${error.message}`);

    for (const row of data || []) {
      const activityId = Number(row?.hubspot_activity_id);
      const activityType = String(row?.activity_type || "").toLowerCase();
      if (!Number.isFinite(activityId)) continue;
      if (activityType !== "call" && activityType !== "meeting") continue;
      const key = `${activityType}:${activityId}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return counts;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const edgeInvokeKey =
      Deno.env.get("MASTER_SYNC_EDGE_INVOKE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") ||
      SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const reqBody = req.method === "POST" ? (await req.json().catch(() => ({}))) : {};

    const daysRaw = Number(url.searchParams.get("days") || reqBody?.days || 30);
    const days = Number.isFinite(daysRaw) && daysRaw > 0
      ? Math.min(Math.floor(daysRaw), 365)
      : 30;
    const includeReconcile = readBoolFlag(url, reqBody, "include_reconcile", true);
    const includeLuma = readBoolFlag(url, reqBody, "include_luma", true);

    const stepResults: any[] = [];
    const stepErrors: any[] = [];
    const runStep = async (
      step: string,
      fnName: string,
      options: Parameters<typeof invokeEdgeFunction>[3],
      required: boolean,
    ) => {
      try {
        const data = await invokeEdgeFunction(SUPABASE_URL, edgeInvokeKey, fnName, options);
        stepResults.push({ step, function: fnName, status: "success", data });
        return data;
      } catch (e: any) {
        const msg = e?.message || String(e);
        stepErrors.push({ step, function: fnName, status: "error", error: msg, required });
        if (required) throw e;
        return null;
      }
    };

    await runStep(
      "hubspot_attendance_source_sync",
      "sync_hubspot_meeting_activities",
      {
        method: "POST",
        body: { days, include_calls: true, include_meetings: true },
      },
      true,
    );

    if (includeReconcile) {
      await runStep(
        "hubspot_attendance_reconcile",
        "reconcile_zoom_attendee_hubspot_mappings",
        {
          method: "POST",
          body: { dry_run: false, days },
        },
        false,
      );
    }

    if (includeLuma) {
      await runStep(
        "luma_context_sync",
        "sync_luma_registrations",
        { method: "POST" },
        false,
      );
    }

    const recentFromDate = dateDaysAgo(Math.min(days, 60));
    const { data: activities, error: activitiesError } = await supabase
      .from("raw_hubspot_meeting_activities")
      .select("hubspot_activity_id,activity_type,hs_timestamp,created_at_hubspot,title")
      .in("activity_type", ["call", "meeting"])
      .or(`hs_timestamp.gte.${recentFromDate},created_at_hubspot.gte.${recentFromDate}`)
      .order("hs_timestamp", { ascending: false })
      .limit(1000);

    if (activitiesError) {
      throw new Error(`Failed loading raw_hubspot_meeting_activities: ${activitiesError.message}`);
    }

    const groupSessions = (activities || [])
      .map((row: any) => {
        const type = classifyGroupCall(row);
        const activityId = Number(row?.hubspot_activity_id);
        if (!type || !Number.isFinite(activityId)) return null;
        const activityType = String(row?.activity_type || "").toLowerCase() === "meeting"
          ? "meeting"
          : "call";
        return {
          hubspotActivityId: activityId,
          activityType,
          groupType: type,
          startAt: row?.hs_timestamp || row?.created_at_hubspot || null,
          title: String(row?.title || "").trim(),
        };
      })
      .filter(Boolean) as Array<{
        hubspotActivityId: number;
        activityType: "call" | "meeting";
        groupType: "Tuesday" | "Thursday";
        startAt: string | null;
        title: string;
      }>;

    const assocCounts = await fetchAssociationCountByActivity(
      supabase,
      groupSessions.map((row) => ({
        hubspotActivityId: row.hubspotActivityId,
        activityType: row.activityType,
      })),
    );

    const canonicalSessionsByDate = new Map<
      string,
      {
        hubspotActivityId: number;
        activityType: "call" | "meeting";
        groupType: "Tuesday" | "Thursday";
        startAt: string | null;
        title: string;
      }
    >();
    for (const session of groupSessions) {
      const sessionDate = session.startAt ? String(session.startAt).slice(0, 10) : "unknown";
      const key = `${session.groupType}:${sessionDate}`;
      const existing = canonicalSessionsByDate.get(key);
      if (!existing) {
        canonicalSessionsByDate.set(key, session);
        continue;
      }
      const existingCount = assocCounts.get(`${existing.activityType}:${existing.hubspotActivityId}`) || 0;
      const sessionCount = assocCounts.get(`${session.activityType}:${session.hubspotActivityId}`) || 0;
      if (sessionCount > existingCount) {
        canonicalSessionsByDate.set(key, session);
      }
    }
    const canonicalSessions = Array.from(canonicalSessionsByDate.values());

    const missingAttendanceSessions = canonicalSessions
      .filter((row) => (assocCounts.get(`${row.activityType}:${row.hubspotActivityId}`) || 0) === 0)
      .slice(0, 8);

    const hostDataWarnings = missingAttendanceSessions.map((row) => ({
      hubspot_activity_id: row.hubspotActivityId,
      activity_type: row.activityType,
      group_type: row.groupType,
      session_date: row.startAt ? String(row.startAt).slice(0, 10) : null,
      message: `${row.groupType} ${formatDateMMDDYYYY(row.startAt)} has no attendee associations in the HubSpot call/meeting record.`,
      remediation: "Host must mark attendees in HubSpot call/meeting record, then run Sync Now.",
      is_user_action_required: true,
      reason_code: "hubspot_activity_missing_attendees",
    }));

    const hostDataWarningSummary = hostDataWarnings.length > 0
      ? `${hostDataWarnings.length} recent Tue/Thu session(s) have no HubSpot attendee associations. Sync is running, but attendance is incomplete until the host marks attendees in HubSpot call/meeting records.`
      : "";

    return new Response(JSON.stringify({
      ok: true,
      days,
      include_reconcile: includeReconcile,
      include_luma: includeLuma,
      steps: stepResults,
      non_fatal_step_errors: stepErrors,
      grouped_sessions_checked: canonicalSessions.length,
      host_data_warnings: hostDataWarnings,
      host_data_warning_summary: hostDataWarningSummary,
      note: "Attendance sync source-of-truth is HubSpot call/meeting records and their contact associations (not legacy Zoom participants).",
    }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
