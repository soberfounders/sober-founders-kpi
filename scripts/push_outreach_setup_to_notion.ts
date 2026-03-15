/**
 * One-time script: push outreach automation setup checklist to Notion.
 *
 * Usage:
 *   source .env && npx tsx scripts/push_outreach_setup_to_notion.ts
 */

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
  console.error("Missing NOTION_API_KEY or NOTION_DATABASE_ID in env");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${NOTION_API_KEY}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

const CHECKLIST_ITEMS = [
  {
    title: "Set HUBSPOT_SENDER_EMAIL in Supabase secrets",
    description:
      "Run: supabase secrets set HUBSPOT_SENDER_EMAIL=your-email@example.com\n\nUse the email connected in HubSpot → Settings → General → Email tab. This is the 'from' address on outreach emails.",
    priority: "High",
    dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
  },
  {
    title: "Add crm.objects.emails.write scope to HubSpot private app",
    description:
      "HubSpot → Settings → Integrations → Private Apps → your app → Scopes.\nAdd 'crm.objects.emails.write' to allow creating email engagements.\nIf you update the token, run: supabase secrets set HUBSPOT_PRIVATE_APP_TOKEN=new-token",
    priority: "High",
    dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
  },
  {
    title: "Verify existing secrets are set for outreach agents",
    description:
      "Run: supabase secrets list\n\nConfirm these are present:\n- HUBSPOT_PRIVATE_APP_TOKEN\n- GEMINI_API_KEY\n- NOTION_API_KEY\n- NOTION_DATABASE_ID\n- SLACK_WEBHOOK_URL\n- SUPABASE_URL\n- SUPABASE_SERVICE_ROLE_KEY\n\nAgents skip integrations gracefully if a key is missing, but all should be set for full functionality.",
    priority: "Medium",
    dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
  },
  {
    title: "Deploy outreach edge functions to Supabase",
    description:
      "Deploy the three new edge functions:\n\nsupabase functions deploy no-show-recovery-agent\nsupabase functions deploy at-risk-retention-agent\nsupabase functions deploy winback-campaign-agent",
    priority: "High",
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  },
  {
    title: "Run migration for outreach automation tables and cron jobs",
    description:
      "Apply migration: supabase db push\n\nThis creates:\n- outreach_experiments table\n- vw_baseline_retention, vw_at_risk_attendees, vw_winback_candidates views\n- vw_outreach_conversions, vw_experiment_results views\n- pg_cron schedules for all 3 campaigns\n- Indexes on recovery_events",
    priority: "High",
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  },
  {
    title: "Snapshot baseline retention before campaigns start",
    description:
      "Query vw_baseline_retention to capture your 'before' numbers:\n\nSELECT * FROM vw_baseline_retention ORDER BY cohort_month DESC LIMIT 6;\n\nRecord the pct_returned_14d, pct_returned_30d, pct_returned_60d values. These are what you'll compare against after 4 weeks of outreach.",
    priority: "Medium",
    dueDate: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
  },
  {
    title: "Review outreach results after 4 weeks — decide keep/kill/adjust",
    description:
      "After 4 weeks, check the Outreach tab in the dashboard.\n\nKey questions:\n- Is no-show recovery conversion > baseline repeat rate? → Keep\n- Is at-risk nudge bringing people back? → Keep\n- Is winback rate > 5%? → Keep (even small wins on hundreds of contacts add up)\n- Any campaign hurting? (complaints, unsubscribes) → Kill\n\nAlso check HubSpot contact timelines for reply quality.",
    priority: "High",
    dueDate: new Date(Date.now() + 32 * 86400000).toISOString().slice(0, 10),
  },
];

async function createTask(item: (typeof CHECKLIST_ITEMS)[0]) {
  const properties: Record<string, any> = {
    "Task name": { title: [{ text: { content: item.title } }] },
    Status: { status: { name: "Not started" } },
    Deadline: { date: { start: item.dueDate } },
    Priority: { select: { name: item.priority } },
    Description: {
      rich_text: [{ text: { content: item.description.slice(0, 1900) } }],
    },
    Tags: {
      multi_select: [{ name: "outreach-automation" }, { name: "setup" }],
    },
  };

  const resp = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { database_id: NOTION_DATABASE_ID },
      properties,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json();
    console.error(`Failed to create "${item.title}":`, err?.message || resp.status);
    return null;
  }

  const page = await resp.json();
  console.log(`Created: "${item.title}" → ${page.url}`);
  return page;
}

async function main() {
  console.log("Pushing outreach setup checklist to Notion...\n");

  for (const item of CHECKLIST_ITEMS) {
    await createTask(item);
  }

  console.log("\nDone! Check your Notion database for 7 new tasks tagged 'outreach-automation'.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
