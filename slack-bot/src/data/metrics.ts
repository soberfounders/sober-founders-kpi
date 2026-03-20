import type { DateRangeInput } from "../types.js";
import { normalizeDateRange, queryMetricAggregate, computeRepeatAttendanceRates } from "./trends.js";

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
      source: "fact_kpi_daily (leads_created, attendance_sessions, donations_total, phoenix_paid_members)",
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
    const available = [
      "leads", "qualified_leads", "attendance", "donations", "email_open_rate",
      "seo", "operations", "free_tuesday_repeat_attendance", "free_thursday_repeat_attendance",
    ];
    return {
      metric,
      value: available.length,
      unit: "count",
      window: range.label,
      source: "static",
      confidence: 1.0,
      notes: [`Available metrics: ${available.join(", ")}`],
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
