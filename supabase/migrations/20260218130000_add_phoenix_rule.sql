
-- Add rule for Phoenix campaigns
INSERT INTO public.fb_funnel_rules (match_field, match_pattern, funnel_key, is_active, priority)
VALUES 
  ('campaign_name', '%phoenix%', 'phoenix', true, 10)
ON CONFLICT DO NOTHING;

-- Ensure 'free' rule has lower priority (it was 5, now we check if we need to adjust)
-- The existing rule for ad account 2665348776814311 has priority 5.
-- If a campaign in that account has 'phoenix' in name, we want it to be 'phoenix'.
-- So priority 10 > 5, which is correct.
