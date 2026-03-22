import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Budget guardrail edge function.
 *
 * Called before every agent action. Returns { allowed: true/false }
 * and auto-pauses the agent if the 24h spend exceeds daily_budget_cents.
 *
 * POST body: { agent_id: string, estimated_cost_cents?: number }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { agent_id, estimated_cost_cents = 0 } = await req.json();
    if (!agent_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "agent_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch agent + rolling 24h spend in one query via the view
    const { data: budget, error: budgetErr } = await sb
      .from("vw_agent_budget_status")
      .select("*")
      .eq("agent_id", agent_id)
      .single();

    if (budgetErr || !budget) {
      return new Response(
        JSON.stringify({ ok: false, error: budgetErr?.message || "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const spent = Number(budget.spent_24h_cents);
    const limit = Number(budget.daily_budget_cents);
    const projectedSpend = spent + estimated_cost_cents;
    const allowed = projectedSpend <= limit && budget.status !== "paused";

    // Auto-pause if budget exceeded
    if (projectedSpend > limit && budget.status === "active") {
      await sb
        .from("agents")
        .update({ status: "paused" })
        .eq("id", agent_id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        allowed,
        agent_id,
        daily_budget_cents: limit,
        spent_24h_cents: spent,
        remaining_cents: Math.max(0, limit - spent),
        estimated_cost_cents,
        reason: !allowed
          ? projectedSpend > limit
            ? "Budget exceeded for rolling 24h window"
            : "Agent is paused"
          : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
