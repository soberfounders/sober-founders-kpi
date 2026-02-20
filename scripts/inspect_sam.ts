
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("=== Inspecting Sam Ghanem Identity ===");

  const { data, error } = await supabase
    .from("zoom_identities")
    .select("*")
    .ilike("canonical_name", "%Sam Ghanem%")
    .single();

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(JSON.stringify(data, null, 2));

  // Check valid aliases length
  if (data.name_aliases) {
      console.log(`\nAliases count: ${data.name_aliases.length}`);
  }
}

main();
