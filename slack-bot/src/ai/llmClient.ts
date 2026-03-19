/**
 * Central OpenAI Responses API wrapper.
 * All LLM calls go through this module for consistent model routing,
 * retry logic, cost tracking, and logging.
 */

import { openai } from "../clients/openai.js";
import { resolveModel, estimateCost, type TaskType } from "./modelRouter.js";
import { logger } from "../observability/logger.js";

// ---------------------------------------------------------------------------
// Cost tracker (in-memory, resets on restart)
// ---------------------------------------------------------------------------

interface CostEntry {
  timestamp: number;
  model: string;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

const costLog: CostEntry[] = [];

const recordCost = (entry: CostEntry): void => {
  costLog.push(entry);
  // Keep max 7 days of entries to avoid unbounded memory
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  while (costLog.length > 0 && costLog[0].timestamp < sevenDaysAgo) {
    costLog.shift();
  }
};

export interface CostSummary {
  period: string;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
  byModel: Record<string, { cost: number; calls: number }>;
  byTaskType: Record<string, { cost: number; calls: number }>;
}

const summarizePeriod = (label: string, since: number): CostSummary => {
  const entries = costLog.filter((e) => e.timestamp >= since);
  const byModel: Record<string, { cost: number; calls: number }> = {};
  const byTaskType: Record<string, { cost: number; calls: number }> = {};

  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const e of entries) {
    totalCost += e.cost;
    totalInput += e.inputTokens;
    totalOutput += e.outputTokens;

    if (!byModel[e.model]) byModel[e.model] = { cost: 0, calls: 0 };
    byModel[e.model].cost += e.cost;
    byModel[e.model].calls += 1;

    if (!byTaskType[e.taskType]) byTaskType[e.taskType] = { cost: 0, calls: 0 };
    byTaskType[e.taskType].cost += e.cost;
    byTaskType[e.taskType].calls += 1;
  }

  return {
    period: label,
    totalCost,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    callCount: entries.length,
    byModel,
    byTaskType,
  };
};

