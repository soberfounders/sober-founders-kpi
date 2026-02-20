
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("=== Diagnosing Sam Ghanem Alias Issue ===");

  // 1. Check attendee_aliases
  console.log("\n--- attendee_aliases matching 'Sam' ---");
  const { data: aliases, error: aliasError } = await supabase
    .from("attendee_aliases")
    .select("*")
    .ilike("target_name", "%Sam%");
  
  if (aliasError) console.error("Error fetching aliases:", aliasError);
  else {
      console.log(`Found ${aliases.length} aliases pointing to Sam.`);
      aliases.forEach((a: any) => console.log(`  ${a.original_name} -> ${a.target_name}`));
  }

  // 2. Check zoom_identities
  console.log("\n--- zoom_identities matching 'Sam' ---");
  const { data: idents, error: identError } = await supabase
    .from("zoom_identities")
    .select("*")
    .ilike("canonical_name", "%Sam%");

  if (identError) {
      // Maybe table doesn't exist or permissions error?
      console.error("Error fetching identities:", identError);
  } else {
      console.log(`Found ${idents.length} identities canonicalized to Sam.`);
      idents.forEach((i: any) => console.log(`  [${i.id}] ${i.name} (User: ${i.zoom_user_id}) -> ${i.canonical_name} (Matches: ${i.match_reason})`));
  }
}

main();
