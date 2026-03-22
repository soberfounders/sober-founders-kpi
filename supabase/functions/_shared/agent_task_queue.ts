/**
 * Agent Task Queue — shared helper for outreach agents.
 *
 * Instead of sending emails directly, agents create agent_tasks
 * that appear in the Agency dashboard for human approval.
 * When approved, the agent-task-executor function handles delivery.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TaskType = "email" | "wp_post" | "crm_update" | "slack_message" | "content_draft" | "seo_audit" | "other";

export interface QueueTaskParams {
  agentRoleName: string;           // e.g. "Marketing Manager" — matched to agents table
  type: TaskType;
  title: string;
  payload: Record<string, unknown>;
  reasoning?: string;
  costEstimateCents?: number;
}

export interface QueueResult {
  ok: boolean;
  taskId?: string;
  error?: string;
  budgetExceeded?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Resolve agent ID from role_name                                    */
/* ------------------------------------------------------------------ */

const agentIdCache: Record<string, string> = {};

async function resolveAgentId(sb: SupabaseClient, roleName: string): Promise<string | null> {
  if (agentIdCache[roleName]) return agentIdCache[roleName];

  const { data } = await sb
    .from("agents")
    .select("id")
    .eq("role_name", roleName)
    .limit(1)
    .single();

  if (data?.id) {
    agentIdCache[roleName] = data.id;
    return data.id;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Budget pre-check                                                   */
/* ------------------------------------------------------------------ */

async function checkBudget(
  sb: SupabaseClient,
  agentId: string,
  estimatedCost: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const { data } = await sb
    .from("vw_agent_budget_status")
    .select("*")
    .eq("agent_id", agentId)
    .single();

  if (!data) return { allowed: false, reason: "Agent budget status not found" };

  const spent = Number(data.spent_24h_cents);
  const limit = Number(data.daily_budget_cents);
  const projected = spent + estimatedCost;

  if (projected > limit) {
    // Auto-pause agent
    await sb.from("agents").update({ status: "paused" }).eq("id", agentId);
    return { allowed: false, reason: `Budget exceeded: spent ${spent}c + est ${estimatedCost}c > limit ${limit}c` };
  }

  if (data.status === "paused") {
    return { allowed: false, reason: "Agent is paused" };
  }

  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/*  Queue a task                                                       */
/* ------------------------------------------------------------------ */

/**
 * Creates an agent_task for human review in the Agency dashboard.
 * Performs a budget pre-check and skips if budget is exceeded.
 *
 * Returns { ok, taskId } on success, or { ok: false, error } on failure.
 */
export async function queueAgentTask(params: QueueTaskParams): Promise<QueueResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  // 1. Resolve agent ID
  const agentId = await resolveAgentId(sb, params.agentRoleName);
  if (!agentId) {
    return { ok: false, error: `Agent "${params.agentRoleName}" not found in agents table` };
  }

  // 2. Budget pre-check
  const cost = params.costEstimateCents ?? 0;
  const budget = await checkBudget(sb, agentId, cost);
  if (!budget.allowed) {
    return { ok: false, error: budget.reason, budgetExceeded: true };
  }

  // 3. Insert task
  const { data, error } = await sb
    .from("agent_tasks")
    .insert({
      agent_id: agentId,
      type: params.type,
      title: params.title,
      payload: params.payload,
      reasoning: params.reasoning || null,
      cost_estimate_cents: cost,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, taskId: data.id };
}

/* ------------------------------------------------------------------ */
/*  Batch queue helper                                                 */
/* ------------------------------------------------------------------ */

/**
 * Queue multiple tasks at once. Stops on first budget failure.
 * Returns array of results.
 */
export async function queueAgentTaskBatch(
  tasks: QueueTaskParams[],
): Promise<QueueResult[]> {
  const results: QueueResult[] = [];
  for (const task of tasks) {
    const result = await queueAgentTask(task);
    results.push(result);
    if (result.budgetExceeded) break; // Stop queuing if budget is exhausted
  }
  return results;
}
