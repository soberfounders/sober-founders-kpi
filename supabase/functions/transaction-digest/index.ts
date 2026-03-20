import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmt$(v: number | null | undefined): string {
  if (v == null) return "$0.00";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function yesterdayRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dayAfter = new Date(yesterday);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  return {
    start: isoDate(yesterday),
    end: isoDate(dayAfter),
    label: yesterday.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/New_York",
    }),
  };
}

interface Transaction {
  source_system: string;
  row_id: string;
  donor_name: string | null;
  donor_email: string | null;
  amount: number;
  currency: string;
  fee_amount: number | null;
  net_amount: number | null;
  donated_at: string;
  status: string | null;
  is_recurring: boolean;
  campaign_name: string | null;
  payment_method: string | null;
}

interface Anomaly {
  severity: "high" | "medium" | "info";
  label: string;
  detail: string;
}

/* ------------------------------------------------------------------ */
/*  Anomaly Detection                                                 */
/* ------------------------------------------------------------------ */

function detectAnomalies(
  todayTxns: Transaction[],
  stats: { avg_amount: number; avg_daily_count: number; stddev_daily_count: number },
  recurringExpected: { donor_email: string; donor_name: string; last_amount: number }[],
  missingRecurring: { donor_email: string; donor_name: string; last_amount: number }[],
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // 1. Unusually large donations (>2x the 90-day average)
  const threshold = stats.avg_amount * 2;
  for (const txn of todayTxns) {
    if (txn.amount > threshold && threshold > 0) {
      anomalies.push({
        severity: "high",
        label: "Large donation",
        detail: `${escapeHtml(txn.donor_name) || "Anonymous"} donated ${fmt$(txn.amount)} (your 90-day avg is ${fmt$(stats.avg_amount)})`,
      });
    }
  }

  // 2. Failed or refunded transactions
  const failed = todayTxns.filter(
    (t) => t.status && ["failed", "refunded", "cancelled", "declined"].includes(t.status.toLowerCase()),
  );
  for (const txn of failed) {
    anomalies.push({
      severity: "high",
      label: `Transaction ${escapeHtml(txn.status)}`,
      detail: `${escapeHtml(txn.donor_name) || "Anonymous"} - ${fmt$(txn.amount)} (${escapeHtml(txn.status)})`,
    });
  }

  // 3. Unusual daily volume
  const count = todayTxns.length;
  const zScore =
    stats.stddev_daily_count > 0
      ? (count - stats.avg_daily_count) / stats.stddev_daily_count
      : 0;
  if (Math.abs(zScore) >= 2) {
    const direction = zScore > 0 ? "spike" : "drop";
    anomalies.push({
      severity: "medium",
      label: `Transaction volume ${direction}`,
      detail: `${count} transactions yesterday vs ${stats.avg_daily_count.toFixed(1)} daily average (${zScore > 0 ? "+" : ""}${zScore.toFixed(1)}σ)`,
    });
  }

  // 4. Missing expected recurring donations
  for (const donor of missingRecurring) {
    anomalies.push({
      severity: "medium",
      label: "Missing recurring donation",
      detail: `${escapeHtml(donor.donor_name) || escapeHtml(donor.donor_email)} usually gives ${fmt$(donor.last_amount)} monthly but hasn't this month`,
    });
  }

  // 5. First-time donors (informational)
  // We check if donor_email has no prior transactions
  const firstTimers = todayTxns.filter((t) => t.donor_email && !t.is_recurring);
  // This is handled in the main function with a DB query

  return anomalies;
}

/* ------------------------------------------------------------------ */
/*  Email Builder                                                     */
/* ------------------------------------------------------------------ */

