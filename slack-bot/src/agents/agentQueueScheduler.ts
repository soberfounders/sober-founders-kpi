/**
 * Agent Queue Scheduler.
 * Polls every 60 seconds, checks the current ET hour against persona schedules,
 * and fires proposal generation + posting for matching personas.
 */

import { WebClient } from "@slack/web-api";
import { env } from "../config/env.js";
import { getPersonasForHour, getPersona } from "./registry.js";
import type { AgentPersona } from "./registry.js";
import {
  createProposal,
  updateProposalSlackTs,
  getTodayProposalCount,
} from "./proposalStore.js";
import {
  generateProposals,
  generateMorningPriorities,
  generateEodRecap,
} from "./proposalBuilder.js";
import {
  buildProposalBlocks,
  buildMorningPrioritiesBlocks,
  buildRecapBlocks,
} from "./proposalBlocks.js";
import { runOutcomeChecker } from "./outcomeChecker.js";
import { getMetricTrend } from "../data/trends.js";
import { logger } from "../observability/logger.js";

const slack = new WebClient(env.slackBotToken);

// In-memory dedup: "persona:hour:YYYY-MM-DD"
const fired = new Set<string>();

const getEtHour = (): number => {
  const now = new Date();
  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(etString).getHours();
};

const getEtDateKey = (): string => {
  const now = new Date();
  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etDate = new Date(etString);
  return `${etDate.getFullYear()}-${String(etDate.getMonth() + 1).padStart(2, "0")}-${String(etDate.getDate()).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------
// Capture baseline for a proposal's target metric
// ---------------------------------------------------------------------------

const captureBaseline = async (metric: string): Promise<number | null> => {
  try {
    const trend = await getMetricTrend(metric, undefined);
    return trend?.current ?? null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Fire a single persona
// ---------------------------------------------------------------------------

const firePersona = async (persona: AgentPersona, etHour: number): Promise<void> => {
  const channelId = env.agentQueueChannelId;
  if (!channelId) {
    logger.warn("AGENT_QUEUE_CHANNEL_ID not set, skipping agent fire");
    return;
  }

  // Check daily limit
  const todayCount = await getTodayProposalCount(persona.id);
  if (todayCount >= persona.maxDailyProposals) {
    logger.info({ persona: persona.id, todayCount }, "Daily proposal limit reached");
    return;
  }

  // Special handling: Marketing Manager 8am = morning priorities
  if (persona.id === "marketing_manager" && etHour === 8) {
    const priorities = await generateMorningPriorities(persona);
    const blocks = buildMorningPrioritiesBlocks(persona, priorities);
    await slack.chat.postMessage({
      channel: channelId,
      text: `${persona.emoji} Morning Priorities`,
      blocks: blocks as any,
    });
    logger.info("Marketing Manager morning priorities posted");
    return;
  }

  // Special handling: Marketing Manager 5pm = EOD recap
  if (persona.id === "marketing_manager" && etHour === 17) {
    const recap = await generateEodRecap(persona);
    const blocks = buildRecapBlocks(persona, recap);
    await slack.chat.postMessage({
      channel: channelId,
      text: `${persona.emoji} End of Day Recap`,
      blocks: blocks as any,
    });
    logger.info("Marketing Manager EOD recap posted");
    return;
  }

  // Special handling: Strategy Agent 4pm = outcome checker
  if (persona.id === "strategy_agent" && etHour === 16) {
    const measured = await runOutcomeChecker();
    logger.info({ measured }, "Strategy Agent outcome checker complete");
    // Also generate regular proposals after outcome check
  }

  // Generate and post proposals
  const drafts = await generateProposals(persona);

  for (const draft of drafts) {
    // Capture baseline
    const baseline = await captureBaseline(draft.target_metric);
    draft.baseline_value = baseline;

    // Store in database
    const proposal = await createProposal(draft, channelId);

    // Build and post Slack message
    const blocks = buildProposalBlocks(persona, proposal);
    const result = await slack.chat.postMessage({
      channel: channelId,
      text: `${persona.emoji} ${proposal.title}`,
      blocks: blocks as any,
    });

    // Save message timestamp for thread replies
    if (result.ts) {
      await updateProposalSlackTs(proposal.id, result.ts);
    }

    logger.info(
      { proposalId: proposal.id, title: proposal.title },
      "Proposal posted to agent queue",
    );
  }
};

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export class AgentQueueScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (!env.agentQueueEnabled) {
      logger.info("Agent queue disabled (AGENT_QUEUE_ENABLED=false)");
      return;
    }

    logger.info("Agent queue scheduler started");
    this.timer = setInterval(() => void this.tick(), 60_000);
    // Also run immediately on start
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("Agent queue scheduler stopped");
    }
  }

  private async tick(): Promise<void> {
    try {
      const etHour = getEtHour();
      const dateKey = getEtDateKey();
      const personas = getPersonasForHour(etHour);

      for (const persona of personas) {
        const dedupKey = `${persona.id}:${etHour}:${dateKey}`;
        if (fired.has(dedupKey)) continue;

        fired.add(dedupKey);
        logger.info({ persona: persona.id, etHour }, "Firing agent persona");

        try {
          await firePersona(persona, etHour);
        } catch (err) {
          logger.error({ err, persona: persona.id }, "Agent persona fire failed");
        }
      }
    } catch (err) {
      logger.error({ err }, "Agent queue scheduler tick failed");
    }
  }
}
