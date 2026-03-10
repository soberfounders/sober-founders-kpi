import { invokeMasterSync, supabase } from "../clients/supabase.js";

export interface CreateTaskInput {
  title: string;
  description: string;
  owner: string;
  priority: "High Priority" | "Medium Priority" | "Low Priority";
  dueDate: string;
  source: string;
  actorUserId: string;
  traceId: string;
}

const toNotionProperties = (input: CreateTaskInput) => ({
  "Task name": { title: [{ text: { content: input.title } }] },
  "Status": { status: { name: "Not started" } },
  "Priority": { select: { name: input.priority } },
  "Description": {
    rich_text: [{ text: { content: input.description.slice(0, 1900) } }],
  },
  "Due Date": {
    date: { start: input.dueDate },
  },
  _person_name: input.owner,
});

export const createTask = async (input: CreateTaskInput) => {
  const requestInsert = await supabase
    .from("task_requests")
    .insert({
      title: input.title,
      description: input.description,
      owner: input.owner,
      priority: input.priority,
      due_date: input.dueDate,
      source: input.source,
      status: "pending",
      request_context: {
        actor_user_id: input.actorUserId,
        trace_id: input.traceId,
      },
      created_by: input.actorUserId,
    })
    .select("id")
    .single();

  if (requestInsert.error) {
    throw new Error(`Failed to create task request record: ${requestInsert.error.message}`);
  }

  const taskRequestId = String(requestInsert.data.id);

  try {
    const response = await invokeMasterSync<Record<string, unknown>>({
      action: "create_task",
      properties: toNotionProperties(input),
    });

    const notionPageId = String((response as Record<string, unknown>).id || "");
    const notionUrl = String((response as Record<string, unknown>).url || "");

    const { error: updateError } = await supabase
      .from("task_requests")
      .update({
        status: "created",
        notion_page_id: notionPageId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskRequestId);

    if (updateError) {
      throw new Error(`Task request update failed: ${updateError.message}`);
    }

    return {
      id: taskRequestId,
      title: input.title,
      owner: input.owner,
      priority: input.priority,
      due_date: input.dueDate,
      source: input.source,
      status: "created",
      notion_page_id: notionPageId || undefined,
      url: notionUrl || undefined,
    };
  } catch (error) {
    await supabase
      .from("task_requests")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskRequestId);

    throw error;
  }
};
