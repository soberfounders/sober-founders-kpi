import type { DateRangeInput } from "../types.js";
import { getKpiSnapshot } from "./metrics.js";
import { getMetricTrend, normalizeDateRange } from "./trends.js";
import { getManagerReport } from "./managers.js";
import { supabase } from "../clients/supabase.js";

export interface SummaryPayload {
  summaryType: string;
  window: string;
  text: string;
  blocks: Array<Record<string, unknown>>;
  sourceMetrics: string[];
  confidence: number;
}

const fmtNumber = (value: number | null, isPercent = false) => {
  if (value === null || !Number.isFinite(value)) return "n/a";
  if (isPercent) return `${(value * 100).toFixed(1)}%`;
  return Math.round(value).toLocaleString();
};

const trendLine = (label: string, current: number | null, deltaPct: number | null, source: string) => {
  const direction = deltaPct === null ? "" : deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat";
  const deltaLabel = deltaPct === null ? "n/a" : `${deltaPct >= 0 ? "+" : ""}${(deltaPct * 100).toFixed(1)}%`;
  return `${label}: ${fmtNumber(current)} (${direction} ${deltaLabel}, source: ${source})`;
};

export const buildSummary = async (summaryType: string, dateRange: DateRangeInput | undefined): Promise<SummaryPayload> => {
  const range = normalizeDateRange(dateRange, 7);

  if (summaryType === "weekly_executive") {
    const [leadsTrend, donationsTrend, attendanceTrend, operationsReport] = await Promise.all([
      getMetricTrend("leads", range, "previous_period"),
      getMetricTrend("donations", range, "previous_period"),
      getMetricTrend("attendance", range, "previous_period"),
      getManagerReport("operations", range),
    ]);

    const lines = [
      trendLine("Leads", leadsTrend.current, leadsTrend.delta_pct, leadsTrend.source),
      trendLine("Donations", donationsTrend.current, donationsTrend.delta_pct, donationsTrend.source),
      trendLine("Attendance", attendanceTrend.current, attendanceTrend.delta_pct, attendanceTrend.source),
      `Operations: ${operationsReport.summary}`,
    ];

    return {
      summaryType,
      window: range.label,
      text: `Weekly executive summary (${range.label})\n- ${lines.join("\n- ")}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `Weekly Executive Summary (${range.label})` } },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: lines.map((line) => `• ${line}`).join("\n"),
          },
        },
      ],
      sourceMetrics: ["leads", "donations", "attendance", "operations"],
      confidence: 0.8,
    };
  }

  if (summaryType === "attendance_focus") {
    const [tuesdayRepeat, thursdayRepeat, attendanceTrend] = await Promise.all([
      getKpiSnapshot("free_tuesday_repeat_attendance", range, undefined),
      getKpiSnapshot("free_thursday_repeat_attendance", range, undefined),
      getMetricTrend("attendance", range),
    ]);

    const lines = [
      trendLine("Attendance", attendanceTrend.current, attendanceTrend.delta_pct, attendanceTrend.source),
      `Tuesday repeat attendance: ${fmtNumber(tuesdayRepeat.value, true)}`,
      `Thursday repeat attendance: ${fmtNumber(thursdayRepeat.value, true)}`,
    ];

    return {
      summaryType,
      window: range.label,
      text: `Attendance summary (${range.label})\n- ${lines.join("\n- ")}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `Attendance Summary (${range.label})` } },
        { type: "section", text: { type: "mrkdwn", text: lines.map((line) => `• ${line}`).join("\n") } },
      ],
      sourceMetrics: ["attendance", "free_tuesday_repeat_attendance", "free_thursday_repeat_attendance"],
      confidence: 0.75,
    };
  }

  if (summaryType === "leads_focus") {
    const [leads, qualified, phoenix, leadsReport] = await Promise.all([
      getKpiSnapshot("leads", range, undefined),
      getKpiSnapshot("qualified_leads", range, undefined),
      getKpiSnapshot("phoenix_forum_paid_members", range, undefined),
      getManagerReport("leads", range),
    ]);

    const lines = [
      `Leads: ${fmtNumber(leads.value)} (source: ${leads.source})`,
      `Qualified leads: ${fmtNumber(qualified.value)} (source: ${qualified.source})`,
      `Phoenix paid members proxy: ${fmtNumber(phoenix.value)} (source: ${phoenix.source})`,
      `Manager report: ${leadsReport.summary}`,
    ];

    return {
      summaryType,
      window: range.label,
      text: `Leads summary (${range.label})\n- ${lines.join("\n- ")}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `Leads Summary (${range.label})` } },
        { type: "section", text: { type: "mrkdwn", text: lines.map((line) => `• ${line}`).join("\n") } },
      ],
      sourceMetrics: ["leads", "qualified_leads", "phoenix_forum_paid_members"],
      confidence: 0.76,
    };
  }

  if (summaryType === "donor_health") {
    const [donationTrend, donorReport] = await Promise.all([
      getMetricTrend("donations", range),
      getManagerReport("donations", range),
    ]);

    const lines = [
      trendLine("Donations", donationTrend.current, donationTrend.delta_pct, donationTrend.source),
      ...donorReport.bullets.slice(0, 3),
    ];

    return {
      summaryType,
      window: range.label,
      text: `Donor health summary (${range.label})\n- ${lines.join("\n- ")}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `Donor Health Summary (${range.label})` } },
        { type: "section", text: { type: "mrkdwn", text: lines.map((line) => `• ${line}`).join("\n") } },
      ],
      sourceMetrics: ["donations", "vw_donor_health"],
      confidence: 0.73,
    };
  }

  const [leads, attendance, donations] = await Promise.all([
    getKpiSnapshot("leads", range, undefined),
    getKpiSnapshot("attendance", range, undefined),
    getKpiSnapshot("donations", range, undefined),
  ]);

  const lines = [
    `Leads: ${fmtNumber(leads.value)} (${leads.source})`,
    `Attendance: ${fmtNumber(attendance.value)} (${attendance.source})`,
    `Donations: ${fmtNumber(donations.value)} (${donations.source})`,
  ];

  return {
    summaryType,
    window: range.label,
    text: `Daily KPI summary (${range.label})\n- ${lines.join("\n- ")}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `Daily KPI Summary (${range.label})` } },
      { type: "section", text: { type: "mrkdwn", text: lines.map((line) => `• ${line}`).join("\n") } },
    ],
    sourceMetrics: ["leads", "attendance", "donations"],
    confidence: 0.75,
  };
};

export const getLatestGeneratedSummaries = async (limit = 5) => {
  const { data, error } = await supabase
    .from("generated_summaries")
    .select("id,summary_type,channel_id,summary_text,created_at,confidence")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch generated summaries: ${error.message}`);
  }

  return data || [];
};
