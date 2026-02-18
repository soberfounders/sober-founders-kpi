
// Load env vars
const bytes = await Deno.readFile('.env');
const envText = new TextDecoder().decode(bytes);
const envVars: Record<string, string> = {};
for (const line of envText.split(/\r?\n/)) { 
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let value = match[2].trim();
    // Remove wrapping quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    envVars[match[1].trim()] = value;
  }
}

// DEBUG: Verify key loaded
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || '';
console.log(`Loaded Key Length: ${key.length}`);
if (key.length < 10) console.warn("WARNING: Key seems too short/empty");

const supabaseUrl = envVars['SUPABASE_URL'];
const serviceRoleKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    Deno.exit(1);
}

const functionUrl = `${supabaseUrl}/functions/v1/sync_zoom_attendance`;

console.log(`Triggering sync at: ${functionUrl}...`);

try {
    const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json'
        }
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Sync failed: ${res.status} ${txt}`);
    }

    const data = await res.json();
    console.log("Sync successful!", data);
} catch (error) {
    console.error("Error triggering sync:", error);
    Deno.exit(1);
}
