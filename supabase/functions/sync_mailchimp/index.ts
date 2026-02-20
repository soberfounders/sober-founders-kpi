// sync_mailchimp — Antigravity Email Analytics Agent
// Pulls fresh Mailchimp campaign data, calculates MPP-adjusted rates,
// upserts into Supabase, and runs anomaly detection.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mustGetEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/**
 * Classify a campaign into Tuesday / Thursday / null by inspecting
 * both the campaign title AND the subject line, case-insensitive.
 */
function classifyCampaign(campaign: any): "Tuesday" | "Thursday" | null {
  const title      = (campaign.settings?.title       || "").toLowerCase();
  const subject    = (campaign.settings?.subject_line || "").toLowerCase();
  const preview    = (campaign.settings?.preview_text || "").toLowerCase();
  const combined   = `${title} ${subject} ${preview}`;

  if (combined.includes("tuesday"))  return "Tuesday";
  if (combined.includes("thursday")) return "Thursday";

  // Fallback: check send weekday
  if (campaign.send_time) {
    const dow = new Date(campaign.send_time).getUTCDay(); // 0=Sun
    if (dow === 2) return "Tuesday";
    if (dow === 4) return "Thursday";
  }

  return null;
}

/**
 * Mailchimp's `click_rate` field in /reports is documented as
 * (unique_clicks / unique_opens) — i.e. CTOR, not CTR.
 * We ALWAYS calculate CTR and CTOR manually from raw numerators.
 *
 * CTR  = unique_clicks / emails_delivered   (clicks/delivered, ~1-4%)
 * CTOR = unique_clicks / unique_opens        (clicks/opens,    ~10-15%)
 */
function computeRates(report: any) {
  const emailsSent    = report.emails_sent   || 0;
  const hardBounces   = report.bounces?.hard_bounces || 0;
  const softBounces   = report.bounces?.soft_bounces || 0;
  const totalBounces  = hardBounces + softBounces;
  const delivered     = emailsSent - totalBounces;

  const uniqueOpens   = report.opens?.unique_opens   || 0;

  // Mailchimp surfaces Apple MPP data in opens.mpp_opens (newer API versions).
  // If absent, fall back to 0 — human_open_rate then equals raw_open_rate
  // and we label it accordingly in the UI.
  const mppOpens      = report.opens?.mpp_opens       || 0;

  // Unique clicks — from report.clicks.unique_clicks (raw count, not a rate)
  const uniqueClicks  = report.clicks?.unique_clicks  || 0;

  // unsubscribed is the count of unsubscribes for this campaign
  const unsubscribes  = report.unsubscribed           || 0;

  // --- manual calculations (never trust Mailchimp pre-computed rates) ---
  const rawOpenRate      = delivered > 0 ? uniqueOpens  / delivered  : 0;
  const humanOpenRate    = delivered > 0 ? (uniqueOpens - mppOpens) / delivered : 0;
  const ctr              = delivered > 0 ? uniqueClicks / delivered  : 0;  // clicks/delivered
  const ctor             = uniqueOpens > 0 ? uniqueClicks / uniqueOpens : 0; // clicks/opens
  const unsubscribeRate  = delivered > 0 ? unsubscribes / delivered  : 0;
  const bounceRate       = emailsSent > 0 ? totalBounces / emailsSent : 0;

  return {
    emails_sent: emailsSent,
    emails_delivered: delivered,
    unique_opens: uniqueOpens,
    mpp_opens: mppOpens,
    unique_clicks: uniqueClicks,
    unsubscribes,
    bounces: totalBounces,
    raw_open_rate: rawOpenRate,
    human_open_rate: humanOpenRate,
    ctr,
    ctor,
    unsubscribe_rate: unsubscribeRate,
    bounce_rate: bounceRate,
  };
}

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

function diagnoseOpenRateDrop(current: any, previous: any): string {
  const parts: string[] = [];

  const rawDrop   = (previous.raw_open_rate   || 0) - (current.raw_open_rate   || 0);
  const humanDrop = (previous.human_open_rate || 0) - (current.human_open_rate || 0);

  if (rawDrop > 0.10 && humanDrop < 0.05) {
    parts.push(
      "⚠️ Likely an Apple MPP correction — raw open rate fell sharply but human (MPP-adjusted) rate is stable. This is NOT a real engagement drop; Apple Mail's bot opens simply corrected downward.",
    );
  }

  if (current.subject_line && previous.subject_line && current.subject_line !== previous.subject_line) {
    parts.push(
      `Subject line changed: "${previous.subject_line}" → "${current.subject_line}". A different subject line may account for the change.`,
    );
  }

  if (previous.human_open_rate > 0.60) {
    parts.push(
      "Previous campaign had an unusually high open rate (>60%), which may make this send look like a sharp drop by comparison even if performance is normal.",
    );
  }

  parts.push("Also check: first send after a list import, or a different send time than usual.");

  return parts.join(" ");
}

