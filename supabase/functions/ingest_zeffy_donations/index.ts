import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-zeffy-webhook-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function mustGetEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function firstPresent(obj: any, paths: string[]): any {
  for (const path of paths) {
    const value = path.split(".").reduce<any>((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function toNumberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const txt = String(value).trim().replace(/[$,\s]/g, "");
  if (!txt) return null;
  const n = Number(txt);
  return Number.isFinite(n) ? n : null;
}

function parseAmountFromPayload(payload: any, kind: "gross" | "fee" | "tip" | "net"): number | null {
  const centsPaths: Record<string, string[]> = {
    gross: ["amount_cents", "gross_amount_cents", "total_amount_cents", "amounts.gross_cents", "amounts.total_cents"],
    fee: ["fee_cents", "platform_fee_cents", "amounts.fee_cents"],
    tip: ["tip_cents", "amounts.tip_cents"],
    net: ["net_amount_cents", "amounts.net_cents"],
  };
  const dollarPaths: Record<string, string[]> = {
    gross: ["amount", "donation_amount", "total_amount", "gross_amount", "amounts.gross", "amounts.total"],
    fee: ["fee_amount", "platform_fee", "fee", "amounts.fee"],
    tip: ["tip_amount", "tip", "amounts.tip"],
    net: ["net_amount", "amounts.net"],
  };

  const cents = toNumberOrNull(firstPresent(payload, centsPaths[kind]));
  if (cents !== null) return cents / 100;
  return toNumberOrNull(firstPresent(payload, dollarPaths[kind]));
}

function parseBool(value: any): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const txt = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "recurring", "monthly"].includes(txt);
}

function parseIsoMaybe(value: any): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeEmail(value: any): string | null {
  const txt = String(value || "").trim().toLowerCase();
  return txt || null;
}

function compactWhitespace(value: any): string | null {
  const txt = String(value || "").replace(/\s+/g, " ").trim();
  return txt || null;
}

function donorNameFromPayload(payload: any): string | null {
  const direct = compactWhitespace(firstPresent(payload, [
    "donor_name",
    "supporter_name",
    "customer_name",
    "name",
    "full_name",
    "supporter.full_name",
    "customer.full_name",
  ]));
  if (direct) return direct;
  const first = compactWhitespace(firstPresent(payload, ["first_name", "supporter.first_name", "customer.first_name"]));
  const last = compactWhitespace(firstPresent(payload, ["last_name", "supporter.last_name", "customer.last_name"]));
  return compactWhitespace(`${first || ""} ${last || ""}`);
}

function deriveSourceEventId(payload: any, donatedAtIso: string | null, amount: number | null): string {
  const explicit = compactWhitespace(firstPresent(payload, [
    "source_event_id",
    "event_id",
    "id",
    "transaction_id",
    "payment_id",
    "donation_id",
    "receipt_id",
    "receipt_number",
    "uuid",
    "data.id",
  ]));
  if (explicit) return `zeffy:${explicit}`;

  const email = normalizeEmail(firstPresent(payload, ["donor_email", "email", "supporter.email", "customer.email"])) || "unknown";
  const ts = donatedAtIso || parseIsoMaybe(firstPresent(payload, ["created_at", "date", "donated_at", "paid_at"])) || new Date().toISOString();
  const amt = amount !== null ? amount.toFixed(2) : "unknown";
  return `zeffy:fallback:${ts}:${email}:${amt}`;
}

function mapPayloadToRow(payload: any) {
  const grossAmount = parseAmountFromPayload(payload, "gross");
  const feeAmount = parseAmountFromPayload(payload, "fee");
  const tipAmount = parseAmountFromPayload(payload, "tip");
  const netAmount = parseAmountFromPayload(payload, "net");
  const donatedAt =
    parseIsoMaybe(firstPresent(payload, [
      "donated_at",
      "created_at",
      "date",
      "paid_at",
      "payment_date",
      "created",
      "timestamp",
    ])) || new Date().toISOString();

  const donorEmail = normalizeEmail(firstPresent(payload, [
    "donor_email",
    "email",
    "supporter.email",
    "customer.email",
    "payer.email",
  ]));
  const donorName = donorNameFromPayload(payload);
  const sourceEventId = deriveSourceEventId(payload, donatedAt, grossAmount);
  const zeffyDonationId = compactWhitespace(firstPresent(payload, ["donation_id", "data.donation_id", "zeffy_donation_id"]));
  const zeffyPaymentId = compactWhitespace(firstPresent(payload, ["payment_id", "transaction_id", "data.payment_id", "zeffy_payment_id"]));
  const status = compactWhitespace(firstPresent(payload, ["status", "payment_status", "data.status"])) || "unknown";
  const campaignName = compactWhitespace(firstPresent(payload, ["campaign_name", "campaign", "fund_name", "data.campaign_name"]));
  const formName = compactWhitespace(firstPresent(payload, ["form_name", "form", "donation_form_name", "data.form_name"]));
  const paymentMethod = compactWhitespace(firstPresent(payload, ["payment_method", "method", "card_brand", "data.payment_method"]));
  const isRecurring = parseBool(firstPresent(payload, ["is_recurring", "recurring", "subscription", "donation_type"]));
  const currency = compactWhitespace(firstPresent(payload, ["currency", "amount_currency"])) || "USD";

  return {
    source_event_id: sourceEventId,
    zeffy_donation_id: zeffyDonationId,
    zeffy_payment_id: zeffyPaymentId,
    donor_name: donorName,
    donor_email: donorEmail,
    amount: grossAmount ?? 0,
    currency,
    fee_amount: feeAmount,
    tip_amount: tipAmount,
    net_amount: netAmount,
    donated_at: donatedAt,
    source_created_at: parseIsoMaybe(firstPresent(payload, ["created_at", "date", "timestamp"])),
    status,
    is_recurring: isRecurring,
    campaign_name: campaignName,
    form_name: formName,
    payment_method: paymentMethod,
    donor_address: firstPresent(payload, ["address", "donor_address", "supporter.address", "customer.address"]) || {},
    payload,
    ingested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
        function: "ingest_zeffy_donations",
        mode: "webhook_ingest",
        note: "POST Zeffy/Zapier payloads (single object or array) to upsert raw_zeffy_donations.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const expectedSecret = Deno.env.get("ZEFFY_WEBHOOK_SECRET");
    if (expectedSecret) {
      const provided = req.headers.get("x-zeffy-webhook-secret") || "";
      if (provided !== expectedSecret) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized webhook secret" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUrl = mustGetEnv("SUPABASE_URL");
    const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payloads = Array.isArray(body)
      ? body
      : Array.isArray(body?.donations)
        ? body.donations
        : Array.isArray(body?.records)
          ? body.records
          : [body];

    const rows = payloads
      .filter((p) => p && typeof p === "object")
      .map(mapPayloadToRow)
      .filter((row) => Number.isFinite(row.amount) && row.amount > 0);

    if (!rows.length) {
      return new Response(JSON.stringify({ ok: false, error: "No valid donation rows found in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("raw_zeffy_donations")
      .upsert(rows, { onConflict: "source_event_id" })
      .select("id,source_event_id");

    if (error) throw error;

    return new Response(
      JSON.stringify({
        ok: true,
        rows_received: payloads.length,
        rows_upserted: data?.length || 0,
        note: "Zeffy donations ingested into raw_zeffy_donations",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("ingest_zeffy_donations error", error);
    return new Response(JSON.stringify({ ok: false, error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
