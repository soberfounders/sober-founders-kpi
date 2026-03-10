import type { App } from "@slack/bolt";
import { handlePromptRequest } from "./events.js";
import { resolveThreadTs } from "../services/threading.js";

const removeMentions = (text: string): string => text.replace(/<@[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export const registerMentionHandler = (app: App): void => {
  app.event("app_mention", async ({ event, say, context }) => {
    const payload = event as unknown as Record<string, unknown>;
    const text = removeMentions(String(payload.text || ""));
    if (!text) return;

    const threadTs = resolveThreadTs(String(payload.ts || ""), payload.thread_ts ? String(payload.thread_ts) : undefined);

    await handlePromptRequest({
      prompt: text,
      actor: {
        userId: String(payload.user || ""),
        channelId: String(payload.channel || ""),
        teamId: context.teamId,
        threadTs,
        messageTs: String(payload.ts || ""),
      },
      reply: async (response) => {
        await say({
          text: response.text,
          thread_ts: response.threadTs,
          blocks: response.blocks as any,
        });
      },
      confirmationEphemeral: false,
    });
  });
};
