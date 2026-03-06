import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { MANAGER_KEYS } from "../../../dashboard/src/lib/managerRegistry.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

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

function normalizeDateOnly(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function notionRequest(secret: string, path: string, body: any) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "Notion-Version": "2022-06-28",
      "content-type": "application/json",
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
    const message =
      (typeof payload === "object" && payload && (payload.message || payload.error)) ||
      (typeof payload === "string" && payload) ||
      `HTTP ${response.status}`;
    throw new Error(`Notion request failed (${response.status}): ${message}`);
  }

  return payload;
}

async function createNotionTodoPage(
  notionSecret: string,
  notionDatabaseId: string,
  payload: {
    title: string;
    description: string | null;
    priority: string | null;
    dueDate: string | null;
    managerKey: string;
    todoId: string;
  },
) {
  const titleValue = payload.title.slice(0, 2000);
  const descriptionValue = String(payload.description || "").slice(0, 2000);
  const priorityValue = String(payload.priority || "P1").trim();

  const attempts = [
    {
      parent: { database_id: notionDatabaseId },
      properties: {
        "Task name": { title: [{ text: { content: titleValue } }] },
        Status: { status: { name: "Not started" } },
        Priority: { select: { name: priorityValue } },
        ...(payload.dueDate ? { "Due Date": { date: { start: payload.dueDate } } } : {}),
        ...(descriptionValue ? { Description: { rich_text: [{ text: { content: descriptionValue } }] } } : {}),
      },
    },
    {
      parent: { database_id: notionDatabaseId },
      properties: {
        Name: { title: [{ text: { content: titleValue } }] },
        Status: { select: { name: "Not started" } },
        Priority: { select: { name: priorityValue } },
        ...(payload.dueDate ? { Date: { date: { start: payload.dueDate } } } : {}),
      },
    },
    {
      parent: { database_id: notionDatabaseId },
      properties: {
        "Task name": { title: [{ text: { content: titleValue } }] },
      },
    },
  ];

  let lastError: Error | null = null;
  for (const body of attempts) {
    try {
      const page = await notionRequest(notionSecret, "/pages", body);
      return page;
    } catch (error: any) {
      lastError = error;
    }
  }

  throw lastError || new Error("Failed to create Notion page.");
}

async function writeAuditLog(
  supabase: any,
  managerKey: string,
  payload: any,
  status: "success" | "error",
  errorText: string | null,
) {
  await supabase.from("audit_log").insert({
    event_type: "notion_add",
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
  const NOTION_API_KEY = mustGetEnv("NOTION_API_KEY");
  const NOTION_TODO_DATABASE_ID =
    Deno.env.get("NOTION_TODO_DATABASE_ID") ||
    Deno.env.get("NOTION_DATABASE_ID") ||
    "";
  if (!NOTION_TODO_DATABASE_ID) {
    throw new Error("Missing required env var: NOTION_TODO_DATABASE_ID");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let managerKey = "";
  let todoId = "";
  let title = "";
  let description: string | null = null;
  let priority: string | null = null;
  let dueDate: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    managerKey = String(body?.manager_key || "").trim().toLowerCase();
    todoId = String(body?.todo_id || "").trim();
    title = String(body?.title || "").trim();
    description = String(body?.description || "").trim() || null;
    priority = String(body?.priority || "").trim() || null;
    dueDate = normalizeDateOnly(body?.due_date);

    if (!managerKey || !MANAGER_KEYS.includes(managerKey)) {
      return jsonResponse({ ok: false, error: `Unsupported manager_key: ${managerKey || "missing"}` }, 400);
    }
    if (!todoId) return jsonResponse({ ok: false, error: "todo_id is required" }, 400);
    if (!title) return jsonResponse({ ok: false, error: "title is required" }, 400);

    const { data: existingRows, error: existingError } = await supabase
      .from("notion_tasks")
      .select("id,notion_page_id,status,created_at,due_date")
      .eq("manager_key", managerKey)
      .eq("todo_id", todoId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (existingError) throw new Error(`Failed reading notion_tasks: ${existingError.message}`);
    const existing = existingRows?.[0] || null;
    if (existing && String(existing?.status || "").toLowerCase() === "created") {
      await writeAuditLog(
        supabase,
        managerKey,
        { todo_id: todoId, existing_notion_page_id: existing?.notion_page_id || null },
        "success",
        null,
      );
      return jsonResponse({
        ok: true,
        status: "created",
        notion_page_id: existing?.notion_page_id || null,
        existing: true,
      });
    }

    const notionPage = await createNotionTodoPage(
      NOTION_API_KEY,
      NOTION_TODO_DATABASE_ID,
      { title, description, priority, dueDate, managerKey, todoId },
    );
    const notionPageId = String(notionPage?.id || "").trim();
    if (!notionPageId) throw new Error("Notion response did not include page id.");

    const { error: insertError } = await supabase.from("notion_tasks").insert({
      manager_key: managerKey,
      todo_id: todoId,
      title,
      description,
      priority,
      due_date: dueDate,
      notion_page_id: notionPageId,
      status: "created",
      error: null,
    });
    if (insertError) throw new Error(`Failed writing notion_tasks row: ${insertError.message}`);

    await writeAuditLog(
      supabase,
      managerKey,
      {
        todo_id: todoId,
        title,
        due_date: dueDate,
        notion_page_id: notionPageId,
      },
      "success",
      null,
    );

    return jsonResponse({
      ok: true,
      status: "created",
      notion_page_id: notionPageId,
      existing: false,
    });
  } catch (error: any) {
    const errMessage = String(error?.message || error);
    if (managerKey && todoId) {
      await supabase.from("notion_tasks").insert({
        manager_key: managerKey,
        todo_id: todoId,
        title: title || `Todo ${todoId}`,
        description,
        priority,
        due_date: dueDate,
        notion_page_id: null,
        status: "error",
        error: errMessage,
      });
      await writeAuditLog(
        supabase,
        managerKey,
        {
          todo_id: todoId,
          title,
          due_date: dueDate,
        },
        "error",
        errMessage,
      );
    }
    return jsonResponse({ ok: false, status: "error", error: errMessage }, 500);
  }
});
