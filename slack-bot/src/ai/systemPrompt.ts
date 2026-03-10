import type { IntentType, OrgContext } from "../types.js";

const FINAL_RESPONSE_CONTRACT = [
  "Return the final answer as JSON with keys:",
  "text: concise Slack-ready answer (max ~8 lines)",
  "confidence: number between 0 and 1",
  "sources: array of { metric, window, confidence? }",
  "timeWindow: plain text date window",
  "intentType: one of informational|recommendation|action_task_creation|outbound_posting",
  "If confidence < 0.6, explicitly say confidence is low and what data is missing.",
  "Always reference source metrics and time windows.",
  "Never suggest or execute arbitrary SQL.",
].join("\n");

export const buildSystemPrompt = (
  orgContext: OrgContext | null,
  intentHint: IntentType,
): string => {
  const today = new Date().toISOString().slice(0, 10);
  const orgBits = orgContext
    ? [
      `Dashboard URL: ${orgContext.dashboardUrl}`,
      `Org timezone: ${orgContext.timezone}`,
      `Executive channels: ${orgContext.executiveChannels.join(",") || "none"}`,
      `Capabilities: ${orgContext.capabilities.join(", ")}`,
    ].join("\n")
    : "Org context unavailable";

  return [
    "You are KPI Copilot for Sober Founders.",
    `Today is ${today}.`,
    `Intent hint: ${intentHint}.`,
    "Use tools to answer with factual KPI data.",
    "Keep outputs concise, executive-friendly, and optimized for Slack threads.",
    "For action requests, execute only approved tools and respect permission denials.",
    "For high-impact actions requiring confirmation, explain that approval is required.",
    orgBits,
    "",
    FINAL_RESPONSE_CONTRACT,
  ].join("\n");
};
