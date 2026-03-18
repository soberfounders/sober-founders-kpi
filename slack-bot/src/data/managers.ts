import { supabase } from "../clients/supabase.js";
import { env } from "../config/env.js";
import type { DateRangeInput, OrgContext } from "../types.js";
import { normalizeDateRange } from "./trends.js";

export interface ManagerReport {
  section: string;
  window: string;
  summary: string;
  bullets: string[];
  source: string;
  confidence: number;
}

const formatNumber = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return Math.round(value).toLocaleString();
};

export const getManagerReport = async (section: string, dateRange: DateRangeInput | undefined): Promise<ManagerReport> => {
  const range = normalizeDateRange(dateRange, 7);
  const normalized = section.toLowerCase();

  const { data: moduleAnalysis } = await supabase
    .from("ai_module_analyses")
    .select("module_key,summary,human_actions,autonomous_actions,generated_at,is_mock")
    .eq("module_key", normalized)
    .maybeSingle();

  if (moduleAnalysis?.summary && Array.isArray(moduleAnalysis.summary) && moduleAnalysis.summary.length > 0) {
    const summaryBullets = moduleAnalysis.summary.slice(0, 5).map((item: unknown) => String(item));
    return {
      section,
      window: range.label,
      summary: summaryBullets[0] || `Latest ${section} analysis`,
      bullets: summaryBullets,
      source: "ai_module_analyses",
      confidence: moduleAnalysis.is_mock ? 0.5 : 0.8,
    };
  }

  if (normalized === "operations") {
    const [{ data: errors }, { data: runs }, { data: health }] = await Promise.all([
      supabase.from("hubspot_sync_errors").select("id,created_at").gte("created_at", `${range.from}T00:00:00.000Z`).lte("created_at", `${range.to}T23:59:59.999Z`),
      supabase.from("hubspot_sync_runs").select("id,status,started_at,finished_at").gte("started_at", `${range.from}T00:00:00.000Z`).lte("started_at", `${range.to}T23:59:59.999Z`),
      supabase.from("vw_hubspot_sync_health_observability").select("sync_health_status,freshness_minutes,error_count_recent").limit(1),
    ]);

    const errorCount = (errors || []).length;
    const runCount = (runs || []).length;
    const failedRuns = (runs || []).filter((row: Record<string, unknown>) => String(row.status || "").toLowerCase() === "failed").length;
    const healthRow = (health || [])[0] as Record<string, unknown> | undefined;

    return {
      section,
      window: range.label,
      summary: `Operations sync health is ${String(healthRow?.sync_health_status || "unknown")} with ${errorCount} recent errors.`,
      bullets: [
        `Sync runs: ${runCount} (failed: ${failedRuns})`,
        `Recent errors: ${errorCount}`,
        `Freshness (minutes): ${formatNumber(Number(healthRow?.freshness_minutes ?? NaN))}`,
      ],
      source: "hubspot_sync_runs + hubspot_sync_errors + vw_hubspot_sync_health_observability",
      confidence: 0.8,
    };
  }

  let funnelKey = normalized;
  if (normalized === "executive" || normalized === "attendance" || normalized === "donations" || normalized === "email" || normalized === "seo") {
    funnelKey = "unknown";
  }

  const { data: trends, error: trendErr } = await supabase
    .from("vw_kpi_trend")
    .select("kpi_key,kpi_name,value,wow_pct,goal_status,funnel_key")
    .eq("funnel_key", funnelKey)
    .limit(25);

  if (trendErr) throw new Error(`vw_kpi_trend query failed: ${trendErr.message}`);

  const filteredTrends = (trends || []).filter((row: Record<string, unknown>) => {
    const key = String(row.kpi_key || "").toLowerCase();
    if (normalized === "attendance") {
      return key.includes("showup") || key.includes("new_tue") || key.includes("new_thu") || key.includes("attendance");
    }
    if (normalized === "donations") {
      return key.includes("donations") || key.includes("revenue_donations") || key.includes("donor");
    }
    if (normalized === "email") {
      return key.includes("email") || key.includes("mailchimp");
    }
    if (normalized === "seo") {
      return key.includes("seo") || key.includes("organic");
    }
    if (normalized === "leads") {
      return key.includes("lead") || key.includes("hs_contacts") || key.includes("interview") || key.includes("calls_booked");
    }
    return true; // Use all for executive or other
  }).slice(0, 8);

  const bullets = filteredTrends.map((row: Record<string, unknown>) => {
    const wow = Number(row.wow_pct);
    const wowLabel = Number.isFinite(wow) ? `${wow >= 0 ? "+" : ""}${wow.toFixed(1)}% WoW` : "WoW n/a";
    return `${String(row.kpi_name || "KPI")}: ${formatNumber(Number(row.value ?? NaN))} (${wowLabel}, ${String(row.goal_status || "no_goal")})`;
  });

  return {
    section,
    window: range.label,
    summary: bullets[0] || `No recent manager report for ${section}.`,
    bullets: bullets.length ? bullets : [`No trend rows found for ${section} in ${range.label}.`],
    source: "vw_kpi_trend",
    confidence: bullets.length ? 0.7 : 0.4,
  };
};


