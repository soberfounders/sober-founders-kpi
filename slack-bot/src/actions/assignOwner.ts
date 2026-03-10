import { supabase } from "../clients/supabase.js";

export interface AssignOwnerInput {
  entityType: "followup" | "task_request";
  entityId: string;
  owner: string;
}

export const assignOwner = async (input: AssignOwnerInput) => {
  if (input.entityType === "followup") {
    const { data, error } = await supabase
      .from("followups")
      .update({ owner: input.owner, updated_at: new Date().toISOString() })
      .eq("id", input.entityId)
      .select("id,owner")
      .single();

    if (error) {
      throw new Error(`Failed to assign followup owner: ${error.message}`);
    }

    return { id: String(data.id), owner: String(data.owner), entity_type: "followup" as const };
  }

  const { data, error } = await supabase
    .from("task_requests")
    .update({ owner: input.owner, updated_at: new Date().toISOString() })
    .eq("id", input.entityId)
    .select("id,owner")
    .single();

  if (error) {
    throw new Error(`Failed to assign task owner: ${error.message}`);
  }

  return { id: String(data.id), owner: String(data.owner), entity_type: "task_request" as const };
};
