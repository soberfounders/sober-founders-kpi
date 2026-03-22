import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendHubSpotEmail, lookupContactByEmail } from "../_shared/hubspot_email.ts";
import { createNotionFollowUp } from "../_shared/notion_task.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Agent Task Executor
 *
 * Processes approved agent_tasks. Called either:
 * - Manually from the dashboard after approving a task
 * - On a cron schedule to sweep newly-approved tasks
 *
 * POST body: { task_id: string } — execute a specific task
 * POST body: {} — sweep all approved (unexecuted) tasks
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);
    const hubspotToken = Deno.env.get("HUBSPOT_PRIVATE_APP_TOKEN") || "";
    const senderEmail = Deno.env.get("HUBSPOT_SENDER_EMAIL") || "alassise@soberfounders.org";

    // Parse request
    let taskId: string | null = null;
    try {
      const body = await req.json();
      taskId = body?.task_id || null;
    } catch { /* no body — sweep mode */ }

    // Fetch tasks to execute
    let query = sb
      .from("agent_tasks")
      .select("*")
      .eq("status", "approved");

    if (taskId) {
      query = query.eq("id", taskId);
    }

    const { data: tasks, error: fetchErr } = await query.limit(20);
    if (fetchErr) throw fetchErr;

    if (!tasks || tasks.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, executed: 0, message: "No approved tasks to execute" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ task_id: string; status: string; error?: string }> = [];

    for (const task of tasks) {
      try {
        // Budget re-check before execution
        const { data: budgetData } = await sb
          .from("vw_agent_budget_status")
          .select("exposure_24h_cents, daily_budget_cents")
          .eq("agent_id", task.agent_id)
          .single();

        if (budgetData) {
          const exposure = Number(budgetData.exposure_24h_cents);
          const limit = Number(budgetData.daily_budget_cents);
          if (exposure > limit) {
            await sb.from("agents").update({ status: "paused" }).eq("id", task.agent_id);
            results.push({ task_id: task.id, status: "error", error: "Budget exceeded at execution time" });
            continue;
          }
        }

        let executionResult: { ok: boolean; error?: string } = { ok: false, error: "Unknown task type" };

        if (task.type === "email") {
          executionResult = await executeEmailTask(sb, task, hubspotToken, senderEmail);
        } else if (task.type === "wp_post") {
          executionResult = await executeWpPostTask(task);
        } else if (task.type === "crm_update") {
          executionResult = { ok: true }; // Placeholder for CRM updates
        } else {
          executionResult = { ok: true }; // Generic tasks marked as done
        }

        if (executionResult.ok) {
          await sb.from("agent_tasks").update({
            status: "executed",
            resolved_at: new Date().toISOString(),
          }).eq("id", task.id);

          // Log usage
          await sb.from("agent_usage_logs").insert({
            agent_id: task.agent_id,
            task_id: task.id,
            tokens_used: 0,
            cost_cents: task.cost_estimate_cents || 0,
            model_used: "executor",
          });

          results.push({ task_id: task.id, status: "executed" });
        } else {
          results.push({ task_id: task.id, status: "error", error: executionResult.error });
        }
      } catch (err) {
        results.push({ task_id: task.id, status: "error", error: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, executed: results.filter((r) => r.status === "executed").length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/* ------------------------------------------------------------------ */
/*  Email task executor                                                */
/* ------------------------------------------------------------------ */

async function executeEmailTask(
  sb: ReturnType<typeof createClient>,
  task: any,
  hubspotToken: string,
  senderEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  const { email, subject, body, campaign_type } = task.payload as any;

  if (!email || !subject || !body) {
    return { ok: false, error: "Missing email, subject, or body in payload" };
  }

  // Look up HubSpot contact
  const { data: contact } = await sb
    .from("raw_hubspot_contacts")
    .select("hubspot_contact_id")
    .ilike("email", email)
    .limit(1)
    .single();

  let contactId = contact?.hubspot_contact_id;
  if (!contactId && hubspotToken) {
    contactId = await lookupContactByEmail(hubspotToken, email);
  }

  if (contactId && hubspotToken) {
    const htmlBody = body.split("\n").map((l: string) => l ? `<p>${l}</p>` : "").join("");
    const emailResult = await sendHubSpotEmail(hubspotToken, {
      contactId,
      contactEmail: email,
      senderEmail,
      subject,
      htmlBody,
      campaignType: campaign_type || "agent_outreach",
    });

    if (!emailResult.ok) {
      return { ok: false, error: emailResult.error };
    }
  } else {
    // Fallback: send via Resend directly (no HubSpot contact)
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return { ok: false, error: "No HubSpot contact and no RESEND_API_KEY" };

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: `Andrew Lassise <${senderEmail}>`,
        to: [email],
        subject,
        text: body,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { ok: false, error: `Resend failed: ${resp.status} ${errText}` };
    }
  }

  // Log to recovery_events for dedup
  await sb.from("recovery_events").insert({
    attendee_email: email,
    event_type: campaign_type || "agent_outreach",
    metadata: {
      source: "agent_task_executor",
      subject,
      body_preview: body.substring(0, 200),
      hubspot_contact_id: contactId,
    },
  });

  // Create Notion follow-up
  await createNotionFollowUp({
    title: `Follow up: ${task.title}`,
    description: `Agent task executed.\n\nEmail: "${subject}"\nTo: ${email}`,
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    priority: "Medium",
    tags: ["outreach", campaign_type || "agent", "automated"],
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  WordPress post task executor                                       */
/* ------------------------------------------------------------------ */

async function executeWpPostTask(task: any): Promise<{ ok: boolean; error?: string }> {
  const { title, content, categories } = task.payload as any;

  const wpUser = Deno.env.get("WP_APPLICATION_USERNAME") || "Andrew";
  const wpPass = Deno.env.get("WP_APPLICATION_PASSWORD");
  if (!wpPass) return { ok: false, error: "WP_APPLICATION_PASSWORD not set" };

  const resp = await fetch("https://soberfounders.org/wp-json/wp/v2/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa(`${wpUser}:${wpPass}`),
    },
    body: JSON.stringify({
      title,
      content,
      status: "pending", // Always create as pending for human review on WordPress
      categories: categories || [],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { ok: false, error: `WP API ${resp.status}: ${errText}` };
  }

  return { ok: true };
}
