/**
 * Notion Follow-Up Task Creator
 *
 * Creates tasks in the Notion database with due dates for
 * outreach follow-ups. Reuses the same database and property
 * schema as the Slack bot task creator in master-sync.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface NotionFollowUpParams {
  title: string;
  description: string;
  dueDate: string;          // ISO date string (YYYY-MM-DD)
  priority?: string;        // 'High' | 'Medium' | 'Low'
  tags?: string[];          // e.g., ['outreach', 'no-show']
  personName?: string;      // Notion user display name to assign
}

export interface NotionFollowUpResult {
  ok: boolean;
  pageId?: string;
  url?: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Create follow-up task                                              */
/* ------------------------------------------------------------------ */

export async function createNotionFollowUp(
  params: NotionFollowUpParams,
): Promise<NotionFollowUpResult> {
  const apiKey = Deno.env.get("NOTION_API_KEY");
  const databaseId = Deno.env.get("NOTION_DATABASE_ID");

  if (!apiKey || !databaseId) {
    return { ok: false, error: "Missing NOTION_API_KEY or NOTION_DATABASE_ID" };
  }

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  // Build properties matching the existing Notion database schema
  // (same property names as master-sync createNotionTask)
  const properties: Record<string, any> = {
    "Task name": {
      title: [{ text: { content: params.title.slice(0, 200) } }],
    },
    "Status": {
      status: { name: "Not started" },
    },
  };

  // Due date — try "Deadline" first (primary), then "Due Date" (fallback)
  // Matches the priority order in master-sync
  if (params.dueDate) {
    properties["Deadline"] = { date: { start: params.dueDate } };
  }

  if (params.priority) {
    properties["Priority"] = { select: { name: params.priority } };
  }

  if (params.description) {
    properties["Description"] = {
      rich_text: [{ text: { content: params.description.slice(0, 1900) } }],
    };
  }

  if (params.tags && params.tags.length > 0) {
    properties["Tags"] = {
      multi_select: params.tags.map((t) => ({ name: t })),
    };
  }

  // Resolve person name to Notion user ID if provided
  if (params.personName) {
    try {
      const usersResp = await fetch("https://api.notion.com/v1/users", { headers });
      if (usersResp.ok) {
        const usersData = await usersResp.json();
        const matched = (usersData.results || []).find(
          (u: any) => u.name?.toLowerCase() === params.personName!.toLowerCase(),
        );
        if (matched) {
          properties["Person"] = { people: [{ id: matched.id }] };
        }
      }
    } catch (e: any) {
      console.warn(`Notion person lookup failed: ${e.message}`);
    }
  }

  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { ok: false, error: `Notion create failed: ${error?.message || response.status}` };
    }

    const page = await response.json();
    return {
      ok: true,
      pageId: page.id,
      url: page.url,
    };
  } catch (e: any) {
    return { ok: false, error: `Notion request failed: ${e.message}` };
  }
}