export const getCostSummary = (): { today: CostSummary; week: CostSummary; month: CostSummary } => {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  return {
    today: summarizePeriod("Today", todayStart.getTime()),
    week: summarizePeriod("This week", weekStart.getTime()),
    month: summarizePeriod("This month", monthStart.getTime()),
  };
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LlmTextRequest {
  taskType: TaskType;
  instructions?: string;
  input: Array<Record<string, unknown>>;
  maxOutputTokens?: number;
  temperature?: number;
  metadata?: Record<string, string>;
}

export interface LlmJsonRequest extends LlmTextRequest {
  jsonSchema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
}

export interface LlmToolRequest extends LlmTextRequest {
  tools: Array<Record<string, unknown>>;
  toolChoice?: string;
  previousResponseId?: string;
}

export interface LlmResponse {
  outputText: string;
  model: string;
  taskType: TaskType;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  latencyMs: number;
  raw: any;
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 1000,
): Promise<T> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.status || err?.statusCode;
      if (attempt < maxRetries && RETRYABLE_STATUS.has(status)) {
        const delay = baseDelayMs * 2 ** attempt;
        logger.warn(
          { attempt, status, delay },
          "LLM call failed with retryable error, retrying",
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error("withRetry: unreachable");
};

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

const extractUsage = (raw: any): { input: number; output: number } => {
  const usage = raw?.usage;
  return {
    input: usage?.input_tokens || usage?.prompt_tokens || 0,
    output: usage?.output_tokens || usage?.completion_tokens || 0,
  };
};

// ---------------------------------------------------------------------------
// Core call function
// ---------------------------------------------------------------------------

const callResponses = async (
  taskType: TaskType,
  params: Record<string, unknown>,
  metadata?: Record<string, string>,
): Promise<LlmResponse> => {
  const model = params.model as string || resolveModel(taskType);
  const start = Date.now();

  const raw = await withRetry(() =>
    openai.responses.create({ ...params, model } as any),
  );

  const latencyMs = Date.now() - start;
  const usage = extractUsage(raw);
  const cost = estimateCost(model, usage.input, usage.output);
  const outputText = (raw as any)?.output_text || "";

  recordCost({
    timestamp: Date.now(),
    model,
    taskType,
    inputTokens: usage.input,
    outputTokens: usage.output,
    cost,
  });

  logger.info(
    {
      taskType,
      model,
      inputTokens: usage.input,
      outputTokens: usage.output,
      totalTokens: usage.input + usage.output,
      estimatedCost: `$${cost.toFixed(6)}`,
      latencyMs,
      ...(metadata || {}),
    },
    `llm:${taskType}`,
  );

  return {
    outputText,
    model,
    taskType,
    inputTokens: usage.input,
    outputTokens: usage.output,
    estimatedCost: cost,
    latencyMs,
    raw,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Plain text completion via Responses API.
 */
export const llmText = async (req: LlmTextRequest): Promise<LlmResponse> => {
  const params: Record<string, unknown> = {
    model: resolveModel(req.taskType),
    input: req.input,
  };
  if (req.instructions) params.instructions = req.instructions;
  if (req.temperature !== undefined) params.temperature = req.temperature;
  if (req.maxOutputTokens) params.max_output_tokens = req.maxOutputTokens;

  return callResponses(req.taskType, params, req.metadata);
};

/**
 * Structured JSON output via Responses API with json_schema.
 * Validates the output; retries once with a repair prompt on parse failure.
 */
export const llmJson = async <T = unknown>(
  req: LlmJsonRequest,
  validate?: (parsed: unknown) => parsed is T,
): Promise<{ data: T; response: LlmResponse }> => {
  const params: Record<string, unknown> = {
    model: resolveModel(req.taskType),
    input: req.input,
    text: {
      format: {
        type: "json_schema",
        ...req.jsonSchema,
      },
    },
  };
  if (req.instructions) params.instructions = req.instructions;
  if (req.temperature !== undefined) params.temperature = req.temperature;
  if (req.maxOutputTokens) params.max_output_tokens = req.maxOutputTokens;

  const response = await callResponses(req.taskType, params, req.metadata);

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.outputText);
  } catch (parseErr) {
    logger.warn(
      { taskType: req.taskType, outputLen: response.outputText.length },
      "llmJson: initial response was not valid JSON, retrying with repair prompt",
    );

    // Retry with repair prompt
    const repairResponse = await callResponses(
      req.taskType,
      {
        ...params,
        input: [
          ...((req.input as any[]) || []),
          {
            role: "user",
            content: `Your previous response was not valid JSON. Please respond with ONLY valid JSON matching the schema. Previous output: ${response.outputText.slice(0, 500)}`,
          },
        ],
      },
      req.metadata,
    );

    try {
      parsed = JSON.parse(repairResponse.outputText);
    } catch {
      logger.error(
        { taskType: req.taskType },
        "llmJson: repair attempt also failed to produce valid JSON",
      );
      throw new Error(`llmJson: failed to get valid JSON for ${req.taskType}`);
    }

    if (validate && !validate(parsed)) {
      throw new Error(`llmJson: repaired JSON failed validation for ${req.taskType}`);
    }

    return { data: parsed as T, response: repairResponse };
  }

  if (validate && !validate(parsed)) {
    throw new Error(`llmJson: JSON failed validation for ${req.taskType}`);
  }

  return { data: parsed as T, response };
};

/**
 * Tool-use call via Responses API.
 * Used by the orchestrator for agentic tool loops.
 */
export const llmToolCall = async (req: LlmToolRequest): Promise<LlmResponse> => {
  const params: Record<string, unknown> = {
    model: resolveModel(req.taskType),
    input: req.input,
    tools: req.tools,
  };
  if (req.instructions) params.instructions = req.instructions;
  if (req.temperature !== undefined) params.temperature = req.temperature;
  if (req.maxOutputTokens) params.max_output_tokens = req.maxOutputTokens;
  if (req.toolChoice) params.tool_choice = req.toolChoice;
  if (req.previousResponseId) params.previous_response_id = req.previousResponseId;

  return callResponses(req.taskType, params, req.metadata);
};
