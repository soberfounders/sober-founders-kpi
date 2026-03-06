# HubSpot Trust Sync Runbook

This project now uses a hybrid HubSpot sync architecture:

- `hubspot_webhook_ingest` (webhook queue ingest)
- `hubspot_webhook_worker` (queue processor, every minute)
- `hubspot_incremental_sync` (every 5 minutes)
- `hubspot_reconcile_sync` (hourly + daily lifecycle correction)
- `hubspot_bootstrap_backfill` (weekly resumable backfill)

## 1) Required HubSpot app setup

In HubSpot private app:

1. Go to app settings: <https://app.hubspot.com/private-apps>
2. Open your app and verify scopes include read access for:
   - `crm.objects.contacts.read`
   - `crm.objects.deals.read`
   - `crm.schemas.deals.read`
   - `crm.objects.deals.sensitive.read.v2` (if your portal uses sensitive deal properties)
   - `crm.objects.deals.highly_sensitive.read.v2` (if your portal uses highly sensitive deal properties)
   - `crm.objects.calls.read`
   - `crm.objects.meetings.read`
3. In **Webhooks**, add target URL:
   - `https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_webhook_ingest`
4. Keep webhook signature secret synced to Supabase:
   - `HUBSPOT_WEBHOOK_SECRET` (HubSpot app client secret)

Recommended subscriptions:

- Contact create / property change / delete / restore
- Deal create / property change / delete / restore
- Call create / property change / delete / restore (if available in your portal)
- Meeting create / property change / delete / restore (if available in your portal)

## 2) Supabase secrets

Required:

- `HUBSPOT_PRIVATE_APP_TOKEN`
- `HUBSPOT_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `HUBSPOT_SYNC_ALERT_WEBHOOK_URL` (Slack/webhook alert endpoint)

## 3) Deploy sequence

```bash
supabase db push --include-all
supabase functions deploy hubspot_webhook_ingest
supabase functions deploy hubspot_webhook_worker
supabase functions deploy hubspot_incremental_sync
supabase functions deploy hubspot_reconcile_sync
supabase functions deploy hubspot_bootstrap_backfill
supabase functions deploy master-sync
```

## 4) Smoke test commands

```bash
curl -X POST "https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_incremental_sync" \
  -H "Content-Type: application/json" \
  -d '{"object_types":"contacts,deals,calls,meetings"}'

curl -X POST "https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_reconcile_sync" \
  -H "Content-Type: application/json" \
  -d '{"mode":"hourly"}'

curl -X POST "https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_reconcile_sync" \
  -H "Content-Type: application/json" \
  -d '{"mode":"daily"}'

curl -X POST "https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/hubspot_bootstrap_backfill" \
  -H "Content-Type: application/json" \
  -d '{"chunk_days":14,"lookback_days":3650}'
```

## 5) Monitoring

Use view:

- `public.vw_hubspot_sync_health`

and tables:

- `public.hubspot_sync_runs`
- `public.hubspot_sync_errors`
- `public.hubspot_webhook_events`
- `public.hubspot_sync_state`

Alert thresholds:

- no successful incremental run in 15 minutes
- queue oldest pending > 15 minutes
- queue dead events > 0
- reconcile stale > 26 hours
