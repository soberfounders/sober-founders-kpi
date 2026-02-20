
// Apply migration via Supabase SQL API (postgrest-compatible approach)
// Uses the service-role key to execute DDL via pg/query endpoint

const bytes = await Deno.readFile('.env');
const envText = new TextDecoder().decode(bytes);
const envVars: Record<string, string> = {};
for (const line of envText.split(/\r?\n/)) { 
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    envVars[match[1].trim()] = value;
  }
}

const supabaseUrl = envVars['SUPABASE_URL'];
const serviceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const anonKey = envVars['SUPABASE_ANON_KEY'];

if (!supabaseUrl) {
    console.error("Missing SUPABASE_URL");
    Deno.exit(1);
}

const migrationSql = await Deno.readTextFile('supabase/migrations/20260219100000_zoom_identity_tables.sql');

// Try the Supabase pg/query endpoint (available on newer Supabase versions)
const queryUrl = `${supabaseUrl}/pg/query`;
console.log(`Trying ${queryUrl}...`);

const res = await fetch(queryUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': anonKey || serviceKey,
  },
  body: JSON.stringify({ query: migrationSql }),
});

console.log(`Status: ${res.status}`);
const text = await res.text();
console.log(`Response: ${text.substring(0, 500)}`);

if (res.ok) {
  console.log("\n✓ Migration applied successfully!");
} else {
  console.log("\nTrying alternative: Supabase SQL execute endpoint...");
  
  // Try the /rest/v1/rpc approach with a custom function
  // Or try direct /sql endpoint
  const sqlUrl = `${supabaseUrl}/rest/v1/`;
  const checkRes = await fetch(`${sqlUrl}zoom_identities?select=canonical_id&limit=1`, {
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': anonKey || serviceKey,
    },
  });
  
  console.log(`Check zoom_identities: ${checkRes.status}`);
  const checkText = await checkRes.text();
  console.log(`Response: ${checkText.substring(0, 200)}`);
  
  if (checkRes.status === 200) {
    console.log("\n✓ Tables already exist!");
  } else {
    console.log("\n✗ Tables don't exist yet. Please apply the migration manually:");
    console.log("  1. Go to https://supabase.com/dashboard/project/ldnucnghzpkuixmnfjbs/sql/new");
    console.log("  2. Paste the contents of supabase/migrations/20260219100000_zoom_identity_tables.sql");
    console.log("  3. Click Run");
  }
}
