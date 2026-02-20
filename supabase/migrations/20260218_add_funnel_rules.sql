-- Insert Funnel Rules for Ad Account Mapping
-- Guarded with IF EXISTS checks to prevent errors on environments
-- where the schema may differ.
DO $$
BEGIN
  -- Only run if fb_funnel_rules exists AND has ad_account_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'fb_funnel_rules'
      AND column_name  = 'ad_account_id'
  ) THEN
    -- 1. Free/Groups Account
    INSERT INTO public.fb_funnel_rules (ad_account_id, funnel_key, match_field, match_pattern, priority, is_active)
    VALUES ('2665348776814311', 'free', 'ad_account_id', '2665348776814311', 1, true)
    ON CONFLICT DO NOTHING;

    -- 2. Phoenix Forum Account
    INSERT INTO public.fb_funnel_rules (ad_account_id, funnel_key, match_field, match_pattern, priority, is_active)
    VALUES ('1034775818463907', 'phoenix', 'ad_account_id', '1034775818463907', 1, true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
