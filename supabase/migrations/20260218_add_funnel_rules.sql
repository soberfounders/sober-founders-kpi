-- Insert Funnel Rules for Ad Account Mapping

-- 1. Free/Groups Account
INSERT INTO fb_funnel_rules (ad_account_id, funnel_key, match_field, match_pattern, priority, is_active)
VALUES 
('2665348776814311', 'free', 'ad_account_id', '2665348776814311', 1, true)
ON CONFLICT (ad_account_id, match_field, match_pattern) 
DO UPDATE SET funnel_key = 'free', is_active = true;

-- 2. Phoenix Forum Account
INSERT INTO fb_funnel_rules (ad_account_id, funnel_key, match_field, match_pattern, priority, is_active)
VALUES 
('1034775818463907', 'phoenix', 'ad_account_id', '1034775818463907', 1, true)
ON CONFLICT (ad_account_id, match_field, match_pattern) 
DO UPDATE SET funnel_key = 'phoenix', is_active = true;
