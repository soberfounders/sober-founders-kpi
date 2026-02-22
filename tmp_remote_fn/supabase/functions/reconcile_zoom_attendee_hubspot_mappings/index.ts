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

function dateDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const body = req.method === "POST" ? (await req.json().catch(() => ({}))) : {};
    const days = Number(url.searchParams.get("days") || body?.days || 30);
    const dryRun = String(url.searchParams.get("dry_run") || body?.dry_run || "true") !== "false";
    const startDate = String(url.searchParams.get("from") || body?.from || dateDaysAgo(days));

    const zoomRes = await supabase
      .from("kpi_metrics")
      .select("id,metric_date,metric_name,metadata")
      .eq("metric_name", "Zoom Meeting Attendees")
      .gte("metric_date", startDate)
      .order("metric_date", { ascending: true })
      .limit(5000);
    if (zoomRes.error) throw new Error(`Failed loading Zoom rows: ${zoomRes.error.message}`);

    const matchRes = await supabase
      .from("zoom_session_hubspot_activity_matches")
      .select("zoom_session_key,session_date,meeting_id,hubspot_activity_id,activity_type,match_confidence,match_source")
      .gte("session_date", startDate)
      .order("session_date", { ascending: true })
      .limit(5000);
    // This table may not exist yet in environments where migration is not applied.
    const sessionMatches = matchRes.error ? [] : (matchRes.data || []);
    const missingMatchTable = !!matchRes.error;

    const assocRes = await supabase
      .from("hubspot_activity_contact_associations")
      .select("hubspot_activity_id,activity_type,hubspot_contact_id,contact_email,contact_firstname,contact_lastname")
      .limit(50000);
    const activityAssociations = assocRes.error ? [] : (assocRes.data || []);
    const missingAssocTable = !!assocRes.error;

    // Shadow-mode summary only (non-breaking): no writes yet.
    const zoomRows = (zoomRes.data || []).filter((r: any) => {
      const g = String(r?.metadata?.group_name || "").toLowerCase();
      return g === "tuesday" || g === "thursday" || String(r?.metadata?.meeting_id || "") === "87199667045" || String(r?.metadata?.meeting_id || "") === "84242212480";
    });

    const sessions = zoomRows.map((r: any) => ({
      metric_date: r.metric_date,
      meeting_id: String(r?.metadata?.meeting_id || ""),
      start_time: r?.metadata?.start_time || null,
      attendees: Array.isArray(r?.metadata?.attendees) ? r.metadata.attendees.length : 0,
      zoom_session_key: `${String(r.metric_date || "")}|${String(r?.metadata?.meeting_id || "")}|${String(r?.metadata?.start_time || "")}`,
    }));

    const matchedKeys = new Set((sessionMatches || []).map((r: any) => String(r.zoom_session_key || "")));
    const sessionsWithHubspotMatch = sessions.filter((s) => matchedKeys.has(s.zoom_session_key));

    return new Response(JSON.stringify({
      ok: true,
      mode: dryRun ? "shadow_dry_run" : "shadow_no_write",
      start_date: startDate,
      zoom_sessions_seen: sessions.length,
      sessions_with_hubspot_activity_match: sessionsWithHubspotMatch.length,
      session_match_table_available: !missingMatchTable,
      activity_association_table_available: !missingAssocTable,
      hubspot_activity_contact_associations_rows: activityAssociations.length,
      note: "Scaffold only (no writes). Next step is materializing zoom_session_hubspot_activity_matches and zoom_attendee_hubspot_mappings from session/activity overlap logic.",
      sample_unmatched_sessions: sessions.filter((s) => !matchedKeys.has(s.zoom_session_key)).slice(0, 10),
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
