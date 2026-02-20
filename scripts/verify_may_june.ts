
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("=== Verifying May/June 2025 Data ===");
  
  // We expect data for these dates:
  const expectedDates = [
    "2025-05-15",
    "2025-05-22",
    "2025-05-29",
    "2025-06-05", // Same ID as 5/29
    "2025-06-12",
    "2025-06-19",
    "2025-06-26"
  ];

  const { data, error } = await supabase
    .from("kpi_metrics")
    .select("metric_date, metric_value")
    .eq("metric_name", "Zoom Net Attendees - Thursday")
    .in("metric_date", expectedDates.map(d => `${d}T00:00:00`))
    .order("metric_date", { ascending: true });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Found Metrics:");
  data?.forEach((row: any) => {
      console.log(`  Date: ${row.metric_date} | Count: ${row.metric_value}`);
  });
}

main();
