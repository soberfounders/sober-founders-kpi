/**
 * Agent Queue Scheduler.
 *
 * Two-channel architecture:
 *   #agent-queue          - Work log (read-only). Sub-agents post activity here.
 *                           No approve/deny buttons. User can reply in threads
 *                           to give feedback and agents will act on it.
 *   #marketing-manager    - Curated. Only the Marketing Manager posts here
 *                           with batched, tiered digests and follow-up nudges.
 *
 * Schedule (ET, 6am-5pm for full coverage):
 *   06:00 - Growth Agent proposal           -> #agent-queue
 *   06:30 - Content Agent proposal          -> #agent-queue
 *   07:00 - Strategy Agent proposal         -> #agent-queue
 *   07:30 - Growth Agent proposal           -> #agent-queue
 *   08:00 - MM: Morning Briefing           -> #marketing-manager
 *   08:30 - Growth Agent proposal           -> #agent-queue
 *   09:00 - Content Agent proposal          -> #agent-queue
 *   09:30 - Strategy Agent proposal         -> #agent-queue
 *   10:00 - MM: Follow-up nudge (if stale) -> #marketing-manager
 *   10:30 - Growth Agent proposal           -> #agent-queue
 *   11:00 - Content Agent proposal          -> #agent-queue
 *   11:30 - Strategy Agent proposal         -> #agent-queue
 *   12:00 - MM: Midday Check-in            -> #marketing-manager
 *   12:30 - Growth Agent proposal           -> #agent-queue
 *   13:00 - Content Agent proposal          -> #agent-queue
 *   13:30 - Strategy Agent proposal         -> #agent-queue
 *   14:00 - MM: Follow-up nudge (if stale) -> #marketing-manager
 *   14:30 - Content Agent proposal          -> #agent-queue
 *   15:00 - MM: Afternoon Briefing         -> #marketing-manager
 *   15:30 - Growth Agent proposal           -> #agent-queue
 *   16:00 - Strategy Agent: outcome checker -> #agent-queue
 *   16:30 - Content Agent proposal          -> #agent-queue
 *   17:00 - MM: EOD Recap                  -> #marketing-manager
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
  generateEodDigest,
  generateNudgeMessage,
} from "./proposalBuilder.js";
import {
  buildWorkLogBlocks,
  buildDigestBlocks,
  buildNudgeBlocks,
} from "./proposalBlocks.js";
import { runOutcomeChecker } from "./outcomeChecker.js";
import { getMetricTrend } from "../data/trends.js";
import { invokeMasterSync } from "../clients/supabase.js";
import { logger } from "../observability/logger.js";

const slack = new WebClient(env.slackBotToken);

// In-memory dedup: "slot:YYYY-MM-DD" where slot = "HH:MM"
const fired = new Set<string>();

// Stale threshold for nudges: proposals pending > 2 hours
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Channel helpers
// ---------------------------------------------------------------------------

/** Returns the #marketing-manager channel, falling back to #agent-queue. */
const getMmChannel = (): string =>
  env.marketingManagerChannelId || env.agentQueueChannelId;

const getWorkLogChannel = (): string => env.agentQueueChannelId;

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
// 30-minute rotation schedule (ET, 6am-5pm)
// ---------------------------------------------------------------------------

type SlotAction =
  | { type: "persona"; personaId: string }
  | { type: "morning_digest" }
  | { type: "midday_digest" }
  | { type: "afternoon_digest" }
  | { type: "eod_digest" }
  | { type: "nudge" }
  | { type: "notion_sync" }
  | { type: "outcome_check_then_propose"; personaId: string };

const SLOT_SCHEDULE: Record<string, SlotAction> = {
  // --- Early morning: agents get a head start before you're online ---
  "06:00": { type: "persona", personaId: "growth_agent" },
  "06:30": { type: "persona", personaId: "content_agent" },
  "07:00": { type: "persona", personaId: "strategy_agent" },
  "07:30": { type: "persona", personaId: "growth_agent" },

  // --- Core hours: MM digests + agents ---
  "08:00": { type: "morning_digest" },
  "08:30": { type: "persona", personaId: "growth_agent" },
  "09:00": { type: "persona", personaId: "content_agent" },
  "09:30": { type: "persona", personaId: "strategy_agent" },
  "10:00": { type: "nudge" },
  "10:30": { type: "persona", personaId: "growth_agent" },
  "11:00": { type: "persona", personaId: "content_agent" },
  "11:30": { type: "persona", personaId: "strategy_agent" },
  "12:00": { type: "midday_digest" },
  "12:30": { type: "persona", personaId: "growth_agent" },
  "13:00": { type: "persona", personaId: "content_agent" },
  "13:30": { type: "persona", personaId: "strategy_agent" },
  "14:00": { type: "nudge" },
  "14:30": { type: "persona", personaId: "content_agent" },

  // --- Afternoon wrap: you're usually off by 3pm ---
  "15:00": { type: "afternoon_digest" },
  "15:30": { type: "persona", personaId: "growth_agent" },
  "16:00": { type: "outcome_check_then_propose", personaId: "strategy_agent" },
  "16:30": { type: "persona", personaId: "content_agent" },
  "17:00": { type: "eod_digest" },
};

