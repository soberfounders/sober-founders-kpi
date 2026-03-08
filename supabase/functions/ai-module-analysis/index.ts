import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const JSON_OUTPUT_CONTRACT_PROMPT = [
  'Return a JSON object with three keys:',
  '- "summary": array of 3-5 bullet point strings describing current status and trends',
  '- "autonomous_actions": array of up to 3 objects with "description" and "action_key"',
  '- "human_actions": array of up to 3 plain-English suggestion strings with button to add to notion',
  "",
  "Be specific, use actual numbers from the data, and keep language concise and direct.",
  "Only suggest autonomous actions that it can handle easily without much babysitting.",
  "Return JSON only. No markdown, no preamble.",
  "Only use action_key values that appear in the allowed action catalog.",
].join("\n");

const SYSTEM_PROMPT = [
  "You are a sales and operations manager assistant. You will be given structured data",
  "from each module (leads, attendance, etc).",
  "",
  JSON_OUTPUT_CONTRACT_PROMPT,
].join("\n");

function buildSystemPrompt(systemRoleOverride: string) {
  const override = String(systemRoleOverride || "").trim();
  if (!override) return SYSTEM_PROMPT;
  return [override, "", JSON_OUTPUT_CONTRACT_PROMPT].join("\n");
}

function mustGetEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function stripCodeFences(text: string) {
  return String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function safeJsonParse<T = any>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeText(value: any, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeTextArray(value: any, maxItems: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of Array.isArray(value) ? value : []) {
    const text = String(row ?? "").trim();
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeAutonomousActions(value: any, allowedActionKeys: Set<string>, maxItems = 3) {
  const out: Array<{ description: string; action_key: string }> = [];
  const seen = new Set<string>();

  for (const row of Array.isArray(value) ? value : []) {
    const actionKey = String(row?.action_key ?? "").trim();
    const description = String(row?.description ?? "").trim();
    if (!actionKey || !description) continue;
    if (allowedActionKeys.size > 0 && !allowedActionKeys.has(actionKey)) continue;
    if (seen.has(actionKey)) continue;
    seen.add(actionKey);
    out.push({ action_key: actionKey, description });
    if (out.length >= maxItems) break;
  }

  return out;
}

async function sha256Hex(payload: any) {
  const encoded = new TextEncoder().encode(JSON.stringify(payload ?? {}));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callOpenAiAnalysis(
  openAiApiKey: string,
  openAiModel: string,
  moduleKey: string,
  context: any,
  actionCatalog: Array<{ action_key: string; description: string }>,
  systemRoleOverride: string,
) {
  const prompt = [
    `module_key: ${moduleKey}`,
    "",
    "allowed_action_catalog:",
    JSON.stringify(actionCatalog || []),
    "",
    "structured_context:",
    JSON.stringify(context || {}),
  ].join("\n");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: openAiModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(systemRoleOverride) },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI analysis failed (${resp.status}): ${txt}`);
  }

  const json = await resp.json();
  const content = String(json?.choices?.[0]?.message?.content || "");
  const parsed = safeJsonParse<any>(stripCodeFences(content));
  if (!parsed || typeof parsed !== "object") {
    throw new Error("OpenAI returned non-JSON analysis payload.");
  }
  return parsed;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "POST only" }), {
        status: 405,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
    const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const moduleKey = String(body?.module_key || "").trim().toLowerCase();
    const context = body?.context ?? {};
    const systemRoleOverride = normalizeText(body?.system_role_override, "");
    const actionCatalog = Array.isArray(body?.action_catalog)
      ? body.action_catalog
          .map((row: any) => ({
            action_key: String(row?.action_key || "").trim(),
            description: String(row?.description || "").trim(),
          }))
          .filter((row: any) => row.action_key && row.description)
      : [];
    const forceRefresh = Boolean(body?.force_refresh);
    const ttlHoursRaw = Number(body?.ttl_hours ?? 24);
    const ttlHours = Number.isFinite(ttlHoursRaw) && ttlHoursRaw > 0
      ? Math.min(ttlHoursRaw, 168)
      : 24;
    const fallbackSummary = normalizeTextArray(body?.fallback_summary, 5);
    const fallbackHumanActions = normalizeTextArray(body?.fallback_human_actions, 3);
    const contextHash = await sha256Hex(context);

    if (!moduleKey) {
      throw new Error("module_key is required.");
    }

    const { data: cachedRow, error: cachedError } = await supabase
      .from("ai_module_analyses")
      .select("module_key,summary,autonomous_actions,human_actions,generated_at,ai_model,is_mock,context_hash")
      .eq("module_key", moduleKey)
      .maybeSingle();

    if (cachedError) {
      throw new Error(`Failed reading ai_module_analyses cache: ${cachedError.message}`);
    }

    const nowMs = Date.now();
    const ttlMs = ttlHours * 60 * 60 * 1000;
    const cachedGeneratedAtMs = Date.parse(String(cachedRow?.generated_at || ""));
    const hasFreshCached = Number.isFinite(cachedGeneratedAtMs) && (nowMs - cachedGeneratedAtMs) <= ttlMs;

    const contextHashMatches = cachedRow?.context_hash
      ? cachedRow.context_hash === contextHash
      : false;

    if (!forceRefresh && cachedRow && hasFreshCached && contextHashMatches) {
      return new Response(JSON.stringify({
        ok: true,
        from_cache: true,
        module_key: moduleKey,
        generated_at: cachedRow.generated_at,
        ai_model: cachedRow.ai_model,
        is_mock: !!cachedRow.is_mock,
        context_hash: cachedRow.context_hash || null,
        context_hash_matches: contextHashMatches,
        analysis: {
          summary: Array.isArray(cachedRow.summary) ? cachedRow.summary : [],
          autonomous_actions: Array.isArray(cachedRow.autonomous_actions) ? cachedRow.autonomous_actions : [],
          human_actions: Array.isArray(cachedRow.human_actions) ? cachedRow.human_actions : [],
        },
      }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const allowedActionKeys = new Set(actionCatalog.map((row: any) => String(row?.action_key || "")));

    let parsed: any = null;
    let aiModel = OPENAI_MODEL;
    let isMock = false;

    if (OPENAI_API_KEY) {
      parsed = await callOpenAiAnalysis(
        OPENAI_API_KEY,
        OPENAI_MODEL,
        moduleKey,
        context,
        actionCatalog,
        systemRoleOverride,
      );
    } else {
      isMock = true;
      aiModel = "none (MOCK)";
      parsed = {
        summary: fallbackSummary.length > 0
          ? fallbackSummary
          : [
              `${moduleKey} analysis is running in fallback mode because OPENAI_API_KEY is not configured.`,
              "Set OPENAI_API_KEY in Supabase Edge Function secrets to enable live AI summaries and recommendations.",
            ],
        autonomous_actions: actionCatalog.slice(0, 3).map((row: any) => ({
          action_key: row.action_key,
          description: row.description,
        })),
        human_actions: fallbackHumanActions,
      };
    }

    const normalizedSummary = (() => {
      const summary = normalizeTextArray(parsed?.summary, 5);
      if (summary.length > 0) return summary;
      if (fallbackSummary.length > 0) return fallbackSummary;
      return [
        `${moduleKey} summary is unavailable from the latest AI response.`,
        "Use Refresh Analysis to retry generation for this module.",
      ];
    })();

    const normalizedAutonomous = (() => {
      const actions = normalizeAutonomousActions(parsed?.autonomous_actions, allowedActionKeys, 3);
      if (actions.length > 0) return actions;
      return actionCatalog.slice(0, 3).map((row: any) => ({
        action_key: row.action_key,
        description: row.description,
      }));
    })();

    const normalizedHuman = (() => {
      const human = normalizeTextArray(parsed?.human_actions, 3);
      if (human.length > 0) return human;
      return fallbackHumanActions;
    })();

    const generatedAt = new Date().toISOString();
    const storedRow = {
      module_key: moduleKey,
      summary: normalizedSummary,
      autonomous_actions: normalizedAutonomous,
      human_actions: normalizedHuman,
      analysis_context: context,
      context_hash: contextHash,
      ai_model: aiModel,
      is_mock: isMock,
      generated_at: generatedAt,
      updated_at: generatedAt,
    };

    const { error: upsertError } = await supabase
      .from("ai_module_analyses")
      .upsert(storedRow, { onConflict: "module_key" });

    if (upsertError) {
      throw new Error(`Failed storing ai_module_analyses cache: ${upsertError.message}`);
    }

    return new Response(JSON.stringify({
      ok: true,
      from_cache: false,
      module_key: moduleKey,
      generated_at: generatedAt,
      ai_model: aiModel,
      is_mock: isMock,
      context_hash: contextHash,
      analysis: {
        summary: normalizedSummary,
        autonomous_actions: normalizedAutonomous,
        human_actions: normalizedHuman,
      },
    }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: String(error?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
