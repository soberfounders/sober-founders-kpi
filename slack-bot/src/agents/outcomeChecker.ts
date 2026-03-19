/**
 * Outcome measurement loop.
 * Queries proposals due for measurement, compares actual vs expected,
 * posts follow-up in original Slack thread, and stores learnings.
 */

import { WebClient } from "@slack/web-api";
import { env } from "../config/env.js";
import { llmText } from "../ai/llmClient.js";
import { getMetricTrend } from "../data/trends.js";
import {
  getProposalsDueForMeasurement,
  updateProposalStatus,
  upsertContext,
} from "./proposalStore.js";
import type { AgentProposal } from "./proposalStore.js";
import { getPersona } from "./registry.js";
import { buildOutcomeBlocks } from "./proposalBlocks.js";
import { logger } from "../observability/logger.js";

const slack = new WebClient(env.slackBotToken);

// ---------------------------------------------------------------------------
// Measure a single proposal
// ---------------------------------------------------------------------------

const measureProposal = async (proposal: AgentProposal): Promise<void> => {
  const persona = getPersona(proposal.agent_persona);
  if (!persona) {
    logger.warn({ proposalId: proposal.id }, "Unknown persona, skipping measurement");
    return;
  }

  // Get current metric value
  let actualValue: number | null = null;
  try {
    const trend = await getMetricTrend(proposal.target_metric, undefined);
    actualValue = trend?.current ?? null;
  } catch {
    logger.warn({ metric: proposal.target_metric }, "Could not fetch metric for measurement");
  }

  const actualDelta =
    actualValue !== null && proposal.baseline_value !== null
      ? actualValue - proposal.baseline_value
      : null;

  // Generate outcome analysis via LLM
  const prompt = `You are ${persona.displayName}. Analyze this proposal outcome:

Title: ${proposal.title}
Target metric: ${proposal.target_metric}
Baseline value: ${proposal.baseline_value ?? "unknown"}
Expected delta: ${proposal.expected_delta} (${proposal.delta_type})
Actual value now: ${actualValue ?? "unknown"}
Actual delta: ${actualDelta ?? "unknown"}

Write a brief outcome analysis (2-3 sentences):
- Did this meet, exceed, or miss expectations?
- What might explain the result?
- Should we double down, iterate, or abandon this approach?

Be data-driven and specific. Do not use em dashes.`;

  let analysis = "Outcome measurement completed.";
  try {
    const response = await llmText({
      taskType: "outcome_analysis",
      input: [{ role: "user", content: prompt }],
      metadata: { proposalId: proposal.id, persona: proposal.agent_persona },
    });
    analysis = response.outputText;
  } catch (err) {
    logger.error({ err }, "LLM outcome analysis failed");
  }

  // Update proposal with measurement
  await updateProposalStatus(proposal.id, "measured", {
    actual_value: actualValue,
    actual_delta: actualDelta,
    outcome_notes: analysis,
    measured_at: new Date().toISOString(),
  });

  // Store learning in agent_context
  const hit = actualDelta !== null && proposal.expected_delta !== null
    ? actualDelta >= proposal.expected_delta
    : false;

  await upsertContext(
    proposal.agent_persona,
    "observation",
    `outcome_${proposal.id.slice(0, 8)}`,
    {
      proposal_id: proposal.id,
      title: proposal.title,
      target_metric: proposal.target_metric,
      expected_delta: proposal.expected_delta,
      actual_delta: actualDelta,
      hit,
    },
    `Outcome for "${proposal.title}": expected ${proposal.expected_delta}, actual ${actualDelta}. ${hit ? "Hit target." : "Missed target."}`,
  );

  // Post follow-up in original Slack thread
  if (proposal.channel_id && proposal.message_ts) {
    const blocks = buildOutcomeBlocks(persona, { ...proposal, actual_value: actualValue, actual_delta: actualDelta }, analysis);
    try {
      await slack.chat.postMessage({
        channel: proposal.channel_id,
        thread_ts: proposal.message_ts,
        text: `${persona.emoji} Outcome report: ${proposal.title}`,
        blocks: blocks as any,
      });
    } catch (err) {
      logger.error({ err, proposalId: proposal.id }, "Failed to post outcome to Slack");
    }
  }

  logger.info(
    { proposalId: proposal.id, actualDelta, hit },
    "Proposal outcome measured",
  );
};

// ---------------------------------------------------------------------------
// Run all due measurements
// ---------------------------------------------------------------------------

export const runOutcomeChecker = async (): Promise<number> => {
  const due = await getProposalsDueForMeasurement();
  if (due.length === 0) {
    logger.info("No proposals due for measurement");
    return 0;
  }

  logger.info({ count: due.length }, "Measuring proposal outcomes");

  for (const proposal of due) {
    try {
      await measureProposal(proposal);
    } catch (err) {
      logger.error({ err, proposalId: proposal.id }, "Failed to measure proposal");
    }
  }

  return due.length;
};
