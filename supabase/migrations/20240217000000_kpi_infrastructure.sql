-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Supported Integrations
CREATE TABLE IF NOT EXISTS public.supported_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE, -- 'notion', 'zoom', 'luma', 'mailchimp', 'hubspot', 'facebook'
  description TEXT,
  icon_url TEXT,
  auth_type TEXT NOT NULL, -- 'api_key', 'oauth2', 'service_role'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. User Integrations (Connections)
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.supported_integrations(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, integration_id)
);

-- 3. Integration Credentials (Vault-like)
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_integration_id UUID REFERENCES public.user_integrations(id) ON DELETE CASCADE,
  credential_key TEXT NOT NULL, -- 'api_key', 'access_token', 'database_id'
  credential_value TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_integration_id, credential_key)
);

-- 5. Notion To-Dos (Specific list storage)
CREATE TABLE IF NOT EXISTS public.notion_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  notion_page_id TEXT UNIQUE NOT NULL,
  task_title TEXT NOT NULL,
  status TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT,
  url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Unified KPI Metrics
CREATE TABLE IF NOT EXISTS public.kpi_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source_slug TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period TEXT DEFAULT 'daily',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS POLICIES
ALTER TABLE public.supported_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_todos ENABLE ROW LEVEL SECURITY;

-- Everyone can see supported integrations (including anon for dev)
CREATE POLICY "Public read supported_integrations" ON public.supported_integrations
  FOR SELECT TO anon, authenticated USING (true);

-- Public read access for dashboard (development mode)
CREATE POLICY "Public read access for todos" ON public.notion_todos
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public read access for metrics" ON public.kpi_metrics
  FOR SELECT TO anon, authenticated USING (true);

-- Users can only see their own connections
CREATE POLICY "Users view own integrations" ON public.user_integrations
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Users can only see their own credentials
CREATE POLICY "Users view own credentials" ON public.integration_credentials
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.user_integrations
      WHERE public.user_integrations.id = public.integration_credentials.user_integration_id
      AND public.user_integrations.user_id = auth.uid()
    )
  );

-- Users can only see/edit their own data (full access)
CREATE POLICY "Users manage own todos" ON public.notion_todos
  FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users manage own metrics" ON public.kpi_metrics
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- SEED DATA
INSERT INTO public.supported_integrations (name, slug, auth_type) VALUES
  ('Notion', 'notion', 'api_key'),
  ('Zoom', 'zoom', 'oauth2'),
  ('Luma', 'luma', 'api_key'),
  ('Mailchimp', 'mailchimp', 'api_key'),
  ('HubSpot', 'hubspot', 'api_key'),
  ('Facebook Ads', 'facebook', 'oauth2')
ON CONFLICT (slug) DO NOTHING;

-- CRON JOB: Every Monday at 1:00 AM EST
-- Note: Supabase Timestamps are UTC. 1 AM EST is 6 AM UTC (or 5 AM during DST).
-- We'll schedule for 6:00 AM UTC Mondays.
SELECT cron.schedule(
  'monday-kpi-sync',
  '0 6 * * 1',
  $$ SELECT net.http_post(
      url:='https://ldnucnghzpkuixmnfjbs.supabase.co/functions/v1/master-sync',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  ) $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule;
