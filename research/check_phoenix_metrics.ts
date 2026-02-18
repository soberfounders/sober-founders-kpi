import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Hardcoded for debugging purposes to bypass .env parsing issues
const supabaseUrl = "https://ldnucnghzpkuixmnfjbs.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkbnVjbmdoenBrdWl4bW5mamJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjAyNzAsImV4cCI6MjA4NjgzNjI3MH0.XKn_aJWarD7oU94-l_so__b1Vk4k0zT_PM7bJdNIAd0";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPhoenixMetrics() {
  console.log("Checking kpi_metrics for Phoenix related entries...");
  
  // Search for anything with "phoenix" in the metric_name
  const { data: metrics, error } = await supabase
    .from('kpi_metrics')
    .select('metric_name, metric_value, metric_date')
    .ilike('metric_name', '%phoenix%')
    .order('metric_date', { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching metrics:", error);
    return;
  }

  if (metrics && metrics.length > 0) {
    console.log("Found existing Phoenix metrics:");
    console.table(metrics);
    
    // Group by name to see unique metric names
    const uniqueNames = [...new Set(metrics.map(m => m.metric_name))];
    console.log("\nUnique Phoenix Metric Names:", uniqueNames);
  } else {
    console.log("No metrics found containing 'Phoenix'.");
  }
}

checkPhoenixMetrics();
