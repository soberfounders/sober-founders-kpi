import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { getKpiSnapshot } from "../data/metrics.js";
import { getMetricTrend } from "../data/trends.js";
import { getDataQualityWarnings, getManagerReport, getOrgContext, listOpenTasks } from "../data/managers.js";
import { createTask as createTaskAction } from "../actions/createTask.js";
import { createFollowup as createFollowupAction } from "../actions/createFollowup.js";
import {
  sendSlackMessage as sendSlackMessageAction,
  sendSlackSummary as postSummaryAction,
} from "../actions/sendSlackSummary.js";
import { logAuditEvent as logAuditEventAction } from "../actions/logAuditEvent.js";
import {
  canCreateFollowup as canCreateFollowupPermission,
  canCreateTask as canCreateTaskPermission,
  canExecuteAgentTools as canExecuteAgentToolsPermission,
  canPostToChannel as canPostToChannelPermission,
  isHighImpactAction,
} from "../slack/permissions/rbac.js";
import {
  consumePendingConfirmation,
  createPendingConfirmation,
  getPendingConfirmation,
} from "../slack/permissions/confirmations.js";
import { env } from "../config/env.js";
import { logger } from "../observability/logger.js";
import type {
  IntentType,
  PendingConfirmation,
  SourceAttribution,
  ToolExecutionContext,
} from "../types.js";
import { toolArgSchemas, type ToolArgsMap, type ToolName } from "./schemas/toolArgs.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Agent execute safety utilities
// ---------------------------------------------------------------------------

const BLOCKED_COMMANDS = [
  "rm -rf /", "rm -rf ~", "rm -rf .",
  "mkfs", "dd if=", ":(){",
  "git push --force", "git push -f",
  "git reset --hard",
  "shutdown", "reboot", "halt",
  "chmod -R 777", "chown -R",
  "curl | sh", "wget | sh", "curl | bash", "wget | bash",
  "> /dev/sda",
  "drop database", "drop table", "truncate",
];

const isCommandBlocked = (command: string): boolean => {
  const lower = command.toLowerCase();
  return BLOCKED_COMMANDS.some((blocked) => lower.includes(blocked));
};

const resolveSafePath = (projectRoot: string, relativePath: string): string => {
  const resolved = path.resolve(projectRoot, relativePath);
  const normalizedRoot = path.resolve(projectRoot);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(`Path traversal denied: ${relativePath} resolves outside project root`);
  }
  return resolved;
};

// ---------------------------------------------------------------------------
// Tool JSON schemas for OpenAI
// ---------------------------------------------------------------------------

const dateRangeJsonSchema = {
  type: "object",
  properties: {
    from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    label: { type: "string" },
  },
  additionalProperties: false,
};

