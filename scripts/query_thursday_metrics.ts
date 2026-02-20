
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("=== Querying Cleaned Net Unique Metrics ===");
  
  const { data, error } = await supabase
    .from("kpi_metrics")
    .select("metric_date, metric_value")
    .eq("metric_name", "Zoom Net Attendees - Thursday")
    .order("metric_date", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error querying metrics:", error);
    return;
  }

  console.log("Recent Net Unique Attendance (Thursday):");
  if (!data || data.length === 0) {
      console.log("No data found.");
  } else {
      data.forEach((row: any) => {
          console.log(`  Date: ${row.metric_date} | Count: ${row.metric_value}`);
      });
  }
}

main();
