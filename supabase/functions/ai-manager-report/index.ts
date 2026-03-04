import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  MANAGER_KEYS,
  getManagerDefinition,
} from "../../../dashboard/src/lib/managerRegistry.js";
import { getMetricsForManager } from "../../../dashboard/src/lib/metricRegistry.js";
import {
  getAutonomousActionsForManager,
  getHumanTodosForManager,
} from "../../../dashboard/src/lib/actionRegistry.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const ALLOWED_PERIODS = new Set(["7d", "30d", "mtd", "qtd"]);
const ALLOWED_COMPARE = new Set(["previous"]);
const SNAPSHOT_TTL_HOURS = 6;
const OPERATIONS_INPUT_MANAGERS = ["leads", "attendance", "email", "seo", "donations"];

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

function safeNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toUtcStartOfDay(input: Date) {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate(), 0, 0, 0, 0));
}

function toUtcEndOfDay(input: Date) {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate(), 23, 59, 59, 999));
}

function addUtcDays(input: Date, days: number) {
  const out = new Date(input);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function dateKeyUtc(input: Date) {
  return input.toISOString().slice(0, 10);
}

function formatDateLabel(input: Date) {
  return input.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
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

function stableJson(value: any) {
  return JSON.stringify(stableObject(value ?? {}));
}

async function sha256Hex(input: any) {
  const payload = new TextEncoder().encode(stableJson(input));
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePeriod(value: any) {
  const key = String(value || "30d").trim().toLowerCase();
  if (!ALLOWED_PERIODS.has(key)) return "30d";
  return key;
}

function normalizeCompare(value: any) {
  const key = String(value || "previous").trim().toLowerCase();
  if (!ALLOWED_COMPARE.has(key)) return "previous";
  return key;
}

function normalizeFilters(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return stableObject(value);
}

function buildWindow(period: string) {
  const today = toUtcStartOfDay(new Date());
  const currentEnd = toUtcEndOfDay(today);

  let currentStart = toUtcStartOfDay(today);
  if (period === "7d") {
    currentStart = addUtcDays(today, -6);
  } else if (period === "30d") {
    currentStart = addUtcDays(today, -29);
  } else if (period === "mtd") {
    currentStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
  } else if (period === "qtd") {
    const quarterStartMonth = Math.floor(today.getUTCMonth() / 3) * 3;
    currentStart = new Date(Date.UTC(today.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0, 0));
  }

  const spanDays = Math.floor((currentEnd.getTime() - currentStart.getTime()) / 86_400_000) + 1;
  const previousEnd = addUtcDays(currentStart, -1);
  const previousStart = addUtcDays(previousEnd, -(spanDays - 1));

  return {
    period,
    spanDays,
    currentStart,
    currentEnd,
    previousStart: toUtcStartOfDay(previousStart),
    previousEnd: toUtcEndOfDay(previousEnd),
    currentLabel: `${formatDateLabel(currentStart)} - ${formatDateLabel(currentEnd)}`,
    previousLabel: `${formatDateLabel(previousStart)} - ${formatDateLabel(previousEnd)}`,
  };
}

function inDateRange(value: any, start: Date, end: Date) {
  const d = safeDate(value);
  if (!d) return false;
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

function inDateKeyRange(value: any, start: Date, end: Date) {
  const d = safeDate(`${String(value || "").slice(0, 10)}T00:00:00.000Z`);
  if (!d) return false;
  return d.getTime() >= toUtcStartOfDay(start).getTime() && d.getTime() <= toUtcStartOfDay(end).getTime();
}

function maxIsoTimestamps(values: any[]) {
  let latest: Date | null = null;
  values.forEach((value) => {
    const d = safeDate(value);
    if (!d) return;
    if (!latest || d.getTime() > latest.getTime()) latest = d;
  });
  return latest ? latest.toISOString() : null;
}

function listDays(start: Date, end: Date) {
  const out: string[] = [];
  let cursor = toUtcStartOfDay(start);
  while (cursor.getTime() <= toUtcStartOfDay(end).getTime()) {
    out.push(dateKeyUtc(cursor));
    cursor = addUtcDays(cursor, 1);
  }
  return out;
}

function aggregateDailySum(rows: any[], getDateKey: (row: any) => string | null, getValue: (row: any) => number, start: Date, end: Date) {
  const keys = listDays(start, end);
  const bucket = new Map<string, number>(keys.map((k) => [k, 0]));
  rows.forEach((row) => {
    const key = getDateKey(row);
    if (!key || !bucket.has(key)) return;
    bucket.set(key, safeNumber(bucket.get(key), 0) + safeNumber(getValue(row), 0));
  });
  return keys.map((key) => ({ x: key, y: safeNumber(bucket.get(key), 0) }));
}

function aggregateDailyRatio(
  rows: any[],
  getDateKey: (row: any) => string | null,
  getNum: (row: any) => number,
  getDen: (row: any) => number,
  start: Date,
  end: Date,
) {
  const keys = listDays(start, end);
  const nums = new Map<string, number>(keys.map((k) => [k, 0]));
  const dens = new Map<string, number>(keys.map((k) => [k, 0]));
  rows.forEach((row) => {
    const key = getDateKey(row);
    if (!key || !nums.has(key)) return;
    nums.set(key, safeNumber(nums.get(key), 0) + safeNumber(getNum(row), 0));
    dens.set(key, safeNumber(dens.get(key), 0) + safeNumber(getDen(row), 0));
  });
  return keys.map((key) => {
    const numerator = safeNumber(nums.get(key), 0);
    const denominator = safeNumber(dens.get(key), 0);
    return { x: key, y: denominator > 0 ? numerator / denominator : 0 };
  });
}

function pctChange(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return (c - p) / Math.abs(p);
}

function pctText(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

function asCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function asCount(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return Math.round(Number(value)).toLocaleString();
}

function resolveStatus(metric: any, currentValue: number | null) {
  if (currentValue === null || !Number.isFinite(Number(currentValue))) return "Watch";
  const value = Number(currentValue);
  const watch = safeNumber(metric?.thresholds?.watch, Number.NaN);
  const red = safeNumber(metric?.thresholds?.red, Number.NaN);
  if (!Number.isFinite(watch) || !Number.isFinite(red)) return "Watch";

  if (metric.positive_direction === "down") {
    if (value > red) return "Red";
    if (value > watch) return "Watch";
    return "Green";
  }

  if (value < red) return "Red";
  if (value < watch) return "Watch";
  return "Green";
}

function getValueByPath(source: Record<string, any>, path: string) {
  if (!path) return null;
  return path
    .split(".")
    .reduce((acc: any, key: string) => (acc === null || acc === undefined ? null : acc[key]), source) ?? null;
}

function keyFromEmailOrName(row: any) {
  const id = Number(row?.hubspot_contact_id);
  if (Number.isFinite(id) && id > 0) return `id:${id}`;
  const email = String(row?.contact_email || row?.guest_email || row?.donor_email || row?.email || "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = String(row?.zoom_attendee_canonical_name || row?.guest_name || row?.donor_name || `${row?.contact_firstname || ""} ${row?.contact_lastname || ""}`)
    .trim()
    .toLowerCase();
  if (name) return `name:${name}`;
  return null;
}

async function selectAllRows(
  queryBuilder: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>,
  { pageSize = 1000, maxPages = 30 } = {},
) {
  const rows: any[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await queryBuilder(from, to);
    if (error) return { data: rows, error };
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return { data: rows, error: null };
}

function leadRevenue(row: any) {
  const official = Number(row?.annual_revenue_in_dollars__official_);
  if (Number.isFinite(official)) return official;
  const fallback = Number(row?.annual_revenue_in_dollars);
  if (Number.isFinite(fallback)) return fallback;
  return null;
}

function isOneYearSoberAtLead(row: any, leadDateLike: any) {
  const leadDate = safeDate(leadDateLike);
  const sobrietyDate = safeDate(row?.sobriety_date);
  if (!leadDate || !sobrietyDate) return false;
  const oneYear = new Date(Date.UTC(
    sobrietyDate.getUTCFullYear() + 1,
    sobrietyDate.getUTCMonth(),
    sobrietyDate.getUTCDate(),
  ));
  return oneYear.getTime() <= leadDate.getTime();
}

function isPaidSocialContact(row: any) {
  const blob = [
    row?.original_traffic_source,
    row?.hs_analytics_source,
    row?.hs_latest_source,
  ].join(" ").toLowerCase();
  return blob.includes("paid_social") || blob.includes("paid social");
}

function periodSplit<T>(rows: T[], inCurrent: (row: T) => boolean, inPrevious: (row: T) => boolean) {
  const current = rows.filter(inCurrent);
  const previous = rows.filter(inPrevious);
  return { current, previous };
}

function freshnessFromSources(sources: Array<{ source: string; last_sync_at: string | null; row_count: number; warning?: string }>) {
  const lastSyncAt = maxIsoTimestamps(sources.map((row) => row.last_sync_at));
  return {
    last_sync_at: lastSyncAt,
    sources,
  };
}

function composeScoreboard(managerKey: string, context: any) {
  const metrics = getMetricsForManager(managerKey);
  const actions = getAutonomousActionsForManager(managerKey);
  const metricNameById = new Map(metrics.map((m) => [m.metric_id, m.name]));

  return metrics.map((metric: any, idx: number) => {
    const current = getValueByPath(context?.current || {}, String(metric?.compute_spec?.context_path || ""));
    const previous = getValueByPath(context?.previous || {}, String(metric?.compute_spec?.context_path || ""));
    const currentNum = current === null || current === undefined ? null : Number(current);
    const previousNum = previous === null || previous === undefined ? null : Number(previous);
    const delta = pctChange(currentNum, previousNum);
    const target = typeof metric.target === "number" ? metric.target : null;
    const status = resolveStatus(metric, currentNum);
    const driverText = (metric.driver_metric_ids || [])
      .map((driverId: string) => metricNameById.get(driverId))
      .filter(Boolean)
      .slice(0, 2)
      .join(" + ") || "Composite movement";
    const nextAction = actions[idx % actions.length]?.title || "Review with manager";

    return {
      metric_id: metric.metric_id,
      name: metric.name,
      unit: metric.unit || "count",
      current: Number.isFinite(currentNum) ? currentNum : null,
      previous: Number.isFinite(previousNum) ? previousNum : null,
      delta,
      target,
      status,
      driver: driverText,
      next_action: nextAction,
    };
  });
}

function composeExecutiveSummary(managerKey: string, context: any, scoreboard: any[]) {
  const manager = getManagerDefinition(managerKey);
  const actions = getAutonomousActionsForManager(managerKey);
  const todos = getHumanTodosForManager(managerKey);

  const sortable = scoreboard
    .filter((row) => typeof row?.delta === "number" && Number.isFinite(row.delta))
    .slice()
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const primaryShift = sortable[0] || null;

  const bullet1 = primaryShift
    ? `${primaryShift.name} moved ${primaryShift.delta >= 0 ? "up" : "down"} ${pctText(Math.abs(primaryShift.delta))} versus the previous period.`
    : `${manager?.name || managerKey} performance was stable with limited comparable deltas in this period.`;

  const drivers = Array.isArray(context?.drivers) ? context.drivers.filter(Boolean) : [];
  const bullet2 = drivers[0]
    ? `Primary driver: ${drivers[0]}`
    : "Primary driver: Data volume is limited, so this cycle relies on conservative baseline assumptions.";

  const bullet3 = `Next best move: ${actions[0]?.title || "Run prioritized autonomous action"} and then complete "${todos[0]?.title || "manager follow-up"}".`;

  return [bullet1, bullet2, bullet3].slice(0, 3);
}

async function buildLeadsContext(supabase: any, window: any) {
  const warnings: string[] = [];

  const contactsResult = await selectAllRows(
    (from, to) =>
      supabase
        .from("raw_hubspot_contacts")
        .select("*")
        .gte("createdate", window.previousStart.toISOString())
        .lte("createdate", window.currentEnd.toISOString())
        .order("createdate", { ascending: true })
        .range(from, to),
    { maxPages: 25 },
  );
  if (contactsResult.error) warnings.push(`HubSpot contacts unavailable: ${contactsResult.error.message}`);
  const contacts = contactsResult.data || [];

  const adsResult = await selectAllRows(
    (from, to) =>
      supabase
        .from("raw_fb_ads_insights_daily")
        .select("date_day,spend,leads,funnel_key,campaign_name")
        .gte("date_day", dateKeyUtc(window.previousStart))
        .lte("date_day", dateKeyUtc(window.currentEnd))
        .order("date_day", { ascending: true })
        .range(from, to),
    { maxPages: 25 },
  );
  if (adsResult.error) warnings.push(`Meta ads rows unavailable: ${adsResult.error.message}`);
  const ads = adsResult.data || [];

  const lumaResult = await selectAllRows(
    (from, to) =>
      supabase
        .from("raw_luma_registrations")
        .select("event_date,guest_email,approval_status,matched_hubspot,funnel_key,updated_at")
        .gte("event_date", dateKeyUtc(window.previousStart))
        .lte("event_date", dateKeyUtc(window.currentEnd))
        .order("event_date", { ascending: true })
        .range(from, to),
    { maxPages: 25 },
  );
  if (lumaResult.error) warnings.push(`Luma registrations unavailable: ${lumaResult.error.message}`);
  const lumaRows = lumaResult.data || [];

  const splitContacts = periodSplit(
    contacts,
    (row) => inDateRange(row?.createdate, window.currentStart, window.currentEnd),
    (row) => inDateRange(row?.createdate, window.previousStart, window.previousEnd),
  );
  const splitAds = periodSplit(
    ads,
    (row) => inDateKeyRange(row?.date_day, window.currentStart, window.currentEnd),
    (row) => inDateKeyRange(row?.date_day, window.previousStart, window.previousEnd),
  );
  const splitLuma = periodSplit(
    lumaRows.filter((row: any) => String(row?.approval_status || "approved").toLowerCase() !== "declined"),
    (row) => inDateKeyRange(row?.event_date, window.currentStart, window.currentEnd),
    (row) => inDateKeyRange(row?.event_date, window.previousStart, window.previousEnd),
  );

  const summarizeContactQuality = (rows: any[]) => {
    const qualityRows = rows.filter((row) => {
      const revenue = leadRevenue(row);
      return Number.isFinite(Number(revenue)) && Number(revenue) >= 250_000 && isOneYearSoberAtLead(row, row?.createdate);
    });
    const greatRows = rows.filter((row) => {
      const revenue = leadRevenue(row);
      return Number.isFinite(Number(revenue)) && Number(revenue) >= 1_000_000 && isOneYearSoberAtLead(row, row?.createdate);
    });
    return {
      quality_leads: qualityRows.length,
      great_leads: greatRows.length,
      paid_social_contacts: rows.filter(isPaidSocialContact).length,
    };
  };

  const leadCurrent = splitContacts.current.length;
  const leadPrevious = splitContacts.previous.length;
  const adsSpendCurrent = splitAds.current.reduce((sum: number, row: any) => sum + safeNumber(row?.spend, 0), 0);
  const adsSpendPrevious = splitAds.previous.reduce((sum: number, row: any) => sum + safeNumber(row?.spend, 0), 0);
  const adsLeadsCurrent = splitAds.current.reduce((sum: number, row: any) => sum + safeNumber(row?.leads, 0), 0);
  const adsLeadsPrevious = splitAds.previous.reduce((sum: number, row: any) => sum + safeNumber(row?.leads, 0), 0);
  const qualityCurrent = summarizeContactQuality(splitContacts.current);
  const qualityPrevious = summarizeContactQuality(splitContacts.previous);

  const currentMetrics = {
    leads_count: leadCurrent,
    ad_spend: adsSpendCurrent,
    ad_leads: adsLeadsCurrent,
    cpl: adsLeadsCurrent > 0 ? adsSpendCurrent / adsLeadsCurrent : null,
    quality_leads: qualityCurrent.quality_leads,
    quality_rate: leadCurrent > 0 ? qualityCurrent.quality_leads / leadCurrent : null,
    great_leads: qualityCurrent.great_leads,
    cpql: qualityCurrent.quality_leads > 0 ? adsSpendCurrent / qualityCurrent.quality_leads : null,
    luma_registrations: splitLuma.current.length,
    luma_to_hubspot_rate: splitLuma.current.length > 0
      ? splitLuma.current.filter((row: any) => !!row?.matched_hubspot).length / splitLuma.current.length
      : null,
    paid_social_share: leadCurrent > 0 ? qualityCurrent.paid_social_contacts / leadCurrent : null,
  };

  const previousMetrics = {
    leads_count: leadPrevious,
    ad_spend: adsSpendPrevious,
    ad_leads: adsLeadsPrevious,
    cpl: adsLeadsPrevious > 0 ? adsSpendPrevious / adsLeadsPrevious : null,
    quality_leads: qualityPrevious.quality_leads,
    quality_rate: leadPrevious > 0 ? qualityPrevious.quality_leads / leadPrevious : null,
    great_leads: qualityPrevious.great_leads,
    cpql: qualityPrevious.quality_leads > 0 ? adsSpendPrevious / qualityPrevious.quality_leads : null,
    luma_registrations: splitLuma.previous.length,
    luma_to_hubspot_rate: splitLuma.previous.length > 0
      ? splitLuma.previous.filter((row: any) => !!row?.matched_hubspot).length / splitLuma.previous.length
      : null,
    paid_social_share: leadPrevious > 0 ? qualityPrevious.paid_social_contacts / leadPrevious : null,
  };

  const campaignBreakdownMap = new Map<string, { campaign: string; spend: number; leads: number }>();
  splitAds.current.forEach((row: any) => {
    const campaign = String(row?.campaign_name || "Unattributed").trim() || "Unattributed";
    const current = campaignBreakdownMap.get(campaign) || { campaign, spend: 0, leads: 0 };
    current.spend += safeNumber(row?.spend, 0);
    current.leads += safeNumber(row?.leads, 0);
    campaignBreakdownMap.set(campaign, current);
  });
  const campaignRows = Array.from(campaignBreakdownMap.values())
    .map((row) => ({ ...row, cpl: row.leads > 0 ? row.spend / row.leads : null }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);

  const drivers = [
    `Lead volume ${pctText(pctChange(currentMetrics.leads_count, previousMetrics.leads_count))} vs previous period.`,
    `Quality lead rate is ${currentMetrics.quality_rate === null ? "N/A" : `${(currentMetrics.quality_rate * 100).toFixed(1)}%`} (${pctText(pctChange(currentMetrics.quality_rate, previousMetrics.quality_rate))} change).`,
    `Cost per lead is ${asCurrency(currentMetrics.cpl)} (${pctText(pctChange(currentMetrics.cpl, previousMetrics.cpl))} vs previous).`,
    campaignRows[0]
      ? `Top campaign by spend: ${campaignRows[0].campaign} (${asCurrency(campaignRows[0].spend)} spend, ${asCount(campaignRows[0].leads)} leads).`
      : "No campaign breakdown rows available for current period.",
  ].slice(0, 4);

  const trends = [
    {
      id: "leads_trend",
      title: "Leads trend",
      points: aggregateDailySum(
        contacts,
        (row) => {
          const d = safeDate(row?.createdate);
          return d ? dateKeyUtc(toUtcStartOfDay(d)) : null;
        },
        () => 1,
        window.previousStart,
        window.currentEnd,
      ),
    },
    {
      id: "cpql_trend",
      title: "CPL trend",
      points: aggregateDailyRatio(
        ads,
        (row) => String(row?.date_day || "").slice(0, 10) || null,
        (row) => safeNumber(row?.spend, 0),
        (row) => safeNumber(row?.leads, 0),
        window.previousStart,
        window.currentEnd,
      ),
    },
  ];

  const freshness = freshnessFromSources([
    {
      source: "raw_hubspot_contacts",
      last_sync_at: maxIsoTimestamps(contacts.map((row: any) => row?.createdate)),
      row_count: contacts.length,
      warning: contactsResult.error ? String(contactsResult.error?.message || contactsResult.error) : undefined,
    },
    {
      source: "raw_fb_ads_insights_daily",
      last_sync_at: maxIsoTimestamps(ads.map((row: any) => row?.date_day)),
      row_count: ads.length,
      warning: adsResult.error ? String(adsResult.error?.message || adsResult.error) : undefined,
    },
    {
      source: "raw_luma_registrations",
      last_sync_at: maxIsoTimestamps(lumaRows.map((row: any) => row?.updated_at || row?.event_date)),
      row_count: lumaRows.length,
      warning: lumaResult.error ? String(lumaResult.error?.message || lumaResult.error) : undefined,
    },
  ]);

  return {
    current: currentMetrics,
    previous: previousMetrics,
    drivers,
    breakdown: {
      columns: ["campaign", "spend", "leads", "cpl"],
      rows: campaignRows,
    },
    trends,
    data_freshness: freshness,
    warnings,
  };
}

async function buildAttendanceContext(supabase: any, window: any) {
  const warnings: string[] = [];

  const activitiesResult = await selectAllRows(
    (from, to) =>
      supabase
        .from("raw_hubspot_meeting_activities")
        .select("hubspot_activity_id,activity_type,hs_timestamp,created_at_hubspot,title,updated_at_hubspot,ingested_at")
        .in("activity_type", ["call", "meeting"])
        .or(`hs_timestamp.gte.${window.previousStart.toISOString()},created_at_hubspot.gte.${window.previousStart.toISOString()}`)
        .order("hs_timestamp", { ascending: true })
        .range(from, to),
    { maxPages: 30 },
  );
  if (activitiesResult.error) warnings.push(`HubSpot activities unavailable: ${activitiesResult.error.message}`);
  const activities = (activitiesResult.data || []).filter((row: any) => {
    const ts = safeDate(row?.hs_timestamp || row?.created_at_hubspot);
    return !!ts && ts.getTime() <= window.currentEnd.getTime();
  });

  const activityIds = Array.from(new Set(
    activities.map((row: any) => Number(row?.hubspot_activity_id)).filter((id) => Number.isFinite(id)),
  ));
  const associations: any[] = [];
  if (activityIds.length > 0) {
    for (let i = 0; i < activityIds.length; i += 200) {
      const chunk = activityIds.slice(i, i + 200);
      const { data, error } = await supabase
        .from("hubspot_activity_contact_associations")
        .select("hubspot_activity_id,activity_type,hubspot_contact_id,contact_email,contact_firstname,contact_lastname,ingested_at")
        .in("hubspot_activity_id", chunk)
        .in("activity_type", ["call", "meeting"]);
      if (error) {
        warnings.push(`HubSpot activity associations unavailable: ${error.message}`);
        break;
      }
      associations.push(...(data || []));
    }
  }

  const lumaResult = await selectAllRows(
    (from, to) =>
      supabase
        .from("raw_luma_registrations")
        .select("event_date,guest_email,approval_status,matched_zoom,updated_at")
        .gte("event_date", dateKeyUtc(window.previousStart))
        .lte("event_date", dateKeyUtc(window.currentEnd))
        .order("event_date", { ascending: true })
        .range(from, to),
    { maxPages: 30 },
  );
  if (lumaResult.error) warnings.push(`Luma registrations unavailable: ${lumaResult.error.message}`);
  const lumaRows = lumaResult.data || [];

  const assocByActivity = new Map<number, Set<string>>();
  associations.forEach((row) => {
    const activityId = Number(row?.hubspot_activity_id);
    if (!Number.isFinite(activityId)) return;
    if (!assocByActivity.has(activityId)) assocByActivity.set(activityId, new Set());
    const key = keyFromEmailOrName(row);
    if (key) assocByActivity.get(activityId)?.add(key);
  });

  const sessions = activities.map((row: any) => {
    const ts = safeDate(row?.hs_timestamp || row?.created_at_hubspot);
    const activityId = Number(row?.hubspot_activity_id);
    const attendees = Number.isFinite(activityId) ? (assocByActivity.get(activityId)?.size || 0) : 0;
    return {
      ...row,
      session_at: ts?.toISOString() || null,
      attendees,
      title: String(row?.title || "Untitled session").trim() || "Untitled session",
    };
  }).filter((row: any) => row.session_at);

  const splitSessions = periodSplit(
    sessions,
    (row) => inDateRange(row?.session_at, window.currentStart, window.currentEnd),
    (row) => inDateRange(row?.session_at, window.previousStart, window.previousEnd),
  );

  const attendeeSetForRows = (rows: any[]) => {
    const set = new Set<string>();
    rows.forEach((row) => {
      const activityId = Number(row?.hubspot_activity_id);
      const members = Number.isFinite(activityId) ? (assocByActivity.get(activityId) || new Set()) : new Set<string>();
      members.forEach((member) => set.add(member));
    });
    return set;
  };

  const currentAttendeesSet = attendeeSetForRows(splitSessions.current);
  const previousAttendeesSet = attendeeSetForRows(splitSessions.previous);

  const currentFreq = new Map<string, number>();
  splitSessions.current.forEach((row) => {
    const activityId = Number(row?.hubspot_activity_id);
    const members = Number.isFinite(activityId) ? (assocByActivity.get(activityId) || new Set()) : new Set<string>();
    members.forEach((member) => currentFreq.set(member, safeNumber(currentFreq.get(member), 0) + 1));
  });

  const currentMetrics = {
    sessions_count: splitSessions.current.length,
    unique_attendees: currentAttendeesSet.size,
    avg_attendance_per_session: splitSessions.current.length > 0
      ? splitSessions.current.reduce((sum, row) => sum + safeNumber(row?.attendees, 0), 0) / splitSessions.current.length
      : null,
    repeat_attendee_rate: currentAttendeesSet.size > 0
      ? Array.from(currentFreq.values()).filter((count) => count > 1).length / currentAttendeesSet.size
      : null,
    first_time_attendees: Array.from(currentAttendeesSet).filter((key) => !previousAttendeesSet.has(key)).length,
    registrations_count: lumaRows.filter((row: any) =>
      String(row?.approval_status || "approved").toLowerCase() !== "declined" &&
      inDateKeyRange(row?.event_date, window.currentStart, window.currentEnd)).length,
    show_up_rate: (() => {
      const regs = lumaRows.filter((row: any) =>
        String(row?.approval_status || "approved").toLowerCase() !== "declined" &&
        inDateKeyRange(row?.event_date, window.currentStart, window.currentEnd));
      if (!regs.length) return null;
      const showups = regs.filter((row: any) => !!row?.matched_zoom).length;
      return showups / regs.length;
    })(),
    high_engagement_attendees: Array.from(currentFreq.values()).filter((count) => count >= 3).length,
    inactive_attendee_risk: Array.from(previousAttendeesSet).filter((key) => !currentAttendeesSet.has(key)).length,
    attendance_followup_volume: Array.from(previousAttendeesSet).filter((key) => !currentAttendeesSet.has(key)).length,
  };

  const previousFreq = new Map<string, number>();
  splitSessions.previous.forEach((row) => {
    const activityId = Number(row?.hubspot_activity_id);
    const members = Number.isFinite(activityId) ? (assocByActivity.get(activityId) || new Set()) : new Set<string>();
    members.forEach((member) => previousFreq.set(member, safeNumber(previousFreq.get(member), 0) + 1));
  });

  const previousMetrics = {
    sessions_count: splitSessions.previous.length,
    unique_attendees: previousAttendeesSet.size,
    avg_attendance_per_session: splitSessions.previous.length > 0
      ? splitSessions.previous.reduce((sum, row) => sum + safeNumber(row?.attendees, 0), 0) / splitSessions.previous.length
      : null,
    repeat_attendee_rate: previousAttendeesSet.size > 0
      ? Array.from(previousFreq.values()).filter((count) => count > 1).length / previousAttendeesSet.size
      : null,
    first_time_attendees: null,
    registrations_count: lumaRows.filter((row: any) =>
      String(row?.approval_status || "approved").toLowerCase() !== "declined" &&
      inDateKeyRange(row?.event_date, window.previousStart, window.previousEnd)).length,
    show_up_rate: (() => {
      const regs = lumaRows.filter((row: any) =>
        String(row?.approval_status || "approved").toLowerCase() !== "declined" &&
        inDateKeyRange(row?.event_date, window.previousStart, window.previousEnd));
      if (!regs.length) return null;
      const showups = regs.filter((row: any) => !!row?.matched_zoom).length;
      return showups / regs.length;
    })(),
    high_engagement_attendees: Array.from(previousFreq.values()).filter((count) => count >= 3).length,
    inactive_attendee_risk: null,
    attendance_followup_volume: null,
  };

  const breakdownRows = splitSessions.current
    .map((row: any) => {
      const d = safeDate(row?.session_at);
      return {
        session_date: d ? dateKeyUtc(toUtcStartOfDay(d)) : "N/A",
        session_title: row?.title || "Untitled session",
        attendees: safeNumber(row?.attendees, 0),
      };
    })
    .sort((a, b) => b.attendees - a.attendees)
    .slice(0, 12);

  const sessionRowsForTrend = sessions.map((row) => ({
    date_key: dateKeyUtc(toUtcStartOfDay(safeDate(row?.session_at) || new Date())),
    attendees: safeNumber(row?.attendees, 0),
  }));

  const drivers = [
    `Session volume changed ${pctText(pctChange(currentMetrics.sessions_count, previousMetrics.sessions_count))} versus previous period.`,
    `Repeat attendee rate is ${currentMetrics.repeat_attendee_rate === null ? "N/A" : `${(currentMetrics.repeat_attendee_rate * 100).toFixed(1)}%`} (${pctText(pctChange(currentMetrics.repeat_attendee_rate, previousMetrics.repeat_attendee_rate))} change).`,
    `Show-up rate is ${currentMetrics.show_up_rate === null ? "N/A" : `${(currentMetrics.show_up_rate * 100).toFixed(1)}%`} with ${asCount(currentMetrics.registrations_count)} registrations.`,
    `Inactive risk cohort contains ${asCount(currentMetrics.inactive_attendee_risk)} previously active attendees.`,
  ];

  const trends = [
    {
      id: "attendance_volume_trend",
      title: "Attendance trend",
      points: aggregateDailySum(
        sessionRowsForTrend,
        (row) => row?.date_key || null,
        (row) => safeNumber(row?.attendees, 0),
        window.previousStart,
        window.currentEnd,
      ),
    },
    {
      id: "attendance_show_rate_trend",
      title: "Show-up rate trend",
      points: aggregateDailyRatio(
        lumaRows.filter((row: any) => String(row?.approval_status || "approved").toLowerCase() !== "declined"),
        (row) => String(row?.event_date || "").slice(0, 10) || null,
        (row) => (row?.matched_zoom ? 1 : 0),
        () => 1,
        window.previousStart,
        window.currentEnd,
      ),
    },
  ];

  const freshness = freshnessFromSources([
    {
      source: "raw_hubspot_meeting_activities",
      last_sync_at: maxIsoTimestamps(activities.map((row: any) => row?.updated_at_hubspot || row?.ingested_at || row?.hs_timestamp)),
      row_count: activities.length,
      warning: activitiesResult.error ? String(activitiesResult.error?.message || activitiesResult.error) : undefined,
    },
    {
      source: "hubspot_activity_contact_associations",
      last_sync_at: maxIsoTimestamps(associations.map((row: any) => row?.ingested_at)),
      row_count: associations.length,
    },
    {
      source: "raw_luma_registrations",
      last_sync_at: maxIsoTimestamps(lumaRows.map((row: any) => row?.updated_at || row?.event_date)),
      row_count: lumaRows.length,
      warning: lumaResult.error ? String(lumaResult.error?.message || lumaResult.error) : undefined,
    },
  ]);

  return {
    current: currentMetrics,
    previous: previousMetrics,
    drivers,
    breakdown: {
      columns: ["session_date", "session_title", "attendees"],
      rows: breakdownRows,
    },
    trends,
    data_freshness: freshness,
    warnings,
  };
}

async function buildEmailContext(supabase: any, window: any) {
  const warnings: string[] = [];

  const result = await selectAllRows(
    (from, to) =>
      supabase
        .from("mailchimp_campaigns")
        .select("id,send_time,campaign_group,emails_sent,emails_delivered,unique_opens,mpp_opens,unique_clicks,unsubscribes,bounces,human_open_rate,raw_open_rate,ctr,ctor,unsubscribe_rate,bounce_rate,updated_at")
        .gte("send_time", window.previousStart.toISOString())
        .lte("send_time", window.currentEnd.toISOString())
        .order("send_time", { ascending: true })
        .range(from, to),
    { maxPages: 20 },
  );
  if (result.error) warnings.push(`Mailchimp campaigns unavailable: ${result.error.message}`);
  const campaigns = result.data || [];

  const split = periodSplit(
    campaigns,
    (row) => inDateRange(row?.send_time, window.currentStart, window.currentEnd),
    (row) => inDateRange(row?.send_time, window.previousStart, window.previousEnd),
  );

  const summarize = (rows: any[]) => {
    const campaignsSent = rows.length;
    const emailsSent = rows.reduce((sum, row) => sum + safeNumber(row?.emails_sent, 0), 0);
    const delivered = rows.reduce((sum, row) => sum + safeNumber(row?.emails_delivered, 0), 0);
    const clicks = rows.reduce((sum, row) => sum + safeNumber(row?.unique_clicks, 0), 0);
    const opens = rows.reduce((sum, row) => sum + safeNumber(row?.unique_opens, 0), 0);
    const unsubscribes = rows.reduce((sum, row) => sum + safeNumber(row?.unsubscribes, 0), 0);
    const bounces = rows.reduce((sum, row) => sum + safeNumber(row?.bounces, 0), 0);
    const humanOpenNumerator = rows.reduce((sum, row) => {
      const deliveredCount = safeNumber(row?.emails_delivered, 0);
      const humanRate = Number(row?.human_open_rate);
      if (Number.isFinite(humanRate)) return sum + humanRate * deliveredCount;
      const opensCount = safeNumber(row?.unique_opens, 0) - safeNumber(row?.mpp_opens, 0);
      return sum + Math.max(opensCount, 0);
    }, 0);
    return {
      campaigns_sent: campaignsSent,
      emails_delivered: delivered,
      unique_clicks: clicks,
      human_open_rate: delivered > 0 ? humanOpenNumerator / delivered : null,
      ctr: delivered > 0 ? clicks / delivered : null,
      ctor: opens > 0 ? clicks / opens : null,
      unsubscribe_rate: delivered > 0 ? unsubscribes / delivered : null,
      bounce_rate: emailsSent > 0 ? bounces / emailsSent : null,
      email_deliverability: emailsSent > 0 ? delivered / emailsSent : null,
      email_list_health: delivered > 0 ? 1 - (unsubscribes / delivered) : null,
    };
  };

  const currentMetrics = summarize(split.current);
  const previousMetrics = summarize(split.previous);
  const hasAnyData = campaigns.length > 0;

  const breakdown = ["Tuesday", "Thursday", "Other"].map((group) => {
    const rows = split.current.filter((row: any) => {
      const g = String(row?.campaign_group || "").trim();
      if (group === "Other") return g !== "Tuesday" && g !== "Thursday";
      return g === group;
    });
    const metrics = summarize(rows);
    return {
      campaign_group: group,
      campaigns_sent: metrics.campaigns_sent,
      emails_delivered: metrics.emails_delivered,
      human_open_rate: metrics.human_open_rate,
      ctr: metrics.ctr,
    };
  }).filter((row) => row.campaigns_sent > 0 || row.campaign_group !== "Other");

  const drivers = hasAnyData
    ? [
        `Human open rate is ${currentMetrics.human_open_rate === null ? "N/A" : `${(currentMetrics.human_open_rate * 100).toFixed(1)}%`} (${pctText(pctChange(currentMetrics.human_open_rate, previousMetrics.human_open_rate))} vs previous).`,
        `CTR is ${currentMetrics.ctr === null ? "N/A" : `${(currentMetrics.ctr * 100).toFixed(2)}%`} with ${asCount(currentMetrics.unique_clicks)} unique clicks.`,
        `List risk signals: unsubscribe ${currentMetrics.unsubscribe_rate === null ? "N/A" : `${(currentMetrics.unsubscribe_rate * 100).toFixed(2)}%`}, bounce ${currentMetrics.bounce_rate === null ? "N/A" : `${(currentMetrics.bounce_rate * 100).toFixed(2)}%`}.`,
      ]
    : [
        "Email data is not available yet; campaign metrics are currently stubbed.",
        "Connect and sync Mailchimp campaigns to replace placeholder values with live performance.",
        "Until sync is configured, action recommendations prioritize setup and data quality.",
      ];

  const trends = [
    {
      id: "email_open_rate_trend",
      title: "Human open rate trend",
      points: campaigns
        .map((row: any) => ({
          x: String(row?.send_time || "").slice(0, 10),
          y: Number.isFinite(Number(row?.human_open_rate)) ? Number(row?.human_open_rate) : 0,
        }))
        .slice(-30),
    },
    {
      id: "email_ctr_trend",
      title: "CTR trend",
      points: campaigns
        .map((row: any) => ({
          x: String(row?.send_time || "").slice(0, 10),
          y: Number.isFinite(Number(row?.ctr)) ? Number(row?.ctr) : 0,
        }))
        .slice(-30),
    },
  ];

  const freshness = freshnessFromSources([
    {
      source: "mailchimp_campaigns",
      last_sync_at: maxIsoTimestamps(campaigns.map((row: any) => row?.updated_at || row?.send_time)),
      row_count: campaigns.length,
      warning: result.error ? String(result.error?.message || result.error) : undefined,
    },
  ]);

  return {
    current: currentMetrics,
    previous: previousMetrics,
    drivers,
    breakdown: {
      columns: ["campaign_group", "campaigns_sent", "emails_delivered", "human_open_rate", "ctr"],
      rows: breakdown,
    },
    trends,
    data_freshness: freshness,
    warnings,
  };
}

async function buildSeoContext(supabase: any, window: any) {
  const warnings: string[] = [];
  const metricNames = [
    "GA Sessions",
    "GA Users",
    "GA Engaged Sessions",
    "GA Engagement Rate",
    "GA Sessions - Organic",
    "GA Sessions - Paid",
    "GA Sessions - Direct",
    "GA Sessions - Referral",
    "GA Sessions - Email",
    "GA Sessions - Social",
    "GA Sessions - Other",
    "GSC Clicks",
    "GSC Impressions",
    "GSC CTR",
    "GSC Avg Position",
  ];

  const result = await selectAllRows(
    (from, to) =>
      supabase
        .from("kpi_metrics")
        .select("source_slug,metric_name,metric_value,metric_date,created_at")
        .in("source_slug", ["google_analytics", "google_search_console"])
        .in("metric_name", metricNames)
        .gte("metric_date", dateKeyUtc(window.previousStart))
        .lte("metric_date", dateKeyUtc(window.currentEnd))
        .order("metric_date", { ascending: true })
        .range(from, to),
    { maxPages: 30 },
  );
  if (result.error) warnings.push(`KPI metrics unavailable: ${result.error.message}`);
  const rows = result.data || [];

  const byDate = new Map<string, any>();
  rows.forEach((row: any) => {
    const dateKey = String(row?.metric_date || "").slice(0, 10);
    if (!dateKey) return;
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, {
        date: dateKey,
        sessions: 0,
        users: 0,
        engaged: 0,
        engagement_rate: null,
        organic: 0,
        paid: 0,
        direct: 0,
        referral: 0,
        email: 0,
        social: 0,
        other: 0,
        gsc_clicks: 0,
        gsc_impressions: 0,
        gsc_ctr: null,
        gsc_position: null,
      });
    }
    const day = byDate.get(dateKey);
    const value = safeNumber(row?.metric_value, 0);
    switch (row?.metric_name) {
      case "GA Sessions": day.sessions = value; break;
      case "GA Users": day.users = value; break;
      case "GA Engaged Sessions": day.engaged = value; break;
      case "GA Engagement Rate": day.engagement_rate = Number(row?.metric_value); break;
      case "GA Sessions - Organic": day.organic = value; break;
      case "GA Sessions - Paid": day.paid = value; break;
      case "GA Sessions - Direct": day.direct = value; break;
      case "GA Sessions - Referral": day.referral = value; break;
      case "GA Sessions - Email": day.email = value; break;
      case "GA Sessions - Social": day.social = value; break;
      case "GA Sessions - Other": day.other = value; break;
      case "GSC Clicks": day.gsc_clicks = value; break;
      case "GSC Impressions": day.gsc_impressions = value; break;
      case "GSC CTR": day.gsc_ctr = Number(row?.metric_value); break;
      case "GSC Avg Position": day.gsc_position = Number(row?.metric_value); break;
      default: break;
    }
  });

  const days = Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const inCurrent = (row: any) => inDateKeyRange(row?.date, window.currentStart, window.currentEnd);
  const inPrevious = (row: any) => inDateKeyRange(row?.date, window.previousStart, window.previousEnd);
  const currentDays = days.filter(inCurrent);
  const previousDays = days.filter(inPrevious);

  const summarize = (rowsForPeriod: any[]) => {
    const sessions = rowsForPeriod.reduce((sum, row) => sum + safeNumber(row?.sessions, 0), 0);
    const users = rowsForPeriod.reduce((sum, row) => sum + safeNumber(row?.users, 0), 0);
    const engaged = rowsForPeriod.reduce((sum, row) => sum + safeNumber(row?.engaged, 0), 0);
    const organic = rowsForPeriod.reduce((sum, row) => sum + safeNumber(row?.organic, 0), 0);
    const paid = rowsForPeriod.reduce((sum, row) => sum + safeNumber(row?.paid, 0), 0);
    const clicks = rowsForPeriod.reduce((sum, row) => sum + safeNumber(row?.gsc_clicks, 0), 0);
    const impressions = rowsForPeriod.reduce((sum, row) => sum + safeNumber(row?.gsc_impressions, 0), 0);
    const positionValues = rowsForPeriod.map((row) => Number(row?.gsc_position)).filter((n) => Number.isFinite(n));
    return {
      ga_sessions: sessions,
      ga_users: users,
      engagement_rate: sessions > 0 ? engaged / sessions : null,
      organic_sessions: organic,
      organic_share: sessions > 0 ? organic / sessions : null,
      paid_sessions: paid,
      gsc_clicks: clicks,
      gsc_impressions: impressions,
      gsc_ctr: impressions > 0 ? clicks / impressions : null,
      avg_position: positionValues.length > 0
        ? positionValues.reduce((sum, value) => sum + value, 0) / positionValues.length
        : null,
    };
  };

  const currentMetrics = summarize(currentDays);
  const previousMetrics = summarize(previousDays);

  const breakdownRows = [
    { channel: "Organic", sessions: currentDays.reduce((sum, row) => sum + safeNumber(row?.organic, 0), 0) },
    { channel: "Paid", sessions: currentDays.reduce((sum, row) => sum + safeNumber(row?.paid, 0), 0) },
    { channel: "Direct", sessions: currentDays.reduce((sum, row) => sum + safeNumber(row?.direct, 0), 0) },
    { channel: "Referral", sessions: currentDays.reduce((sum, row) => sum + safeNumber(row?.referral, 0), 0) },
    { channel: "Email", sessions: currentDays.reduce((sum, row) => sum + safeNumber(row?.email, 0), 0) },
    { channel: "Social", sessions: currentDays.reduce((sum, row) => sum + safeNumber(row?.social, 0), 0) },
    { channel: "Other", sessions: currentDays.reduce((sum, row) => sum + safeNumber(row?.other, 0), 0) },
  ];

  const drivers = [
    `Organic sessions ${pctText(pctChange(currentMetrics.organic_sessions, previousMetrics.organic_sessions))} vs previous period.`,
    `Search clicks ${pctText(pctChange(currentMetrics.gsc_clicks, previousMetrics.gsc_clicks))} with CTR at ${currentMetrics.gsc_ctr === null ? "N/A" : `${(currentMetrics.gsc_ctr * 100).toFixed(2)}%`}.`,
    `Average position is ${currentMetrics.avg_position === null ? "N/A" : currentMetrics.avg_position.toFixed(1)} (${pctText(pctChange(previousMetrics.avg_position, currentMetrics.avg_position))} better/worse signal).`,
  ];

  const trends = [
    {
      id: "seo_sessions_trend",
      title: "Sessions trend",
      points: days.map((row) => ({ x: row.date, y: safeNumber(row?.sessions, 0) })),
    },
    {
      id: "seo_clicks_trend",
      title: "Search clicks trend",
      points: days.map((row) => ({ x: row.date, y: safeNumber(row?.gsc_clicks, 0) })),
    },
  ];

  const freshness = freshnessFromSources([
    {
      source: "kpi_metrics",
      last_sync_at: maxIsoTimestamps(rows.map((row: any) => row?.created_at || row?.metric_date)),
      row_count: rows.length,
      warning: result.error ? String(result.error?.message || result.error) : undefined,
    },
  ]);

  return {
    current: currentMetrics,
    previous: previousMetrics,
    drivers,
    breakdown: {
      columns: ["channel", "sessions"],
      rows: breakdownRows,
    },
    trends,
    data_freshness: freshness,
    warnings,
  };
}

async function buildDonationsContext(supabase: any, window: any) {
  const warnings: string[] = [];

  const txResult = await selectAllRows(
    (from, to) =>
      supabase
        .from("donation_transactions_unified")
        .select("row_id,donor_name,donor_email,amount,is_recurring,campaign_name,donated_at,created_at,updated_at")
        .gte("donated_at", window.previousStart.toISOString())
        .lte("donated_at", window.currentEnd.toISOString())
        .order("donated_at", { ascending: true })
        .range(from, to),
    { maxPages: 40 },
  );
  if (txResult.error) warnings.push(`Donation transactions unavailable: ${txResult.error.message}`);
  const txRows = (txResult.data || []).filter((row: any) => safeNumber(row?.amount, 0) > 0);

  const supporterResult = await selectAllRows(
    (from, to) =>
      supabase
        .from("raw_zeffy_supporter_profiles")
        .select("donor_email,last_payment_at,updated_at")
        .order("last_payment_at", { ascending: false })
        .range(from, to),
    { maxPages: 20 },
  );
  if (supporterResult.error) warnings.push(`Supporter profiles unavailable: ${supporterResult.error.message}`);
  const supporterRows = supporterResult.data || [];

  const split = periodSplit(
    txRows,
    (row) => inDateRange(row?.donated_at, window.currentStart, window.currentEnd),
    (row) => inDateRange(row?.donated_at, window.previousStart, window.previousEnd),
  );

  const summarize = (rows: any[]) => {
    const totalAmount = rows.reduce((sum, row) => sum + safeNumber(row?.amount, 0), 0);
    const txCount = rows.length;
    const uniqueDonors = new Set(rows.map((row) => keyFromEmailOrName(row)).filter(Boolean)).size;
    const recurringRows = rows.filter((row: any) => !!row?.is_recurring);
    const recurringAmount = recurringRows.reduce((sum, row) => sum + safeNumber(row?.amount, 0), 0);
    const donorTotals = new Map<string, number>();
    rows.forEach((row) => {
      const key = keyFromEmailOrName(row) || `anon:${row?.row_id || Math.random()}`;
      donorTotals.set(key, safeNumber(donorTotals.get(key), 0) + safeNumber(row?.amount, 0));
    });
    const topDonorAmount = Math.max(0, ...Array.from(donorTotals.values()));
    const campaignTagged = rows.filter((row: any) => String(row?.campaign_name || "").trim().length > 0).length;
    return {
      total_amount: totalAmount,
      transactions_count: txCount,
      unique_donors: uniqueDonors,
      average_gift: txCount > 0 ? totalAmount / txCount : null,
      recurring_txn_share: txCount > 0 ? recurringRows.length / txCount : null,
      recurring_amount_share: totalAmount > 0 ? recurringAmount / totalAmount : null,
      top_donor_concentration: totalAmount > 0 ? topDonorAmount / totalAmount : null,
      campaign_attribution_coverage: txCount > 0 ? campaignTagged / txCount : null,
      active_supporters: supporterRows.length,
      donations_data_freshness: null,
    };
  };

  const currentMetrics = summarize(split.current);
  const previousMetrics = summarize(split.previous);

  const campaignMap = new Map<string, { campaign_name: string; amount: number; transactions: number }>();
  split.current.forEach((row: any) => {
    const campaign = String(row?.campaign_name || "Unattributed").trim() || "Unattributed";
    const item = campaignMap.get(campaign) || { campaign_name: campaign, amount: 0, transactions: 0 };
    item.amount += safeNumber(row?.amount, 0);
    item.transactions += 1;
    campaignMap.set(campaign, item);
  });
  const campaignRows = Array.from(campaignMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 12);

  const drivers = [
    `Donation amount ${pctText(pctChange(currentMetrics.total_amount, previousMetrics.total_amount))} vs previous period.`,
    `Recurring amount share is ${currentMetrics.recurring_amount_share === null ? "N/A" : `${(currentMetrics.recurring_amount_share * 100).toFixed(1)}%`} (${pctText(pctChange(currentMetrics.recurring_amount_share, previousMetrics.recurring_amount_share))} change).`,
    `Unique donors: ${asCount(currentMetrics.unique_donors)} (${pctText(pctChange(currentMetrics.unique_donors, previousMetrics.unique_donors))} vs previous).`,
    campaignRows[0]
      ? `Top campaign contribution: ${campaignRows[0].campaign_name} at ${asCurrency(campaignRows[0].amount)}.`
      : "Campaign attribution is sparse; top campaign cannot be determined reliably.",
  ];

  const trends = [
    {
      id: "donations_amount_trend",
      title: "Donation amount trend",
      points: aggregateDailySum(
        txRows,
        (row) => {
          const d = safeDate(row?.donated_at);
          return d ? dateKeyUtc(toUtcStartOfDay(d)) : null;
        },
        (row) => safeNumber(row?.amount, 0),
        window.previousStart,
        window.currentEnd,
      ),
    },
    {
      id: "donations_count_trend",
      title: "Donation count trend",
      points: aggregateDailySum(
        txRows,
        (row) => {
          const d = safeDate(row?.donated_at);
          return d ? dateKeyUtc(toUtcStartOfDay(d)) : null;
        },
        () => 1,
        window.previousStart,
        window.currentEnd,
      ),
    },
  ];

  const freshness = freshnessFromSources([
    {
      source: "donation_transactions_unified",
      last_sync_at: maxIsoTimestamps(txRows.map((row: any) => row?.updated_at || row?.created_at || row?.donated_at)),
      row_count: txRows.length,
      warning: txResult.error ? String(txResult.error?.message || txResult.error) : undefined,
    },
    {
      source: "raw_zeffy_supporter_profiles",
      last_sync_at: maxIsoTimestamps(supporterRows.map((row: any) => row?.updated_at || row?.last_payment_at)),
      row_count: supporterRows.length,
      warning: supporterResult.error ? String(supporterResult.error?.message || supporterResult.error) : undefined,
    },
  ]);

  return {
    current: currentMetrics,
    previous: previousMetrics,
    drivers,
    breakdown: {
      columns: ["campaign_name", "amount", "transactions"],
      rows: campaignRows,
    },
    trends,
    data_freshness: freshness,
    warnings,
  };
}

function readStatusCounts(scoreboard: any[]) {
  const counts = { red: 0, watch: 0, green: 0 };
  (scoreboard || []).forEach((row) => {
    const status = String(row?.status || "").toLowerCase();
    if (status === "red") counts.red += 1;
    else if (status === "green") counts.green += 1;
    else counts.watch += 1;
  });
  return counts;
}

async function loadManagerSnapshot(supabase: any, managerKey: string, period: string, compare: string, filters: any) {
  const filtersJson = stableJson(filters);
  const { data, error } = await supabase
    .from("analysis_snapshots")
    .select("id,manager_key,period,compare,filters,output,created_at")
    .eq("manager_key", managerKey)
    .eq("period", period)
    .eq("compare", compare)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw new Error(`Failed to load prior snapshots for ${managerKey}: ${error.message}`);
  const rows = data || [];
  const exact = rows.find((row: any) => stableJson(row?.filters || {}) === filtersJson);
  return exact || rows[0] || null;
}

async function buildOperationsContext(
  supabase: any,
  managerSnapshots: Record<string, any>,
) {
  const rows = Object.entries(managerSnapshots).map(([managerKey, snapshot]) => {
    const output = snapshot?.output || {};
    const scoreboard = Array.isArray(output?.scoreboard) ? output.scoreboard : [];
    const counts = readStatusCounts(scoreboard);
    const lastSync = output?.data_freshness?.last_sync_at || snapshot?.created_at || null;
    const freshnessHours = lastSync ? (Date.now() - new Date(lastSync).getTime()) / 3_600_000 : null;
    return {
      manager_key: managerKey,
      manager_name: getManagerDefinition(managerKey)?.name || managerKey,
      red_metrics: counts.red,
      watch_metrics: counts.watch,
      green_metrics: counts.green,
      freshness_hours: Number.isFinite(freshnessHours) ? freshnessHours : null,
      last_updated: snapshot?.created_at || null,
      stale: Number.isFinite(freshnessHours) ? freshnessHours > 24 : true,
    };
  });

  const managersReporting = rows.filter((row) => !!row.last_updated).length;
  const redCount = rows.reduce((sum, row) => sum + safeNumber(row.red_metrics, 0), 0);
  const watchCount = rows.reduce((sum, row) => sum + safeNumber(row.watch_metrics, 0), 0);
  const greenCount = rows.reduce((sum, row) => sum + safeNumber(row.green_metrics, 0), 0);
  const freshnessHours = rows
    .map((row) => (Number.isFinite(row.freshness_hours) ? row.freshness_hours : null))
    .filter((n) => n !== null);
  const maxFreshnessHours = freshnessHours.length > 0 ? Math.max(...freshnessHours as number[]) : null;

  let previousRedCount = redCount;
  let previousReporting = managersReporting;
  for (const managerKey of OPERATIONS_INPUT_MANAGERS) {
    const { data, error } = await supabase
      .from("analysis_snapshots")
      .select("output,created_at")
      .eq("manager_key", managerKey)
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(2);
    if (error || !data || data.length < 2) continue;
    const latestCounts = readStatusCounts(data[0]?.output?.scoreboard || []);
    const prevCounts = readStatusCounts(data[1]?.output?.scoreboard || []);
    previousRedCount = previousRedCount - latestCounts.red + prevCounts.red;
    previousReporting = previousReporting;
  }

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { count: actionRunsCount } = await supabase
    .from("action_runs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgoIso)
    .eq("status", "success");
  const { count: notionTaskCount } = await supabase
    .from("notion_tasks")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgoIso)
    .eq("status", "created");

  const bottleneck = rows.slice().sort((a, b) => (b.red_metrics - a.red_metrics) || (safeNumber(b.watch_metrics) - safeNumber(a.watch_metrics)))[0];
  const drivers = [
    bottleneck
      ? `${bottleneck.manager_name} has the largest constraint with ${bottleneck.red_metrics} red metrics.`
      : "No manager bottleneck could be identified from available snapshots.",
    `Cross-functional red metrics total ${redCount} (${pctText(pctChange(redCount, previousRedCount))} vs prior baseline).`,
    `Oldest data freshness is ${maxFreshnessHours === null ? "N/A" : `${maxFreshnessHours.toFixed(1)}h`} across manager feeds.`,
    `Execution throughput in the last 7 days: ${safeNumber(actionRunsCount, 0)} autonomous runs, ${safeNumber(notionTaskCount, 0)} Notion tasks added.`,
  ];

  const trends = [
    {
      id: "ops_red_metrics_trend",
      title: "Red metrics trend",
      points: [
        { x: "Previous", y: previousRedCount },
        { x: "Current", y: redCount },
      ],
    },
    {
      id: "ops_reporting_coverage_trend",
      title: "Reporting coverage trend",
      points: [
        { x: "Previous", y: previousReporting },
        { x: "Current", y: managersReporting },
      ],
    },
  ];

  return {
    current: {
      managers_reporting: managersReporting,
      red_metrics_count: redCount,
      watch_metrics_count: watchCount,
      green_metrics_count: greenCount,
      data_freshness_hours: maxFreshnessHours,
      action_runs_7d: safeNumber(actionRunsCount, 0),
      notion_tasks_7d: safeNumber(notionTaskCount, 0),
      improvement_velocity: previousRedCount - redCount,
    },
    previous: {
      managers_reporting: previousReporting,
      red_metrics_count: previousRedCount,
      watch_metrics_count: null,
      green_metrics_count: null,
      data_freshness_hours: null,
      action_runs_7d: null,
      notion_tasks_7d: null,
      improvement_velocity: null,
    },
    drivers,
    breakdown: {
      columns: ["manager_name", "red_metrics", "watch_metrics", "green_metrics", "freshness_hours", "last_updated"],
      rows,
    },
    trends,
    data_freshness: freshnessFromSources(
      rows.map((row) => ({
        source: row.manager_key,
        last_sync_at: row.last_updated || null,
        row_count: safeNumber(row.red_metrics, 0) + safeNumber(row.watch_metrics, 0) + safeNumber(row.green_metrics, 0),
      })),
    ),
    warnings: [],
  };
}

async function buildContextForManager(
  supabase: any,
  managerKey: string,
  window: any,
  snapshotProvider: (managerKey: string) => Promise<any>,
) {
  if (managerKey === "leads") return await buildLeadsContext(supabase, window);
  if (managerKey === "attendance") return await buildAttendanceContext(supabase, window);
  if (managerKey === "email") return await buildEmailContext(supabase, window);
  if (managerKey === "seo") return await buildSeoContext(supabase, window);
  if (managerKey === "donations") return await buildDonationsContext(supabase, window);
  if (managerKey === "operations") {
    const snapshots: Record<string, any> = {};
    for (const key of OPERATIONS_INPUT_MANAGERS) {
      snapshots[key] = await snapshotProvider(key);
    }
    return await buildOperationsContext(supabase, snapshots);
  }
  throw new Error(`Unsupported manager key: ${managerKey}`);
}

async function writeAuditLog(
  supabase: any,
  eventType: string,
  managerKey: string | null,
  payload: any,
  status: "success" | "error",
  errorText: string | null = null,
) {
  await supabase.from("audit_log").insert({
    event_type: eventType,
    manager_key: managerKey,
    payload: stableObject(payload || {}),
    status,
    error: errorText,
  });
}

async function resolveSnapshotOrGenerate(
  supabase: any,
  managerKey: string,
  period: string,
  compare: string,
  filters: any,
  generator: (managerKey: string) => Promise<any>,
) {
  const existing = await loadManagerSnapshot(supabase, managerKey, period, compare, filters);
  if (existing?.output) return existing;
  const generated = await generator(managerKey);
  return { output: generated, created_at: generated?.generated_at || new Date().toISOString() };
}

async function generateReportForManager(
  supabase: any,
  managerKey: string,
  period: string,
  compare: string,
  filters: any,
  force: boolean,
  depth = 0,
) {
  if (!MANAGER_KEYS.includes(managerKey)) throw new Error(`Unsupported manager_key: ${managerKey}`);
  const manager = getManagerDefinition(managerKey);
  if (!manager) throw new Error(`Unknown manager definition: ${managerKey}`);
  const window = buildWindow(period);

  const snapshotProvider = async (otherManagerKey: string) => {
    return await resolveSnapshotOrGenerate(
      supabase,
      otherManagerKey,
      period,
      compare,
      filters,
      async (key: string) => {
        if (depth > 1) {
          const fallbackSnapshot = await loadManagerSnapshot(supabase, key, period, compare, filters);
          return fallbackSnapshot?.output || {
            manager_key: key,
            generated_at: new Date().toISOString(),
            scoreboard: [],
            data_freshness: { last_sync_at: null, sources: [] },
          };
        }
        const generated = await generateReportForManager(supabase, key, period, compare, filters, false, depth + 1);
        return generated.output;
      },
    );
  };

  const context = await buildContextForManager(supabase, managerKey, window, snapshotProvider);
  const sourceTimestamps = (context?.data_freshness?.sources || []).map((source: any) => ({
    source: source?.source || "unknown",
    last_sync_at: source?.last_sync_at || null,
    row_count: safeNumber(source?.row_count, 0),
  }));

  const inputsHash = await sha256Hex({
    manager_key: managerKey,
    period,
    compare,
    filters,
    source_timestamps: sourceTimestamps,
  });

  const { data: cachedRows, error: cacheError } = await supabase
    .from("analysis_snapshots")
    .select("id,output,created_at")
    .eq("manager_key", managerKey)
    .eq("period", period)
    .eq("compare", compare)
    .eq("inputs_hash", inputsHash)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1);
  if (cacheError) {
    throw new Error(`Failed reading analysis_snapshots cache: ${cacheError.message}`);
  }

  const cached = (cachedRows || [])[0] || null;
  const ttlMs = SNAPSHOT_TTL_HOURS * 60 * 60 * 1000;
  const isFreshCached = !!cached?.created_at && (Date.now() - Date.parse(cached.created_at)) <= ttlMs;

  if (!force && cached && isFreshCached) {
    await writeAuditLog(
      supabase,
      "analysis_refresh",
      managerKey,
      { period, compare, filters, from_cache: true, inputs_hash: inputsHash },
      "success",
      null,
    );
    return {
      fromCache: true,
      inputsHash,
      snapshotId: cached.id,
      output: cached.output,
    };
  }

  const autonomousActions = getAutonomousActionsForManager(managerKey).slice(0, 3).map((row: any) => ({
    action_id: row.action_id,
    title: row.title,
    description: row.description,
    expected_impact: row.expected_impact,
    risk: row.risk,
  }));

  const humanTodos = getHumanTodosForManager(managerKey).slice(0, 3).map((row: any) => ({
    todo_id: row.todo_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    due_in_days: row.due_in_days ?? null,
  }));

  const scoreboard = composeScoreboard(managerKey, context).slice(0, 12);
  const executiveSummary = composeExecutiveSummary(managerKey, context, scoreboard);
  const trends = Array.isArray(context?.trends) ? context.trends.slice(0, 2) : [];
  while (trends.length < 2) {
    trends.push({
      id: `placeholder_trend_${trends.length + 1}`,
      title: `Trend ${trends.length + 1}`,
      points: [],
    });
  }

  const output = {
    manager_key: managerKey,
    period,
    compare,
    generated_at: new Date().toISOString(),
    data_freshness: {
      last_sync_at: context?.data_freshness?.last_sync_at || null,
      sources: context?.data_freshness?.sources || [],
    },
    executive_summary: executiveSummary.slice(0, 3),
    scoreboard,
    drivers: (context?.drivers || []).filter(Boolean).slice(0, 6),
    breakdown: context?.breakdown || { columns: [], rows: [] },
    trends: trends.slice(0, 2),
    autonomous_actions: autonomousActions,
    human_todos: humanTodos,
  };

  const { data: insertedRows, error: insertError } = await supabase
    .from("analysis_snapshots")
    .insert({
      manager_key: managerKey,
      period,
      compare,
      filters,
      inputs_hash: inputsHash,
      output,
      status: "success",
      error: null,
    })
    .select("id")
    .limit(1);
  if (insertError) {
    throw new Error(`Failed storing analysis snapshot: ${insertError.message}`);
  }

  const snapshotId = insertedRows?.[0]?.id || null;
  await writeAuditLog(
    supabase,
    "analysis_refresh",
    managerKey,
    {
      period,
      compare,
      filters,
      from_cache: false,
      snapshot_id: snapshotId,
      inputs_hash: inputsHash,
      warnings: context?.warnings || [],
    },
    "success",
    null,
  );

  return {
    fromCache: false,
    inputsHash,
    snapshotId,
    output,
  };
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

  let managerKey = "";
  let period = "30d";
  let compare = "previous";
  let filters: Record<string, any> = {};
  let force = false;

  try {
    const body = await req.json().catch(() => ({}));
    managerKey = String(body?.manager_key || "").trim().toLowerCase();
    period = normalizePeriod(body?.period);
    compare = normalizeCompare(body?.compare);
    filters = normalizeFilters(body?.filters);
    force = Boolean(body?.force);

    if (!managerKey) {
      return jsonResponse({ ok: false, error: "manager_key is required" }, 400);
    }
    if (!MANAGER_KEYS.includes(managerKey)) {
      return jsonResponse({ ok: false, error: `Unsupported manager_key: ${managerKey}` }, 400);
    }
    if (!ALLOWED_PERIODS.has(period)) {
      return jsonResponse({ ok: false, error: `Unsupported period: ${period}` }, 400);
    }
    if (!ALLOWED_COMPARE.has(compare)) {
      return jsonResponse({ ok: false, error: `Unsupported compare: ${compare}` }, 400);
    }

    const result = await generateReportForManager(supabase, managerKey, period, compare, filters, force, 0);
    return jsonResponse({
      ok: true,
      from_cache: result.fromCache,
      inputs_hash: result.inputsHash,
      snapshot_id: result.snapshotId,
      ...result.output,
    });
  } catch (error: any) {
    const errMessage = String(error?.message || error);
    try {
      const fallbackHash = await sha256Hex({
        manager_key: managerKey || null,
        period,
        compare,
        filters,
        failed_at: new Date().toISOString(),
      });
      await supabase.from("analysis_snapshots").insert({
        manager_key: managerKey || "unknown",
        period,
        compare,
        filters,
        inputs_hash: fallbackHash,
        output: {},
        status: "error",
        error: errMessage,
      });
      await writeAuditLog(
        supabase,
        "analysis_refresh",
        managerKey || null,
        { period, compare, filters },
        "error",
        errMessage,
      );
    } catch (_) {
      // swallow secondary logging failures
    }
    return jsonResponse({ ok: false, error: errMessage }, 500);
  }
});