// ---------------------------------------------------------------------------
// Sync Notion tasks so the bot has up-to-date status
// ---------------------------------------------------------------------------

const syncNotionTasks = async (): Promise<void> => {
  try {
    await invokeMasterSync({ action: "sync_notion" });
    logger.info("Notion tasks synced successfully");
  } catch (err) {
    logger.error({ err }, "Failed to sync Notion tasks (continuing with stale data)");
  }
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
// Fire a single persona's proposal cycle -> #agent-queue (work log, no buttons)
// ---------------------------------------------------------------------------

const fireProposals = async (persona: AgentPersona): Promise<void> => {
  const channelId = getWorkLogChannel();
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
    // Work log: no approve/deny buttons, just informational
    const blocks = buildWorkLogBlocks(persona, proposal);
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
      "Proposal posted to agent queue (work log)",
    );
  }
};

// ---------------------------------------------------------------------------
// Execute a slot action
// ---------------------------------------------------------------------------

const executeSlot = async (action: SlotAction): Promise<void> => {
  const workLogChannel = getWorkLogChannel();
  const mmChannel = getMmChannel();

  if (!workLogChannel) {
    logger.warn("AGENT_QUEUE_CHANNEL_ID not set, skipping slot execution");
    return;
  }

  switch (action.type) {
    // ----- Marketing Manager digests -> #marketing-manager -----

    case "morning_digest": {
      // Sync Notion tasks before the briefing so task list is current
      await syncNotionTasks();
      const manager = getPersona("marketing_manager")!;
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

      logger.info({ channel: mmChannel, needsInput: digest.needsInput.length }, "Morning digest posted");
      break;
    }

    case "midday_digest": {
      await syncNotionTasks();
      const manager = getPersona("marketing_manager")!;
      const digest = await generateMiddayDigest(manager);
      const blocks = buildDigestBlocks(manager, digest, "midday");
      await slack.chat.postMessage({
        channel: mmChannel,
        text: `${manager.emoji} Midday Check-in`,
        blocks: blocks as any,
      });

      if (workLogChannel !== mmChannel) {
        await slack.chat.postMessage({
          channel: workLogChannel,
          text: `${manager.emoji} Midday check-in posted to #marketing-manager. ${digest.needsInput.length} items pending.`,
        });
      }

      logger.info({ channel: mmChannel, needsInput: digest.needsInput.length }, "Midday digest posted");
      break;
    }

    case "afternoon_digest": {
      await syncNotionTasks();
      const manager = getPersona("marketing_manager")!;
      const digest = await generateMiddayDigest(manager);
      const blocks = buildDigestBlocks(manager, digest, "afternoon");
      await slack.chat.postMessage({
        channel: mmChannel,
        text: `${manager.emoji} Afternoon Wrap-up`,
        blocks: blocks as any,
      });

      if (workLogChannel !== mmChannel) {
        await slack.chat.postMessage({
          channel: workLogChannel,
          text: `${manager.emoji} Afternoon wrap-up posted to #marketing-manager. ${digest.needsInput.length} items pending.`,
        });
      }

      logger.info({ channel: mmChannel, needsInput: digest.needsInput.length }, "Afternoon digest posted");
      break;
    }

    case "eod_digest": {
      await syncNotionTasks();
      const manager = getPersona("marketing_manager")!;
      const digest = await generateEodDigest(manager);
      const blocks = buildDigestBlocks(manager, digest, "eod");
      await slack.chat.postMessage({
        channel: mmChannel,
        text: `${manager.emoji} End of Day Recap`,
        blocks: blocks as any,
      });

      if (workLogChannel !== mmChannel) {
        await slack.chat.postMessage({
          channel: workLogChannel,
          text: `${manager.emoji} EOD recap posted to #marketing-manager. ${digest.completed.length} completed, ${digest.needsInput.length} still pending.`,
        });
      }

      logger.info({ channel: mmChannel, completed: digest.completed.length }, "EOD digest posted");
      break;
    }

    // ----- Follow-up nudge -> #marketing-manager -----

    case "nudge": {
      const stale = await getStalePendingProposals(STALE_THRESHOLD_MS);
      if (stale.length === 0) {
        logger.info("No stale proposals, skipping nudge");
        break;
      }

      const manager = getPersona("marketing_manager")!;
      const nudgeText = await generateNudgeMessage(manager, stale);
      const blocks = buildNudgeBlocks(manager, nudgeText, stale);
      await slack.chat.postMessage({
        channel: mmChannel,
        text: `${manager.emoji} ${stale.length} item(s) waiting for your input`,
        blocks: blocks as any,
      });

      logger.info({ channel: mmChannel, staleCount: stale.length }, "Nudge posted");
      break;
    }

    // ----- Standalone Notion sync (keeps task list fresh between digests) -----

    case "notion_sync": {
      await syncNotionTasks();
      break;
    }

    // ----- Sub-agent proposals -> #agent-queue (work log) -----

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

    const mmCh = env.marketingManagerChannelId ? "#marketing-manager" : "(fallback to #agent-queue)";
    logger.info({ mmChannel: mmCh }, "Agent queue scheduler started (two-channel mode, 6am-5pm ET)");
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
      if (!action) return; // Outside scheduled hours or not a scheduled slot

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
