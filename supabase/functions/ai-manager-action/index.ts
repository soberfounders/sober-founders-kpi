import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { MANAGER_KEYS, getManagerDefinition } from "../../../dashboard/src/lib/managerRegistry.js";
import { getAutonomousActionsForManager } from "../../../dashboard/src/lib/actionRegistry.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const ALLOWED_PERIODS = new Set(["7d", "30d", "mtd", "qtd"]);
const ALLOWED_COMPARE = new Set(["previous"]);

function mustGetEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function jsonResponse(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function normalizePeriod(value: any) {
  const period = String(value || "30d").trim().toLowerCase();
  return ALLOWED_PERIODS.has(period) ? period : "30d";
}

function normalizeCompare(value: any) {
  const compare = String(value || "previous").trim().toLowerCase();
  return ALLOWED_COMPARE.has(compare) ? compare : "previous";
}

function stableObject(value: any): any {
  if (Array.isArray(value)) return value.map((v) => stableObject(v));
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc: Record<string, any>, key) => {
        acc[key] = stableObject(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function normalizeFilters(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return stableObject(value);
}

async function invokeEdgeFunction(
  supabaseUrl: string,
  serviceRoleKey: string,
  functionName: string,
  body: any,
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify(body || {}),
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = text;
  }

  if (!response.ok) {
    const errorText =
      (typeof payload === "object" && payload && (payload.error || payload.message)) ||
      (typeof payload === "string" && payload) ||
      `HTTP ${response.status}`;
    throw new Error(`${functionName} failed (${response.status}): ${errorText}`);
  }

  if (payload && typeof payload === "object" && payload.ok === false) {
    throw new Error(`${functionName} returned ok=false: ${payload.error || "unknown error"}`);
  }

  return payload;
}

async function writeAuditLog(
  supabase: any,
  managerKey: string,
  payload: any,
  status: "success" | "error",
  errorText: string | null,
) {
  await supabase.from("audit_log").insert({
    event_type: "action_run",
    manager_key: managerKey,
    payload: stableObject(payload || {}),
    status,
    error: errorText,
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST only" }, 405);
  }

  const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let runId: string | null = null;
  let managerKey = "";
  let actionId = "";
  let period = "30d";
  let compare = "previous";
  let filters: Record<string, any> = {};

  try {
    const body = await req.json().catch(() => ({}));
    managerKey = String(body?.manager_key || "").trim().toLowerCase();
    actionId = String(body?.action_id || "").trim();
    period = normalizePeriod(body?.period);
    compare = normalizeCompare(body?.compare);
    filters = normalizeFilters(body?.filters);

    if (!managerKey || !MANAGER_KEYS.includes(managerKey)) {
      return jsonResponse({ ok: false, error: `Unsupported manager_key: ${managerKey || "missing"}` }, 400);
    }
    if (!actionId) {
      return jsonResponse({ ok: false, error: "action_id is required" }, 400);
    }

    const manager = getManagerDefinition(managerKey);
    const actions = getAutonomousActionsForManager(managerKey);
    const action = actions.find((row: any) => String(row?.action_id || "") === actionId);
    if (!action) {
      return jsonResponse({ ok: false, error: `Unknown action_id "${actionId}" for manager "${managerKey}"` }, 400);
    }

    const { data: insertedRows, error: insertError } = await supabase
      .from("action_runs")
      .insert({
        manager_key: managerKey,
        action_id: actionId,
        period,
        compare,
        filters,
        status: "running",
      })
      .select("id")
      .limit(1);
    if (insertError) throw new Error(`Failed to create action_runs row: ${insertError.message}`);
    runId = insertedRows?.[0]?.id || null;

    let analysisPayload: any = null;
    try {
      analysisPayload = await invokeEdgeFunction(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, "ai-module-analysis", {
        module_key: managerKey,
        context: {
          manager_key: managerKey,
          manager_name: manager?.name || managerKey,
          action_id: actionId,
          period,
          compare,
          filters,
          action_payload: action.function_payload_template || {},
          requested_at: new Date().toISOString(),
        },
        action_catalog: [{ action_key: actionId, description: action.description }],
        ttl_hours: 1,
        force_refresh: true,
        fallback_summary: [
          `${action.title} completed for ${manager?.name || managerKey}.`,
          "Execution used deterministic manager action fallback flow.",
        ],
        fallback_human_actions: [
          "Review action output and verify KPI movement after snapshot refresh.",
        ],
      });
    } catch (_) {
      analysisPayload = null;
    }

    const summaryRows = Array.isArray(analysisPayload?.analysis?.summary)
      ? analysisPayload.analysis.summary.map((row: any) => String(row || "").trim()).filter(Boolean).slice(0, 3)
      : [];
    const followups = Array.isArray(analysisPayload?.analysis?.human_actions)
      ? analysisPayload.analysis.human_actions.map((row: any) => String(row || "").trim()).filter(Boolean).slice(0, 3)
      : [];

    const result = {
      what_changed: summaryRows[0] || `${action.title} was executed successfully for ${manager?.name || managerKey}.`,
      what_was_executed: [
        `Resolved action definition ${action.action_id}.`,
        `Executed action mode "${action.function_payload_template?.mode || "default"}".`,
        `Applied period=${period}, compare=${compare}, filters=${JSON.stringify(filters)}.`,
      ],
      recommended_followups: followups.length > 0
        ? followups
        : [
            "Refresh manager report snapshot to inspect KPI deltas.",
            "Validate expected impact against scoreboard status changes.",
            "Add any human follow-up work items to Notion.",
          ],
      action_definition: {
        action_id: action.action_id,
        title: action.title,
        expected_impact: action.expected_impact,
        risk: action.risk,
      },
      ai_assist: analysisPayload?.analysis || null,
    };

    let refreshedSnapshot: any = null;
    try {
      refreshedSnapshot = await invokeEdgeFunction(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, "ai-manager-report", {
        manager_key: managerKey,
        period,
        compare,
        filters,
        force: true,
      });
    } catch (refreshError: any) {
      refreshedSnapshot = {
        ok: false,
        error: String(refreshError?.message || refreshError),
      };
    }

    if (runId) {
      await supabase
        .from("action_runs")
        .update({
          status: "success",
          result,
          error: null,
        })
        .eq("id", runId);
    }

    await writeAuditLog(
      supabase,
      managerKey,
      {
        run_id: runId,
        action_id: actionId,
        period,
        compare,
        filters,
        result_summary: result.what_changed,
      },
      "success",
      null,
    );

    return jsonResponse({
      ok: true,
      status: "success",
      run_id: runId,
      result,
      refreshed_snapshot: refreshedSnapshot,
    });
  } catch (error: any) {
    const errMessage = String(error?.message || error);
    if (runId) {
      await supabase
        .from("action_runs")
        .update({
          status: "error",
          error: errMessage,
        })
        .eq("id", runId);
    }
    if (managerKey) {
      await writeAuditLog(
        supabase,
        managerKey,
        {
          run_id: runId,
          action_id: actionId,
          period,
          compare,
          filters,
        },
        "error",
        errMessage,
      );
    }
    return jsonResponse({ ok: false, status: "error", error: errMessage, run_id: runId }, 500);
  }
});
