import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  HUBSPOT_OBJECT_TYPES,
  HubspotObjectType,
  addDays,
  buildSupabaseAdminClient,
  finishSyncRun,
  logSyncError,
  nowIso,
  readSyncState,
  sendSyncAlertIfNeeded,
  startSyncRun,
  syncObjectRange,
  updateSyncState,
} from "../_shared/hubspot_sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function parseDateIsoOrNull(raw: any): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function parseObjectTypes(raw: string | null): HubspotObjectType[] {
  if (!raw) return HUBSPOT_OBJECT_TYPES;
  const values = raw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean) as HubspotObjectType[];
  const filtered = values.filter((v) => HUBSPOT_OBJECT_TYPES.includes(v));
  return filtered.length ? Array.from(new Set(filtered)) : HUBSPOT_OBJECT_TYPES;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        function: "hubspot_bootstrap_backfill",
        mode: "resumable_chunked_backfill",
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

  const hubspotToken = Deno.env.get("HUBSPOT_PRIVATE_APP_TOKEN");
  if (!hubspotToken) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing HUBSPOT_PRIVATE_APP_TOKEN" }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const objectTypes = parseObjectTypes(String(url.searchParams.get("object_types") || body?.object_types || "").trim() || null);
  const lookbackDays = Number(url.searchParams.get("lookback_days") || body?.lookback_days || 3650);
  const chunkDays = Number(url.searchParams.get("chunk_days") || body?.chunk_days || 14);
  const forcedFrom = parseDateIsoOrNull(url.searchParams.get("from") || body?.from || null);
  const forcedTo = parseDateIsoOrNull(url.searchParams.get("to") || body?.to || null);

  const supabase = buildSupabaseAdminClient();
  const endIso = forcedTo || nowIso();
  const defaultStartIso = forcedFrom || addDays(endIso, -Math.max(1, lookbackDays));

  const results: any[] = [];
  let hadErrors = false;

  for (const objectType of objectTypes) {
    let runId = "";
    try {
      const state = await readSyncState(supabase, objectType);
      const stateMeta = (state?.metadata && typeof state.metadata === "object") ? state.metadata : {};
      const stateCursorRaw = stateMeta?.backfill_cursor_date ? String(stateMeta.backfill_cursor_date) : null;
      const stateCursorIso = parseDateIsoOrNull(stateCursorRaw ? `${stateCursorRaw}T00:00:00.000Z` : null);

      const startIso = forcedFrom || stateCursorIso || defaultStartIso;
      const chunkEndCandidate = addDays(startIso, Math.max(1, chunkDays));
      const chunkEndIso = new Date(chunkEndCandidate) < new Date(endIso) ? chunkEndCandidate : endIso;
      const doneAfterChunk = new Date(chunkEndIso) >= new Date(endIso);

      runId = await startSyncRun(supabase, {
        runType: "backfill",
        objectType,
        cursorFrom: startIso,
        cursorTo: chunkEndIso,
        metadata: {
          lookback_days: lookbackDays,
          chunk_days: chunkDays,
          forced_from: forcedFrom,
          forced_to: forcedTo,
        },
      });

      const syncResult = await syncObjectRange(
        supabase,
        hubspotToken,
        objectType,
        startIso,
        chunkEndIso,
        "backfill",
      );

      const nextCursorDate = doneAfterChunk ? null : toDateOnly(chunkEndIso);
      await updateSyncState(supabase, objectType, {
        last_success_at: nowIso(),
        last_error_at: null,
        last_error: null,
        metadata: {
          ...stateMeta,
          backfill_cursor_date: nextCursorDate,
          backfill_last_completed_at: doneAfterChunk ? nowIso() : null,
        },
      });

      await finishSyncRun(supabase, runId, {
        status: "success",
        itemsRead: syncResult.itemsRead,
        itemsWritten: syncResult.itemsWritten,
        itemsFailed: 0,
        metadata: {
          details: syncResult.details,
          backfill_window_start: startIso,
          backfill_window_end: chunkEndIso,
          done_after_chunk: doneAfterChunk,
          next_cursor_date: nextCursorDate,
        },
      });

      results.push({
        object_type: objectType,
        status: "success",
        run_id: runId,
        window_start: startIso,
        window_end: chunkEndIso,
        done_after_chunk: doneAfterChunk,
        next_cursor_date: nextCursorDate,
        items_read: syncResult.itemsRead,
        items_written: syncResult.itemsWritten,
      });
    } catch (e: any) {
      hadErrors = true;
      const msg = String(e?.message || e);
      if (runId) {
        await finishSyncRun(supabase, runId, {
          status: "error",
          itemsRead: 0,
          itemsWritten: 0,
          itemsFailed: 1,
          metadata: { error: msg },
        }).catch(() => {});
      }
      await logSyncError(supabase, {
        runId: runId || null,
        objectType,
        stage: "backfill_sync",
        errorMessage: msg,
      }).catch(() => {});
      await updateSyncState(supabase, objectType, {
        last_error_at: nowIso(),
        last_error: msg,
      }).catch(() => {});
      results.push({
        object_type: objectType,
        status: "error",
        run_id: runId || null,
        error: msg,
      });
    }
  }

  if (hadErrors) {
    await sendSyncAlertIfNeeded("Backfill sync errors", {
      lookback_days: lookbackDays,
      chunk_days: chunkDays,
      results,
    });
  }

  return new Response(
    JSON.stringify({
      ok: !hadErrors,
      lookback_days: lookbackDays,
      chunk_days: chunkDays,
      results,
    }),
    {
      status: hadErrors ? 207 : 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    },
  );
});
