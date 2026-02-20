import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://ldnucnghzpkuixmnfjbs.supabase.co";
const supabaseKey = "8d25d4a7b1e1905680589166b7018a9888f42f8d84109e9ac2aef220afb306ab";

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyRules() {
    console.log("Applying funnel rules via Supabase Client...");

    const rules = [
        {
            ad_account_id: '2665348776814311',
            funnel_key: 'free',
            match_field: 'ad_account_id',
            match_pattern: '2665348776814311',
            priority: 1,
            is_active: true
        },
        {
            ad_account_id: '1034775818463907',
            funnel_key: 'phoenix',
            match_field: 'ad_account_id',
            match_pattern: '1034775818463907',
            priority: 1,
            is_active: true
        }
    ];

    for (const rule of rules) {
        // We use upsert to handle conflict on (ad_account_id, match_field, match_pattern) if constraint exists
        // Or unqiueness on match_pattern/match_field?
        // The migration SQL used ON CONFLICT (ad_account_id, match_field, match_pattern).
        
        const { error } = await supabase
            .from('fb_funnel_rules')
            .upsert(rule, { onConflict: 'ad_account_id,match_field,match_pattern' });

        if (error) {
            console.error(`Error upserting rule for ${rule.funnel_key}:`, error);
        } else {
            console.log(`Success: ${rule.funnel_key}`);
        }
    }
}

applyRules();
