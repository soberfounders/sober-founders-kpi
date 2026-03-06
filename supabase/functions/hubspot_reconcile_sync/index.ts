import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  HUBSPOT_OBJECT_TYPES,
  addDays,
  buildSupabaseAdminClient,
  finishSyncRun,
  logSyncError,
  nowIso,
  readSyncState,
  reconcileLifecycleForObjectType,
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

type ReconcileMode = "hourly" | "daily";

function parseMode(raw: string | null): ReconcileMode {
  return raw === "daily" ? "daily" : "hourly";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        function: "hubspot_reconcile_sync",
        modes: ["hourly", "daily"],
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

  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const mode = parseMode(String(url.searchParams.get("mode") || body?.mode || "hourly").trim().toLowerCase());
  const objectTypes = HUBSPOT_OBJECT_TYPES;
  const hourlyLookbackDays = Number(url.searchParams.get("hourly_lookback_days") || body?.hourly_lookback_days || 7);
  const dailyLookbackDays = Number(url.searchParams.get("daily_lookback_days") || body?.daily_lookback_days || 30);
  const lookbackDays = mode === "daily" ? Math.max(1, dailyLookbackDays) : Math.max(1, hourlyLookbackDays);
  const rangeTo = nowIso();
  const rangeFrom = addDays(rangeTo, -lookbackDays);

  const hubspotToken = Deno.env.get("HUBSPOT_PRIVATE_APP_TOKEN");
  if (!hubspotToken) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing HUBSPOT_PRIVATE_APP_TOKEN" }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const supabase = buildSupabaseAdminClient();
  const results: any[] = [];
  let hadErrors = false;

  for (const objectType of objectTypes) {
    let runId = "";
    try {
      const state = await readSyncState(supabase, objectType);
      runId = await startSyncRun(supabase, {
        runType: mode === "daily" ? "reconcile_daily" : "reconcile_hourly",
        objectType,
        cursorFrom: rangeFrom,
        cursorTo: rangeTo,
        metadata: { mode, lookback_days: lookbackDays },
      });

      const syncResult = await syncObjectRange(
        supabase,
        hubspotToken,
        objectType,
        rangeFrom,
        rangeTo,
        mode === "daily" ? "reconcile_daily" : "reconcile_hourly",
      );

      let lifecycle = { localActive: 0, remoteActive: 0, softDeleted: 0, restored: 0 };
      if (mode === "daily") {
        lifecycle = await reconcileLifecycleForObjectType(
          supabase,
          hubspotToken,
          objectType,
          "reconcile_daily_lifecycle",
        );
      }

      await finishSyncRun(supabase, runId, {
        status: "success",
        itemsRead: syncResult.itemsRead,
        itemsWritten: syncResult.itemsWritten + lifecycle.softDeleted + lifecycle.restored,
        itemsFailed: 0,
        metadata: {
          mode,
          sync_details: syncResult.details,
          lifecycle,
        },
      });

      await updateSyncState(supabase, objectType, {
        last_success_at: nowIso(),
        last_error_at: null,
        last_error: null,
        total_runs: Number(state?.total_runs || 0) + 1,
        metadata: {
          ...(state?.metadata || {}),
          [`last_${mode}_reconcile_at`]: nowIso(),
        },
      });

      results.push({
        object_type: objectType,
        status: "success",
        run_id: runId,
        mode,
        from: rangeFrom,
        to: rangeTo,
        items_read: syncResult.itemsRead,
        items_written: syncResult.itemsWritten,
        lifecycle,
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
          metadata: { error: msg, mode },
        }).catch(() => {});
      }
      await logSyncError(supabase, {
        runId: runId || null,
        objectType,
        stage: "reconcile_sync",
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
        mode,
        error: msg,
      });
    }
  }

  if (hadErrors) {
    await sendSyncAlertIfNeeded("Reconcile sync errors", {
      mode,
      lookback_days: lookbackDays,
      errors: results.filter((r) => r.status === "error"),
      results,
    });
  }

  return new Response(
    JSON.stringify({
      ok: !hadErrors,
      mode,
      lookback_days: lookbackDays,
      from: rangeFrom,
      to: rangeTo,
      results,
    }),
    {
      status: hadErrors ? 207 : 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    },
  );
});