async function detectAnomalies(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<any[]> {
  const alerts: any[] = [];

  // Fetch last 20 stored campaigns (newest first) — we need ≥2 per group to compare
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/mailchimp_campaigns?order=send_time.desc&limit=20&select=*`,
    {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );

  if (!resp.ok) return alerts; // Skip silently — DB may not be seeded yet

  const history: any[] = await resp.json();

  for (const group of ["Tuesday", "Thursday"] as const) {
    const records = history.filter((h) => h.campaign_group === group);
    if (records.length < 2) continue;

    const current  = records[0];
    const previous = records[1];

    // 1. Human open rate drop > 15 pp
    const openRateDrop = (previous.human_open_rate || 0) - (current.human_open_rate || 0);
    if (openRateDrop > 0.15) {
      alerts.push({
        group,
        type: "Open Rate Drop",
        severity: "high",
        message: `Human Open Rate (excl. Apple MPP) dropped by ${(openRateDrop * 100).toFixed(1)} percentage points vs. last week (${(previous.human_open_rate * 100).toFixed(1)}% → ${(current.human_open_rate * 100).toFixed(1)}%).`,
        diagnosis: diagnoseOpenRateDrop(current, previous),
      });
    }

    // 2. CTR drop > 1 pp
    const ctrDrop = (previous.ctr || 0) - (current.ctr || 0);
    if (ctrDrop > 0.01) {
      alerts.push({
        group,
        type: "CTR Drop",
        severity: "medium",
        message: `Click-Through Rate (CTR = clicks/delivered) dropped by ${(ctrDrop * 100).toFixed(1)} pp (${(previous.ctr * 100).toFixed(1)}% → ${(current.ctr * 100).toFixed(1)}%). Note: CTR of ~2% is normal for this list.`,
      });
    }

    // 3. Unsubscribe spike > 0.5%
    if ((current.unsubscribe_rate || 0) > 0.005) {
      alerts.push({
        group,
        type: "Unsubscribe Rate Spike",
        severity: "high",
        message: `Unsubscribe rate hit ${(current.unsubscribe_rate * 100).toFixed(2)}% — above the 0.5% warning threshold. Review the content or list segment for this send.`,
      });
    }

    // 4. Delivered count dropped > 20%
    if (previous.emails_delivered > 0) {
      const deliveryRatio = current.emails_delivered / previous.emails_delivered;
      if (deliveryRatio < 0.80) {
        alerts.push({
          group,
          type: "Delivery Volume Drop",
          severity: "high",
          message: `Emails delivered dropped by ${((1 - deliveryRatio) * 100).toFixed(0)}%: ${current.emails_delivered.toLocaleString()} this send vs. ${previous.emails_delivered.toLocaleString()} last send. Could indicate a list suppression event, bounce spike, or sending issue.`,
        });
      }
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const MAILCHIMP_API_KEY       = mustGetEnv("MAILCHIMP_API_KEY");
    const MAILCHIMP_SERVER_PREFIX = mustGetEnv("MAILCHIMP_SERVER_PREFIX");
    const SUPABASE_URL            = mustGetEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");

    const MC_BASE = `https://${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0`;

    async function mcFetch(path: string) {
      const r = await fetch(`${MC_BASE}${path}`, {
        headers: {
          Authorization: `apikey ${MAILCHIMP_API_KEY}`,
          "Content-Type": "application/json",
        },
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Mailchimp ${path} → ${r.status}: ${txt}`);
      }
      return r.json();
    }

    // --- Step 1: Fetch last 50 sent campaigns ---
    const { campaigns } = await mcFetch(
      "/campaigns?count=50&sort_field=send_time&sort_dir=DESC&status=sent",
    );

    const rows: any[] = [];

    for (const campaign of campaigns ?? []) {
      const group = classifyCampaign(campaign);
      if (!group) continue; // Not a Tue/Thu campaign — skip

      // --- Step 2: Fetch the per-campaign report ---
      const report = await mcFetch(`/reports/${campaign.id}`);

      const metrics = computeRates(report);

      rows.push({
        id:            campaign.id,
        title:         campaign.settings?.title        || "",
        subject_line:  campaign.settings?.subject_line || "",
        send_time:     campaign.send_time,
        campaign_group: group,
        ...metrics,
        metadata: {
          // Store raw API response for operator verification
          report_summary: {
            open_rate_field_from_api: report.opens?.open_rate,   // This is Mailchimp's pre-computed open rate (unique/delivered) — we verify against our manual calc
            click_rate_field_from_api: report.clicks?.click_rate, // Mailchimp docs: click_rate = unique_clicks/unique_opens (CTOR!) — we do NOT label this as CTR
            unique_subscriber_clicks: report.clicks?.unique_subscriber_clicks,
          },
        },
      });
    }

    // --- Step 3: Upsert into Supabase ---
    if (rows.length > 0) {
      const upsertResp = await fetch(
        `${SUPABASE_URL}/rest/v1/mailchimp_campaigns?on_conflict=id`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "content-type": "application/json",
            prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(rows),
        },
      );

      if (!upsertResp.ok) {
        const txt = await upsertResp.text();
        throw new Error(`Supabase upsert failed: ${upsertResp.status} ${txt}`);
      }
    }

    // --- Step 4: Anomaly detection against fresh DB history ---
    const anomalies = await detectAnomalies(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    return new Response(
      JSON.stringify({
        ok: true,
        synced_campaigns: rows.length,
        tuesday_count:  rows.filter((r) => r.campaign_group === "Tuesday").length,
        thursday_count: rows.filter((r) => r.campaign_group === "Thursday").length,
        anomalies,
        data: rows,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("sync_mailchimp error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
