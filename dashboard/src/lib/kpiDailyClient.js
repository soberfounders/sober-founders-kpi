/**
 * kpiDailyClient.js — Unified Metrics Layer consumer (Phase 4)
 *
 * Reads from fact_kpi_daily and produces the same metric shapes that
 * DashboardOverview expects from its raw-table pipeline.
 */
import { supabase } from './supabaseClient';

/**
 * Fetch all fact_kpi_daily rows in [from, to].
 * Returns raw rows: { metric_date, kpi_key, funnel_key, value }
 */
export async function fetchKpiDaily(from, to) {
  const { data, error } = await supabase
    .from('fact_kpi_daily')
    .select('metric_date, kpi_key, funnel_key, value')
    .gte('metric_date', from)
    .lte('metric_date', to)
    .order('metric_date', { ascending: true });

  if (error) throw new Error(`fact_kpi_daily query failed: ${error.message}`);
  return data || [];
}

/**
 * Sum all values for a given kpi_key + funnel_key within a date window.
 */
function sumMetric(rows, kpiKey, funnelKey, windowStart, windowEnd) {
  let total = 0;
  let found = false;
  for (const row of rows) {
    if (
      row.kpi_key === kpiKey &&
      row.funnel_key === funnelKey &&
      row.metric_date >= windowStart &&
      row.metric_date <= windowEnd
    ) {
      const v = Number(row.value);
      if (Number.isFinite(v)) {
        total += v;
        found = true;
      }
    }
  }
  return found ? total : null;
}

/**
 * Average all values for a given kpi_key + funnel_key within a date window.
 */
function avgMetric(rows, kpiKey, funnelKey, windowStart, windowEnd) {
  let total = 0;
  let count = 0;
  for (const row of rows) {
    if (
      row.kpi_key === kpiKey &&
      row.funnel_key === funnelKey &&
      row.metric_date >= windowStart &&
      row.metric_date <= windowEnd
    ) {
      const v = Number(row.value);
      if (Number.isFinite(v)) {
        total += v;
        count++;
      }
    }
  }
  return count > 0 ? total / count : null;
}

/**
 * Latest (most recent) value for a metric in window.
 */
function latestMetric(rows, kpiKey, funnelKey, windowStart, windowEnd) {
  let best = null;
  let bestDate = '';
  for (const row of rows) {
    if (
      row.kpi_key === kpiKey &&
      row.funnel_key === funnelKey &&
      row.metric_date >= windowStart &&
      row.metric_date <= windowEnd &&
      row.metric_date > bestDate
    ) {
      const v = Number(row.value);
      if (Number.isFinite(v)) {
        best = v;
        bestDate = row.metric_date;
      }
    }
  }
  return best;
}

function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

/**
 * Build the flattened metric values object that DashboardOverview KPI cards expect
 * from a set of cached fact_kpi_daily rows and a date window.
 *
 * Returns the same shape as flattenMetricValues() in DashboardOverview.jsx.
 */
export function buildMetricsFromDaily(rows, windowStart, windowEnd) {
  const s = (key, funnel) => sumMetric(rows, key, funnel, windowStart, windowEnd);
  const a = (key, funnel) => avgMetric(rows, key, funnel, windowStart, windowEnd);

  // Free funnel
  const freeMeetings = s('ad_leads', 'free');
  const freeQualified = s('qualified_leads_created', 'free');
  const freePhoenixQualified = s('phoenix_qualified_leads', 'free');
  const freeGreat = s('great_leads', 'free');
  const freeSpend = s('ad_spend', 'free');
  const freeCpql = safeDivide(freeSpend, freeQualified);
  const freeCpgl = safeDivide(freeSpend, freeGreat);
  const freeInterviews = s('interviews_completed', 'free');

  // Phoenix funnel
  const phoenixLeads = s('ad_leads', 'phoenix');
  const phoenixQualified = s('phoenix_qualified_leads', 'phoenix');
  const phoenixSpend = s('ad_spend', 'phoenix');
  const phoenixCpql = safeDivide(phoenixSpend, phoenixQualified);
  const phoenixInterviews = s('interviews_completed', 'phoenix');

  // Attendance (day-split)
  const attendanceTotalTue = s('attendance_total', 'tuesday');
  const attendanceNewTue = s('attendance_new', 'tuesday');
  const attendanceRepeatTue = s('attendance_repeat', 'tuesday');
  const attendanceAvgVisitsTue = latestMetric(rows, 'avg_visits_per_person', 'tuesday', windowStart, windowEnd);
  const attendanceTotalThu = s('attendance_total', 'thursday');
  const attendanceNewThu = s('attendance_new', 'thursday');
  const attendanceRepeatThu = s('attendance_repeat', 'thursday');
  const attendanceAvgVisitsThu = latestMetric(rows, 'avg_visits_per_person', 'thursday', windowStart, windowEnd);

  // Donations
  const donationsCount = s('donations_count', 'all');
  const donationsAmount = s('donations_total', 'all');

  // Operations
  const operationsCompletedItems = s('completed_items', 'all');

  return {
    freeMeetings,
    freeQualified,
    freePhoenixQualified,
    freeCpql,
    freeGreat,
    freeCpgl,
    freeInterviews,
    phoenixLeads,
    phoenixQualified,
    phoenixCpql,
    phoenixInterviews,
    attendanceTotalTue,
    attendanceNewTue,
    attendanceRepeatTue,
    attendanceAvgVisitsTue,
    attendanceTotalThu,
    attendanceNewThu,
    attendanceRepeatThu,
    attendanceAvgVisitsThu,
    donationsCount,
    donationsAmount,
    operationsCompletedItems,
  };
}
