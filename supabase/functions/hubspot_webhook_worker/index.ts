import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  HUBSPOT_OBJECT_TYPES,
  HubspotObjectType,
  buildSupabaseAdminClient,
  detectWebhookDeleteEvent,
  detectWebhookRestoreEvent,
  finishSyncRun,
  hubspotGetObjectById,
  logSyncError,
  mapContactRow,
  mapDealRow,
  sendSyncAlertIfNeeded,
  softDeleteObject,
  startSyncRun,
  syncObjectRange,
  upsertContacts,
  upsertDeals,
} from "../_shared/hubspot_sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const MAX_ATTEMPTS_DEFAULT = 8;

async function processSingleWebhookEvent(
  supabase: any,
  hubspotToken: string,
  eventRow: any,
): Promise<{ written: number; action: string }> {
  const objectType = String(eventRow?.object_type || "") as HubspotObjectType;
  if (!HUBSPOT_OBJECT_TYPES.includes(objectType)) {
    throw new Error(`Unsupported object_type in queue row: ${objectType}`);
  }
  const objectId = String(eventRow?.object_id || "").trim();
  if (!objectId) throw new Error("Webhook row missing object_id");
  const source = "webhook_worker";
  const occurredAt = String(eventRow?.occurred_at || new Date().toISOString());
  const rawEvent = eventRow?.raw_event || {};

  if (detectWebhookDeleteEvent(rawEvent)) {
    const changed = await softDeleteObject(supabase, objectType, objectId, occurredAt, source);
    return { written: changed, action: "soft_delete" };
  }

  const object = await hubspotGetObjectById(hubspotToken, objectType, objectId);
  if (!object) {
    // object no longer exists: enforce tombstone
    const changed = await softDeleteObject(supabase, objectType, objectId, occurredAt, source);
    return { written: changed, action: "soft_delete_not_found" };
  }

  if (objectType === "contacts") {
    const row = await mapContactRow(object, source);
    if (!row) throw new Error(`Failed to map contact ${objectId}`);
    const written = await upsertContacts(supabase, [row]);
    return { written, action: detectWebhookRestoreEvent(rawEvent) ? "restore_contact" : "upsert_contact" };
  }

  if (objectType === "deals") {
    const row = await mapDealRow(object, source);
    if (!row) throw new Error(`Failed to map deal ${objectId}`);
    const written = await upsertDeals(supabase, [row]);
    return { written, action: detectWebhookRestoreEvent(rawEvent) ? "restore_deal" : "upsert_deal" };
  }

  // calls/meetings: use shared range sync over narrow window around event for association consistency.
  const updatedIso = object?.properties?.hs_lastmodifieddate
    ? new Date(Number(object.properties.hs_lastmodifieddate)).toISOString()
    : (object?.updatedAt || new Date().toISOString());
  const fromIso = new Date(new Date(updatedIso).getTime() - (5 * 60 * 1000)).toISOString();
  const toIso = new Date(new Date(updatedIso).getTime() + (5 * 60 * 1000)).toISOString();

  const rangeResult = await syncObjectRange(supabase, hubspotToken, objectType, fromIso, toIso, source);
  return {
    written: rangeResult.itemsWritten,
    action: detectWebhookRestoreEvent(rawEvent) ? "restore_activity" : "upsert_activity",
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        function: "hubspot_webhook_worker",
        mode: "queue_worker",
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
  const batchSize = Number(body?.batch_size || 100);
  const maxAttempts = Number(body?.max_attempts || MAX_ATTEMPTS_DEFAULT);

  let runId = "";
  try {
    runId = await startSyncRun(supabase, {
      runType: "webhook_worker",
      objectType: null,
      metadata: { batch_size: batchSize, max_attempts: maxAttempts },
    });

    const { data: claimedRows, error: claimError } = await supabase
      .rpc("hubspot_claim_webhook_events", { p_limit: Math.max(1, Math.min(batchSize, 500)) });
    if (claimError) throw new Error(`Failed claiming webhook queue rows: ${claimError.message}`);

    const rows = Array.isArray(claimedRows) ? claimedRows : [];
    if (!rows.length) {
      await finishSyncRun(supabase, runId, {
        status: "success",
        itemsRead: 0,
        itemsWritten: 0,
        itemsFailed: 0,
        metadata: { note: "No pending webhook rows" },
      });
      return new Response(
        JSON.stringify({ ok: true, claimed: 0, processed: 0, failed: 0, dead: 0 }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    let processed = 0;
    let failed = 0;
    let dead = 0;
    let written = 0;
    const failures: any[] = [];

    for (const row of rows) {
      try {
        const result = await processSingleWebhookEvent(supabase, hubspotToken, row);
        written += Number(result?.written || 0);
        processed += 1;
        const { error } = await supabase
          .from("hubspot_webhook_events")
          .update({
            status: "done",
            processed_at: new Date().toISOString(),
            locked_at: null,
            last_error: null,
          })
          .eq("id", row.id);
        if (error) throw new Error(`Failed marking queue row as done (${row.id}): ${error.message}`);
      } catch (e: any) {
        failed += 1;
        const errorMessage = String(e?.message || e);
        failures.push({ id: row.id, object_type: row.object_type, object_id: row.object_id, error: errorMessage });
        await logSyncError(supabase, {
          runId,
          objectType: row?.object_type || null,
          objectId: row?.object_id ? String(row.object_id) : null,
          stage: "webhook_worker_process",
          errorMessage,
          payload: row?.raw_event || {},
        });

        const nextAttemptCount = Number(row?.attempt_count || 0) + 1;
        const isDead = nextAttemptCount >= Math.max(1, maxAttempts);
        if (isDead) dead += 1;
        const backoffMin = Math.min(60, Math.pow(2, Math.min(10, nextAttemptCount)));
        const nextAttemptAt = new Date(Date.now() + (backoffMin * 60 * 1000)).toISOString();

        const { error: queueUpdateError } = await supabase
          .from("hubspot_webhook_events")
          .update({
            status: isDead ? "dead" : "pending",
            attempt_count: nextAttemptCount,
            next_attempt_at: isDead ? new Date().toISOString() : nextAttemptAt,
            last_error: errorMessage,
            locked_at: null,
          })
          .eq("id", row.id);
        if (queueUpdateError) {
          throw new Error(`Failed updating retry state for queue row ${row.id}: ${queueUpdateError.message}`);
        }
      }
    }

    const status = failed === 0 ? "success" : (processed > 0 ? "partial" : "error");
    await finishSyncRun(supabase, runId, {
      status,
      itemsRead: rows.length,
      itemsWritten: written,
      itemsFailed: failed,
      metadata: { dead, failures: failures.slice(0, 25) },
    });

    if (dead > 0 || failed > 0) {
      await sendSyncAlertIfNeeded("Webhook worker encountered failures", {
        run_id: runId,
        claimed: rows.length,
        processed,
        failed,
        dead,
        sample_failures: failures.slice(0, 10),
      });
    }

    return new Response(
      JSON.stringify({
        ok: status !== "error",
        status,
        run_id: runId,
        claimed: rows.length,
        processed,
        failed,
        dead,
        written,
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (runId) {
      await finishSyncRun(supabase, runId, {
        status: "error",
        itemsRead: 0,
        itemsWritten: 0,
        itemsFailed: 1,
        metadata: { error: msg },
      }).catch(() => {});
      await logSyncError(supabase, {
        runId,
        stage: "webhook_worker_fatal",
        errorMessage: msg,
      }).catch(() => {});
    }

    await sendSyncAlertIfNeeded("Webhook worker fatal error", {
      run_id: runId || null,
      error: msg,
    });

    return new Response(
      JSON.stringify({ ok: false, error: msg, run_id: runId || null }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
