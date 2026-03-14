import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildZoomFreezePayload, getZoomFreezeConfig } from "../_shared/zoom_freeze.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PATCH, PUT, DELETE',
};

function mustGetEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function mondayKeyUtc(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const offsetToMon = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offsetToMon);
  return isoDateOnly(d);
}

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDateOnly(d);
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseDateKey(value: unknown) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return text;
}

function buildAdsWeekStarts(baseWeekStart: string, priorWeeks: number, backfillFrom: string) {
  const weekStarts: string[] = [];
  const maxWeeks = Math.max(0, priorWeeks);
  const normalizedFrom = backfillFrom ? mondayKeyUtc(new Date(`${backfillFrom}T00:00:00.000Z`)) : "";

  let cursor = baseWeekStart;
  let safety = 0;
  while (safety < 200) {
    weekStarts.push(cursor);
    safety += 1;

    if (normalizedFrom) {
      if (cursor <= normalizedFrom) break;
      cursor = addDays(cursor, -7);
      continue;
    }

    if (weekStarts.length >= maxWeeks + 1) break;
    cursor = addDays(cursor, -7);
  }

  return Array.from(new Set(weekStarts));
}

async function invokeEdgeFunction(
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: any;
  } = {},
) {
  const method = options.method || (options.body ? "POST" : "GET");
  const fnUrl = new URL(`${supabaseUrl}/functions/v1/${fnName}`);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    fnUrl.searchParams.set(key, String(value));
  });

  const resp = await fetch(fnUrl.toString(), {
    method,
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await resp.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }

  if (!resp.ok) {
    const errMessage =
      (typeof data === 'object' && data && (data.error?.message || data.error)) ||
      (typeof data === 'string' && data) ||
      `HTTP ${resp.status}`;
    throw new Error(`${fnName} failed (${resp.status}): ${errMessage}`);
  }

  if (typeof data === 'object' && data && data.ok === false) {
    throw new Error(`${fnName} returned ok=false: ${data.error || 'unknown error'}`);
  }

  return data;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = mustGetEnv("SUPABASE_URL");
    const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    // Child edge sync functions can be invoked with the dashboard anon key or a custom override.
    // In this project runtime, built-in SUPABASE_* keys may be stale for edge-gateway auth (401),
    // so allow a custom secret override that can be rotated independently.
    const edgeInvokeKey =
      Deno.env.get("MASTER_SYNC_EDGE_INVOKE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") ||
      serviceRoleKey;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const triggerRefresh = url.searchParams.get("trigger_refresh") === 'true';
    let parsedBody: any = {};

    // Action-based routing for write operations (all via POST body)
    // NOTE: Supabase Edge Functions gateway only supports POST/GET.
    // PATCH/PUT/DELETE are blocked at the CORS preflight level by the gateway.
    if (req.method === 'POST') {
      try { parsedBody = await req.json(); } catch (_) { parsedBody = {}; /* no body = sync request */ }
      const body = parsedBody;

      if (body.action === 'update_task' && body.pageId) {
        const result = await updateNotionTask(body.pageId, body.properties);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (body.action === 'create_task' && body.properties) {
        const result = await createNotionTask(body.properties);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Lightweight Notion-only sync for the To-Do dashboard
      if (body.action === 'sync_notion') {
        const metrics = await syncNotion(supabase);
        return new Response(
          JSON.stringify({ ok: true, source: 'notion', count: metrics.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Legacy support: PATCH method or /tasks pathname routing (for older clients)
      if (body.pageId && body.properties && !body.action) {
        const result = await updateNotionTask(body.pageId, body.properties);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Fall through to sync logic if no action matched
    }

    const weekStart =
      url.searchParams.get("week_start") ||
      parsedBody?.week_start ||
      mondayKeyUtc(new Date());
    const adsBackfillWeeks = clampInt(
      url.searchParams.get("ads_backfill_weeks") || parsedBody?.ads_backfill_weeks || 1,
      1,
      0,
      104,
    );
    const adsBackfillFrom = parseDateKey(
      url.searchParams.get("ads_backfill_from") || parsedBody?.ads_backfill_from || "",
    );
    const adsWeekStarts = buildAdsWeekStarts(weekStart, adsBackfillWeeks, adsBackfillFrom);
    const hubspotDaysRaw =
      Number(url.searchParams.get("hubspot_days") || parsedBody?.hubspot_days || 45);
    const hubspotDays =
      Number.isFinite(hubspotDaysRaw) && hubspotDaysRaw > 0
        ? Math.min(Math.floor(hubspotDaysRaw), 730)
        : 45;
    const hubspotFromRaw = String(url.searchParams.get("hubspot_from") || parsedBody?.hubspot_from || "").trim();
    const hubspotToRaw = String(url.searchParams.get("hubspot_to") || parsedBody?.hubspot_to || "").trim();
    const hubspotFrom = /^\d{4}-\d{2}-\d{2}$/.test(hubspotFromRaw) ? hubspotFromRaw : "";
    const hubspotTo = /^\d{4}-\d{2}-\d{2}$/.test(hubspotToRaw) ? hubspotToRaw : "";
    const hubspotSourceSyncBody: Record<string, any> = {
      include_calls: true,
      include_meetings: true,
    };
    if (hubspotFrom) hubspotSourceSyncBody.from = hubspotFrom;
    else hubspotSourceSyncBody.days = hubspotDays;
    if (hubspotTo) hubspotSourceSyncBody.to = hubspotTo;
    const hubspotReconcileBody: Record<string, any> = { dry_run: false };
    if (hubspotFrom) hubspotReconcileBody.from = hubspotFrom;
    else hubspotReconcileBody.days = hubspotDays;
    if (hubspotTo) hubspotReconcileBody.to = hubspotTo;
    const zoomFreeze = getZoomFreezeConfig();

    console.log(`Starting Master Sync for week: ${weekStart}, force refresh: ${triggerRefresh}`);

    const results: any[] = [];
    const runStep = async (
      source: string,
      fnName: string,
      options: Parameters<typeof invokeEdgeFunction>[3] = {},
      ) => {
      try {
        const data = await invokeEdgeFunction(supabaseUrl, edgeInvokeKey, fnName, options);
        results.push({ source, function: fnName, status: 'success', data });
        return { ok: true, data };
      } catch (e: any) {
        console.error(`Master sync step failed [${source}/${fnName}]`, e);
        results.push({ source, function: fnName, status: 'error', error: e?.message || String(e) });
        return { ok: false, error: e };
      }
    };

    // Stage 1: independent non-ads source syncs (including HubSpot calls, which is the attendance source of truth).
    const stageOneSteps = [
      runStep('hubspot_incremental', 'hubspot_incremental_sync', {
        method: 'POST',
        body: {
          object_types: 'contacts,deals,calls,meetings',
          overlap_minutes: 2,
        },
      }),
      runStep('hubspot_reconcile_hourly', 'hubspot_reconcile_sync', {
        method: 'POST',
        body: {
          mode: 'hourly',
          hourly_lookback_days: 7,
        },
      }),
      runStep('hubspot_calls', 'sync_hubspot_meeting_activities', {
        method: 'POST',
        body: hubspotSourceSyncBody,
      }),
      runStep('generic_metrics', 'sync-metrics', {
        method: 'GET',
        query: { trigger_refresh: true },
      }),
      runStep('google_analytics', 'sync_google_analytics', { method: 'POST' }),
      runStep('search_console', 'sync_search_console', { method: 'POST' }),
    ];

    if (zoomFreeze.frozen) {
      results.push({
        source: 'zoom_attendance_legacy',
        function: 'sync_zoom_attendance',
        status: 'skipped',
        data: buildZoomFreezePayload('Master sync skipped legacy Zoom attendance ingestion.'),
      });
    } else {
      stageOneSteps.push(runStep('zoom_attendance_legacy', 'sync_zoom_attendance', { method: 'POST' }));
    }

    await Promise.all(stageOneSteps);

    // Stage 1b: ads sync with configurable backfill window.
    // Execute sequentially to avoid unnecessary Meta API concurrency spikes.
    for (let i = 0; i < adsWeekStarts.length; i += 1) {
      const targetWeekStart = adsWeekStarts[i];
      const sourceName = i === 0 ? 'facebook_ads' : `facebook_ads_backfill_week_${i}`;
      await runStep(sourceName, 'sync_fb_ads', {
        method: 'GET',
        query: { week_start: targetWeekStart },
      });
    }

    // Stage 2: jobs that benefit from the refreshed HubSpot/Zoom caches.
    const stageTwoSteps = [
      runStep('luma_registrations', 'sync_luma_registrations', { method: 'POST' }),
    ];

    if (zoomFreeze.frozen) {
      results.push({
        source: 'zoom_hubspot_reconcile',
        function: 'reconcile_zoom_attendee_hubspot_mappings',
        status: 'skipped',
        data: buildZoomFreezePayload('Master sync skipped legacy Zoom-to-HubSpot reconciliation.'),
      });
    } else {
      stageTwoSteps.push(runStep('zoom_hubspot_reconcile', 'reconcile_zoom_attendee_hubspot_mappings', {
        method: 'POST',
        body: hubspotReconcileBody,
      }));
    }

    await Promise.all(stageTwoSteps);

    // Keep a local Notion sync fallback if generic sync path is unavailable/misconfigured.
    // This preserves the previous behavior of master-sync while the stack transitions.
    if (!results.some((r) => r.source === 'generic_metrics' && r.status === 'success')) {
      try {
        const metrics = await syncNotion(supabase);
        results.push({ source: 'notion_fallback', status: 'success', count: metrics.length });
      } catch (e: any) {
        results.push({ source: 'notion_fallback', status: 'error', error: e.message });
      }
    }

    const hasErrors = results.some((r) => r.status === 'error');

    return new Response(
      JSON.stringify({
        ok: !hasErrors,
        results,
        week_start: weekStart,
        ads_backfill_weeks: adsBackfillWeeks,
        ads_backfill_from: adsBackfillFrom || null,
        ads_weeks_synced: adsWeekStarts,
        hubspot_days: hubspotDays,
        hubspot_from: hubspotFrom || null,
        hubspot_to: hubspotTo || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Master Sync Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});


async function syncNotion(supabase: any) {
  const secret = Deno.env.get('NOTION_API_KEY') ?? '';
  const databaseId = Deno.env.get('NOTION_DATABASE_ID') ?? '';

  if (!secret || !databaseId) {
    console.error("Missing Notion credentials — NOTION_API_KEY:", !!secret, "NOTION_DATABASE_ID:", !!databaseId);
    throw new Error("Missing Notion credentials in environment variables. Ensure both NOTION_API_KEY and NOTION_DATABASE_ID are set in Edge Function Secrets.");
  }

  // Paginated fetch — Notion caps at 100 per request
  const allPages: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  while (hasMore) {
    const body: any = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;

    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.error("Notion API error:", response.status, JSON.stringify(errorBody));
      throw new Error(`Notion Sync failed (${response.status}): ${errorBody.message || JSON.stringify(errorBody)}`);
    }

    const data = await response.json();
    allPages.push(...(data.results || []));
    hasMore = data.has_more === true;
    startCursor = data.next_cursor || undefined;
  }

  console.log(`Notion sync: fetched ${allPages.length} pages from database ${databaseId}`);

  const todos = allPages.map((page: any) => {
    const props = page.properties;
    // Support multiple common title property names (user's DB uses 'Task name')
    const title = props['Task name']?.title?.[0]?.plain_text || props.Name?.title?.[0]?.plain_text || props.Title?.title?.[0]?.plain_text || 'Untitled';
    const status = props.Status?.status?.name || props.Status?.select?.name || 'No Status';
    const dueDate = props.Deadline?.date?.start || props.Date?.date?.start || props['Due Date']?.date?.start || props['Due date']?.date?.start || null;
    const priority = props.Priority?.select?.name || props.Priority?.status?.name || null;
    const effortLevel = props['Effort level']?.select?.name || props['Effort Level']?.select?.name || null;
    const assignee = props.Person?.people?.[0]?.name || props.Assignee?.people?.[0]?.name || null;
    const tags = props.Tags?.multi_select?.map((t: any) => t.name) || [];

    return {
      notion_page_id: page.id,
      task_title: title,
      status: status,
      due_date: dueDate,
      priority: priority,
      url: page.url,
      metadata: { ...props, assignee, tags, effort_level: effortLevel },
    };
  });

  if (todos.length > 0) {
    const { error } = await supabase
      .from('notion_todos')
      .upsert(todos, { onConflict: 'notion_page_id' });
    if (error) {
      console.error("Supabase upsert error:", JSON.stringify(error));
      throw error;
    }
  }

  // Cleanup: remove local rows that no longer exist in Notion
  const notionPageIds = new Set(allPages.map((p: any) => p.id));
  const { data: localTodos } = await supabase.from('notion_todos').select('notion_page_id');
  if (localTodos) {
    const staleIds = localTodos
      .filter((t: any) => !notionPageIds.has(t.notion_page_id))
      .map((t: any) => t.notion_page_id);
    if (staleIds.length > 0) {
      console.log(`Notion sync: cleaning up ${staleIds.length} stale local records`);
      await supabase.from('notion_todos').delete().in('notion_page_id', staleIds);
    }
  }

  const openTasks = todos.filter((t: any) => t.status !== 'Done' && t.status !== 'Completed').length;

  return [{
    metric_name: 'Open Notion Tasks',
    metric_value: openTasks,
    source_slug: 'notion',
    metadata: { total_tasks: todos.length, open_tasks: openTasks }
  }];
}

async function updateNotionTask(pageId: string, properties: any) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('NOTION_API_KEY')}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Notion Update failed: ${error.message}`);
  }

  return await response.json();
}

async function createNotionTask(properties: any) {
  const apiKey = Deno.env.get('NOTION_API_KEY');

  // Handle Person field: resolve display name to Notion user ID
  const personName = properties['_person_name'];
  delete properties['_person_name']; // Remove the intermediate field

  if (personName) {
    try {
      const usersResp = await fetch('https://api.notion.com/v1/users', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
        },
      });
      if (usersResp.ok) {
        const usersData = await usersResp.json();
        const matched = (usersData.results || []).find(
          (u: any) => u.name?.toLowerCase() === personName.toLowerCase()
        );
        if (matched) {
          properties['Person'] = { people: [{ id: matched.id }] };
          console.log(`Resolved Person "${personName}" to Notion user ID: ${matched.id}`);
        } else {
          console.warn(`Could not find Notion user "${personName}" — skipping Person field`);
        }
      }
    } catch (e: any) {
      console.warn(`Person lookup failed: ${e.message} — skipping Person field`);
    }
  }

  const response = await fetch(`https://api.notion.com/v1/pages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: Deno.env.get('NOTION_DATABASE_ID') },
      properties,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Notion Create failed: ${error.message}`);
  }

  return await response.json();
}
