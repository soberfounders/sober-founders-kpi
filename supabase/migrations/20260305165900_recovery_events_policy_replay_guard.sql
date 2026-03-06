-- Replay guard for duplicate historical recovery_events migrations.
-- Drops policies before the later duplicate migration re-creates them.
DO $$
BEGIN
  IF to_regclass('public.recovery_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS recovery_events_select ON public.recovery_events;
    DROP POLICY IF EXISTS recovery_events_insert ON public.recovery_events;
  END IF;
END $$;
