-- Enable pgcrypto for encryption if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Supported Integrations
CREATE TABLE IF NOT EXISTS public.supported_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT,
  auth_type TEXT NOT NULL, -- 'api_key', 'oauth2'
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
-- Encrypted sensitive data should be handled carefully
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_integration_id UUID REFERENCES public.user_integrations(id) ON DELETE CASCADE,
  credential_key TEXT NOT NULL, -- e.g., 'access_token', 'api_key'
  credential_value TEXT NOT NULL, -- This should ideally be encrypted or handled via vault
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_integration_id, credential_key)
);

-- 4. KPI Metrics (Unified storage)
CREATE TABLE IF NOT EXISTS public.kpi_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.supported_integrations(id) ON DELETE SET NULL,
  metric_name TEXT NOT NULL, -- e.g., 'Zoom Attendees', 'Mailchimp Open Rate'
  metric_value NUMERIC NOT NULL,
  metric_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS POLICIES

ALTER TABLE public.supported_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_metrics ENABLE ROW LEVEL SECURITY;

-- Everyone can see supported integrations
CREATE POLICY "Public read supported_integrations" ON public.supported_integrations
  FOR SELECT TO authenticated USING (true);

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

-- Users can only see their own metrics
CREATE POLICY "Users view own metrics" ON public.kpi_metrics
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- SEED DATA for initial apps
INSERT INTO public.supported_integrations (name, slug, auth_type) VALUES
  ('Notion', 'notion', 'api_key'),
  ('Zoom', 'zoom', 'oauth2'),
  ('Luma', 'luma', 'api_key'),
  ('Mailchimp', 'mailchimp', 'api_key')
ON CONFLICT (slug) DO NOTHING;
