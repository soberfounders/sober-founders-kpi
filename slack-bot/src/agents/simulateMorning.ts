/**
 * Simulate the morning schedule (6:00am - 10:30am ET).
 * Fires each slot sequentially with a short delay between them
 * so you can watch them arrive in Slack in order.
 *
 * Usage: npx tsx src/agents/simulateMorning.ts
 */

import { WebClient } from "@slack/web-api";
import { env } from "../config/env.js";
import { getPersona } from "./registry.js";
import type { AgentPersona } from "./registry.js";
import {
  createProposal,
  updateProposalSlackTs,
  getTodayProposalCount,
  getStalePendingProposals,
} from "./proposalStore.js";
import {
  generateProposals,
  generateMorningDigest,
  generateMiddayDigest,
  generateNudgeMessage,
} from "./proposalBuilder.js";
import {
  buildWorkLogBlocks,
  buildDigestBlocks,
  buildNudgeBlocks,
} from "./proposalBlocks.js";
import { getMetricTrend } from "../data/trends.js";
import { logger } from "../observability/logger.js";

const slack = new WebClient(env.slackBotToken);

const getMmChannel = (): string =>
  env.marketingManagerChannelId || env.agentQueueChannelId;
const getWorkLogChannel = (): string => env.agentQueueChannelId;

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

const captureBaseline = async (metric: string): Promise<number | null> => {
  try {
    const trend = await getMetricTrend(metric, undefined);
    return trend?.current ?? null;
  } catch {
    return null;
  }
};

const fireProposals = async (persona: AgentPersona): Promise<void> => {
  const channelId = getWorkLogChannel();
  if (!channelId) return;

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
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The morning slots we want to simulate (6:00am - 10:30am ET)
const MORNING_SLOTS: Array<{ time: string; label: string; run: () => Promise<void> }> = [
  {
    time: "06:00",
    label: "Growth Agent proposal",
    run: async () => {
      const persona = getPersona("growth_agent")!;
      await fireProposals(persona);
    },
  },
  {
    time: "06:30",
    label: "Content Agent proposal",
    run: async () => {
      const persona = getPersona("content_agent")!;
      await fireProposals(persona);
    },
  },
  {
    time: "07:00",
    label: "Strategy Agent proposal",
    run: async () => {
      const persona = getPersona("strategy_agent")!;
      await fireProposals(persona);
    },
  },
  {
    time: "07:30",
    label: "Growth Agent proposal",
    run: async () => {
      const persona = getPersona("growth_agent")!;
      await fireProposals(persona);
    },
  },
  {
    time: "08:00",
    label: "MM: Morning Briefing -> #marketing-manager",
    run: async () => {
      const manager = getPersona("marketing_manager")!;
      const mmChannel = getMmChannel();
      const workLogChannel = getWorkLogChannel();

      const digest = await generateMorningDigest(manager);
      const blocks = buildDigestBlocks(manager, digest, "morning");
      await slack.chat.postMessage({
        channel: mmChannel,
        text: `${manager.emoji} Morning Briefing`,
        blocks: blocks as any,
      });

      if (workLogChannel !== mmChannel) {
        await slack.chat.postMessage({
          channel: workLogChannel,
          text: `${manager.emoji} Morning briefing posted to #marketing-manager. ${digest.needsInput.length} items need founder input.`,
        });
      }
    },
  },
  {
    time: "08:30",
    label: "Growth Agent proposal",
    run: async () => {
      const persona = getPersona("growth_agent")!;
      await fireProposals(persona);
    },
  },
  {
    time: "09:00",
    label: "Content Agent proposal",
    run: async () => {
      const persona = getPersona("content_agent")!;
      await fireProposals(persona);
    },
  },
  {
    time: "09:30",
    label: "Strategy Agent proposal",
    run: async () => {
      const persona = getPersona("strategy_agent")!;
      await fireProposals(persona);
    },
  },
  {
    time: "10:00",
    label: "MM: Follow-up nudge (if stale proposals)",
    run: async () => {
      const stale = await getStalePendingProposals(STALE_THRESHOLD_MS);
      if (stale.length === 0) {
        logger.info("No stale proposals, skipping nudge");
        return;
      }
      const manager = getPersona("marketing_manager")!;
      const mmChannel = getMmChannel();
      const nudgeText = await generateNudgeMessage(manager, stale);
      const blocks = buildNudgeBlocks(manager, nudgeText, stale);
      await slack.chat.postMessage({
        channel: mmChannel,
        text: `${manager.emoji} ${stale.length} item(s) waiting for your input`,
        blocks: blocks as any,
      });
    },
  },
  {
    time: "10:30",
    label: "Growth Agent proposal",
    run: async () => {
      const persona = getPersona("growth_agent")!;
      await fireProposals(persona);
    },
  },
];

const run = async () => {
  const workLogChannel = getWorkLogChannel();
  const mmChannel = getMmChannel();

  if (!workLogChannel) {
    logger.error("AGENT_QUEUE_CHANNEL_ID not set");
    process.exit(1);
  }

  logger.info(
    { workLogChannel, mmChannel, slots: MORNING_SLOTS.length },
    "Starting morning simulation (6:00am - 10:30am ET)",
  );

  for (const slot of MORNING_SLOTS) {
    logger.info(`\n--- [${slot.time} ET] ${slot.label} ---`);
    try {
      await slot.run();
      logger.info(`    [${slot.time}] Done`);
    } catch (err: any) {
      logger.error({ err: err?.message || String(err) }, `    [${slot.time}] FAILED`);
    }
    // 3 second pause between slots so messages arrive in order
    await sleep(3000);
  }

  logger.info("\nMorning simulation complete!");
};

run().catch((err) => {
  logger.error({ err }, "Morning simulation failed");
  process.exit(1);
});
