/**
 * Handles thread replies in #agent-queue.
 * When a user replies in a proposal thread, the agent persona responds
 * and captures any modifications to the proposal.
 */

import type { App } from "@slack/bolt";
import { env } from "../../config/env.js";
import { llmText } from "../../ai/llmClient.js";
import { getProposalByMessageTs, updateProposalStatus } from "../../agents/proposalStore.js";
import { getPersona } from "../../agents/registry.js";
import { logger } from "../../observability/logger.js";

export const registerAgentThreadHandler = (app: App): void => {
  app.message(async ({ message, client, context }) => {
    const payload = message as unknown as Record<string, unknown>;

    // Only handle threaded messages (has thread_ts)
    if (payload.subtype || payload.bot_id) return;
    if (!payload.thread_ts) return;

    const channelId = String(payload.channel || "");
    if (!channelId || channelId !== env.agentQueueChannelId) return;

    const threadTs = String(payload.thread_ts);
    const userText = String(payload.text || "").trim();
    if (!userText) return;

    logger.info({ channelId, threadTs, userText: userText.slice(0, 80) }, "Agent thread reply received");

    // Look up the proposal by the thread root message_ts
    const proposal = await getProposalByMessageTs(channelId, threadTs);
    if (!proposal) {
      logger.info({ threadTs }, "No proposal found for thread_ts - not a proposal thread");
      return;
    }

    const persona = getPersona(proposal.agent_persona);
    if (!persona) return;

    logger.info(
      { proposalId: proposal.id, persona: persona.id, userText },
      "Thread reply in proposal thread",
    );

    // Capture user modification if proposal is still pending
    if (proposal.status === "proposed") {
      await updateProposalStatus(proposal.id, "proposed", {
        user_modifications: userText,
      });
    }

    // Generate a conversational response as the agent persona
    try {
      const systemPrompt = `You are ${persona.displayName} (${persona.emoji}), a marketing agent for Sober Founders. ${persona.systemPromptAddendum}

You're discussing this proposal:
Title: ${proposal.title}
Description: ${proposal.description}
Target metric: ${proposal.target_metric}
Expected delta: ${proposal.expected_delta} (${proposal.delta_type})

Respond conversationally. Be direct and specific. If the user gives feedback or modifications, acknowledge them and adjust your recommendation. Do not use em dashes. Keep it concise.`;

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

      logger.info({ proposalId: proposal.id }, "Thread response posted to Slack");
    } catch (err: any) {
      logger.error({ err: err?.message || String(err), proposalId: proposal.id }, "Failed to respond in proposal thread");
    }
  });
};
