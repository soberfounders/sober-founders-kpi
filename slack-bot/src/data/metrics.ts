import type { DateRangeInput } from "../types.js";
import { normalizeDateRange, queryMetricAggregate, computeRepeatAttendanceRates } from "./trends.js";
import { supabase } from "../clients/supabase.js";

export interface KpiSnapshotResult {
  metric: string;
  value: number | null;
  unit?: string;
  window: string;
  source: string;
  confidence: number;
  notes: string[];
  components?: Array<{ metric: string; value: number | null; source: string }>;
}

const metricUnits: Record<string, string> = {
  donations: "USD",
  donations_total: "USD",
  cpl: "USD",
  cpql: "USD",
  cpgl: "USD",
  email_open_rate: "ratio",
  free_tuesday_repeat_attendance: "ratio",
  free_thursday_repeat_attendance: "ratio",
};

export const getKpiSnapshot = async (
  metric: string,
  dateRange: DateRangeInput | undefined,
  filters: Record<string, string | number | boolean> | undefined,
): Promise<KpiSnapshotResult> => {
  const range = normalizeDateRange(dateRange, 7);
  const normalizedMetric = metric.trim().toLowerCase();

  if (normalizedMetric === "org_health" || normalizedMetric === "overview") {
    const components = await Promise.all([
      queryMetricAggregate("leads", range),
      queryMetricAggregate("attendance", range),
      queryMetricAggregate("donations", range),
      queryMetricAggregate("phoenix_forum_paid_members", range),
    ]);

    const numeric = components
      .map((component) => component.value)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    const score = numeric.length
      ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length
      : null;

    return {
      metric,
      value: score,
      window: range.label,
      source: "kpi_metrics + donation_transactions_unified",
      confidence: score === null ? 0.35 : 0.7,
      notes: score === null ? ["Org health is incomplete due to missing source values"] : [],
      components: [
        { metric: "leads", value: components[0].value, source: components[0].source },
        { metric: "attendance", value: components[1].value, source: components[1].source },
        { metric: "donations", value: components[2].value, source: components[2].source },
        { metric: "phoenix_forum_paid_members", value: components[3].value, source: components[3].source },
      ],
    };
  }

  if (normalizedMetric === "free_tuesday_repeat_attendance" || normalizedMetric === "free_thursday_repeat_attendance") {
    const repeat = await computeRepeatAttendanceRates(range);
    const value = normalizedMetric.includes("tuesday") ? repeat.tuesday : repeat.thursday;
    return {
      metric,
      value,
      unit: "ratio",
      window: range.label,
      source: repeat.source,
      confidence: value === null ? 0.4 : 0.75,
      notes: repeat.notes,
    };
  }

  if (normalizedMetric === "list_metrics") {
    const { data, error } = await supabase
      .from("kpi_metrics")
      .select("metric_name")
      .gte("metric_date", range.from)
      .lte("metric_date", range.to)
      .limit(5000);

    if (error) {
      throw new Error(`Failed to list metrics: ${error.message}`);
    }

    const unique = Array.from(new Set((data || []).map((row) => String(row.metric_name || "")).filter(Boolean))).sort();
    return {
      metric,
      value: unique.length,
      unit: "count",
      window: range.label,
      source: "kpi_metrics",
      confidence: 0.9,
      notes: [`Available metrics: ${unique.slice(0, 50).join(", ")}${unique.length > 50 ? " ..." : ""}`],
    };
  }

  const aggregate = await queryMetricAggregate(metric, range);
  const confidence = aggregate.value === null
    ? 0.35
    : filters && Object.keys(filters).length > 0
      ? 0.7
      : 0.85;

  return {
    metric,
    value: aggregate.value,
    unit: metricUnits[normalizedMetric],
    window: range.label,
    source: aggregate.source,
    confidence,
    notes: aggregate.notes,
  };
};
