import { supabase } from "../../clients/supabase.js";
import { logger } from "../../observability/logger.js";
import type { IntentType } from "../../types.js";

export const resolveThreadTs = (eventTs?: string, threadTs?: string): string | undefined => {
  return threadTs || eventTs;
};

export interface ConversationLogInput {
  teamId?: string;
  channelId: string;
  threadTs?: string;
  messageTs?: string;
  actorUserId: string;
  direction: "inbound" | "outbound";
  messageText: string;
  intentType?: IntentType;
  metadata?: Record<string, unknown>;
}

export const logConversationTurn = async (input: ConversationLogInput): Promise<void> => {
  const { error } = await supabase.from("slack_conversations").insert({
    team_id: input.teamId || null,
    channel_id: input.channelId,
    thread_ts: input.threadTs || null,
    message_ts: input.messageTs || null,
    actor_user_id: input.actorUserId,
    direction: input.direction,
    message_text: input.messageText,
    intent_type: input.intentType || null,
    metadata: input.metadata || {},
  });

  if (error) {
    logger.warn({ err: error, input }, "Failed to log slack_conversations row");
  }
};
