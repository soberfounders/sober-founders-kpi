-- Create table for Mailchimp Campaigns
CREATE TABLE IF NOT EXISTS public.mailchimp_campaigns (
  id TEXT PRIMARY KEY, -- Mailchimp Campaign ID
  title TEXT NOT NULL,
  subject_line TEXT,
  send_time TIMESTAMPTZ,
  emails_sent INTEGER DEFAULT 0,
  emails_delivered INTEGER DEFAULT 0,
  unique_opens INTEGER DEFAULT 0,
  mpp_opens INTEGER DEFAULT 0,
  unique_clicks INTEGER DEFAULT 0,
  unsubscribes INTEGER DEFAULT 0,
  bounces INTEGER DEFAULT 0,
  
  -- Calculated rates (stored for easy querying, but can be recalculated)
  raw_open_rate NUMERIC,
  human_open_rate NUMERIC,
  ctr NUMERIC,
  ctor NUMERIC,
  unsubscribe_rate NUMERIC,
  bounce_rate NUMERIC,
  
  -- Classification
  campaign_group TEXT, -- 'Tuesday' or 'Thursday'
  
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mailchimp_campaigns ENABLE ROW LEVEL SECURITY;

-- Public read access for dashboard (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mailchimp_campaigns'
      AND policyname = 'Public read mailchimp_campaigns'
  ) THEN
    CREATE POLICY "Public read mailchimp_campaigns" ON public.mailchimp_campaigns
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END
$$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mailchimp_campaign_group ON public.mailchimp_campaigns(campaign_group);
CREATE INDEX IF NOT EXISTS idx_mailchimp_send_time ON public.mailchimp_campaigns(send_time DESC);
