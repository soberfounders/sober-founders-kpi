-- Per-module AI analysis cache for DashboardOverview cards.
-- Stores summary bullets + autonomous/human actions so page loads can use
-- the latest generated analysis without forcing a new AI call each refresh.

CREATE TABLE IF NOT EXISTS public.ai_module_analyses (
  module_key text PRIMARY KEY,
  summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  autonomous_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  human_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  analysis_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_hash text,
  ai_model text,
  is_mock boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_module_analyses_generated_at
  ON public.ai_module_analyses (generated_at DESC);

ALTER TABLE public.ai_module_analyses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_module_analyses'
      AND policyname = 'Public read ai_module_analyses'
  ) THEN
    CREATE POLICY "Public read ai_module_analyses"
      ON public.ai_module_analyses
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;
