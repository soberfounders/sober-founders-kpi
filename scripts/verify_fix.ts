
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("=== Diagnosing Sam & Josh (Post-Fix) ===");
  
  // 1. Check Sam
  console.log("\n--- Finding 'Sam Ghanem' ---");
  const { data: samData } = await supabase
    .from("zoom_identities")
    .select("*")
    .ilike("canonical_name", "%Sam Ghanem%")
    .single();

  if (samData) {
      console.log(`Sam Ghanem Identity:`);
      console.log(`  ID: ${samData.canonical_id}`);
      console.log(`  Visits: ${samData.total_appearances}`);
      console.log(`  Aliases (${samData.name_aliases?.length}): ${samData.name_aliases?.join(", ")}`);
      // Check if Josh is in aliases
      if (samData.name_aliases?.some((a: string) => a.toLowerCase().includes("josh"))) {
          console.error("❌ FAILED: Josh is still an alias of Sam!");
      } else {
          console.log("✅ SUCCESS: Josh is NOT an alias of Sam.");
      }
  } else {
      console.log("❌ Sam Ghanem identity not found.");
  }

  // 2. Check Josh
  console.log("\n--- Finding 'Josh Cougler' ---");
  const { data: joshData } = await supabase
    .from("zoom_identities")
    .select("*")
    .ilike("canonical_name", "%Josh Cougler%")
    .single();

  if (joshData) {
      console.log(`Josh Cougler Identity:`);
      console.log(`  ID: ${joshData.canonical_id}`);
      console.log(`  Visits: ${joshData.total_appearances}`);
  } else {
      console.log("❌ Josh Cougler identity not found (Maybe he is merged into someone else?)");
  }
}

main();
