# Email Analytics Agent — Deployment Task

## Objective

Deploy a live Mailchimp email analytics dashboard with MPP-adjusted metrics,
Tuesday/Thursday stream separation, and anomaly detection.

## Status

- [x] `sync_mailchimp` edge function written & deployed to Supabase
- [x] `EmailDashboard.jsx` rewritten with live data, correct metric labels
- [x] Migration file `20260219120000_mailchimp_campaign_tables.sql` exists
      locally
- [x] Broken migration `20260218_add_funnel_rules.sql` fixed
- [x] Supabase secrets set (MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX,
      SUPABASE_SERVICE_ROLE_KEY)
- [x] `.env` updated with correct service_role_key JWT
- [ ] **`mailchimp_campaigns` table created in remote DB** ← BLOCKED (db push
      unreliable)
- [ ] End-to-end test: invoke function → confirm data in DB → confirm dashboard
      renders

## Remaining Steps

### Step 1 — Apply migration via psql (direct connection)

Use the Postgres connection string to run the migration SQL directly, bypassing
the broken Supabase CLI migration history entirely.

Connection:
`postgresql://postgres:eD7IMyb8WUB0xv@db.ldnucnghzpkuixmnfjbs.supabase.co:5432/postgres`

### Step 2 — Test the edge function live

Call `sync_mailchimp` and confirm it:

- Calls Mailchimp API successfully
- Classifies Tuesday/Thursday campaigns correctly
- Upserts data to `mailchimp_campaigns`
- Returns anomaly detection results

### Step 3 — Verify dashboard renders

Confirm `EmailDashboard.jsx` loads data from Supabase and displays correctly.

## Key Metric Definitions (Must Not Change)

- **Human Open Rate** = (Unique Opens − MPP Opens) / Delivered → primary metric
- **Raw Open Rate** = Unique Opens / Delivered → secondary, labeled "(incl.
  Apple MPP)"
- **CTR** = Unique Clicks / Delivered → ~1–4%, NOT CTOR
- **CTOR** = Unique Clicks / Unique Opens → ~10–15%, always labeled separately
