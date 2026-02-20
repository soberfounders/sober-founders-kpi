
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("=== RESETTING Identity Tables ===");
  
  // Truncate tables with CASCADE
  // Since we don't have direct SQL access, we delete all rows.
  
  console.log("Deleting zoom_merge_log...");
  await supabase.from("zoom_merge_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("Deleting zoom_attendance...");
  await supabase.from("zoom_attendance").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("Deleting zoom_pending_review...");
  await supabase.from("zoom_pending_review").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  
  console.log("Deleting zoom_identities...");
  const { error } = await supabase.from("zoom_identities").delete().neq("canonical_id", "00000000-0000-0000-0000-000000000000");
  
  if (error) {
      console.error("Error deleting identities:", error);
  } else {
      console.log("Success. Tables cleared.");
  }
}

main();
