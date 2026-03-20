/**
 * Test script - fires all 4 agents immediately without waiting for scheduled hours.
 *
 * Usage: npx tsx src/agents/testRun.ts
 */

import { WebClient } from "@slack/web-api";
import { env } from "../config/env.js";
import { getPersona } from "./registry.js";
import {
  createProposal,
  updateProposalSlackTs,
} from "./proposalStore.js";
import {
  generateProposals,
  generateMorningPriorities,
} from "./proposalBuilder.js";
import {
  buildWorkLogBlocks,
  buildMorningPrioritiesBlocks,
} from "./proposalBlocks.js";
import { getMetricTrend } from "../data/trends.js";
import { logger } from "../observability/logger.js";

const slack = new WebClient(env.slackBotToken);
const channelId = env.agentQueueChannelId;

const captureBaseline = async (metric: string): Promise<number | null> => {
  try {
    const trend = await getMetricTrend(metric, undefined);
    return trend?.current ?? null;
  } catch {
    return null;
  }
};

const run = async () => {
  if (!channelId) {
    logger.error("AGENT_QUEUE_CHANNEL_ID not set");
    process.exit(1);
  }

  logger.info({ channelId }, "Starting test run - firing all agents");

  // 1. Marketing Manager - morning priorities
  const manager = getPersona("marketing_manager")!;
  logger.info("Generating morning priorities...");
  const priorities = await generateMorningPriorities(manager);
  const priorityBlocks = buildMorningPrioritiesBlocks(manager, priorities);
  await slack.chat.postMessage({
    channel: channelId,
    text: `${manager.emoji} Morning Priorities`,
    blocks: priorityBlocks as any,
  });
  logger.info("Morning priorities posted");

  // 2. Growth, Content, Strategy agents - proposals
  const agentIds = ["growth_agent", "content_agent", "strategy_agent"];
  for (const agentId of agentIds) {
    const persona = getPersona(agentId)!;
    logger.info({ agent: agentId }, "Generating proposals...");

    const drafts = await generateProposals(persona);
    for (const draft of drafts) {
      const baseline = await captureBaseline(draft.target_metric);
      draft.baseline_value = baseline;

      const proposal = await createProposal(draft, channelId);
      const blocks = buildWorkLogBlocks(persona, proposal);

      const result = await slack.chat.postMessage({
        channel: channelId,
        text: `${persona.emoji} ${proposal.title}`,
        blocks: blocks as any,
      });

      if (result.ts) {
        await updateProposalSlackTs(proposal.id, result.ts);
      }

      logger.info({ proposalId: proposal.id, title: proposal.title }, "Proposal posted");
    }
  }

  logger.info("Test run complete - all agents fired");
};

run().catch((err) => {
  logger.error({ err }, "Test run failed");
  process.exit(1);
});
