import { supabase } from "../clients/supabase.js";
import { logger } from "../observability/logger.js";
import type { AuditPayload } from "../types.js";

export const logAuditEvent = async (payload: AuditPayload): Promise<string> => {
  const { data, error } = await supabase
    .from("bot_actions_audit")
    .insert({
      action_type: payload.actionType,
      intent_type: payload.intentType,
      actor_user_id: payload.actorUserId,
      channel_id: payload.channelId,
      tool_name: payload.toolName || null,
      input_payload: payload.input,
      output_payload: payload.output || {},
      status: payload.status,
      confirmation_required: payload.confirmationRequired,
      confirmation_status: payload.confirmationStatus,
      trace_id: payload.traceId,
      error_message: payload.errorMessage || null,
    })
    .select("id")
    .single();

  if (error) {
    logger.error({ err: error, payload }, "Failed to insert bot_actions_audit event");
    throw new Error(`Failed to log audit event: ${error.message}`);
  }

  return String(data.id);
};
