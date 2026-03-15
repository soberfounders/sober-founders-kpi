import { openai } from "../clients/openai.js";
import { env } from "../config/env.js";
import { responseEnvelopeSchema } from "./schemas/response.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import {
  defaultToolRuntime,
  isToolName,
  openAiTools,
  summarizeToolExecution,
  type ToolExecutionResult,
} from "./tools.js";
import type {
  IntentType,
  SlackResponseEnvelope,
  SourceAttribution,
  ToolExecutionContext,
} from "../types.js";
import { getOrgContext } from "../data/managers.js";
import { getThreadHistory } from "../slack/services/threading.js";
import { logger } from "../observability/logger.js";

interface ResponseClient {
  create: (request: Record<string, unknown>) => Promise<any>;
}

interface OrchestratorDependencies {
  model: string;
  responseClient: ResponseClient;
  toolRuntime: typeof defaultToolRuntime;
  maxToolTurns: number;
  getOrgContext: typeof getOrgContext;
}

const defaultDeps: OrchestratorDependencies = {
  model: env.openAiModel,
  responseClient: openai.responses,
  toolRuntime: defaultToolRuntime,
  maxToolTurns: 6,
  getOrgContext,
};

const readText = (response: any): string => {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      const text = String(content?.text || content?.output_text || "").trim();
      if (text) parts.push(text);
    }
  }
  return parts.join("\n").trim();
};

interface FunctionCallItem {
  call_id: string;
  name: string;
  arguments: unknown;
}

const readFunctionCalls = (response: any): FunctionCallItem[] => {
  const calls: FunctionCallItem[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== "function_call") continue;
    const callId = String(item.call_id || "").trim();
    const name = String(item.name || "").trim();
    if (!callId || !name) continue;
    calls.push({
      call_id: callId,
      name,
      arguments: item.arguments,
    });
  }
  return calls;
};

