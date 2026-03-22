import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Agent Task Approve/Reject - Service-role gated endpoint.
 *
 * Replaces client-side direct updates to agent_tasks.status.
 * RLS now blocks anon UPDATE on agent_tasks, so all status
 * transitions must go through this function (service role).
 *
 * POST body:
 *   { task_id: string, action: "approve" | "reject", feedback?: string }
 *
 * On approve: sets status to "approved", then invokes agent-task-executor.
 * On reject:  sets status to "rejected", writes agent_memory if feedback given.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { task_id, action, feedback } = await req.json();

    if (!task_id || !action) {
      return new Response(
        JSON.stringify({ ok: false, error: "task_id and action required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action !== "approve" && action !== "reject") {
      return new Response(
        JSON.stringify({ ok: false, error: "action must be 'approve' or 'reject'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch the task first to verify it exists and is pending
    const { data: task, error: fetchErr } = await sb
      .from("agent_tasks")
      .select("*")
      .eq("id", task_id)
      .eq("status", "pending")
      .single();

    if (fetchErr || !task) {
      return new Response(
        JSON.stringify({ ok: false, error: "Task not found or not in pending status" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date().toISOString();

    if (action === "approve") {
      // 1. Update task status
      const { error: updateErr } = await sb
        .from("agent_tasks")
        .update({
          status: "approved",
          feedback_text: feedback || null,
          resolved_at: now,
        })
        .eq("id", task_id);

      if (updateErr) throw updateErr;

      // 2. Auto-execute via agent-task-executor
      let executionResult = null;
      try {
        const execResp = await fetch(
          `${supabaseUrl}/functions/v1/agent-task-executor`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ task_id }),
          },
        );
        executionResult = await execResp.json();
      } catch (err) {
        console.error("Executor invocation failed:", err);
        executionResult = { ok: false, error: (err as Error).message };
      }

      return new Response(
        JSON.stringify({ ok: true, action: "approved", task_id, execution: executionResult }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // action === "reject"
    const { error: updateErr } = await sb
      .from("agent_tasks")
      .update({
        status: "rejected",
        feedback_text: feedback || null,
        resolved_at: now,
      })
      .eq("id", task_id);

    if (updateErr) throw updateErr;

    // Always write agent_memory for rejections (even without feedback)
    await sb.from("agent_memory").insert({
      agent_id: task.agent_id,
      task_id,
      feedback_summary: feedback
        ? `REJECTED: ${task.title}. Feedback: ${feedback}`
        : `REJECTED: ${task.title}. No feedback provided.`,
    });

    return new Response(
      JSON.stringify({ ok: true, action: "rejected", task_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Agent Task Approve Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
