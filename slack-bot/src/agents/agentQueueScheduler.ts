/**
 * Agent Queue Scheduler.
 *
 * Runs on a 30-minute cadence, rotating through agent personas so the channel
 * always has a fresh suggestion tied to the big-picture goals:
 *   1. Get people into Phoenix Forum (paid membership)
 *   2. Get people to show up to mastermind groups
 *   3. Get them to repeat and come back
 *
 * Schedule (ET business hours, every 30 min):
 *   8:00  - Marketing Manager: morning priorities
 *   8:30  - Growth Agent
 *   9:00  - Content Agent
 *   9:30  - Strategy Agent
 *   10:00 - Growth Agent
 *   10:30 - Content Agent
 *   11:00 - Strategy Agent
 *   11:30 - Growth Agent
 *   12:00 - Marketing Manager: midday check-in
 *   12:30 - Growth Agent
 *   13:00 - Content Agent
 *   13:30 - Strategy Agent
 *   14:00 - Growth Agent
 *   14:30 - Content Agent
 *   15:00 - Strategy Agent
 *   15:30 - Growth Agent
 *   16:00 - Strategy Agent: outcome checker
 *   16:30 - Content Agent
 *   17:00 - Marketing Manager: EOD recap
 */

import { WebClient } from "@slack/web-api";
import { env } from "../config/env.js";
import { getPersona, ALL_PERSONA_IDS } from "./registry.js";
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
  generateMiddayCheckin,
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

// In-memory dedup: "slot:YYYY-MM-DD" where slot = "HH:MM"
const fired = new Set<string>();

// ---------------------------------------------------------------------------
// ET time helpers
// ---------------------------------------------------------------------------

const getEtNow = (): { hour: number; minute: number; dateKey: string } => {
  const now = new Date();
  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etDate = new Date(etString);
  return {
    hour: etDate.getHours(),
    minute: etDate.getMinutes(),
    dateKey: `${etDate.getFullYear()}-${String(etDate.getMonth() + 1).padStart(2, "0")}-${String(etDate.getDate()).padStart(2, "0")}`,
  };
};

/** Returns "HH:00" or "HH:30" for the current 30-min slot */
const getSlotKey = (hour: number, minute: number): string => {
  const half = minute < 30 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${half}`;
};

// ---------------------------------------------------------------------------
// 30-minute rotation schedule (ET)
// Maps "HH:MM" -> persona id (or special action)
// ---------------------------------------------------------------------------

type SlotAction =
  | { type: "persona"; personaId: string }
  | { type: "morning_priorities" }
  | { type: "midday_checkin" }
  | { type: "eod_recap" }
  | { type: "outcome_check_then_propose"; personaId: string };

const SLOT_SCHEDULE: Record<string, SlotAction> = {
  "08:00": { type: "morning_priorities" },
  "08:30": { type: "persona", personaId: "growth_agent" },
  "09:00": { type: "persona", personaId: "content_agent" },
  "09:30": { type: "persona", personaId: "strategy_agent" },
  "10:00": { type: "persona", personaId: "growth_agent" },
  "10:30": { type: "persona", personaId: "content_agent" },
  "11:00": { type: "persona", personaId: "strategy_agent" },
  "11:30": { type: "persona", personaId: "growth_agent" },
  "12:00": { type: "midday_checkin" },
  "12:30": { type: "persona", personaId: "growth_agent" },
  "13:00": { type: "persona", personaId: "content_agent" },
  "13:30": { type: "persona", personaId: "strategy_agent" },
  "14:00": { type: "persona", personaId: "growth_agent" },
  "14:30": { type: "persona", personaId: "content_agent" },
  "15:00": { type: "persona", personaId: "strategy_agent" },
  "15:30": { type: "persona", personaId: "growth_agent" },
  "16:00": { type: "outcome_check_then_propose", personaId: "strategy_agent" },
  "16:30": { type: "persona", personaId: "content_agent" },
  "17:00": { type: "eod_recap" },
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
// Fire a single persona's proposal cycle
// ---------------------------------------------------------------------------

const fireProposals = async (persona: AgentPersona): Promise<void> => {
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

  const drafts = await generateProposals(persona);

  for (const draft of drafts) {
    const baseline = await captureBaseline(draft.target_metric);
    draft.baseline_value = baseline;

    const proposal = await createProposal(draft, channelId);
    const blocks = buildProposalBlocks(persona, proposal);
    const result = await slack.chat.postMessage({
      channel: channelId,
      text: `${persona.emoji} ${proposal.title}`,
      blocks: blocks as any,
    });

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
// Execute a slot action
// ---------------------------------------------------------------------------

const executeSlot = async (action: SlotAction): Promise<void> => {
  const channelId = env.agentQueueChannelId;
  if (!channelId) {
    logger.warn("AGENT_QUEUE_CHANNEL_ID not set, skipping slot execution");
    return;
  }

  switch (action.type) {
    case "morning_priorities": {
      const manager = getPersona("marketing_manager")!;
      const priorities = await generateMorningPriorities(manager);
      const blocks = buildMorningPrioritiesBlocks(manager, priorities);
      await slack.chat.postMessage({
        channel: channelId,
        text: `${manager.emoji} Morning Priorities`,
        blocks: blocks as any,
      });
      logger.info("Morning priorities posted");
      break;
    }

    case "midday_checkin": {
      const manager = getPersona("marketing_manager")!;
      const checkin = await generateMiddayCheckin(manager);
      const blocks = buildMorningPrioritiesBlocks(manager, checkin);
      await slack.chat.postMessage({
        channel: channelId,
        text: `${manager.emoji} Midday Check-in`,
        blocks: blocks as any,
      });
      logger.info("Midday check-in posted");
      break;
    }

    case "eod_recap": {
      const manager = getPersona("marketing_manager")!;
      const recap = await generateEodRecap(manager);
      const blocks = buildRecapBlocks(manager, recap);
      await slack.chat.postMessage({
        channel: channelId,
        text: `${manager.emoji} End of Day Recap`,
        blocks: blocks as any,
      });
      logger.info("EOD recap posted");
      break;
    }

    case "outcome_check_then_propose": {
      const measured = await runOutcomeChecker();
      logger.info({ measured }, "Outcome checker complete");
      const persona = getPersona(action.personaId);
      if (persona) await fireProposals(persona);
      break;
    }

    case "persona": {
      const persona = getPersona(action.personaId);
      if (persona) await fireProposals(persona);
      break;
    }
  }
};

// ---------------------------------------------------------------------------
// Scheduler (polls every 60s, fires on 30-min boundaries)
// ---------------------------------------------------------------------------

export class AgentQueueScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (!env.agentQueueEnabled) {
      logger.info("Agent queue disabled (AGENT_QUEUE_ENABLED=false)");
      return;
    }

    logger.info("Agent queue scheduler started (30-min cadence)");
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
      const { hour, minute, dateKey } = getEtNow();
      const slotKey = getSlotKey(hour, minute);
      const dedupKey = `${slotKey}:${dateKey}`;

      if (fired.has(dedupKey)) return;

      const action = SLOT_SCHEDULE[slotKey];
      if (!action) return; // Outside business hours or not a scheduled slot

      fired.add(dedupKey);
      logger.info({ slotKey, action }, "Firing agent queue slot");

      try {
        await executeSlot(action);
      } catch (err) {
        logger.error({ err, slotKey }, "Agent queue slot execution failed");
      }
    } catch (err) {
      logger.error({ err }, "Agent queue scheduler tick failed");
    }
  }
}
