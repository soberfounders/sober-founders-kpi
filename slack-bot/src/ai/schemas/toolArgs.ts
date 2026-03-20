import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const dateRangeSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  label: z.string().min(1).optional(),
}).optional();

export const getKpiSnapshotArgsSchema = z.object({
  metric: z.string().min(1),
  date_range: dateRangeSchema,
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const getMetricTrendArgsSchema = z.object({
  metric: z.string().min(1),
  date_range: dateRangeSchema,
  compare_to: z.enum(["previous_period", "previous_week", "previous_month", "year_ago"]).optional(),
});

export const getManagerReportArgsSchema = z.object({
  section: z.enum(["leads", "attendance", "donations", "email", "seo", "operations", "executive"]),
  date_range: dateRangeSchema,
});

export const listOpenTasksArgsSchema = z.object({
  owner: z.string().optional(),
  team: z.string().optional(),
  priority: z.string().optional(),
});

export const createTaskArgsSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(3),
  owner: z.string().min(1),
  priority: z.enum(["High Priority", "Medium Priority", "Low Priority"]),
  due_date: isoDate,
  source: z.string().min(1),
});

export const createFollowupArgsSchema = z.object({
  topic: z.string().min(3),
  owner: z.string().min(1),
  due_date: isoDate,
  context: z.string().min(3),
});

export const sendSlackMessageArgsSchema = z.object({
  channel: z.string().min(1),
  text: z.string().min(1),
  blocks: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const postSummaryArgsSchema = z.object({
  summary_type: z.enum(["weekly_executive", "daily_health", "attendance_focus", "leads_focus", "donor_health"]),
  channel: z.string().min(1),
  date_range: dateRangeSchema,
});

export const getDataQualityWarningsArgsSchema = z.object({});
export const getOrgContextArgsSchema = z.object({});

export const readFileArgsSchema = z.object({
  path: z.string().min(1),
  line_start: z.number().int().positive().optional(),
  line_end: z.number().int().positive().optional(),
});

export const searchFilesArgsSchema = z.object({
  pattern: z.string().min(1),
  glob: z.string().optional(),
  max_results: z.number().int().min(1).max(50).optional(),
});

export const writeFileArgsSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  create_directories: z.boolean().optional(),
});

export const runCommandArgsSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().min(1000).max(120_000).optional(),
});

export const toolArgSchemas = {
  get_kpi_snapshot: getKpiSnapshotArgsSchema,
  get_metric_trend: getMetricTrendArgsSchema,
  get_manager_report: getManagerReportArgsSchema,
  list_open_tasks: listOpenTasksArgsSchema,
  create_task: createTaskArgsSchema,
  create_followup: createFollowupArgsSchema,
  send_slack_message: sendSlackMessageArgsSchema,
  post_summary: postSummaryArgsSchema,
  get_data_quality_warnings: getDataQualityWarningsArgsSchema,
  get_org_context: getOrgContextArgsSchema,
  read_file: readFileArgsSchema,
  search_files: searchFilesArgsSchema,
  write_file: writeFileArgsSchema,
  run_command: runCommandArgsSchema,
} as const;

export type ToolName = keyof typeof toolArgSchemas;
export type ToolArgsMap = {
  [K in ToolName]: z.infer<(typeof toolArgSchemas)[K]>;
};
