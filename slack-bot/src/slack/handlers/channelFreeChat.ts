import type { App } from "@slack/bolt";
import { env } from "../../config/env.js";
import { handlePromptRequest } from "./events.js";
import { presentNextProposal } from "./interactions.js";
import { getPersona } from "../../agents/registry.js";
import { llmText } from "../../ai/llmClient.js";
import { logger } from "../../observability/logger.js";

const removeMentions = (text: string): string => text.replace(/<@[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Check if user text signals "what's next" / "next idea" */
const isNextIdeaRequest = (text: string): boolean => {
  const lower = text.toLowerCase().trim();
  return /\b(what'?s next|next idea|next one|what else|another idea|more ideas|anything else|whats next)\b/.test(lower);
};

export const registerChannelFreeChatHandler = (app: App): void => {
  app.message(async ({ message, say, client, context }) => {
    const payload = message as unknown as Record<string, unknown>;
    if (payload.subtype || payload.bot_id) return;

    const channelType = String(payload.channel_type || "");
    if (!["channel", "group"].includes(channelType)) return;

    const channelId = String(payload.channel || "");
    // Allow free chat in designated channels, agent queue, and marketing-manager
    const isFreeChatChannel = env.freeChatChannelIds.includes(channelId);
    const isAgentQueueChannel = env.agentQueueChannelId && channelId === env.agentQueueChannelId;
    const isMarketingManagerChannel = env.marketingManagerChannelId && channelId === env.marketingManagerChannelId;
    if (!channelId || (!isFreeChatChannel && !isAgentQueueChannel && !isMarketingManagerChannel)) return;

    const rawText = String(payload.text || "").trim();
    if (!rawText) return;

    const botUserId = String(context.botUserId || "");
    if (botUserId && rawText.includes(`<@${botUserId}>`)) return;

    const prompt = removeMentions(rawText);
    if (!prompt) return;

    // --- #marketing-manager top-level messages get special handling ---
    if (isMarketingManagerChannel) {
      // "whats next" / "next idea" -> present the next queued proposal
      if (isNextIdeaRequest(prompt)) {
        const presented = await presentNextProposal(client, channelId);
        if (!presented) {
          const manager = getPersona("marketing_manager");
          const emoji = manager?.emoji || "";
          await say({ text: `${emoji} No ideas queued up right now. The agents will generate more throughout the day.` });
        }
        return;
      }

      // All other top-level messages -> conversational reply as Marketing Manager
      const manager = getPersona("marketing_manager");
      if (!manager) return;

      try {
        const response = await llmText({
          taskType: "conversation_reply",
          instructions: `You are ${manager.displayName} (${manager.emoji}), the Marketing Manager for Sober Founders. ${manager.systemPromptAddendum}

The founder just sent a message in #marketing-manager. Respond helpfully and directly. If they're asking a question, answer it. If they're giving feedback, acknowledge it. If they want the next idea, tell them to say "whats next" or present it yourself.

Do not use em dashes. Keep it concise.

Priority hierarchy:
1. Phoenix Forum membership growth (paid members at $250/mo)
2. Donations and MRR
3. Free group attendance (Thursday open, Tuesday verified)`,
          input: [{ role: "user", content: prompt }],
          metadata: { persona: manager.id },
        });

        await say({ text: `${manager.emoji} ${response.outputText}` });
      } catch (err: any) {
        logger.error({ err: err?.message || String(err) }, "Failed to respond in #marketing-manager");
      }
      return;
    }

    await handlePromptRequest({
      prompt,
      actor: {
        userId: String(payload.user || ""),
        channelId,
        teamId: context.teamId,
        // Free-chat channel mode replies publicly in-channel (not threaded).
        threadTs: undefined,
        messageTs: String(payload.ts || ""),
      },
      reply: async (response) => {
        await say({
          text: response.text,
          blocks: response.blocks as any,
        });
      },
      confirmationEphemeral: false,
    });
  });
};