function buildEmailHtml(
  dateLabel: string,
  txns: Transaction[],
  anomalies: Anomaly[],
  stats: { total: number; count: number; recurring_total: number; recurring_count: number; one_time_total: number; one_time_count: number },
  firstTimeDonors: string[],
): string {
  const highAnomalies = anomalies.filter((a) => a.severity === "high");
  const medAnomalies = anomalies.filter((a) => a.severity === "medium");
  const hasAnomalies = anomalies.length > 0;

  const subjectEmoji = highAnomalies.length > 0 ? "🚨" : medAnomalies.length > 0 ? "⚠️" : "✅";

  let html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
  <h1 style="font-size: 22px; margin-bottom: 4px;">${subjectEmoji} Transaction Digest</h1>
  <p style="color: #666; margin-top: 0; font-size: 14px;">${dateLabel}</p>
`;

  // Anomaly alerts
  if (hasAnomalies) {
    html += `<div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">`;
    html += `<strong style="font-size: 15px;">Flagged Items (${anomalies.length})</strong>`;
    html += `<ul style="margin: 8px 0 0 0; padding-left: 20px;">`;
    for (const a of anomalies) {
      const icon = a.severity === "high" ? "🔴" : a.severity === "medium" ? "🟡" : "🔵";
      html += `<li style="margin-bottom: 6px;">${icon} <strong>${a.label}:</strong> ${a.detail}</li>`;
    }
    html += `</ul></div>`;
  } else {
    html += `<div style="background: #d4edda; border-left: 4px solid #28a745; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
      <strong>All clear.</strong> No anomalies detected yesterday.
    </div>`;
  }

  // Summary stats
  html += `
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr style="background: #f8f9fa;">
      <td style="padding: 10px 14px; border: 1px solid #dee2e6;"><strong>Total Revenue</strong></td>
      <td style="padding: 10px 14px; border: 1px solid #dee2e6; text-align: right; font-size: 18px; font-weight: bold;">${fmt$(stats.total)}</td>
    </tr>
    <tr>
      <td style="padding: 10px 14px; border: 1px solid #dee2e6;">Transactions</td>
      <td style="padding: 10px 14px; border: 1px solid #dee2e6; text-align: right;">${stats.count}</td>
    </tr>
    <tr style="background: #f8f9fa;">
      <td style="padding: 10px 14px; border: 1px solid #dee2e6;">Recurring</td>
      <td style="padding: 10px 14px; border: 1px solid #dee2e6; text-align: right;">${stats.recurring_count} (${fmt$(stats.recurring_total)})</td>
    </tr>
    <tr>
      <td style="padding: 10px 14px; border: 1px solid #dee2e6;">One-time</td>
      <td style="padding: 10px 14px; border: 1px solid #dee2e6; text-align: right;">${stats.one_time_count} (${fmt$(stats.one_time_total)})</td>
    </tr>
  </table>`;

  // First-time donors
  if (firstTimeDonors.length > 0) {
    html += `<div style="background: #e8f4fd; border-left: 4px solid #0d6efd; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">`;
    html += `<strong>🆕 First-time donors (${firstTimeDonors.length}):</strong> ${firstTimeDonors.map(escapeHtml).join(", ")}`;
    html += `</div>`;
  }

  // Transaction list
  if (txns.length > 0) {
    html += `<h2 style="font-size: 16px; margin-top: 24px;">All Transactions</h2>`;
    html += `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">`;
    html += `<tr style="background: #343a40; color: white;">
      <th style="padding: 8px 10px; text-align: left;">Donor</th>
      <th style="padding: 8px 10px; text-align: right;">Amount</th>
      <th style="padding: 8px 10px; text-align: center;">Type</th>
      <th style="padding: 8px 10px; text-align: left;">Campaign</th>
    </tr>`;

    for (let i = 0; i < txns.length; i++) {
      const t = txns[i];
      const bg = i % 2 === 0 ? "#ffffff" : "#f8f9fa";
      const statusBadge =
        t.status && ["failed", "refunded", "cancelled", "declined"].includes(t.status.toLowerCase())
          ? ` <span style="color: red; font-weight: bold;">[${escapeHtml(t.status)}]</span>`
          : "";
      html += `<tr style="background: ${bg};">
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${escapeHtml(t.donor_name) || "Anonymous"}${statusBadge}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee; text-align: right;">${fmt$(t.amount)}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee; text-align: center;">${t.is_recurring ? "🔄" : "1x"}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${escapeHtml(t.campaign_name) || "-"}</td>
      </tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p style="color: #666; font-style: italic; margin-top: 16px;">No transactions yesterday.</p>`;
  }

  html += `
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0 12px;">
  <p style="font-size: 11px; color: #999;">Generated by Sober Founders Transaction Digest &bull; ${new Date().toISOString().slice(0, 16)} UTC</p>
</div>`;

  return html;
}

