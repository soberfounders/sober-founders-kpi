import { supabase } from "../../clients/supabase.js";
import { logger } from "../../observability/logger.js";
import type { IntentType } from "../../types.js";

export const resolveThreadTs = (_eventTs?: string, threadTs?: string): string | undefined => {
  return threadTs;
};

export interface ConversationHistoryItem {
  direction: "inbound" | "outbound";
  messageText: string;
}

export const getThreadHistory = async (
  channelId: string,
  threadTs: string,
  beforeMessageTs?: string,
  limit = 10,
): Promise<ConversationHistoryItem[]> => {
  let query = supabase
    .from("slack_conversations")
    .select("direction,message_text,created_at")
    .eq("channel_id", channelId)
    .eq("thread_ts", threadTs)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (beforeMessageTs) {
    query = query.lt("message_ts", beforeMessageTs);
  }

  const { data, error } = await query;
  if (error) {
    logger.warn({ err: error, channelId, threadTs }, "Failed to fetch thread history");
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    direction: String(row.direction || "inbound") as "inbound" | "outbound",
    messageText: String(row.message_text || ""),
  }));
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
