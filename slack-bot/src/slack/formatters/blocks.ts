export const buildConfirmationBlocks = (
  pendingActionId: string,
  actionSummary: string,
): Array<Record<string, unknown>> => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `Approval required before executing:\n*${actionSummary}*`,
    },
  },
  {
    type: "actions",
    elements: [
      {
        type: "button",
        style: "primary",
        text: { type: "plain_text", text: "Approve" },
        action_id: "confirm_action_approve",
        value: pendingActionId,
      },
      {
        type: "button",
        style: "danger",
        text: { type: "plain_text", text: "Deny" },
        action_id: "confirm_action_deny",
        value: pendingActionId,
      },
    ],
  },
];

export const buildActionButtons = (): Array<Record<string, unknown>> => [
  {
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Create task" },
        action_id: "kpi_create_task",
        value: "create_task",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Post summary" },
        action_id: "kpi_post_summary",
        value: "post_summary",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Assign owner" },
        action_id: "kpi_assign_owner",
        value: "assign_owner",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "View dashboard" },
        action_id: "kpi_view_dashboard",
        value: "view_dashboard",
      },
    ],
  },
];

export const buildAppHomeBlocks = (
  latestSummaries: Array<Record<string, unknown>>,
  latestTasks: Array<Record<string, unknown>>,
  dashboardUrl: string,
): Array<Record<string, unknown>> => {
  const summaryLines = latestSummaries.length
    ? latestSummaries.slice(0, 5).map((summary) => `• *${String(summary.summary_type || "summary")}* · ${String(summary.created_at || "")}`).join("\n")
    : "No summaries yet.";

  const taskLines = latestTasks.length
    ? latestTasks.slice(0, 5).map((task) => `• ${String(task.task_title || task.title || "task")} (${String(task.status || "open")})`).join("\n")
    : "No open tasks found.";

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "KPI Copilot" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Ask KPI questions in DM, @mention me in channel threads, or run `/kpi ask <question>`."
      }
    },
    ...buildActionButtons(),
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Latest summaries*\n${summaryLines}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Open tasks*\n${taskLines}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open dashboard" },
          action_id: "kpi_view_dashboard",
          url: dashboardUrl,
          value: "open_dashboard",
        },
      ],
    },
  ];
};
