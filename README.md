# Sober Founders KPI Dashboard

A modern, real-time KPI dashboard for Sober Founders, built with React, Vite,
and Supabase.

## Project Structure

- `/dashboard`: The React frontend application.
- `/supabase`: Supabase Edge Functions and configuration.
- `/docs`: Analytics framework and implementation notes.
- Root: Backend scripts for data ingestion and processing.

## Tech Stack

- **Frontend**: React, Vite, Recharts, Framer Motion, Lucide Icons.
- **Backend/Database**: Supabase (PostgreSQL, Edge Functions).
- **Integrations**: HubSpot, Facebook/Meta Ads API.

## Getting Started

### Prerequisites

- Node.js (v18+)
- Supabase CLI (optional, for local development)

### Frontend Setup

1. `cd dashboard`
2. `npm install`
3. `npm run dev`

### Environment Variables

Create a `.env` file in the root and in `/dashboard` with the following (see
`.env.example`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ENABLE_REMOTE_AI_MODULE_ANALYSIS` (`true` to enable live AI module analysis calls)
- `VITE_DASHBOARD_LOOKBACK_DAYS` (recommended: `730`)
- `VITE_HUBSPOT_CONTACT_LOOKBACK_DAYS` (recommended: `730`)
- `VITE_LEADS_LOOKBACK_DAYS` (recommended: `730`)
- `VITE_LEADS_ATTRIBUTION_HISTORY_DAYS` (recommended: `730`)
- `VITE_ATTENDANCE_BACKFILL_DAYS` (recommended: `730`)
- `META_ACCESS_TOKEN`
- `HUBSPOT_PRIVATE_APP_TOKEN`
- `LUMA_API_KEY` (for `sync_luma_registrations` function)

### Supabase CLI (without re-exporting env each time)

Use the helper wrapper from repo root:

1. Add `SUPABASE_ACCESS_TOKEN` to root `.env` (one-time).
2. Run commands through `./scripts/supabase.sh ...`.

Examples:

- `./scripts/supabase.sh --version`
- `./scripts/supabase.sh projects list`
- `./scripts/supabase.sh link --project-ref ldnucnghzpkuixmnfjbs`

The wrapper auto-loads root `.env`, so you can keep moving without manual `export` steps every session.

### Vercel Deployment Notes

- Root Directory: `dashboard`
- Build command: `npm run build`
- Output directory: `dist`
- Required Vercel env vars (Production/Preview):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_ENABLE_REMOTE_AI_MODULE_ANALYSIS` (`false` by default unless `ai-module-analysis` is deployed and reachable)
  - `VITE_DASHBOARD_LOOKBACK_DAYS` (`730`)
  - `VITE_HUBSPOT_CONTACT_LOOKBACK_DAYS` (`730`)
  - `VITE_LEADS_LOOKBACK_DAYS` (`730`)
  - `VITE_LEADS_ATTRIBUTION_HISTORY_DAYS` (`730`)
  - `VITE_ATTENDANCE_BACKFILL_DAYS` (`730`)

### Supabase Deploy Notes (Edge + Migrations)

Run from repo root:

1. `supabase link --project-ref ldnucnghzpkuixmnfjbs`
2. `supabase db push`
3. `supabase functions deploy sync_hubspot_meeting_activities`
4. `supabase functions deploy sync_attendance_from_hubspot`
5. `supabase functions deploy master-sync`
6. `supabase functions deploy ai-module-analysis`
7. `supabase functions deploy analyze-leads-insights`
8. `supabase functions deploy ai-briefing`

HubSpot trust-sync deploy (new):

9. `supabase functions deploy hubspot_webhook_ingest`
10. `supabase functions deploy hubspot_webhook_worker`
11. `supabase functions deploy hubspot_incremental_sync`
12. `supabase functions deploy hubspot_reconcile_sync`
13. `supabase functions deploy hubspot_bootstrap_backfill`

One-time historical backfill (recommended immediately after deploy):

- `supabase functions invoke sync_attendance_from_hubspot --no-verify-jwt --body "{\"days\":730,\"include_reconcile\":true,\"include_luma\":true}"`

HubSpot webhook endpoint:

- `https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_webhook_ingest`
- Required secret header validation is based on `HUBSPOT_WEBHOOK_SECRET` (HubSpot app client secret)
- Required function secrets:
  - `HUBSPOT_PRIVATE_APP_TOKEN`
  - `HUBSPOT_WEBHOOK_SECRET`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - optional alerts: `HUBSPOT_SYNC_ALERT_WEBHOOK_URL`

## License

Proprietary - Sober Founders

## Lead Intelligence Notes

The Leads view now implements a full marketing funnel analysis with:

- Funnel stages from impressions to great leads
- CPL / CPQL / CPGL / cost per show-up / cost per registration
- Top and bottom ad efficiency ranking
- Net new Tue/Thu show-up tracking
- Thursday Lu.ma registration syncing with Zoom + HubSpot identity matching
- AI recommendations prioritized by CPGL impact

Reference: `docs/lead-intelligence-framework.md`

- Quick-win autonomous workflow pilot: `docs/ai-manager-quick-win-pilot.md`
- Leads autonomous manager execution plan: `docs/leads-autonomous-manager-plan.md`
