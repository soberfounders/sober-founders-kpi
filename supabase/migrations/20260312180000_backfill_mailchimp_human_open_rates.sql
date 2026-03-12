-- Backfill correct human open rates for mailchimp campaigns.
--
-- Root cause: when these campaigns were first synced, the Mailchimp API did
-- not return opens.mpp_opens (Apple MPP bot count), so mpp_opens was stored
-- as 0. This caused human_open_rate to equal raw_open_rate (total opens /
-- delivered) instead of (human opens / delivered).
--
-- Data source: values confirmed directly in Mailchimp UI by operator.
--   human_opens = "Opened — X recipients" (Apple MPP excluded)
--   clicks      = unique_clicks
--
-- For each row we:
--   1. Set mpp_opens  = unique_opens - human_opens  (derive the bot count)
--   2. Recompute human_open_rate = human_opens / emails_delivered
--   3. Recompute ctr  = unique_clicks / emails_delivered
--   4. Recompute ctor = unique_clicks / human_opens  (was clicks/total_opens)
--   5. Set unique_clicks to the confirmed value
--
-- Campaigns NOT listed below will be corrected on the next sync, because the
-- sync function re-fetches from the Mailchimp API (which now returns mpp_opens)
-- and upserts all fields. The dashboard triggers a sync on every page load.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 3/10/2026 — 59 delivered, 21 human opens (35.6%), 1 click ────────────────
UPDATE public.mailchimp_campaigns
SET
  mpp_opens        = GREATEST(0, unique_opens - 21),
  human_open_rate  = 21.0 / NULLIF(emails_delivered, 0),
  unique_clicks    = 1,
  ctr              = 1.0  / NULLIF(emails_delivered, 0),
  ctor             = 1.0  / 21.0,
  updated_at       = NOW()
WHERE (send_time AT TIME ZONE 'America/New_York')::date = '2026-03-10';

-- ── 3/5/2026 — 136 human opens (20.1%), 5 clicks ─────────────────────────────
UPDATE public.mailchimp_campaigns
SET
  mpp_opens        = GREATEST(0, unique_opens - 136),
  human_open_rate  = 136.0 / NULLIF(emails_delivered, 0),
  unique_clicks    = 5,
  ctr              = 5.0   / NULLIF(emails_delivered, 0),
  ctor             = 5.0   / 136.0,
  updated_at       = NOW()
WHERE (send_time AT TIME ZONE 'America/New_York')::date = '2026-03-05';

-- ── 3/3/2026 — 59 delivered, 19 human opens (32.2%), 0 clicks ────────────────
UPDATE public.mailchimp_campaigns
SET
  mpp_opens        = GREATEST(0, unique_opens - 19),
  human_open_rate  = 19.0 / NULLIF(emails_delivered, 0),
  unique_clicks    = 0,
  ctr              = 0,
  ctor             = 0,
  updated_at       = NOW()
WHERE (send_time AT TIME ZONE 'America/New_York')::date = '2026-03-03';

-- ── 2/26/2026 — 148 human opens (22.3%), 15 clicks (2.3%) ───────────────────
UPDATE public.mailchimp_campaigns
SET
  mpp_opens        = GREATEST(0, unique_opens - 148),
  human_open_rate  = 148.0 / NULLIF(emails_delivered, 0),
  unique_clicks    = 15,
  ctr              = 15.0  / NULLIF(emails_delivered, 0),
  ctor             = 15.0  / 148.0,
  updated_at       = NOW()
WHERE (send_time AT TIME ZONE 'America/New_York')::date = '2026-02-26';