/* ------------------------------------------------------------------ */
/*  Main Handler                                                      */
/* ------------------------------------------------------------------ */

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const recipientEmail =
      Deno.env.get("DIGEST_RECIPIENT_EMAIL") || "alassise@soberfounders.org";
    const senderEmail =
      Deno.env.get("HUBSPOT_SENDER_EMAIL") || "alassise@soberfounders.org";

    if (!resendKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { start, end, label: dateLabel } = yesterdayRange();

    // 1. Fetch yesterday's transactions
    const { data: txns, error: txnError } = await supabase
      .from("donation_transactions_unified")
      .select("*")
      .gte("donated_at", start)
      .lt("donated_at", end)
      .order("donated_at", { ascending: true });

    if (txnError) throw txnError;
    const transactions: Transaction[] = txns || [];

    // 2. Compute 90-day baseline stats for anomaly detection
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90);

    const { data: historicalTxns } = await supabase
      .from("donation_transactions_unified")
      .select("amount,donated_at")
      .gte("donated_at", isoDate(ninetyDaysAgo))
      .lt("donated_at", start);

    const historical = historicalTxns || [];
    const avgAmount =
      historical.length > 0
        ? historical.reduce((s, r) => s + Number(r.amount || 0), 0) / historical.length
        : 0;

    // Daily count stats
    const dailyCounts: Record<string, number> = {};
    for (const r of historical) {
      const day = r.donated_at?.slice(0, 10);
      if (day) dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    }
    const countValues = Object.values(dailyCounts);
    // Include zero-transaction days in the average
    const totalDays = 90;
    const avgDailyCount = historical.length / totalDays;
    const stddevDailyCount =
      countValues.length > 1
        ? Math.sqrt(
            countValues.reduce((s, v) => s + (v - avgDailyCount) ** 2, 0) /
              countValues.length,
          )
        : 0;

    // 3. Identify missing recurring donors this month
    //    Find donors who gave recurring in each of the last 2 months but not this month
    const thisMonthStart = new Date();
    thisMonthStart.setUTCDate(1);
    const twoMonthsAgo = new Date(thisMonthStart);
    twoMonthsAgo.setUTCMonth(twoMonthsAgo.getUTCMonth() - 2);

    const { data: recentRecurring } = await supabase
      .from("donation_transactions_unified")
      .select("donor_email,donor_name,amount,donated_at")
      .eq("is_recurring", true)
      .gte("donated_at", isoDate(twoMonthsAgo))
      .lt("donated_at", isoDate(thisMonthStart));

    const { data: thisMonthRecurring } = await supabase
      .from("donation_transactions_unified")
      .select("donor_email")
      .eq("is_recurring", true)
      .gte("donated_at", isoDate(thisMonthStart));

    const thisMonthEmails = new Set(
      (thisMonthRecurring || []).map((r) => r.donor_email?.toLowerCase()),
    );

    // Group recent recurring by donor
    const recurringDonors: Record<string, { donor_name: string; last_amount: number; months: Set<string> }> = {};
    for (const r of recentRecurring || []) {
      const email = r.donor_email?.toLowerCase();
      if (!email) continue;
      const month = r.donated_at?.slice(0, 7);
      if (!recurringDonors[email]) {
        recurringDonors[email] = { donor_name: r.donor_name || email, last_amount: Number(r.amount), months: new Set() };
      }
      recurringDonors[email].months.add(month);
      recurringDonors[email].last_amount = Number(r.amount);
    }

    const missingRecurring = Object.entries(recurringDonors)
      .filter(([email, info]) => info.months.size >= 2 && !thisMonthEmails.has(email))
      .map(([email, info]) => ({
        donor_email: email,
        donor_name: info.donor_name,
        last_amount: info.last_amount,
      }));

    // Only flag missing recurring after the 15th of the month (give them time)
    const dayOfMonth = new Date().getUTCDate();
    const missingToFlag = dayOfMonth >= 15 ? missingRecurring : [];

    // 4. Detect first-time donors
    const yesterdayEmails = transactions
      .filter((t) => t.donor_email)
      .map((t) => t.donor_email!.toLowerCase());

    const firstTimeDonors: string[] = [];
    if (yesterdayEmails.length > 0) {
      const { data: priorDonors } = await supabase
        .from("donation_transactions_unified")
        .select("donor_email")
        .in("donor_email", yesterdayEmails)
        .lt("donated_at", start);

      const priorEmails = new Set(
        (priorDonors || []).map((r) => r.donor_email?.toLowerCase()),
      );

      for (const txn of transactions) {
        const email = txn.donor_email?.toLowerCase();
        if (email && !priorEmails.has(email)) {
          firstTimeDonors.push(txn.donor_name || email);
          priorEmails.add(email); // prevent dupes in list
        }
      }
    }

    // 5. Run anomaly detection
    const anomalies = detectAnomalies(
      transactions,
      { avg_amount: avgAmount, avg_daily_count: avgDailyCount, stddev_daily_count: stddevDailyCount },
      [],
      missingToFlag,
    );

    // 6. Compute summary stats
    const summaryStats = {
      total: transactions.reduce((s, t) => s + Number(t.amount || 0), 0),
      count: transactions.length,
      recurring_total: transactions
        .filter((t) => t.is_recurring)
        .reduce((s, t) => s + Number(t.amount || 0), 0),
      recurring_count: transactions.filter((t) => t.is_recurring).length,
      one_time_total: transactions
        .filter((t) => !t.is_recurring)
        .reduce((s, t) => s + Number(t.amount || 0), 0),
      one_time_count: transactions.filter((t) => !t.is_recurring).length,
    };

    // 7. Build and send email
    const htmlBody = buildEmailHtml(
      dateLabel,
      transactions,
      anomalies,
      summaryStats,
      firstTimeDonors,
    );

    const highCount = anomalies.filter((a) => a.severity === "high").length;
    const subjectPrefix = highCount > 0 ? "🚨" : anomalies.length > 0 ? "⚠️" : "✅";
    const subject = `${subjectPrefix} Transaction Digest: ${fmt$(summaryStats.total)} from ${summaryStats.count} txns — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: `Sober Founders <${senderEmail}>`,
        to: [recipientEmail],
        subject,
        html: htmlBody,
      }),
    });

    if (!resendResp.ok) {
      const errText = await resendResp.text();
      throw new Error(`Resend failed: ${resendResp.status} ${errText}`);
    }

    const resendResult = await resendResp.json();

    console.log(
      `Transaction digest sent: ${summaryStats.count} txns, ${anomalies.length} anomalies, email_id=${resendResult?.id}`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        date: start,
        transactions: summaryStats.count,
        total: summaryStats.total,
        anomalies: anomalies.length,
        first_time_donors: firstTimeDonors.length,
        email_id: resendResult?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("Transaction digest error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message || err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
