import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  HUBSPOT_OBJECT_TYPES,
  HubspotObjectType,
  buildSupabaseAdminClient,
  finishSyncRun,
  logSyncError,
  nowIso,
  readSyncState,
  sendSyncAlertIfNeeded,
  startSyncRun,
  subtractMinutes,
  syncObjectRange,
  updateSyncState,
} from "../_shared/hubspot_sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function parseObjectTypes(raw: string | null): HubspotObjectType[] {
  if (!raw) return HUBSPOT_OBJECT_TYPES;
  const values = raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean) as HubspotObjectType[];
  const filtered = values.filter((v) => HUBSPOT_OBJECT_TYPES.includes(v));
  return filtered.length ? Array.from(new Set(filtered)) : HUBSPOT_OBJECT_TYPES;
}

function safeDate(value: any): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        function: "hubspot_incremental_sync",
        mode: "updated_at_incremental",
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const supabase = buildSupabaseAdminClient();
  const hubspotToken = Deno.env.get("HUBSPOT_PRIVATE_APP_TOKEN");
  if (!hubspotToken) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing HUBSPOT_PRIVATE_APP_TOKEN" }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const objectTypes = parseObjectTypes(
    String(url.searchParams.get("object_types") || body?.object_types || "").trim() || null,
  );

  const overlapMinutes = Number(url.searchParams.get("overlap_minutes") || body?.overlap_minutes || 2);
  const defaultLookbackDays = Number(url.searchParams.get("default_lookback_days") || body?.default_lookback_days || 30);
  const forcedFrom = safeDate(url.searchParams.get("from") || body?.from || null);
  const forcedTo = safeDate(url.searchParams.get("to") || body?.to || null);
  const now = nowIso();
  const rangeTo = forcedTo || now;

  const results: any[] = [];
  let hadFatal = false;

  for (const objectType of objectTypes) {
    let runId = "";
    try {
      const state = await readSyncState(supabase, objectType);
      const stateCursor = safeDate(state?.cursor_updated_at);
      const fallbackFrom = new Date(Date.now() - (Math.max(1, defaultLookbackDays) * 24 * 60 * 60 * 1000)).toISOString();
      const baseFrom = forcedFrom || stateCursor || fallbackFrom;
      const rangeFrom = subtractMinutes(baseFrom, Math.max(0, overlapMinutes));

      runId = await startSyncRun(supabase, {
        runType: "incremental",
        objectType,
        cursorFrom: rangeFrom,
        cursorTo: rangeTo,
        metadata: { overlap_minutes: overlapMinutes, forced_from: forcedFrom, forced_to: forcedTo },
      });

      await updateSyncState(supabase, objectType, {
        last_run_started_at: nowIso(),
        total_runs: Number(state?.total_runs || 0) + 1,
      });

      const synced = await syncObjectRange(supabase, hubspotToken, objectType, rangeFrom, rangeTo, "incremental");
      const newCursor = synced.maxUpdatedAt || rangeTo;

      await updateSyncState(supabase, objectType, {
        cursor_updated_at: newCursor,
        cursor_object_id: null,
        last_success_at: nowIso(),
        last_error_at: null,
        last_error: null,
      });

      await finishSyncRun(supabase, runId, {
        status: "success",
        itemsRead: synced.itemsRead,
        itemsWritten: synced.itemsWritten,
        itemsFailed: 0,
        metadata: synced.details,
      });

      results.push({
        object_type: objectType,
        status: "success",
        run_id: runId,
        from: rangeFrom,
        to: rangeTo,
        cursor_updated_at: newCursor,
        items_read: synced.itemsRead,
        items_written: synced.itemsWritten,
        details: synced.details,
      });
    } catch (e: any) {
      const errorMessage = String(e?.message || e);
      hadFatal = true;
      if (runId) {
        await finishSyncRun(supabase, runId, {
          status: "error",
          itemsRead: 0,
          itemsWritten: 0,
          itemsFailed: 1,
          metadata: { error: errorMessage },
        }).catch(() => {});
      }
      await updateSyncState(supabase, objectType, {
        last_error_at: nowIso(),
        last_error: errorMessage,
      }).catch(() => {});
      await logSyncError(supabase, {
        runId: runId || null,
        objectType,
        stage: "incremental_sync",
        errorMessage,
      }).catch(() => {});
      results.push({
        object_type: objectType,
        status: "error",
        run_id: runId || null,
        error: errorMessage,
      });
    }
  }

  const hasAnyError = results.some((r) => r.status === "error");
  if (hasAnyError) {
    await sendSyncAlertIfNeeded("Incremental sync errors", {
      errors: results.filter((r) => r.status === "error"),
      results,
    });
  }

  return new Response(
    JSON.stringify({
      ok: !hadFatal,
      mode: "incremental",
      object_types: objectTypes,
      results,
    }),
    {
      status: hadFatal ? 207 : 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    },
  );
});
