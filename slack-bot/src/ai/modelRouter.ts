/**
 * Central model router.
 * Selects the OpenAI model based on task type and cheap mode setting.
 */

import { env } from "../config/env.js";

export type TaskType =
  | "proposal_json"
  | "morning_summary"
  | "midday_checkin"
  | "evening_recap"
  | "morning_digest"
  | "midday_digest"
  | "eod_digest"
  | "nudge"
  | "proposal_expand"
  | "conversation_reply"
  | "outcome_analysis"
  | "orchestrator_tool_call";

// Tasks that fall back to CHEAP model when OPENAI_USE_CHEAP_MODE=true
const CHEAP_ELIGIBLE: ReadonlySet<TaskType> = new Set([
  "morning_summary",
  "midday_checkin",
  "evening_recap",
  "morning_digest",
  "midday_digest",
  "eod_digest",
  "nudge",
  "conversation_reply",
]);

// Default routing: task -> which env model tier to use
const TASK_TIER: Record<TaskType, "primary" | "fast"> = {
  proposal_json: "primary",
  morning_summary: "fast",
  midday_checkin: "fast",
  evening_recap: "fast",
  morning_digest: "fast",
  midday_digest: "fast",
  eod_digest: "fast",
  nudge: "fast",
  proposal_expand: "primary",
  conversation_reply: "fast",
  outcome_analysis: "primary",
  orchestrator_tool_call: "primary",
};

export const resolveModel = (taskType: TaskType): string => {
  if (env.openAiUseCheapMode && CHEAP_ELIGIBLE.has(taskType)) {
    return env.openAiModelCheap;
  }
  return TASK_TIER[taskType] === "primary"
    ? env.openAiModelPrimary
    : env.openAiModelFast;
};

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-5.4": { inputPer1M: 2.5, outputPer1M: 15.0 },
  "gpt-5.4-mini": { inputPer1M: 0.75, outputPer1M: 4.5 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4.1": { inputPer1M: 2.0, outputPer1M: 8.0 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
};

export const estimateCost = (
  model: string,
  inputTokens: number,
  outputTokens: number,
): number => {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
};

export const estimateDailyCost = (model: string): { daily: number; monthly: number } => {
  const daily = estimateCost(model, 68_000, 32_000);
  return { daily, monthly: daily * 30 };
};
