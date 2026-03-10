import { supabase } from "../clients/supabase.js";
import type { DateRangeInput } from "../types.js";

const TUESDAY_MEETING_ID = "87199667045";
const THURSDAY_MEETING_ID = "84242212480";

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

const aggregateKpiMetric = async (metricNames: string[], from: string, to: string, agg: "sum" | "avg"): Promise<AggregateResult> => {
  const query = supabase
    .from("kpi_metrics")
    .select("metric_name,metric_value,metric_date")
    .gte("metric_date", from)
    .lte("metric_date", to)
    .in("metric_name", metricNames);

  const { data, error } = await query;
  if (error) {
    throw new Error(`kpi_metrics query failed: ${error.message}`);
  }

  const rows = data || [];
  if (!rows.length) {
    return { value: null, source: "kpi_metrics", notes: [`No ${metricNames.join(", ")} records in selected window`] };
  }

  const values = rows.map((row) => Number(row.metric_value)).filter((value) => Number.isFinite(value));
  if (!values.length) {
    return { value: null, source: "kpi_metrics", notes: ["Metric values are non-numeric"] };
  }

  const value = agg === "sum"
    ? values.reduce((sum, current) => sum + current, 0)
    : values.reduce((sum, current) => sum + current, 0) / values.length;

  return { value, source: "kpi_metrics", notes: [] };
};

