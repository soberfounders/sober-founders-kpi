# Slack KPI Copilot (Bolt + Socket Mode + OpenAI Responses)

Production-ready Slack worker for Sober Founders KPI chat, summaries, follow-ups, and task execution.

## What This Service Does
- Supports Slack App Home, DM, channel `@mentions`, and `/kpi` slash command.
- Answers KPI questions using allowlisted tools only (no model SQL access).
- Creates follow-ups/tasks and posts summaries with RBAC + confirmation gates.
- Logs all action outcomes to audit storage.
- Runs scheduled summary delivery from `user_channel_preferences`.

## Architecture

```text
slack-bot/
  src/
    index.ts
    config/env.ts
    observability/logger.ts
    clients/{supabase.ts,openai.ts,slack.ts}
    slack/
      app.ts
      handlers/{events.ts,mentions.ts,dm.ts,home.ts,interactions.ts}
      commands/{kpi.ts}
      services/{threading.ts,rateLimit.ts,scheduler.ts}
      formatters/{messages.ts,blocks.ts,errors.ts}
      permissions/{rbac.ts,confirmations.ts}
    ai/
      orchestrator.ts
      tools.ts
      systemPrompt.ts
      schemas/{toolArgs.ts,toolResults.ts,response.ts}
    data/{metrics.ts,summaries.ts,trends.ts,managers.ts}
    actions/{createTask.ts,sendSlackSummary.ts,createFollowup.ts,assignOwner.ts,logAuditEvent.ts}
  tests/
    unit/
    integration/
```

## Tooling Contract (Model-Callable)
The model can call only these tools:
- `get_kpi_snapshot(metric, date_range, filters)`
- `get_metric_trend(metric, date_range, compare_to)`
- `get_manager_report(section, date_range)`
- `list_open_tasks(owner?, team?, priority?)`
- `create_task(title, description, owner, priority, due_date, source)`
- `create_followup(topic, owner, due_date, context)`
- `send_slack_message(channel, text, blocks?)`
- `post_summary(summary_type, channel, date_range)`
- `get_data_quality_warnings()`
- `get_org_context()`

All tool args are schema-validated with Zod.

## Security and Governance
- No arbitrary SQL generation/execution by model.
- Data access through fixed adapters in `src/data/*`.
- DB-backed RBAC via:
  - `slack_user_roles`
  - `slack_channel_policies`
- High-impact actions require explicit approval button flow.
- Every mutating attempt/result logs to `bot_actions_audit`.
- Rate limiting per user/channel (`SlidingWindowRateLimiter`).
- Env validation at startup (`src/config/env.ts`).

## Persistence (Migration)
Apply migration:
- `supabase/migrations/20260310170000_add_slack_kpi_copilot_tables.sql`

Creates:
- `slack_conversations`
- `bot_actions_audit`
- `generated_summaries`
- `followups`
- `task_requests`
- `user_channel_preferences`
- `slack_user_roles`
- `slack_channel_policies`

## Environment Variables
Use [`slack-bot/.env.example`](./.env.example).

Required:
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional but recommended:
- `SLACK_SIGNING_SECRET`
- `MASTER_SYNC_EDGE_INVOKE_KEY`
- `SLACK_EXECUTIVE_CHANNELS`
- scheduler/rate-limit tuning vars

## Slack App Setup Checklist
1. Create app at [api.slack.com/apps](https://api.slack.com/apps).
2. Enable **Socket Mode** and generate app token (`connections:write`).
3. Add bot token scopes listed below.
4. Enable **Interactivity & Shortcuts**.
5. Enable **Event Subscriptions** and add bot events listed below.
6. Add slash command `/kpi`.
7. Install/reinstall app to workspace.
8. Populate environment secrets in Railway/local env.

## OAuth Scopes
### Bot Token Scopes
- `app_mentions:read`
- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`
- `chat:write`
- `chat:write.public`
- `commands`

### App-Level Scope (Socket Mode)
- `connections:write`

## Event Subscriptions
Add bot events:
- `app_home_opened`
- `app_mention`
- `message.im`

## Slash Command Registration
Register one command:
- `/kpi`

Subcommands handled in parser:
- `/kpi ask <question>`
- `/kpi summary [type] [from=YYYY-MM-DD to=YYYY-MM-DD] [post]`
- `/kpi tasks [owner=<name>] [team=<team>] [priority=<priority>]`
- `/kpi followup <topic> [owner=<name>] [due=YYYY-MM-DD]`

## Local Development
1. Install deps:
   - `npm --prefix slack-bot install`
2. Set env:
   - copy `.env.example` to `.env` and fill credentials.
3. Apply Supabase migration.
4. Start worker:
   - `npm run slack:dev`
5. In Slack:
   - DM bot, mention in a channel thread, or run `/kpi`.

## Railway Deployment
1. Create Railway service with root directory `slack-bot/`.
2. Build command: `npm install && npm run build`.
3. Start command: `npm run start`.
4. Add all required env vars.
5. Ensure migration is applied before first run.
6. Verify logs show `Slack KPI Copilot started`.

Notes:
- Socket Mode has no inbound HTTP health endpoint by default.
- If credentials are missing, service fails safely on boot via env validation.

## Tests
Run:
- `npm run slack:lint`
- `npm run slack:test`

Current test coverage includes:
- Unit
  - Slash command parser and prompt builder
  - Intent router
  - Tool arg validation / allowlist
  - Permission and confirmation gating
  - Slack formatter footer output
- Integration (mocked clients)
  - Orchestrator multi-step tool loop
  - Confirmation approve/deny flow
  - Scheduler polling/posting path
  - Prompt handling flow with confirmation blocks

## Example Prompts and Slack Interactions
Examples:
- `What changed this week?`
- `Why are Phoenix Forum paid members down?`
- `Summarize attendance issues and post action items`
- `Create a follow-up task for Andrew in Notion`
- `Post a weekly executive summary to Slack`

Expected behavior:
- Informational queries return concise KPI response + source window + confidence.
- Action requests enforce RBAC.
- High-impact actions return approve/deny buttons.
- Approved actions execute and log audit rows.

## Admin Quick Guide
See [`ADMIN_README.md`](./ADMIN_README.md) for non-technical operation guidance.
