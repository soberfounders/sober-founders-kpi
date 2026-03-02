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

One-time historical backfill (recommended immediately after deploy):

- `supabase functions invoke sync_attendance_from_hubspot --no-verify-jwt --body "{\"days\":730,\"include_reconcile\":true,\"include_luma\":true}"`

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
