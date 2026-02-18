-- Add a "free" funnel rule in a schema-compatible way.
-- Some environments include ad_account_id, others do not.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fb_funnel_rules'
      AND column_name = 'ad_account_id'
  ) THEN
    INSERT INTO public.fb_funnel_rules (ad_account_id, match_field, match_pattern, funnel_key, is_active, priority)
    VALUES ('2665348776814311', 'campaign_name', '%', 'free', true, 5)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.fb_funnel_rules (match_field, match_pattern, funnel_key, is_active, priority)
    VALUES ('campaign_name', 'free', 'free', true, 5)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
