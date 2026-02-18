import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Hardcoded for debugging purposes to bypass .env parsing issues
const supabaseUrl = "https://ldnucnghzpkuixmnfjbs.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkbnVjbmdoenBrdWl4bW5mamJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjAyNzAsImV4cCI6MjA4NjgzNjI3MH0.XKn_aJWarD7oU94-l_so__b1Vk4k0zT_PM7bJdNIAd0";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkHubSpotData() {
  console.log("Checking raw_hubspot_contacts for Phoenix related data...");
  
  const { data: contacts, error } = await supabase
    .from('raw_hubspot_contacts')
    .select('*')
    .or('membership_s.ilike.%Paid Groups%,hs_analytics_source_data_2.ilike.%phoenix%')
    .limit(100);

  if (error) {
    console.error("Error fetching contacts:", error);
    return;
  }

  if (contacts && contacts.length > 0) {
    console.log(`Found ${contacts.length} contacts.`);
    
    // Check membership_s values
    const memberships = [...new Set(contacts.map(c => c.membership_s))];
    console.log("Unique Memberships:", memberships);

    // Check for "Phoenix" in any field
    const phoenixContacts = contacts.filter(c => 
        JSON.stringify(c).toLowerCase().includes('phoenix')
    );
    console.log(`Contacts containing 'phoenix': ${phoenixContacts.length}`);
    if (phoenixContacts.length > 0) {
        console.log("Sample Phoenix Contact:", phoenixContacts[0]);
    }
  } else {
    console.log("No contacts found.");
  }
}

checkHubSpotData();
