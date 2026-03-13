import type { App } from "@slack/bolt";
import { env } from "../../config/env.js";
import { handlePromptRequest } from "./events.js";

const removeMentions = (text: string): string => text.replace(/<@[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export const registerChannelFreeChatHandler = (app: App): void => {
  app.message(async ({ message, say, context }) => {
    const payload = message as unknown as Record<string, unknown>;
    if (payload.subtype || payload.bot_id) return;

    const channelType = String(payload.channel_type || "");
    if (!["channel", "group"].includes(channelType)) return;

    const channelId = String(payload.channel || "");
    if (!channelId || !env.freeChatChannelIds.includes(channelId)) return;

    const rawText = String(payload.text || "").trim();
    if (!rawText) return;

    const botUserId = String(context.botUserId || "");
    if (botUserId && rawText.includes(`<@${botUserId}>`)) return;

    const prompt = removeMentions(rawText);
    if (!prompt) return;

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