const averageConfidence = (toolExecutions: ToolExecutionResult[]): number => {
  if (!toolExecutions.length) return 0.6;
  const values = toolExecutions.map((item) => item.confidence).filter((value) => Number.isFinite(value));
  if (!values.length) return 0.6;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const mergeSources = (toolExecutions: ToolExecutionResult[]): SourceAttribution[] => {
  const seen = new Set<string>();
  const merged: SourceAttribution[] = [];
  for (const execution of toolExecutions) {
    for (const source of execution.sources || []) {
      const key = `${source.metric}::${source.window}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(source);
    }
  }
  return merged;
};

const bestTimeWindow = (toolExecutions: ToolExecutionResult[]): string => {
  const candidate = [...toolExecutions]
    .reverse()
    .find((execution) => execution.timeWindow && execution.timeWindow !== "not specified");
  return candidate?.timeWindow || "latest available";
};

export const classifyIntent = (prompt: string): IntentType => {
  const text = prompt.toLowerCase();

  if (
    text.includes("create task")
    || text.includes("follow-up")
    || text.includes("followup")
    || text.includes("assign")
    || text.includes("owner")
  ) {
    return "action_task_creation";
  }

  if (
    text.includes("post")
    || text.includes("send")
    || text.includes("publish")
    || text.includes("weekly executive summary")
  ) {
    return "outbound_posting";
  }

  if (
    text.includes("recommend")
    || text.includes("should we")
    || text.includes("what should")
    || text.includes("next step")
  ) {
    return "recommendation";
  }

  return "informational";
};

const fallbackText = (toolExecutions: ToolExecutionResult[]): string => {
  if (!toolExecutions.length) {
    return "I could not find enough data to answer that. Please try narrowing the date range or metric name.";
  }

  const lines = toolExecutions.slice(-3).map((execution) => summarizeToolExecution(execution));
  return lines.join("\n");
};

const normalizeEnvelope = (
  rawText: string,
  intentType: IntentType,
  toolExecutions: ToolExecutionResult[],
): SlackResponseEnvelope => {
  const text = rawText.trim();
  const maybeJson = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();

  if (maybeJson) {
    const parsed = responseEnvelopeSchema.safeParse(maybeJson);
    if (parsed.success) {
      const json = parsed.data;
      const lowConfidenceText = json.confidence < 0.6 && !/low confidence/i.test(json.text)
        ? `${json.text}\nI have low confidence due to limited or stale data.`
        : json.text;

      return {
        text: lowConfidenceText,
        confidence: json.confidence,
        sources: json.sources,
        timeWindow: json.timeWindow,
        intentType: json.intentType,
      };
    }
  }

  const confidence = averageConfidence(toolExecutions);
  const sources = mergeSources(toolExecutions);
  const timeWindow = bestTimeWindow(toolExecutions);

  const lowConfidenceClause = confidence < 0.6 && !/low confidence/i.test(text)
    ? "\nI have low confidence due to missing or incomplete source data."
    : "";

  return {
    text: `${text || fallbackText(toolExecutions)}${lowConfidenceClause}`,
    confidence,
    sources: sources.length ? sources : [{ metric: "kpi_data", window: timeWindow, confidence }],
    timeWindow,
    intentType,
  };
};

export interface OrchestratorRequest {
  prompt: string;
  context: ToolExecutionContext;
}

export const createKpiOrchestrator = (deps: Partial<OrchestratorDependencies> = {}) => {
  const resolved: OrchestratorDependencies = {
    ...defaultDeps,
    ...deps,
  };

  const run = async (request: OrchestratorRequest): Promise<SlackResponseEnvelope> => {
    const intentHint = classifyIntent(request.prompt);
    const orgContext = await resolved.getOrgContext().catch(() => null);

    const { actor } = request.context;
    const historyItems = actor.threadTs
      ? await getThreadHistory(actor.channelId, actor.threadTs, actor.messageTs, 10).catch(() => [])
      : [];

    const historyMessages: Array<Record<string, unknown>> = historyItems.map((item) => ({
      role: item.direction === "inbound" ? "user" : "assistant",
      content: [{ type: "input_text", text: item.messageText }],
    }));

    let response = await resolved.responseClient.create({
      model: resolved.model,
      temperature: 0.2,
      max_output_tokens: 900,
      tools: openAiTools,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: buildSystemPrompt(orgContext, intentHint) }],
        },
        ...historyMessages,
        {
          role: "user",
          content: [{ type: "input_text", text: request.prompt }],
        },
      ],
    });

    const toolExecutions: ToolExecutionResult[] = [];

    for (let step = 0; step < resolved.maxToolTurns; step += 1) {
      const calls = readFunctionCalls(response);
      if (!calls.length) break;

      const outputs: Array<Record<string, unknown>> = [];
      for (const call of calls) {
        if (!isToolName(call.name)) {
          outputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({ error: `Tool ${call.name} is not allowlisted.` }),
          });
          continue;
        }

        const execution = await resolved.toolRuntime.execute(call.name, call.arguments, request.context);
        toolExecutions.push(execution);

        if (execution.requiresConfirmation && execution.pendingActionId) {
          return {
            text: `Approval required: ${execution.actionSummary || execution.toolName}`,
            blocks: undefined,
            confidence: 0.95,
            sources: execution.sources,
            timeWindow: execution.timeWindow,
            intentType: execution.intentType,
            requiresConfirmation: true,
            pendingActionId: execution.pendingActionId,
          };
        }

        outputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(execution.ok ? execution.result : { error: execution.error }),
        });
      }

      response = await resolved.responseClient.create({
        model: resolved.model,
        temperature: 0.2,
        max_output_tokens: 900,
        previous_response_id: response.id,
        tools: openAiTools,
        input: outputs,
      });
    }

    const finalText = readText(response);
    return normalizeEnvelope(finalText, intentHint, toolExecutions);
  };

  return {
    run,
  };
};

export const kpiOrchestrator = createKpiOrchestrator();

export const orchestrateKpiPrompt = async (request: OrchestratorRequest): Promise<SlackResponseEnvelope> => {
  try {
    return await kpiOrchestrator.run(request);
  } catch (error) {
    logger.error({ err: error, request }, "orchestrateKpiPrompt failed");
    return {
      text: "I could not complete that KPI request because the orchestration pipeline failed.",
      confidence: 0.2,
      sources: [{ metric: "orchestrator", window: "latest", confidence: 0.2 }],
      timeWindow: "latest",
      intentType: classifyIntent(request.prompt),
    };
  }
};
