import { supabase } from "../clients/supabase.js";

export interface FollowupInput {
  topic: string;
  owner: string;
  dueDate: string;
  context: string;
  actorUserId: string;
  source: Record<string, unknown>;
}

export const createFollowup = async (input: FollowupInput) => {
  const { data, error } = await supabase
    .from("followups")
    .insert({
      topic: input.topic,
      owner: input.owner,
      due_date: input.dueDate,
      context: input.context,
      status: "open",
      source: input.source,
      created_by: input.actorUserId,
    })
    .select("id,topic,owner,due_date,status")
    .single();

  if (error) {
    throw new Error(`Failed to create followup: ${error.message}`);
  }

  return {
    id: String(data.id),
    topic: String(data.topic),
    owner: String(data.owner),
    due_date: String(data.due_date),
    status: String(data.status),
  };
};
