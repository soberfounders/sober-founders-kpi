import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendHubSpotEmail, lookupContactByEmail } from "../_shared/hubspot_email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Send a single outreach email from the dashboard review queue.
 *
 * Expects JSON body:
 * {
 *   email: string,
 *   firstname: string,
 *   subject: string,
 *   body: string,           // plain text email body
 *   campaign_type: string,  // 'no_show_followup' | 'at_risk_nudge' | 'winback' | 'streak_break'
 *   meeting_date?: string,  // ISO date of the missed meeting (for no-show)
 * }
 *
 * Flow:
 * 1. Look up HubSpot contact ID by email
 * 2. Send via Resend (real SMTP delivery)
 * 3. Log on HubSpot contact timeline
 * 4. Insert recovery_events record for tracking
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      email,
      firstname,
      subject,
      body,
      campaign_type,
      meeting_date,
    } = await req.json();

    if (!email || !subject || !body || !campaign_type) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required fields: email, subject, body, campaign_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const hubspotToken = Deno.env.get("HUBSPOT_PRIVATE_APP_TOKEN");
    const senderEmail = Deno.env.get("HUBSPOT_SENDER_EMAIL") || "alassise@soberfounders.org";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Check suppression list
    const { data: suppressed } = await supabase
      .from("contact_outreach_suppression")
      .select("contact_email")
      .ilike("contact_email", email)
      .limit(1);

    if (suppressed && suppressed.length > 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "Contact is on the suppression list" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Check for duplicate send (same email + campaign_type in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recentSends } = await supabase
      .from("recovery_events")
      .select("id")
      .ilike("attendee_email", email)
      .eq("event_type", campaign_type)
      .gte("delivered_at", sevenDaysAgo)
      .limit(1);

    if (recentSends && recentSends.length > 0) {
      return new Response(
        JSON.stringify({ ok: false, error: `Already sent ${campaign_type} email to ${email} in the last 7 days` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Look up HubSpot contact
    let contactId: string | null = null;
    if (hubspotToken) {
      contactId = await lookupContactByEmail(hubspotToken, email);
    }

    // 4. Send via Resend + log to HubSpot
    const htmlBody = `<p>${body.replace(/\n/g, "</p><p>")}</p>`;
    let emailResult = { ok: false, emailId: undefined as string | undefined, error: undefined as string | undefined };

    if (hubspotToken && contactId) {
      emailResult = await sendHubSpotEmail(hubspotToken, {
        contactId,
        contactEmail: email,
        senderEmail,
        subject,
        htmlBody,
        campaignType: campaign_type,
      });
    } else {
      // Fallback: send via Resend directly if no HubSpot contact found
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) {
        return new Response(
          JSON.stringify({ ok: false, error: "RESEND_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: `Andrew Lassise <${senderEmail}>`,
          to: [email],
          subject,
          text: body,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return new Response(
          JSON.stringify({ ok: false, error: `Resend failed: ${resp.status} ${errText}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const result = await resp.json();
      emailResult = { ok: true, emailId: result?.id, error: undefined };
    }

    if (!emailResult.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: emailResult.error || "Email send failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5. Log to recovery_events for comeback tracking
    const { error: insertError } = await supabase
      .from("recovery_events")
      .insert({
        attendee_email: email.toLowerCase(),
        event_type: campaign_type,
        meeting_date: meeting_date || null,
        delivered_at: new Date().toISOString(),
        metadata: {
          source: "dashboard_manual_send",
          subject,
          body_preview: body.slice(0, 200),
          hubspot_contact_id: contactId,
          resend_email_id: emailResult.emailId,
        },
      });

    if (insertError) {
      console.error("recovery_events insert error:", insertError);
      // Email was still sent — don't fail the response
    }

    return new Response(
      JSON.stringify({
        ok: true,
        emailId: emailResult.emailId,
        contactId,
        logged: !insertError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("send-outreach-email error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message || err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
