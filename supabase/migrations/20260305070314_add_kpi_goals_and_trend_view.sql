
/* ============================================================
   1. kpi_goals — stores target values per KPI / funnel
   ============================================================ */
CREATE TABLE IF NOT EXISTS public.kpi_goals (
  kpi_key          TEXT        NOT NULL,
  funnel_key       TEXT        NOT NULL DEFAULT 'unknown',
  target_value     NUMERIC     NOT NULL,
  higher_is_better BOOLEAN     NOT NULL DEFAULT true,
  notes            TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kpi_goals_pkey PRIMARY KEY (kpi_key, funnel_key),
  CONSTRAINT kpi_goals_kpi_key_fkey FOREIGN KEY (kpi_key)
    REFERENCES public.dim_kpi (kpi_key) ON DELETE CASCADE
);

ALTER TABLE public.kpi_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_goals_select_all"  ON public.kpi_goals FOR SELECT USING (true);
CREATE POLICY "kpi_goals_insert_all"  ON public.kpi_goals FOR INSERT WITH CHECK (true);
CREATE POLICY "kpi_goals_update_all"  ON public.kpi_goals FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "kpi_goals_delete_all"  ON public.kpi_goals FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS kpi_goals_set_updated_at ON public.kpi_goals;
CREATE TRIGGER kpi_goals_set_updated_at
  BEFORE UPDATE ON public.kpi_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ============================================================
   2. vw_kpi_trend — rolling-window stats + goal gap per KPI
   ============================================================ */
CREATE OR REPLACE VIEW public.vw_kpi_trend AS
WITH windowed AS (
  SELECT
    f.kpi_key,
    d.name                                                          AS kpi_name,
    f.funnel_key,
    f.week_start,
    f.value,
    LAG(f.value, 1) OVER w                                          AS prev_1w,
    LAG(f.value, 2) OVER w                                          AS prev_2w,
    LAG(f.value, 3) OVER w                                          AS prev_3w,
    array_agg(f.value) OVER (
      PARTITION BY f.kpi_key, f.funnel_key
      ORDER BY f.week_start
      ROWS BETWEEN 7 PRECEDING AND CURRENT ROW
    )                                                               AS trailing_8w_values,
    avg(f.value) OVER (
      PARTITION BY f.kpi_key, f.funnel_key
      ORDER BY f.week_start
      ROWS BETWEEN 7 PRECEDING AND CURRENT ROW
    )                                                               AS rolling_avg_8w,
    stddev_samp(f.value) OVER (
      PARTITION BY f.kpi_key, f.funnel_key
      ORDER BY f.week_start
      ROWS BETWEEN 7 PRECEDING AND CURRENT ROW
    )                                                               AS rolling_std_8w,
    g.target_value,
    g.higher_is_better,
    g.notes                                                         AS goal_notes
  FROM public.fact_kpi_weekly f
  JOIN public.dim_kpi d ON d.kpi_key = f.kpi_key
  LEFT JOIN public.kpi_goals g
    ON  g.kpi_key    = f.kpi_key
    AND g.funnel_key = f.funnel_key
  WINDOW w AS (PARTITION BY f.kpi_key, f.funnel_key ORDER BY f.week_start)
)
SELECT
  kpi_key,
  kpi_name,
  funnel_key,
  week_start,
  value,
  prev_1w,
  prev_2w,
  prev_3w,
  trailing_8w_values,
  ROUND(rolling_avg_8w::NUMERIC, 2)                                 AS rolling_avg_8w,
  ROUND(rolling_std_8w::NUMERIC, 2)                                 AS rolling_std_8w,
  CASE
    WHEN rolling_std_8w > 0
    THEN ROUND(((value - rolling_avg_8w) / rolling_std_8w)::NUMERIC, 2)
    ELSE NULL
  END                                                               AS z_score,
  (value - prev_1w)                                                 AS wow_delta,
  CASE
    WHEN prev_1w IS NOT NULL AND prev_1w <> 0
    THEN ROUND(((value - prev_1w) / ABS(prev_1w) * 100)::NUMERIC, 1)
    ELSE NULL
  END                                                               AS wow_pct,
  CASE
    WHEN prev_3w IS NOT NULL
         AND value < prev_1w AND prev_1w < prev_2w AND prev_2w < prev_3w THEN 3
    WHEN prev_2w IS NOT NULL
         AND value < prev_1w AND prev_1w < prev_2w                       THEN 2
    WHEN prev_1w IS NOT NULL
         AND value < prev_1w                                              THEN 1
    ELSE 0
  END                                                               AS consecutive_declines,
  target_value                                                      AS goal_value,
  higher_is_better,
  goal_notes,
  CASE
    WHEN target_value IS NULL THEN 'no_goal'
    WHEN higher_is_better IS NOT DISTINCT FROM true THEN
      CASE
        WHEN value >= target_value          THEN 'on_track'
        WHEN value >= target_value * 0.85   THEN 'near_goal'
        ELSE                                     'off_track'
      END
    ELSE -- lower is better (cost metrics)
      CASE
        WHEN value <= target_value          THEN 'on_track'
        WHEN value <= target_value * 1.15   THEN 'near_goal'
        ELSE                                     'off_track'
      END
  END                                                               AS goal_status,
  CASE
    WHEN target_value IS NOT NULL AND target_value <> 0
    THEN ROUND(((value - target_value) / target_value * 100)::NUMERIC, 1)
    ELSE NULL
  END                                                               AS pct_to_goal