const toolJsonSchemas: Record<ToolName, Record<string, unknown>> = {
  get_kpi_snapshot: {
    type: "object",
    properties: {
      metric: { type: "string" },
      date_range: dateRangeJsonSchema,
      filters: {
        type: "object",
        additionalProperties: {
          oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
        },
      },
    },
    required: ["metric"],
    additionalProperties: false,
  },
  get_metric_trend: {
    type: "object",
    properties: {
      metric: { type: "string" },
      date_range: dateRangeJsonSchema,
      compare_to: {
        type: "string",
        enum: ["previous_period", "previous_week", "previous_month", "year_ago"],
      },
    },
    required: ["metric"],
    additionalProperties: false,
  },
  get_manager_report: {
    type: "object",
    properties: {
      section: {
        type: "string",
        enum: ["leads", "attendance", "donations", "email", "seo", "operations", "executive"],
      },
      date_range: dateRangeJsonSchema,
    },
    required: ["section"],
    additionalProperties: false,
  },
  list_open_tasks: {
    type: "object",
    properties: {
      owner: { type: "string" },
      team: { type: "string" },
      priority: { type: "string" },
    },
    additionalProperties: false,
  },
  create_task: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      owner: { type: "string" },
      priority: { type: "string", enum: ["High Priority", "Medium Priority", "Low Priority"] },
      due_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      source: { type: "string" },
    },
    required: ["title", "description", "owner", "priority", "due_date", "source"],
    additionalProperties: false,
  },
  create_followup: {
    type: "object",
    properties: {
      topic: { type: "string" },
      owner: { type: "string" },
      due_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      context: { type: "string" },
    },
    required: ["topic", "owner", "due_date", "context"],
    additionalProperties: false,
  },
  send_slack_message: {
    type: "object",
    properties: {
      channel: { type: "string" },
      text: { type: "string" },
      blocks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
    required: ["channel", "text"],
    additionalProperties: false,
  },
  post_summary: {
    type: "object",
    properties: {
      summary_type: {
        type: "string",
        enum: ["weekly_executive", "daily_health", "attendance_focus", "leads_focus", "donor_health"],
      },
      channel: { type: "string" },
      date_range: dateRangeJsonSchema,
    },
    required: ["summary_type", "channel"],
    additionalProperties: false,
  },
  get_data_quality_warnings: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  get_org_context: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  read_file: {
    type: "object",
    properties: {
      path: { type: "string" },
      line_start: { type: "integer" },
      line_end: { type: "integer" },
    },
    required: ["path"],
    additionalProperties: false,
  },
  search_files: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      glob: { type: "string" },
      max_results: { type: "integer" },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  write_file: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
      create_directories: { type: "boolean" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  run_command: {
    type: "object",
    properties: {
      command: { type: "string" },
      cwd: { type: "string" },
      timeout_ms: { type: "integer" },
    },
    required: ["command"],
    additionalProperties: false,
  },
};

const toolDescriptions: Record<ToolName, string> = {
  get_kpi_snapshot: "Fetch a point-in-time value for a single KPI metric. Use metric='leads', 'qualified_leads', 'donations', 'attendance', 'email_open_rate', 'seo', 'phoenix_forum_paid_members', 'free_tuesday_repeat_attendance', 'free_thursday_repeat_attendance', 'operations', or 'org_health' for a composite score. Use metric='list_metrics' to discover all available metric names. Default window is last 7 days.",
  get_metric_trend: "Fetch a metric's current value and compare it to a prior period. Returns current, previous, delta, and delta_pct. compare_to options: previous_period (default), previous_week, previous_month, year_ago. Use for trend questions like 'are leads up or down?'",
  get_manager_report: "Fetch a section-level summary with bullets and WoW trends. Sections: leads, attendance, donations, email, seo, operations, executive. Use for broad 'how is X doing?' questions. Falls back to vw_kpi_trend rows if no AI analysis is cached.",
  list_open_tasks: "List open tasks from Notion. Optionally filter by owner (assignee name fragment), team (tag), or priority ('High Priority', 'Medium Priority', 'Low Priority'). Returns task title, owner, due date, status.",
  create_task: "Create a new task in Notion with title, description, owner, priority, due date, and source. Requires confirmation for high-impact channels. Priority must be one of: 'High Priority', 'Medium Priority', 'Low Priority'.",
  create_followup: "Create a follow-up item in Notion for a specific owner with a topic, due date, and context. Used for softer action items that don't need full task tracking.",
  send_slack_message: "Send a Slack message to a specific channel. Requires permission and confirmation for high-impact channels. Use for targeted notifications, not for KPI summaries (use post_summary for that).",
  post_summary: "Generate and post a formatted KPI summary to a Slack channel. summary_type options: weekly_executive, daily_health, attendance_focus, leads_focus, donor_health. Always requires confirmation before posting.",
  get_data_quality_warnings: "Check HubSpot sync health: staleness, error counts, and sync run status. Use when the user asks about data freshness, sync issues, or data quality.",
  get_org_context: "Fetch org-level config: dashboard URL, timezone, executive channel IDs, and active RBAC capabilities. Use when you need to know where to post or what permissions are in play.",
  read_file: "Read a file from the project directory. Returns file contents with line numbers. Optionally specify line_start and line_end to read a range. Path is relative to project root.",
  search_files: "Search file contents using a regex pattern (like ripgrep). Returns matching file paths and lines. Optionally filter by glob pattern (e.g. '*.ts'). Max 50 results.",
  write_file: "Write content to a file in the project directory. Creates the file if it doesn't exist. Set create_directories to true to create parent dirs. Requires confirmation. Path is relative to project root.",
  run_command: "Run a shell command in the project directory. Has a timeout and blocked-command safety list. Requires confirmation. Returns stdout/stderr. Use for npm, git, node, deploy commands.",
};

const AGENT_EXECUTE_TOOL_NAMES = new Set<ToolName>(["read_file", "search_files", "write_file", "run_command"]);

export const openAiTools: Array<Record<string, unknown>> = (Object.keys(toolArgSchemas) as ToolName[])
  .filter((name) => !AGENT_EXECUTE_TOOL_NAMES.has(name))
  .map((name) => ({
    type: "function",
    name,
    description: toolDescriptions[name],
    parameters: toolJsonSchemas[name],
  }));

export const agentExecuteTools: Array<Record<string, unknown>> = (Object.keys(toolArgSchemas) as ToolName[]).map((name) => ({
  type: "function",
  name,
  description: toolDescriptions[name],
  parameters: toolJsonSchemas[name],
}));

const toolIntentMap: Record<ToolName, IntentType> = {
  get_kpi_snapshot: "informational",
  get_metric_trend: "informational",
  get_manager_report: "informational",
  list_open_tasks: "informational",
  create_task: "action_task_creation",
  create_followup: "action_task_creation",
  send_slack_message: "outbound_posting",
  post_summary: "outbound_posting",
  get_data_quality_warnings: "recommendation",
  get_org_context: "informational",
  read_file: "agent_execute",
  search_files: "agent_execute",
  write_file: "agent_execute",
  run_command: "agent_execute",
};

const mutatingTools = new Set<ToolName>([
  "create_task",
  "create_followup",
  "send_slack_message",
  "post_summary",
  "write_file",
  "run_command",
]);

const toolNames = new Set<ToolName>(Object.keys(toolArgSchemas) as ToolName[]);

const hashInput = (value: unknown): string => {
  const payload = JSON.stringify(value ?? {});
  return crypto.createHash("sha256").update(payload).digest("hex");
};

const parseToolArgs = <T extends ToolName>(toolName: T, rawArgs: unknown): ToolArgsMap[T] => {
  const rawObject = typeof rawArgs === "string"
    ? (() => {
      try {
        return JSON.parse(rawArgs);
      } catch {
        throw new Error(`Tool ${toolName} arguments are not valid JSON`);
      }
    })()
    : rawArgs;

  const schema = toolArgSchemas[toolName];
  const parsed = schema.safeParse(rawObject ?? {});
  if (!parsed.success) {
    const issueText = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid arguments for ${toolName}: ${issueText}`);
  }
  return parsed.data as ToolArgsMap[T];
};

export interface ToolExecutionResult {
  ok: boolean;
  toolName: ToolName;
  intentType: IntentType;
  result?: unknown;
  error?: string;
  confidence: number;
  sources: SourceAttribution[];
  timeWindow: string;
  requiresConfirmation?: boolean;
  pendingActionId?: string;
  actionSummary?: string;
}

interface ToolExecutionOptions {
  confirmedHighImpact?: boolean;
}

export interface ToolRuntimeDependencies {
  getKpiSnapshot: typeof getKpiSnapshot;
  getMetricTrend: typeof getMetricTrend;
  getManagerReport: typeof getManagerReport;
  listOpenTasks: typeof listOpenTasks;
  createTask: typeof createTaskAction;
  createFollowup: typeof createFollowupAction;
  sendSlackMessage: typeof sendSlackMessageAction;
  postSummary: typeof postSummaryAction;
  getDataQualityWarnings: typeof getDataQualityWarnings;
  getOrgContext: typeof getOrgContext;
  logAuditEvent: typeof logAuditEventAction;
  canCreateTask: typeof canCreateTaskPermission;
  canCreateFollowup: typeof canCreateFollowupPermission;
  canExecuteAgentTools: typeof canExecuteAgentToolsPermission;
  canPostToChannel: typeof canPostToChannelPermission;
  isHighImpactAction: typeof isHighImpactAction;
  createPendingConfirmation: typeof createPendingConfirmation;
  getPendingConfirmation: typeof getPendingConfirmation;
  consumePendingConfirmation: typeof consumePendingConfirmation;
}

const defaultDeps: ToolRuntimeDependencies = {
  getKpiSnapshot,
  getMetricTrend,
  getManagerReport,
  listOpenTasks,
  createTask: createTaskAction,
  createFollowup: createFollowupAction,
  canExecuteAgentTools: canExecuteAgentToolsPermission,
  sendSlackMessage: sendSlackMessageAction,
  postSummary: postSummaryAction,
  getDataQualityWarnings,
  getOrgContext,
  logAuditEvent: logAuditEventAction,
  canCreateTask: canCreateTaskPermission,
  canCreateFollowup: canCreateFollowupPermission,
  canPostToChannel: canPostToChannelPermission,
  isHighImpactAction,
  createPendingConfirmation,
  getPendingConfirmation,
  consumePendingConfirmation,
};

const toolToActionSummary = (toolName: ToolName, args: Record<string, unknown>): string => {
  if (toolName === "post_summary") {
    return `Post ${String(args.summary_type || "summary")} to ${String(args.channel || "channel")}`;
  }
  if (toolName === "send_slack_message") {
    return `Send Slack message to ${String(args.channel || "channel")}`;
  }
  if (toolName === "create_task") {
    return `Create task '${String(args.title || "")}' for ${String(args.owner || "owner")}`;
  }
  if (toolName === "create_followup") {
    return `Create follow-up '${String(args.topic || "")}' for ${String(args.owner || "owner")}`;
  }
  if (toolName === "write_file") {
    return `Write file: ${String(args.path || "unknown")}`;
  }
  if (toolName === "run_command") {
    return `Run command: ${String(args.command || "").slice(0, 80)}`;
  }
  return `${toolName}`;
};

const emptyResult = (toolName: ToolName): ToolExecutionResult => ({
  ok: true,
  toolName,
  intentType: toolIntentMap[toolName],
  confidence: 0.7,
  sources: [],
  timeWindow: "not specified",
});

const buildDeniedResult = (toolName: ToolName, message: string): ToolExecutionResult => ({
  ok: false,
  toolName,
  intentType: toolIntentMap[toolName],
  error: message,
  confidence: 1,
  sources: [],
  timeWindow: "not specified",
});

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
};

const toSources = (metric: string, window: string, confidence?: number): SourceAttribution[] => [{
  metric,
  window,
  confidence,
}];

export const isToolName = (name: string): name is ToolName => toolNames.has(name as ToolName);
export const isMutatingTool = (toolName: ToolName): boolean => mutatingTools.has(toolName);

export interface PendingActionResolution {
  ok: boolean;
  message: string;
  execution?: ToolExecutionResult;
}

export const createToolRuntime = (deps: ToolRuntimeDependencies = defaultDeps) => {
  const execute = async (
    toolName: ToolName,
    rawArgs: unknown,
    context: ToolExecutionContext,
    options: ToolExecutionOptions = {},
  ): Promise<ToolExecutionResult> => {
    const traceId = context.traceId;
    const base = emptyResult(toolName);

    const checkMutatingPermission = async (): Promise<string | null> => {
      if (toolName === "write_file" || toolName === "run_command") {
        const allowed = await deps.canExecuteAgentTools(context.actor.userId);
        return allowed ? null : "Permission denied: agent execute tools require admin role.";
      }

      if (toolName === "create_task") {
        const allowed = await deps.canCreateTask(context.actor.userId, context.actor.channelId);
        return allowed ? null : "Permission denied for task creation in this channel.";
      }

      if (toolName === "create_followup") {
        const allowed = await deps.canCreateFollowup(context.actor.userId);
        return allowed ? null : "Permission denied for follow-up creation.";
      }

      if (toolName === "send_slack_message") {
        const channel = String(args.channel || context.actor.channelId);
        const allowed = await deps.canPostToChannel(context.actor.userId, channel);
        return allowed ? null : `Permission denied to post in ${channel}.`;
      }

      if (toolName === "post_summary") {
        const channel = String(args.channel || context.actor.channelId);
        const allowed = await deps.canPostToChannel(context.actor.userId, channel);
        return allowed ? null : `Permission denied to post summaries in ${channel}.`;
      }

      return null;
    };

    const maybeCreateConfirmation = async (args: Record<string, unknown>, actionInputHash: string): Promise<ToolExecutionResult | null> => {
      if (!isMutatingTool(toolName)) return null;

      const highImpact = toolName === "post_summary"
        ? true
        : await deps.isHighImpactAction(toolName, typeof args.channel === "string" ? args.channel : context.actor.channelId);

      if (!highImpact || options.confirmedHighImpact) return null;

      const pending = deps.createPendingConfirmation({
        actorUserId: context.actor.userId,
        channelId: context.actor.channelId,
        threadTs: context.actor.threadTs,
        actionType: toolName,
        toolName,
        input: args,
        traceId,
      });

      await deps.logAuditEvent({
        actionType: toolName,
        actorUserId: context.actor.userId,
        channelId: context.actor.channelId,
        intentType: toolIntentMap[toolName],
        toolName,
        status: "pending_confirmation",
        confirmationRequired: true,
        confirmationStatus: "pending",
        input: { ...args, input_hash: actionInputHash },
        output: { pending_action_id: pending.id },
        traceId,
      });

      return {
        ...base,
        ok: true,
        requiresConfirmation: true,
        pendingActionId: pending.id,
        actionSummary: toolToActionSummary(toolName, args),
        result: {
          status: "pending_confirmation",
          pending_action_id: pending.id,
        },
      };
    };

    let args: Record<string, unknown> = {};
    let actionInputHash = hashInput({});

    try {
      args = parseToolArgs(toolName, rawArgs) as Record<string, unknown>;
      actionInputHash = hashInput(args);

      if (isMutatingTool(toolName)) {
        const deniedReason = await checkMutatingPermission();
        if (deniedReason) {
          await deps.logAuditEvent({
            actionType: toolName,
            actorUserId: context.actor.userId,
            channelId: context.actor.channelId,
            intentType: toolIntentMap[toolName],
            toolName,
            status: "denied",
            confirmationRequired: false,
            confirmationStatus: "not_required",
            input: { ...args, input_hash: actionInputHash },
            errorMessage: deniedReason,
            traceId,
          });
          return buildDeniedResult(toolName, deniedReason);
        }

        const pending = await maybeCreateConfirmation(args, actionInputHash);
        if (pending) {
          return pending;
        }
      }

      if (toolName === "get_kpi_snapshot") {
        const typed = args as ToolArgsMap["get_kpi_snapshot"];
        const result = await deps.getKpiSnapshot(typed.metric, typed.date_range, typed.filters);
        return {
          ...base,
          confidence: result.confidence,
          sources: toSources(result.metric, result.window, result.confidence),
          timeWindow: result.window,
          result,
        };
      }

      if (toolName === "get_metric_trend") {
        const typed = args as ToolArgsMap["get_metric_trend"];
        const result = await deps.getMetricTrend(typed.metric, typed.date_range, typed.compare_to);
        return {
          ...base,
          confidence: Number(result.confidence || 0.75),
          sources: toSources(result.metric, result.window, Number(result.confidence || 0.75)),
          timeWindow: result.window,
          result,
        };
      }

      if (toolName === "get_manager_report") {
        const typed = args as ToolArgsMap["get_manager_report"];
        const result = await deps.getManagerReport(typed.section, typed.date_range);
        return {
          ...base,
          confidence: result.confidence,
          sources: toSources(result.section, result.window, result.confidence),
          timeWindow: result.window,
          result,
        };
      }

      if (toolName === "list_open_tasks") {
        const typed = args as ToolArgsMap["list_open_tasks"];
        const result = await deps.listOpenTasks(typed.owner, typed.team, typed.priority);
        return {
          ...base,
          confidence: 0.9,
          sources: toSources("notion_todos", "open tasks", 0.9),
          timeWindow: "open tasks",
          result,
        };
      }

      if (toolName === "create_task") {
        const typed = args as ToolArgsMap["create_task"];
        const result = await deps.createTask({
          title: typed.title,
          description: typed.description,
          owner: typed.owner,
          priority: typed.priority,
          dueDate: typed.due_date,
          source: typed.source,
          actorUserId: context.actor.userId,
          traceId,
        });

        await deps.logAuditEvent({
          actionType: toolName,
          actorUserId: context.actor.userId,
          channelId: context.actor.channelId,
          intentType: toolIntentMap[toolName],
          toolName,
          status: "executed",
          confirmationRequired: false,
          confirmationStatus: "not_required",
          input: { ...typed, input_hash: actionInputHash },
          output: toRecord(result),
          traceId,
        });

        return {
          ...base,
          confidence: 0.9,
          sources: toSources("task_requests", typed.due_date, 0.9),
          timeWindow: typed.due_date,
          result,
        };
      }

      if (toolName === "create_followup") {
        const typed = args as ToolArgsMap["create_followup"];
        const result = await deps.createFollowup({
          topic: typed.topic,
          owner: typed.owner,
          dueDate: typed.due_date,
          context: typed.context,
          actorUserId: context.actor.userId,
          source: {
            tool: toolName,
            trace_id: traceId,
            channel_id: context.actor.channelId,
          },
        });

        await deps.logAuditEvent({
          actionType: toolName,
          actorUserId: context.actor.userId,
          channelId: context.actor.channelId,
          intentType: toolIntentMap[toolName],
          toolName,
          status: "executed",
          confirmationRequired: false,
          confirmationStatus: "not_required",
          input: { ...typed, input_hash: actionInputHash },
          output: toRecord(result),
          traceId,
        });

        return {
          ...base,
          confidence: 0.9,
          sources: toSources("followups", typed.due_date, 0.9),
          timeWindow: typed.due_date,
          result,
        };
      }

      if (toolName === "send_slack_message") {
        const typed = args as ToolArgsMap["send_slack_message"];
        const result = await deps.sendSlackMessage(typed.channel, typed.text, typed.blocks);

        await deps.logAuditEvent({
          actionType: toolName,
          actorUserId: context.actor.userId,
          channelId: context.actor.channelId,
          intentType: toolIntentMap[toolName],
          toolName,
          status: "executed",
          confirmationRequired: options.confirmedHighImpact === true,
          confirmationStatus: options.confirmedHighImpact === true ? "approved" : "not_required",
          input: { ...typed, input_hash: actionInputHash },
          output: toRecord(result),
          traceId,
        });

        return {
          ...base,
          confidence: 0.95,
          sources: toSources("slack", "immediate", 0.95),
          timeWindow: "immediate",
          result,
        };
      }

      if (toolName === "post_summary") {
        const typed = args as ToolArgsMap["post_summary"];
        const result = await deps.postSummary(typed.summary_type, typed.channel, typed.date_range, traceId);

        await deps.logAuditEvent({
          actionType: toolName,
          actorUserId: context.actor.userId,
          channelId: context.actor.channelId,
          intentType: toolIntentMap[toolName],
          toolName,
          status: "executed",
          confirmationRequired: true,
          confirmationStatus: options.confirmedHighImpact === true ? "approved" : "not_required",
          input: { ...typed, input_hash: actionInputHash },
          output: toRecord(result),
          traceId,
        });

        return {
          ...base,
          confidence: Number(toRecord(result).confidence || 0.85),
          sources: toSources("generated_summaries", typed.summary_type, Number(toRecord(result).confidence || 0.85)),
          timeWindow: typed.date_range?.label || `${typed.date_range?.from || ""} to ${typed.date_range?.to || ""}`.trim() || "current period",
          result,
        };
      }

      // -------------------------------------------------------------------
      // Agent execute tools
      // -------------------------------------------------------------------

      if (toolName === "read_file") {
        const typed = args as ToolArgsMap["read_file"];
        const projectRoot = env.agentExecuteProjectRoot;
        if (!projectRoot) throw new Error("Agent execute not configured: AGENT_EXECUTE_PROJECT_ROOT not set");
        const fullPath = resolveSafePath(projectRoot, typed.path);
        const content = await fs.readFile(fullPath, "utf-8");
        const lines = content.split("\n");
        const start = (typed.line_start || 1) - 1;
        const end = typed.line_end || lines.length;
        const slice = lines.slice(start, end);
        const numbered = slice.map((line, i) => `${start + i + 1}\t${line}`).join("\n");
        return {
          ...base,
          confidence: 0.95,
          sources: toSources("file_system", typed.path, 0.95),
          timeWindow: "current",
          result: { path: typed.path, line_count: slice.length, content: numbered },
        };
      }

      if (toolName === "search_files") {
        const typed = args as ToolArgsMap["search_files"];
        const projectRoot = env.agentExecuteProjectRoot;
        if (!projectRoot) throw new Error("Agent execute not configured: AGENT_EXECUTE_PROJECT_ROOT not set");
        const maxResults = typed.max_results || 20;
        const rgArgs = ["--json", "--max-count", "5", typed.pattern];
        if (typed.glob) rgArgs.push("--glob", typed.glob);
        rgArgs.push(projectRoot);
        try {
          const { stdout } = await execFileAsync("rg", rgArgs, { timeout: 15_000, maxBuffer: 1024 * 1024 });
          const matches = stdout.split("\n")
            .filter(Boolean)
            .map((line) => { try { return JSON.parse(line); } catch { return null; } })
            .filter(Boolean)
            .filter((item: any) => item.type === "match")
            .slice(0, maxResults)
            .map((item: any) => ({
              path: path.relative(projectRoot, item.data?.path?.text || ""),
              line_number: item.data?.line_number,
              text: String(item.data?.lines?.text || "").trim(),
            }));
          return {
            ...base,
            confidence: 0.9,
            sources: toSources("file_search", typed.pattern, 0.9),
            timeWindow: "current",
            result: { pattern: typed.pattern, match_count: matches.length, matches },
          };
        } catch (searchErr: any) {
          // rg exits 1 when no matches found
          if (searchErr?.code === 1) {
            return { ...base, confidence: 0.9, sources: toSources("file_search", typed.pattern, 0.9), timeWindow: "current", result: { pattern: typed.pattern, match_count: 0, matches: [] } };
          }
          throw searchErr;
        }
      }

      if (toolName === "write_file") {
        const typed = args as ToolArgsMap["write_file"];
        const projectRoot = env.agentExecuteProjectRoot;
        if (!projectRoot) throw new Error("Agent execute not configured: AGENT_EXECUTE_PROJECT_ROOT not set");
        const fullPath = resolveSafePath(projectRoot, typed.path);
        if (typed.create_directories) {
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
        }
        await fs.writeFile(fullPath, typed.content, "utf-8");

        await deps.logAuditEvent({
          actionType: toolName,
          actorUserId: context.actor.userId,
          channelId: context.actor.channelId,
          intentType: "agent_execute",
          toolName,
          status: "executed",
          confirmationRequired: true,
          confirmationStatus: options.confirmedHighImpact ? "approved" : "not_required",
          input: { path: typed.path, content_length: typed.content.length, input_hash: actionInputHash },
          output: { path: typed.path, bytes_written: typed.content.length },
          traceId,
        });

        return {
          ...base,
          confidence: 0.95,
          sources: toSources("file_system", typed.path, 0.95),
          timeWindow: "immediate",
          result: { path: typed.path, bytes_written: typed.content.length, status: "written" },
        };
      }

      if (toolName === "run_command") {
        const typed = args as ToolArgsMap["run_command"];
        const projectRoot = env.agentExecuteProjectRoot;
        if (!projectRoot) throw new Error("Agent execute not configured: AGENT_EXECUTE_PROJECT_ROOT not set");
        if (isCommandBlocked(typed.command)) {
          return buildDeniedResult(toolName, `Command blocked by safety policy: ${typed.command.slice(0, 80)}`);
        }
        const cwd = typed.cwd ? resolveSafePath(projectRoot, typed.cwd) : projectRoot;
        const timeout = Math.min(typed.timeout_ms || env.agentExecuteCommandTimeoutMs, env.agentExecuteCommandTimeoutMs);

        try {
          const { stdout, stderr } = await execFileAsync("bash", ["-c", typed.command], {
            cwd,
            timeout,
            maxBuffer: 512 * 1024,
          });

          await deps.logAuditEvent({
            actionType: toolName,
            actorUserId: context.actor.userId,
            channelId: context.actor.channelId,
            intentType: "agent_execute",
            toolName,
            status: "executed",
            confirmationRequired: true,
            confirmationStatus: options.confirmedHighImpact ? "approved" : "not_required",
            input: { command: typed.command, cwd: typed.cwd, input_hash: actionInputHash },
            output: { stdout_length: stdout.length, stderr_length: stderr.length },
            traceId,
          });

          return {
            ...base,
            confidence: 0.9,
            sources: toSources("shell", typed.command.slice(0, 50), 0.9),
            timeWindow: "immediate",
            result: { stdout: stdout.slice(0, 8000), stderr: stderr.slice(0, 2000), exit_code: 0 },
          };
        } catch (cmdErr: any) {
          const stdout = String(cmdErr.stdout || "").slice(0, 8000);
          const stderr = String(cmdErr.stderr || "").slice(0, 2000);
          const exitCode = cmdErr.code ?? 1;

          await deps.logAuditEvent({
            actionType: toolName,
            actorUserId: context.actor.userId,
            channelId: context.actor.channelId,
            intentType: "agent_execute",
            toolName,
            status: "executed",
            confirmationRequired: true,
            confirmationStatus: options.confirmedHighImpact ? "approved" : "not_required",
            input: { command: typed.command, cwd: typed.cwd, input_hash: actionInputHash },
            output: { stdout_length: stdout.length, stderr_length: stderr.length, exit_code: exitCode },
            traceId,
          });

          return {
            ...base,
            confidence: 0.9,
            sources: toSources("shell", typed.command.slice(0, 50), 0.9),
            timeWindow: "immediate",
            result: { stdout, stderr, exit_code: exitCode },
          };
        }
      }

      if (toolName === "get_data_quality_warnings") {
        const result = await deps.getDataQualityWarnings();
        return {
          ...base,
          confidence: 0.8,
          sources: toSources("vw_hubspot_sync_health_observability", "latest", 0.8),
          timeWindow: "latest",
          result,
        };
      }

      if (toolName === "get_org_context") {
        const result = await deps.getOrgContext();
        return {
          ...base,
          confidence: 0.95,
          sources: toSources("org_context", "latest", 0.95),
          timeWindow: "latest",
          result,
        };
      }

      return buildDeniedResult(toolName, "Tool not implemented");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (isMutatingTool(toolName)) {
        await deps.logAuditEvent({
          actionType: toolName,
          actorUserId: context.actor.userId,
          channelId: context.actor.channelId,
          intentType: toolIntentMap[toolName],
          toolName,
          status: "failed",
          confirmationRequired: options.confirmedHighImpact === true,
          confirmationStatus: options.confirmedHighImpact === true ? "approved" : "not_required",
          input: { ...args, input_hash: actionInputHash },
          errorMessage,
          traceId,
        }).catch((auditError) => {
          logger.error({ err: auditError, toolName, traceId }, "Failed to write failed audit event");
        });
      }

      return {
        ...base,
        ok: false,
        error: errorMessage,
      };
    }
  };

  const approvePendingAction = async (
    pendingActionId: string,
    approverUserId: string,
    channelId?: string,
    threadTs?: string,
  ): Promise<PendingActionResolution> => {
    const pending = deps.consumePendingConfirmation(pendingActionId);
    if (!pending) {
      return { ok: false, message: "Pending action not found or already expired." };
    }

    if (pending.actorUserId !== approverUserId) {
      await deps.logAuditEvent({
        actionType: pending.actionType,
        actorUserId: approverUserId,
        channelId: channelId || pending.channelId,
        intentType: toolIntentMap[pending.toolName as ToolName] || "outbound_posting",
        toolName: pending.toolName,
        status: "denied",
        confirmationRequired: true,
        confirmationStatus: "denied",
        input: { ...pending.input, pending_action_id: pending.id, denied_reason: "approver_mismatch" },
        traceId: pending.traceId,
      });
      return { ok: false, message: "Only the requesting user can approve this action." };
    }

    await deps.logAuditEvent({
      actionType: pending.actionType,
      actorUserId: approverUserId,
      channelId: channelId || pending.channelId,
      intentType: toolIntentMap[pending.toolName as ToolName] || "outbound_posting",
      toolName: pending.toolName,
      status: "approved",
      confirmationRequired: true,
      confirmationStatus: "approved",
      input: { ...pending.input, pending_action_id: pending.id },
      traceId: pending.traceId,
    });

    const execution = await execute(
      pending.toolName as ToolName,
      pending.input,
      {
        traceId: pending.traceId,
        actor: {
          userId: pending.actorUserId,
          channelId: pending.channelId,
          threadTs: threadTs || pending.threadTs,
        },
      },
      { confirmedHighImpact: true },
    );

    if (!execution.ok) {
      return { ok: false, message: `Approved but execution failed: ${execution.error || "unknown error"}`, execution };
    }

    return {
      ok: true,
      message: `Approved and executed: ${pending.toolName}`,
      execution,
    };
  };

  const denyPendingAction = async (
    pendingActionId: string,
    actorUserId: string,
    channelId?: string,
  ): Promise<PendingActionResolution> => {
    const pending: PendingConfirmation | null = deps.consumePendingConfirmation(pendingActionId);
    if (!pending) {
      return { ok: false, message: "Pending action not found or already expired." };
    }

    await deps.logAuditEvent({
      actionType: pending.actionType,
      actorUserId,
      channelId: channelId || pending.channelId,
      intentType: toolIntentMap[pending.toolName as ToolName] || "outbound_posting",
      toolName: pending.toolName,
      status: "denied",
      confirmationRequired: true,
      confirmationStatus: "denied",
      input: { ...pending.input, pending_action_id: pending.id },
      traceId: pending.traceId,
    });

    return {
      ok: true,
      message: `Denied action: ${pending.toolName}`,
    };
  };

  return {
    execute,
    approvePendingAction,
    denyPendingAction,
  };
};

export const defaultToolRuntime = createToolRuntime();

export const summarizeToolExecution = (execution: ToolExecutionResult): string => {
  if (!execution.ok) {
    return `Action failed: ${execution.error || "unknown error"}`;
  }

  if (execution.requiresConfirmation) {
    return `Approval required before executing ${execution.toolName}.`;
  }

  if (execution.toolName === "create_task") {
    const row = toRecord(execution.result);
    return `Task created: ${String(row.title || "Untitled")} (owner: ${String(row.owner || "unassigned")}).`;
  }

  if (execution.toolName === "create_followup") {
    const row = toRecord(execution.result);
    return `Follow-up created: ${String(row.topic || "Untitled")} (owner: ${String(row.owner || "unassigned")}).`;
  }

  if (execution.toolName === "post_summary") {
    const row = toRecord(execution.result);
    if (row.deduped === true) {
      return "Summary already posted for that channel and time window; skipped duplicate.";
    }
    return "Summary posted successfully.";
  }

  if (execution.toolName === "send_slack_message") {
    return "Slack message sent.";
  }

  if (execution.toolName === "read_file") {
    const row = toRecord(execution.result);
    return `File read: ${String(row.path || "unknown")} (${String(row.line_count || 0)} lines).`;
  }

  if (execution.toolName === "search_files") {
    const row = toRecord(execution.result);
    return `Search complete: ${String(row.match_count || 0)} matches for "${String(row.pattern || "")}".`;
  }

  if (execution.toolName === "write_file") {
    const row = toRecord(execution.result);
    return `File written: ${String(row.path || "unknown")} (${String(row.bytes_written || 0)} bytes).`;
  }

  if (execution.toolName === "run_command") {
    return "Command executed.";
  }

  return `${execution.toolName} executed.`;
};
