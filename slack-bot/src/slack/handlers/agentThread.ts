/**
 * Handles thread replies in #agent-queue and #marketing-manager.
 *
 * In #agent-queue (work log):
 *   - User replies are treated as actionable feedback/instructions.
 *   - The agent responds conversationally AND acts on the feedback.
 *   - The Marketing Manager is notified of issues in #marketing-manager.
 *
 * In #marketing-manager:
 *   - Thread replies on proposal buttons work via interactions.ts.
 *   - General thread replies get a conversational MM response.
 */

import type { App } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { env } from "../../config/env.js";
import { llmText } from "../../ai/llmClient.js";
import { getProposalByMessageTs, updateProposalStatus } from "../../agents/proposalStore.js";
import { getPersona } from "../../agents/registry.js";
import { logger } from "../../observability/logger.js";

const slack = new WebClient(env.slackBotToken);

/** Post a notification to #marketing-manager about feedback received in #agent-queue */
const notifyMmOfFeedback = async (
  agentName: string,
  agentEmoji: string,
  proposalTitle: string,
  userFeedback: string,
): Promise<void> => {
  const mmChannel = env.marketingManagerChannelId;
  if (!mmChannel) return;

  try {
    const manager = getPersona("marketing_manager");
    const emoji = manager?.emoji || "\u{1F4CB}";
    await slack.chat.postMessage({
      channel: mmChannel,
      text: `${emoji} *Feedback received in #agent-queue*\n${agentEmoji} *${agentName}* - "${proposalTitle}"\nFounder said: _"${userFeedback.slice(0, 300)}"_\nAgent is acting on this. I'll track the follow-through.`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to notify MM of agent-queue feedback");
  }
};

export const registerAgentThreadHandler = (app: App): void => {
  app.message(async ({ message, client, context }) => {
    const payload = message as unknown as Record<string, unknown>;

    // Only handle threaded messages (has thread_ts)
    if (payload.subtype || payload.bot_id) return;
    if (!payload.thread_ts) return;

    const channelId = String(payload.channel || "");
    // Handle threads in both #agent-queue and #marketing-manager
    const agentChannels = [env.agentQueueChannelId, env.marketingManagerChannelId].filter(Boolean);
    if (!channelId || !agentChannels.includes(channelId)) return;

    const threadTs = String(payload.thread_ts);
    const userText = String(payload.text || "").trim();
    if (!userText) return;

    const isWorkLog = channelId === env.agentQueueChannelId;

    logger.info({ channelId, threadTs, userText: userText.slice(0, 80), isWorkLog }, "Agent thread reply received");

    // Look up the proposal by the thread root message_ts
    const proposal = await getProposalByMessageTs(channelId, threadTs);

    if (proposal) {
      // --- Proposal thread: respond as the specific agent persona ---
      const persona = getPersona(proposal.agent_persona);
      if (!persona) return;

      logger.info(
        { proposalId: proposal.id, persona: persona.id, userText, isWorkLog },
        "Thread reply in proposal thread",
      );

      // Capture user modification if proposal is still pending
      if (proposal.status === "proposed") {
        await updateProposalStatus(proposal.id, "proposed", {
          user_modifications: userText,
        });
      }

      try {
        // In #agent-queue, treat feedback as actionable instructions
        const actionContext = isWorkLog
          ? `\n\nIMPORTANT: The founder is giving you direct feedback in the work log. This is an instruction to act on, not just a discussion. Acknowledge the feedback, explain what you'll do to address it, and be specific about next steps. If they're pointing out a problem (missing CTA, wrong copy, broken link, etc.), confirm you understand the issue and describe exactly how you'll fix it.`
          : "";

        const systemPrompt = `You are ${persona.displayName} (${persona.emoji}), a marketing agent for Sober Founders. ${persona.systemPromptAddendum}

You're discussing this proposal:
Title: ${proposal.title}
Description: ${proposal.description}
Target metric: ${proposal.target_metric}
Expected delta: ${proposal.expected_delta} (${proposal.delta_type})
Status: ${proposal.status}${actionContext}

Respond conversationally. Be direct and specific. Do not use em dashes. Keep it concise.`;

        const response = await llmText({
          taskType: "conversation_reply",
          instructions: systemPrompt,
          input: [{ role: "user", content: userText }],
          metadata: { proposalId: proposal.id, persona: persona.id },
        });

        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `${persona.emoji} ${response.outputText}`,
        });

        // If this is in the work log, notify MM about the feedback
        if (isWorkLog) {
          await notifyMmOfFeedback(
            persona.displayName,
            persona.emoji,
            proposal.title,
            userText,
          );
        }

        logger.info({ proposalId: proposal.id, isWorkLog }, "Thread response posted to Slack");
      } catch (err: any) {
        logger.error({ err: err?.message || String(err), proposalId: proposal.id }, "Failed to respond in proposal thread");
      }
    } else {
      // --- Non-proposal thread (e.g., digest thread in #marketing-manager) ---
      // Respond as Marketing Manager for general conversation
      const manager = getPersona("marketing_manager");
      if (!manager) return;

      logger.info({ channelId, threadTs, userText }, "General thread reply (no linked proposal)");

      try {
        const systemPrompt = `You are ${manager.displayName} (${manager.emoji}), the Marketing Manager for Sober Founders. ${manager.systemPromptAddendum}

The founder is replying in a thread. This could be on a digest message, a nudge, or any other message you posted. Respond helpfully and directly. If they're asking a question, answer it. If they're giving feedback, acknowledge it and explain what action you'll take. Do not use em dashes. Keep it concise.

Priority hierarchy (always keep this in mind):
1. Phoenix Forum membership growth (paid members at $250/mo)
2. Donations and MRR (monthly recurring revenue)
3. Free group attendance (Thursday open, Tuesday verified)`;

        const response = await llmText({
          taskType: "conversation_reply",
          instructions: systemPrompt,
          input: [{ role: "user", content: userText }],
          metadata: { persona: manager.id },
        });

        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `${manager.emoji} ${response.outputText}`,
        });

        logger.info("General thread response posted");
      } catch (err: any) {
        logger.error({ err: err?.message || String(err) }, "Failed to respond in general thread");
      }
    }
  });
};