const aggregateDonations = async (from: string, to: string): Promise<AggregateResult> => {
  const { data, error } = await supabase
    .from("donation_transactions_unified")
    .select("amount,donated_at")
    .gte("donated_at", `${from}T00:00:00.000Z`)
    .lte("donated_at", `${to}T23:59:59.999Z`);

  if (error) {
    throw new Error(`donation_transactions_unified query failed: ${error.message}`);
  }

  const rows = data || [];
  if (!rows.length) {
    return { value: null, source: "donation_transactions_unified", notes: ["No donations in selected window"] };
  }

  const total = rows.reduce((sum, row) => {
    const amount = Number(row.amount);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  return { value: total, source: "donation_transactions_unified", notes: [] };
};

const aggregateEmailOpenRate = async (from: string, to: string): Promise<AggregateResult> => {
  const { data, error } = await supabase
    .from("mailchimp_campaigns")
    .select("human_open_rate,send_time")
    .gte("send_time", `${from}T00:00:00.000Z`)
    .lte("send_time", `${to}T23:59:59.999Z`);

  if (error) {
    throw new Error(`mailchimp_campaigns query failed: ${error.message}`);
  }

  const rows = data || [];
  if (!rows.length) {
    return { value: null, source: "mailchimp_campaigns", notes: ["No campaigns in selected window"] };
  }

  const openRates = rows
    .map((row) => Number(row.human_open_rate))
    .filter((value) => Number.isFinite(value));

  if (!openRates.length) {
    return { value: null, source: "mailchimp_campaigns", notes: ["No usable human_open_rate values"] };
  }

  const avgOpenRate = openRates.reduce((sum, current) => sum + current, 0) / openRates.length;
  return { value: avgOpenRate, source: "mailchimp_campaigns", notes: [] };
};

const aggregateSeoOrganic = async (from: string, to: string): Promise<AggregateResult> => {
  const { data, error } = await supabase
    .from("vw_seo_channel_daily")
    .select("metric_date,organic")
    .gte("metric_date", from)
    .lte("metric_date", to);

  if (error) {
    throw new Error(`vw_seo_channel_daily query failed: ${error.message}`);
  }

  const rows = data || [];
  if (!rows.length) {
    return { value: null, source: "vw_seo_channel_daily", notes: ["No SEO daily rows in selected window"] };
  }

  const totalOrganic = rows.reduce((sum, row) => {
    const value = Number((row as Record<string, unknown>).organic);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  return { value: totalOrganic, source: "vw_seo_channel_daily", notes: [] };
};

const aggregateOperationsErrors = async (from: string, to: string): Promise<AggregateResult> => {
  const { data, error } = await supabase
    .from("hubspot_sync_errors")
    .select("id,created_at")
    .gte("created_at", `${from}T00:00:00.000Z`)
    .lte("created_at", `${to}T23:59:59.999Z`);

  if (error) {
    throw new Error(`hubspot_sync_errors query failed: ${error.message}`);
  }

  return {
    value: (data || []).length,
    source: "hubspot_sync_errors",
    notes: [],
  };
};

const extractSessionGroup = (row: Record<string, unknown>): "tuesday" | "thursday" | null => {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const groupName = String(metadata.group_name || "").toLowerCase();
  if (groupName === "tuesday") return "tuesday";
  if (groupName === "thursday") return "thursday";

  const meetingId = String(metadata.meeting_id || metadata.zoom_meeting_id || "").trim();
  if (meetingId === TUESDAY_MEETING_ID) return "tuesday";
  if (meetingId === THURSDAY_MEETING_ID) return "thursday";

  const dateValue = String(metadata.start_time || row.metric_date || "");
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return null;
  const day = parsedDate.getUTCDay();
  if (day === 2) return "tuesday";
  if (day === 4) return "thursday";
  return null;
};

const extractAttendees = (row: Record<string, unknown>): string[] => {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(metadata.attendees)
    ? metadata.attendees
    : Array.isArray(metadata.participant_names)
      ? metadata.participant_names
      : [];

  const normalized = raw
    .map((entry) => String(typeof entry === "string" ? entry : (entry as Record<string, unknown>).name || ""))
    .map((name) => name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
};

export const computeRepeatAttendanceRates = async (range: DateRangeInput | undefined): Promise<{ tuesday: number | null; thursday: number | null; source: string; notes: string[] }> => {
  const normalizedRange = normalizeDateRange(range, 30);
  const { data, error } = await supabase
    .from("kpi_metrics")
    .select("metric_date,metric_name,metadata")
    .eq("metric_name", "Zoom Meeting Attendees")
    .gte("metric_date", normalizedRange.from)
    .lte("metric_date", normalizedRange.to)
    .order("metric_date", { ascending: true });

  if (error) {
    throw new Error(`Repeat attendance query failed: ${error.message}`);
  }

  const rows = data || [];
  if (!rows.length) {
    return {
      tuesday: null,
      thursday: null,
      source: "kpi_metrics:Zoom Meeting Attendees",
      notes: ["No attendance sessions in selected window"],
    };
  }

  const counters: Record<"tuesday" | "thursday", Map<string, number>> = {
    tuesday: new Map<string, number>(),
    thursday: new Map<string, number>(),
  };

  for (const row of rows as Array<Record<string, unknown>>) {
    const group = extractSessionGroup(row);
    if (!group) continue;

    const attendees = extractAttendees(row);
    for (const attendee of attendees) {
      counters[group].set(attendee, (counters[group].get(attendee) || 0) + 1);
    }
  }

  const computeRate = (map: Map<string, number>): number | null => {
    if (map.size === 0) return null;
    let repeaters = 0;
    for (const count of map.values()) {
      if (count > 1) repeaters += 1;
    }
    return repeaters / map.size;
  };

  return {
    tuesday: computeRate(counters.tuesday),
    thursday: computeRate(counters.thursday),
    source: "kpi_metrics:Zoom Meeting Attendees",
    notes: [],
  };
};

export const queryMetricAggregate = async (metric: string, range: NormalizedDateRange): Promise<AggregateResult> => {
  const normalized = metric.trim().toLowerCase();

  if (["leads", "hs_contacts_created", "new_leads"].includes(normalized)) {
    return aggregateKpiMetric(["hs_contacts_created"], range.from, range.to, "sum");
  }

  if (["qualified_leads", "hs_contacts_qualified_created"].includes(normalized)) {
    return aggregateKpiMetric(["hs_contacts_qualified_created"], range.from, range.to, "sum");
  }

  if (["attendance", "showups", "zoom_meeting_attendees"].includes(normalized)) {
    return aggregateKpiMetric(["Zoom Meeting Attendees"], range.from, range.to, "sum");
  }

  if (["donations", "donations_total", "revenue_donations"].includes(normalized)) {
    return aggregateDonations(range.from, range.to);
  }

  if (["email", "email_open_rate", "mailchimp_open_rate"].includes(normalized)) {
    return aggregateEmailOpenRate(range.from, range.to);
  }

  if (["seo", "seo_organic_sessions", "organic_sessions"].includes(normalized)) {
    return aggregateSeoOrganic(range.from, range.to);
  }

  if (["operations", "operations_errors", "sync_errors"].includes(normalized)) {
    return aggregateOperationsErrors(range.from, range.to);
  }

  if (["phoenix_forum_paid_members", "phoenix_paid_members", "phoenix_new_members"].includes(normalized)) {
    const result = await aggregateKpiMetric(["phoenix_new_members", "phoenix_forum_paid_members"], range.from, range.to, "sum");
    if (result.value === null) {
      return {
        ...result,
        notes: [...result.notes, "Falling back to phoenix_new_members as proxy for paid members"],
      };
    }
    return result;
  }

  if (["free_tuesday_repeat_attendance", "free_thursday_repeat_attendance"].includes(normalized)) {
    const repeatRates = await computeRepeatAttendanceRates(range);
    return {
      value: normalized.includes("tuesday") ? repeatRates.tuesday : repeatRates.thursday,
      source: repeatRates.source,
      notes: repeatRates.notes,
    };
  }

  return aggregateKpiMetric([metric], range.from, range.to, "sum");
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
    confidence: currentValue === null ? 0.35 : 0.8,
    notes: [...current.notes, ...previous.notes],
  };
};
