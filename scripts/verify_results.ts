import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const { data, error } = await supabase
  .from("kpi_metrics")
  .select("*")
  .eq("metric_name", "Zoom New Attendees")
  .order("metric_date", { ascending: false });

if (error) {
  console.error(error);
  Deno.exit(1);
}

for (const row of data) {
    const details = row.metadata.new_attendee_details || [];
    const hasEmail = details.some((d: any) => d.email);
    if (hasEmail) {
        console.log(`--- ${row.metric_date} (HAS EMAILS) ---`);
        console.log(JSON.stringify(row.metadata.new_attendee_details, null, 2));
    }
}
