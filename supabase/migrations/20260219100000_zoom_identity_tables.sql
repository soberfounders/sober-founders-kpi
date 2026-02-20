-- ============================================================
-- Zoom Data Integrity System — Identity Resolution Tables
-- ============================================================

-- 1. Master Identity Records
CREATE TABLE IF NOT EXISTS public.zoom_identities (
  canonical_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL,
  zoom_user_ids TEXT[] DEFAULT '{}',
  name_aliases TEXT[] DEFAULT '{}',
  email TEXT,
  first_seen_date DATE,
  total_appearances INTEGER DEFAULT 0,
  is_note_taker BOOLEAN DEFAULT false,
  merged_from UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zoom_identities_zoom_user_ids ON public.zoom_identities USING GIN (zoom_user_ids);
CREATE INDEX IF NOT EXISTS idx_zoom_identities_name_aliases ON public.zoom_identities USING GIN (name_aliases);
CREATE INDEX IF NOT EXISTS idx_zoom_identities_email ON public.zoom_identities (email);

-- 2. Per-session Attendance (links canonical_id to sessions)
CREATE TABLE IF NOT EXISTS public.zoom_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id UUID NOT NULL REFERENCES public.zoom_identities(canonical_id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  meeting_id TEXT NOT NULL,
  meeting_uuid TEXT,
  group_name TEXT NOT NULL,  -- 'Tuesday' or 'Thursday'
  is_net_new BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(canonical_id, session_date, meeting_id)
);

CREATE INDEX IF NOT EXISTS idx_zoom_attendance_session ON public.zoom_attendance (session_date, group_name);
CREATE INDEX IF NOT EXISTS idx_zoom_attendance_canonical ON public.zoom_attendance (canonical_id);

-- 3. Merge Audit Log
CREATE TABLE IF NOT EXISTS public.zoom_merge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,  -- 'auto_merge_zoom_id', 'auto_merge_name', 'auto_merge_email', 'manual_merge', 'new_record', 'note_taker_removed'
  source_name TEXT,
  target_canonical_id UUID REFERENCES public.zoom_identities(canonical_id) ON DELETE SET NULL,
  target_canonical_name TEXT,
  confidence NUMERIC,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zoom_merge_log_created ON public.zoom_merge_log (created_at DESC);

-- 4. Pending Review Queue (fuzzy matches needing human decision)
CREATE TABLE IF NOT EXISTS public.zoom_pending_review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_a_id UUID REFERENCES public.zoom_identities(canonical_id) ON DELETE CASCADE,
  candidate_b_id UUID REFERENCES public.zoom_identities(canonical_id) ON DELETE CASCADE,
  candidate_a_name TEXT,
  candidate_b_name TEXT,
  confidence NUMERIC,
  reason TEXT,
  status TEXT DEFAULT 'pending',  -- 'pending', 'merged', 'kept_separate', 'marked_notetaker'
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zoom_pending_status ON public.zoom_pending_review (status);

-- 5. Note Taker Blocklist
CREATE TABLE IF NOT EXISTS public.zoom_notetaker_blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoom_user_id TEXT,
  name_pattern TEXT,
  added_by TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.zoom_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoom_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoom_merge_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoom_pending_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoom_notetaker_blocklist ENABLE ROW LEVEL SECURITY;

-- Read access for dashboard (matching existing kpi_metrics pattern)
CREATE POLICY "Public read zoom_identities" ON public.zoom_identities
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public read zoom_attendance" ON public.zoom_attendance
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public read zoom_merge_log" ON public.zoom_merge_log
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public read zoom_pending_review" ON public.zoom_pending_review
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public read zoom_notetaker_blocklist" ON public.zoom_notetaker_blocklist
  FOR SELECT TO anon, authenticated USING (true);

-- Write access for anon (dev mode, matching existing pattern)
CREATE POLICY "Anon write zoom_identities" ON public.zoom_identities
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon write zoom_attendance" ON public.zoom_attendance
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon write zoom_merge_log" ON public.zoom_merge_log
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon write zoom_pending_review" ON public.zoom_pending_review
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon write zoom_notetaker_blocklist" ON public.zoom_notetaker_blocklist
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Seed default notetaker patterns
INSERT INTO public.zoom_notetaker_blocklist (name_pattern, added_by) VALUES
  ('notetaker', 'system'),
  ('note taker', 'system'),
  ('note-taker', 'system'),
  ('otter', 'system'),
  ('fireflies', 'system'),
  ('fathom', 'system'),
  ('krisp', 'system'),
  ('airgram', 'system'),
  ('notta', 'system'),
  ('read.ai', 'system')
ON CONFLICT DO NOTHING;
