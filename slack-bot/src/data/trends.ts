/**
 * trends.ts — Unified Metrics Layer consumer (Phase 3)
 *
 * All metric reads now go through fact_kpi_daily, which is populated by
 * the compute-metrics edge function. This replaces the old raw-table
 * aggregate queries that duplicated logic from the dashboard.
 */
import { supabase } from "../clients/supabase.js";
import type { DateRangeInput } from "../types.js";

export interface NormalizedDateRange {
  from: string;
  to: string;
  label: string;
}

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const parseDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const normalizeDateRange = (dateRange?: DateRangeInput, fallbackDays = 7): NormalizedDateRange => {
  const now = new Date();
  const defaultTo = toDateOnly(now);
  const defaultFromDate = new Date(now);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - (fallbackDays - 1));
  const defaultFrom = toDateOnly(defaultFromDate);

  const from = parseDate(dateRange?.from) ? (dateRange?.from as string) : defaultFrom;
  const to = parseDate(dateRange?.to) ? (dateRange?.to as string) : defaultTo;
  const sorted = from <= to ? { from, to } : { from: to, to: from };

  return {
    from: sorted.from,
    to: sorted.to,
    label: dateRange?.label || `${sorted.from} to ${sorted.to}`,
  };
};

const getPreviousRange = (range: NormalizedDateRange): NormalizedDateRange => {
  const fromDate = parseDate(range.from) as Date;
  const toDate = parseDate(range.to) as Date;
  const spanDays = Math.max(1, Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1);

  const prevToDate = new Date(fromDate);
  prevToDate.setUTCDate(prevToDate.getUTCDate() - 1);

  const prevFromDate = new Date(prevToDate);
  prevFromDate.setUTCDate(prevFromDate.getUTCDate() - (spanDays - 1));

  return {
    from: toDateOnly(prevFromDate),
    to: toDateOnly(prevToDate),
    label: `previous ${spanDays}-day period`,
  };
};

