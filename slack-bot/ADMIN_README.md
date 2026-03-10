# KPI Slack Bot - Admin Guide

This bot answers KPI questions in Slack and can create follow-ups/tasks.

## Daily Use
- Ask in DM or mention in a channel thread.
- Use `/kpi` command for quick actions:
  - `/kpi ask ...`
  - `/kpi summary ...`
  - `/kpi tasks ...`
  - `/kpi followup ...`

## What To Expect
- Responses include data source and time window.
- If confidence is low, the bot says so.
- High-impact actions show **Approve / Deny** buttons.

## Permissions
Permissions are controlled in database tables:
- `slack_user_roles` (who can do what)
- `slack_channel_policies` (where posting/task actions are allowed)

If someone is blocked incorrectly:
1. Check their row in `slack_user_roles`.
2. Check the target channel in `slack_channel_policies`.

## Scheduled Summaries
Automated summary posting is controlled by `user_channel_preferences`.

Key fields:
- `slack_user_id`
- `channel_id`
- `summary_type`
- `schedule_interval_minutes`
- `is_active`

## Auditing
All action outcomes are logged in `bot_actions_audit`.

Use this to review:
- who requested action
- what action was requested
- approval state
- final success/failure
- trace id for debugging

## Common Issues
- Bot not responding:
  - Verify `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` are set.
- AI responses failing:
  - Verify `OPENAI_API_KEY`.
- Data not loading:
  - Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Notion task creation failing:
  - Verify `MASTER_SYNC_EDGE_INVOKE_KEY` (or fallback key).

## Escalation Checklist
When reporting an issue, include:
- Slack channel/user
- exact command/message
- approximate time
- audit `trace_id` from `bot_actions_audit`
