CREATE TABLE public.ai_briefings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  briefing_type text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]',
  action_items jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  ai_model text,
  confidence real,
  delivered_to jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ai_briefings_type_created ON public.ai_briefings (briefing_type, created_at DESC);

ALTER TABLE public.ai_briefings ENABLE ROW LEVEL SECURITY;;
