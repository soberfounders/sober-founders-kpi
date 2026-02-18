
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const envText = await Deno.readTextFile('.env');
const env: Record<string, string> = {};
for (const line of envText.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1].trim()] = value;
  }
}

const supabaseUrl = env["SUPABASE_URL"];
const supabaseKey = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials!");
    Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log("Checking raw_fb_ads_insights_daily...");
  const { data: ads, error: adsError } = await supabase
    .from('raw_fb_ads_insights_daily')
    .select('*')
    .order('date_day', { ascending: false })
    .limit(5);

  if (adsError) console.error("Ads Error:", adsError);
  else {
    console.log(`Found ${ads.length} ad records.`);
    if (ads.length > 0) console.log("Sample Ad:", ads[0]);
  }

  console.log("\nChecking kpi_metrics (Zoom New Attendees)...");
  const { data: zoom, error: zoomError } = await supabase
    .from('kpi_metrics')
    .select('*')
    .eq('metric_name', 'Zoom New Attendees')
    .order('metric_date', { ascending: false })
    .limit(5);

  if (zoomError) console.error("Zoom Error:", zoomError);
  else {
    console.log(`Found ${zoom.length} zoom metrics.`);
    if (zoom.length > 0) console.log("Sample Zoom:", zoom[0]);
  }

  console.log("\nChecking fb_funnel_rules...");
  const { data: rules, error: rulesError } = await supabase
    .from('fb_funnel_rules')
    .select('*');

  if (rulesError) console.error("Rules Error:", rulesError);
  else {
    console.log("Rules:", rules);
  }
}

checkData();
