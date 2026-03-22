import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ── Model routing helper ── */
function selectModel(
  config: Record<string, string> | null | undefined,
  complexity: string,
): string {
  const defaults: Record<string, string> = {
    simple: "gpt-4o-mini",
    complex: "claude-opus-4-6",
  };
  if (!config) return defaults[complexity] || defaults.simple;
  return config[complexity] || defaults[complexity] || defaults.simple;
}

/**
 * Budget guardrail + model routing edge function.
 *
 * Called before every agent action. Returns:
 * - { allowed: true/false } with budget status
 * - { recommended_model } based on task complexity and agent config
 *
 * Auto-pauses the agent if the 24h spend exceeds daily_budget_cents.
 *
 * POST body: {
 *   agent_id: string,
 *   estimated_cost_cents?: number,
 *   task_complexity?: "simple" | "complex"  // for model routing
 * }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { agent_id, estimated_cost_cents = 0, task_complexity = "simple" } = await req.json();
    if (!agent_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "agent_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch agent config (for model routing) + rolling 24h spend
    const [agentRes, budgetRes] = await Promise.all([
      sb.from("agents").select("model_routing_config").eq("id", agent_id).single(),
      sb.from("vw_agent_budget_status").select("*").eq("agent_id", agent_id).single(),
    ]);

    const agentConfig = agentRes.data;
    const budget = budgetRes.data;
    const budgetErr = budgetRes.error;

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
        recommended_model: selectModel(agentConfig?.model_routing_config, task_complexity),
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
