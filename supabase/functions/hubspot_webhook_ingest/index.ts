import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  buildSupabaseAdminClient,
  detectWebhookObjectType,
  hmacSha256Base64,
  webhookDedupeKey,
  webhookObjectId,
  webhookOccurredAtIso,
} from "../_shared/hubspot_sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hubspot-signature-v3, x-hubspot-request-timestamp",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function parseTimestampHeader(tsRaw: string | null): number {
  if (!tsRaw) return NaN;
  const n = Number(tsRaw);
  return Number.isFinite(n) ? n : NaN;
}

async function verifyHubspotSignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("HUBSPOT_WEBHOOK_SECRET");
  if (!secret) return true; // secret not configured: accept for migration bootstrap

  const signature = req.headers.get("x-hubspot-signature-v3") || "";
  const tsRaw = req.headers.get("x-hubspot-request-timestamp");
  const ts = parseTimestampHeader(tsRaw);
  if (!signature || !Number.isFinite(ts)) return false;

  const skewMs = Math.abs(Date.now() - ts);
  if (skewMs > 5 * 60 * 1000) return false;

  const method = req.method.toUpperCase();
  const uri = new URL(req.url).toString();
  const source = `${method}${uri}${rawBody}${ts}`;
  const expected = await hmacSha256Base64(secret, source);
  return expected === signature;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        function: "hubspot_webhook_ingest",
        mode: "webhook_queue_ingest",
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

  try {
    const rawBody = await req.text();
    const signatureValid = await verifyHubspotSignature(req, rawBody);
    if (!signatureValid) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid HubSpot webhook signature" }),
        { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    let parsed: any = [];
    try {
      parsed = rawBody ? JSON.parse(rawBody) : [];
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const events = Array.isArray(parsed) ? parsed : [parsed];
    if (!events.length) {
      return new Response(
        JSON.stringify({ ok: true, inserted: 0, ignored: 0, events_received: 0 }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    const queueRows: any[] = [];
    let ignored = 0;
    for (const event of events) {
      const objectType = detectWebhookObjectType(event);
      const objectId = webhookObjectId(event);
      if (!objectType || !objectId) {
        ignored += 1;
        continue;
      }
      queueRows.push({
        dedupe_key: await webhookDedupeKey(event),
        portal_id: Number(event?.portalId) || null,
        object_type: objectType,
        object_id: objectId,
        subscription_type: String(event?.subscriptionType || "unknown"),
        property_name: event?.propertyName ? String(event.propertyName) : null,
        occurred_at: webhookOccurredAtIso(event),
        event_timestamp_ms: Number(event?.occurredAt) || null,
        status: "pending",
        next_attempt_at: new Date().toISOString(),
        raw_event: event,
      });
    }

    const supabase = buildSupabaseAdminClient();
    let inserted = 0;
    if (queueRows.length > 0) {
      const { data, error } = await supabase
        .from("hubspot_webhook_events")
        .upsert(queueRows, { onConflict: "dedupe_key", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`Failed to enqueue webhook events: ${error.message}`);
      inserted = (data || []).length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        events_received: events.length,
        inserted,
        ignored,
        dedupe_candidates: queueRows.length,
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