FROM windowed;

/* ============================================================
   3. Seed default goals (edit these in the AI Manager dashboard)
   ============================================================ */
INSERT INTO public.kpi_goals (kpi_key, funnel_key, target_value, higher_is_better, notes) VALUES
  -- Attendance
  ('showup_tue_total',          'unknown', 18,  true,  'Tuesday meeting weekly headcount target'),
  ('showup_thu_total',          'unknown', 25,  true,  'Thursday meeting weekly headcount target'),
  ('new_tue',                   'unknown',  3,  true,  'First-time Tuesday attendees per week'),
  ('new_thu',                   'unknown',  5,  true,  'First-time Thursday attendees per week'),
  ('total_new_show_calculated', 'unknown',  8,  true,  'Total new attendees across both meetings per week'),
  -- Leads
  ('hs_contacts_created',           'unknown', 20, true, 'New HubSpot contacts per week'),
  ('hs_contacts_qualified_created', 'unknown',  5, true, 'Contacts >$250k revenue per week'),
  ('paid_leads_free',               'free',    15, true, 'Paid leads from free funnel per week'),
  ('paid_qualified_leads_free',     'free',     5, true, 'Paid qualified leads from free funnel per week'),
  ('paid_leads_phoenix',            'phoenix',  8, true, 'Paid leads from Phoenix funnel per week'),
  ('paid_qualified_leads_phoenix',  'phoenix',  3, true, 'Paid qualified leads from Phoenix funnel per week'),
  ('leads_great_>=1m',              'unknown',  3, true, 'New $1M+ revenue leads per week'),
  ('leads_good_250k_1m',            'unknown',  5, true, 'New $250k–$1M revenue leads per week'),
  -- Phoenix
  ('phoenix_calls_booked',      'phoenix', 5, true, 'Discovery calls booked per week'),
  ('phoenix_interviews_booked', 'phoenix', 3, true, 'Phoenix interviews booked per week'),
  ('phoenix_new_members',       'phoenix', 2, true, 'New paying Phoenix members per week'),
  ('intro_meetings_hs',         'unknown', 4, true, 'HubSpot-logged intro meetings per week'),
  -- Cost efficiency (lower is better)
  ('ad_cost_per_paid_lead',       'free',    50,  false, 'Target CPL for free funnel (lower is better)'),
  ('ad_cost_per_paid_lead',       'phoenix', 80,  false, 'Target CPL for Phoenix funnel (lower is better)'),
  ('ad_cost_per_qualified_lead',  'free',   150,  false, 'Target CPQL for free funnel (lower is better)'),
  ('ad_cost_per_new_showup_free', 'free',   200,  false, 'Cost per new free show-up (lower is better)')
ON CONFLICT (kpi_key, funnel_key) DO NOTHING;
;
