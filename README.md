# Sober Founders KPI Dashboard

A modern, real-time KPI dashboard for Sober Founders, built with React, Vite,
and Supabase.

## Project Structure

- `/dashboard`: The React frontend application.
- `/supabase`: Supabase Edge Functions and configuration.
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
- `META_ACCESS_TOKEN`
- `HUBSPOT_PRIVATE_APP_TOKEN`

## License

Proprietary - Sober Founders
