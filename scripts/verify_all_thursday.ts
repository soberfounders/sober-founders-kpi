
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("=== Verifying Full Thursday History (May-Aug 2025) ===");
  
  const expectedDates = [
    // May
    "2025-05-15", "2025-05-22", "2025-05-29",
    // June
    "2025-06-05", "2025-06-12", "2025-06-19", "2025-06-26",
    // July
    "2025-07-03", "2025-07-10", "2025-07-17", "2025-07-24", "2025-07-31",
    // August
    "2025-08-07", "2025-08-14", "2025-08-21", "2025-08-28"
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

  console.log(`Found ${data?.length} out of ${expectedDates.length} expected dates.`);
  
  const foundDates = new Set(data?.map((r: any) => r.metric_date.slice(0, 10)));
  
  expectedDates.forEach(date => {
      const row = data?.find((r: any) => r.metric_date.startsWith(date));
      if (row) {
          console.log(`✅ ${date}: ${row.metric_value}`);
      } else {
          console.log(`❌ ${date}: MISSING`);
      }
  });
}

main();