export const listOpenTasks = async (owner?: string, team?: string, priority?: string) => {
  let query = supabase
    .from("notion_todos")
    .select("notion_page_id,task_title,status,due_date,priority,url,metadata")
    .not("status", "in", "(Done,Completed)")
    .order("due_date", { ascending: true })
    .limit(100);

  if (priority) {
    query = query.eq("priority", priority);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list open tasks: ${error.message}`);
  }

  const rows = (data || []).filter((row: Record<string, unknown>) => {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    const assignee = String(metadata.assignee || "").toLowerCase();
    const tags = Array.isArray(metadata.tags) ? metadata.tags.map((tag) => String(tag).toLowerCase()) : [];
    const ownerMatch = owner ? assignee.includes(owner.toLowerCase()) : true;
    const teamMatch = team ? tags.includes(team.toLowerCase()) : true;
    return ownerMatch && teamMatch;
  });

  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.notion_page_id || ""),
    title: String(row.task_title || ""),
    owner: String(((row.metadata as Record<string, unknown>)?.assignee as string) || ""),
    priority: String(row.priority || ""),
    status: String(row.status || ""),
    due_date: row.due_date ? new Date(String(row.due_date)).toISOString().slice(0, 10) : undefined,
    source: "notion_todos",
    url: String(row.url || ""),
  }));
};

export const getDataQualityWarnings = async () => {
  const warnings: string[] = [];

  const [{ data: healthRows, error: healthError }, { data: syncErrors, error: syncError }] = await Promise.all([
    supabase
      .from("vw_hubspot_sync_health_observability")
      .select("sync_health_status,freshness_minutes,error_count_recent,staleness_flag")
      .limit(1),
    supabase
      .from("hubspot_sync_errors")
      .select("id,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (healthError) {
    warnings.push(`Unable to load hubspot sync health view: ${healthError.message}`);
  }
  if (syncError) {
    warnings.push(`Unable to load hubspot sync errors: ${syncError.message}`);
  }

  const health = (healthRows || [])[0] as Record<string, unknown> | undefined;
  if (health) {
    if (String(health.sync_health_status || "").toLowerCase() !== "healthy") {
      warnings.push(`HubSpot sync health status is ${String(health.sync_health_status || "unknown")}.`);
    }

    const freshness = Number(health.freshness_minutes ?? NaN);
    if (Number.isFinite(freshness) && freshness > 180) {
      warnings.push(`HubSpot sync freshness is stale at ${Math.round(freshness)} minutes.`);
    }

    const recentErrors = Number(health.error_count_recent ?? NaN);
    if (Number.isFinite(recentErrors) && recentErrors > 0) {
      warnings.push(`HubSpot sync has ${recentErrors} recent error(s).`);
    }
  }

  for (const row of syncErrors || []) {
    warnings.push(`Sync error: ${String((row as Record<string, unknown>).error_message || "Unknown")}`);
  }

  if (warnings.length === 0) {
    warnings.push("No active data quality warnings detected.");
  }

  return warnings;
};

export const getOrgContext = async (): Promise<OrgContext> => {
  const { data: roleRows } = await supabase
    .from("slack_user_roles")
    .select("role")
    .limit(20);

  const roleSet = new Set((roleRows || []).map((row: Record<string, unknown>) => String(row.role || "")).filter(Boolean));

  return {
    dashboardUrl: env.dashboardBaseUrl,
    timezone: "America/New_York",
    executiveChannels: env.executiveChannels,
    capabilities: [
      "kpi_snapshots",
      "metric_trends",
      "manager_reports",
      "task_creation_notion",
      "slack_summaries",
      "followup_tracking",
      "auditable_actions",
      `rbac_roles:${Array.from(roleSet).join(",") || "none"}`,
    ],
  };
};