interface AggregateResult {
  value: number | null;
  source: string;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Metric name → canonical kpi_key mapping
// ---------------------------------------------------------------------------
interface MetricMapping {
  kpi_key: string;
  funnel_key: string;
  agg: "sum" | "avg" | "latest";
}

const METRIC_MAP: Record<string, MetricMapping> = {
  // Leads domain
  leads:                         { kpi_key: "leads_created",            funnel_key: "all",     agg: "sum" },
  hs_contacts_created:           { kpi_key: "leads_created",            funnel_key: "all",     agg: "sum" },
  new_leads:                     { kpi_key: "leads_created",            funnel_key: "all",     agg: "sum" },
  qualified_leads:               { kpi_key: "qualified_leads_created",  funnel_key: "all",     agg: "sum" },
  hs_contacts_qualified_created: { kpi_key: "qualified_leads_created",  funnel_key: "all",     agg: "sum" },
  phoenix_qualified_leads:       { kpi_key: "phoenix_qualified_leads",  funnel_key: "all",     agg: "sum" },

  // Attendance domain
  attendance:                    { kpi_key: "attendance_sessions",      funnel_key: "all",     agg: "sum" },
  showups:                       { kpi_key: "attendance_sessions",      funnel_key: "all",     agg: "sum" },
  zoom_meeting_attendees:        { kpi_key: "attendance_sessions",      funnel_key: "all",     agg: "sum" },
  unique_attendees:              { kpi_key: "unique_attendees",         funnel_key: "all",     agg: "sum" },
  new_attendees:                 { kpi_key: "new_attendees",            funnel_key: "all",     agg: "sum" },

  // Donations domain
  donations:                     { kpi_key: "donations_total",          funnel_key: "all",     agg: "sum" },
  donations_total:               { kpi_key: "donations_total",          funnel_key: "all",     agg: "sum" },
  revenue_donations:             { kpi_key: "donations_total",          funnel_key: "all",     agg: "sum" },
  active_donors:                 { kpi_key: "active_donors",            funnel_key: "all",     agg: "latest" },
  recurring_revenue:             { kpi_key: "recurring_revenue",        funnel_key: "all",     agg: "sum" },

  // Email domain
  email:                         { kpi_key: "email_open_rate",          funnel_key: "all",     agg: "avg" },
  email_open_rate:               { kpi_key: "email_open_rate",          funnel_key: "all",     agg: "avg" },
  mailchimp_open_rate:           { kpi_key: "email_open_rate",          funnel_key: "all",     agg: "avg" },
  email_click_rate:              { kpi_key: "email_click_rate",         funnel_key: "all",     agg: "avg" },

  // SEO domain
  seo:                           { kpi_key: "seo_organic_sessions",     funnel_key: "all",     agg: "sum" },
  seo_organic_sessions:          { kpi_key: "seo_organic_sessions",     funnel_key: "all",     agg: "sum" },
  organic_sessions:              { kpi_key: "seo_organic_sessions",     funnel_key: "all",     agg: "sum" },

  // Operations domain
  operations:                    { kpi_key: "sync_errors",              funnel_key: "all",     agg: "sum" },
  operations_errors:             { kpi_key: "sync_errors",              funnel_key: "all",     agg: "sum" },
  sync_errors:                   { kpi_key: "sync_errors",              funnel_key: "all",     agg: "sum" },
  sync_freshness_minutes:        { kpi_key: "sync_freshness_minutes",   funnel_key: "all",     agg: "latest" },

  // Phoenix domain
  phoenix_forum_paid_members:    { kpi_key: "phoenix_paid_members",     funnel_key: "phoenix", agg: "latest" },
  phoenix_paid_members:          { kpi_key: "phoenix_paid_members",     funnel_key: "phoenix", agg: "latest" },
  phoenix_new_members:           { kpi_key: "phoenix_paid_members",     funnel_key: "phoenix", agg: "latest" },

  // Repeat attendance (ratios)
  free_tuesday_repeat_attendance:  { kpi_key: "repeat_rate_tuesday",    funnel_key: "tuesday",   agg: "avg" },
  free_thursday_repeat_attendance: { kpi_key: "repeat_rate_thursday",   funnel_key: "thursday",  agg: "avg" },

  // Outreach domain
  outreach_sent:                 { kpi_key: "outreach_sent",            funnel_key: "all",     agg: "sum" },
  outreach_conversion_rate:      { kpi_key: "outreach_conversion_rate", funnel_key: "all",     agg: "avg" },

  // Ad spend / cost composites
  ad_spend:                      { kpi_key: "ad_spend",                 funnel_key: "all",     agg: "sum" },
  ad_leads:                      { kpi_key: "ad_leads",                 funnel_key: "all",     agg: "sum" },
  cpl:                           { kpi_key: "cpl",                      funnel_key: "all",     agg: "avg" },
  cpql:                          { kpi_key: "cpql",                     funnel_key: "all",     agg: "avg" },
  cpgl:                          { kpi_key: "cpgl",                     funnel_key: "all",     agg: "avg" },
  great_leads:                   { kpi_key: "great_leads",              funnel_key: "all",     agg: "sum" },

  // Interviews
  interviews_completed:          { kpi_key: "interviews_completed",     funnel_key: "all",     agg: "sum" },

  // Day-split attendance
  attendance_total_tuesday:      { kpi_key: "attendance_total",         funnel_key: "tuesday",  agg: "sum" },
  attendance_total_thursday:     { kpi_key: "attendance_total",         funnel_key: "thursday", agg: "sum" },
  attendance_new_tuesday:        { kpi_key: "attendance_new",           funnel_key: "tuesday",  agg: "sum" },
  attendance_new_thursday:       { kpi_key: "attendance_new",           funnel_key: "thursday", agg: "sum" },
  attendance_repeat_tuesday:     { kpi_key: "attendance_repeat",        funnel_key: "tuesday",  agg: "sum" },
  attendance_repeat_thursday:    { kpi_key: "attendance_repeat",        funnel_key: "thursday", agg: "sum" },

  // Donations count
  donations_count:               { kpi_key: "donations_count",          funnel_key: "all",     agg: "sum" },

  // Completed items
  completed_items:               { kpi_key: "completed_items",          funnel_key: "all",     agg: "sum" },
};

// ---------------------------------------------------------------------------
// Core query: read from fact_kpi_daily
// ---------------------------------------------------------------------------
const queryFactKpiDaily = async (
  mapping: MetricMapping,
  from: string,
  to: string,
): Promise<AggregateResult> => {
  const { kpi_key, funnel_key, agg } = mapping;

  if (agg === "latest") {
    // For snapshot metrics, get the most recent value in the window
    const { data, error } = await supabase
      .from("fact_kpi_daily")
      .select("value")
      .eq("kpi_key", kpi_key)
      .eq("funnel_key", funnel_key)
      .gte("metric_date", from)
      .lte("metric_date", to)
      .order("metric_date", { ascending: false })
      .limit(1);

    if (error) throw new Error(`fact_kpi_daily query failed for ${kpi_key}: ${error.message}`);

    const row = (data || [])[0] as Record<string, unknown> | undefined;
    return {
      value: row ? Number(row.value) : null,
      source: `fact_kpi_daily (${kpi_key})`,
      notes: row ? [] : [`No ${kpi_key} data in fact_kpi_daily for ${from} to ${to}`],
    };
  }

  // For sum/avg, fetch all daily values and aggregate client-side
  const { data, error } = await supabase
    .from("fact_kpi_daily")
    .select("value")
    .eq("kpi_key", kpi_key)
    .eq("funnel_key", funnel_key)
    .gte("metric_date", from)
    .lte("metric_date", to);

  if (error) throw new Error(`fact_kpi_daily query failed for ${kpi_key}: ${error.message}`);

  const values = (data || [])
    .map((row: Record<string, unknown>) => Number(row.value))
    .filter(Number.isFinite);

  if (!values.length) {
    return {
      value: null,
      source: `fact_kpi_daily (${kpi_key})`,
      notes: [`No ${kpi_key} data in fact_kpi_daily for ${from} to ${to}`],
    };
  }

  const result = agg === "sum"
    ? values.reduce((s, v) => s + v, 0)
    : values.reduce((s, v) => s + v, 0) / values.length;

  return {
    value: result,
    source: `fact_kpi_daily (${kpi_key})`,
    notes: [],
  };
};

// ---------------------------------------------------------------------------
// Public API (same signatures as before)
// ---------------------------------------------------------------------------

export const queryMetricAggregate = async (metric: string, range: NormalizedDateRange): Promise<AggregateResult> => {
  const normalized = metric.trim().toLowerCase();
  const mapping = METRIC_MAP[normalized];

  if (!mapping) {
    return {
      value: null,
      source: "unknown",
      notes: [`Metric '${metric}' is not mapped. Available: ${Object.keys(METRIC_MAP).join(", ")}`],
    };
  }

  return queryFactKpiDaily(mapping, range.from, range.to);
};

export const computeRepeatAttendanceRates = async (range: DateRangeInput | undefined): Promise<{
  tuesday: number | null;
  thursday: number | null;
  source: string;
  notes: string[];
}> => {
  const normalizedRange = normalizeDateRange(range, 30);

  const [tuesdayResult, thursdayResult] = await Promise.all([
    queryFactKpiDaily(
      { kpi_key: "repeat_rate_tuesday", funnel_key: "tuesday", agg: "avg" },
      normalizedRange.from,
      normalizedRange.to,
    ),
    queryFactKpiDaily(
      { kpi_key: "repeat_rate_thursday", funnel_key: "thursday", agg: "avg" },
      normalizedRange.from,
      normalizedRange.to,
    ),
  ]);

  return {
    tuesday: tuesdayResult.value,
    thursday: thursdayResult.value,
    source: "fact_kpi_daily (repeat_rate_tuesday, repeat_rate_thursday)",
    notes: [...tuesdayResult.notes, ...thursdayResult.notes],
  };
};

export const getMetricTrend = async (
  metric: string,
  dateRange: DateRangeInput | undefined,
  compareTo: string = "previous_period",
) => {
  const currentRange = normalizeDateRange(dateRange, 7);
  const previousRange = getPreviousRange(currentRange);

  const [current, previous] = await Promise.all([
    queryMetricAggregate(metric, currentRange),
    queryMetricAggregate(metric, previousRange),
  ]);

  const currentValue = current.value;
  const previousValue = previous.value;
  const delta = (currentValue !== null && previousValue !== null)
    ? currentValue - previousValue
    : null;

  const deltaPct = (delta !== null && previousValue !== null && previousValue !== 0)
    ? delta / Math.abs(previousValue)
    : null;

  return {
    metric,
    current: currentValue,
    previous: previousValue,
    delta,
    delta_pct: deltaPct,
    window: currentRange.label,
    compare_to: compareTo,
    source: current.source,
    confidence: currentValue === null ? 0.35 : 0.85,
    notes: [...current.notes, ...previous.notes],
  };
};
