# Donations Backfill + Live Zeffy Sync Runbook

## 1) Apply database changes

Run Supabase migrations so the donations schema can store Zeffy export fields:

```powershell
supabase db push
```

Migration added:
- `supabase/migrations/20260302184500_expand_donations_for_zeffy_exports.sql`

## 2) Deploy updated webhook ingest function

```powershell
supabase functions deploy ingest_zeffy_donations
```

Optional secret (recommended):

```powershell
supabase secrets set ZEFFY_WEBHOOK_SECRET=\"<strong-random-secret>\"
```

## 3) Backfill historical Zeffy exports

Dry-run parse check:

```powershell
python scripts/backfill_zeffy_exports.py `
  --transactions-xlsx \"C:\\Users\\rusht\\Downloads\\Zeffy-export-1772429552143.xlsx\" `
  --supporters-xlsx \"C:\\Users\\rusht\\Downloads\\Zeffy-export-1772430632771.xlsx\" `
  --dry-run
```

Write to Supabase:

```powershell
$env:SUPABASE_URL=\"https://<project-ref>.supabase.co\"
$env:SUPABASE_SERVICE_ROLE_KEY=\"<service-role-key>\"

python scripts/backfill_zeffy_exports.py `
  --transactions-xlsx \"C:\\Users\\rusht\\Downloads\\Zeffy-export-1772429552143.xlsx\" `
  --supporters-xlsx \"C:\\Users\\rusht\\Downloads\\Zeffy-export-1772430632771.xlsx\"
```

## 4) Zapier live sync (new donations)

- Trigger: Zeffy `Get Donations`
- Action: Webhooks by Zapier `POST`
- URL: `https://<project-ref>.supabase.co/functions/v1/ingest_zeffy_donations`
- Headers:
  - `Content-Type: application/json`
  - `x-zeffy-webhook-secret: <same-secret-as-ZEFFY_WEBHOOK_SECRET>`
- Body: pass donation payload fields directly (single object or array supported by the function)

## 5) Verify in dashboard

- `DashboardOverview` now defaults to live donations data (dummy mode off unless `VITE_USE_DUMMY_DONATIONS=true`)
- `DonationsDashboard` now loads:
  - 12-month donation trend
  - payment method mix
  - top campaigns
  - top donors leaderboard
  - recent donations
  - supporter commitment snapshot
