/* ============================================================
   recovery_events — tracking no-show outreach
   ============================================================ */
CREATE TABLE IF NOT EXISTS public.recovery_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_email  TEXT        NOT NULL,
  event_type      TEXT        NOT NULL,
  meeting_id      TEXT,
  meeting_date    DATE,
  metadata        JSONB       DEFAULT '{}'::jsonb,
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recovery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recovery_events_select" ON public.recovery_events FOR SELECT USING (true);
CREATE POLICY "recovery_events_insert" ON public.recovery_events FOR INSERT WITH CHECK (true);
