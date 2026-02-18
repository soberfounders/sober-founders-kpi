
// Load env vars
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

const token = envVars['HUBSPOT_PRIVATE_APP_TOKEN'];
if (!token) {
    console.error("Missing HUBSPOT_PRIVATE_APP_TOKEN");
    Deno.exit(1);
}

const emailToTest = "test@example.com"; // We might not find this, let's try to search for *any* contact or just list recent
// or better, if the user has a known email, we could test that. 
// I'll try to list one contact and see their properties.

const url = "https://api.hubapi.com/crm/v3/objects/contacts?limit=1&properties=email,firstname,lastname,hs_analytics_source,hs_analytics_source_data_1,hs_analytics_source_data_2,original_traffic_source";

console.log(`Fetching Hubspot contact...`);

try {
    const res = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HubSpot failed: ${res.status} ${txt}`);
    }

    const data = await res.json();
    console.log("HubSpot Test Success!");
    if (data.results && data.results.length > 0) {
        console.log("Sample Contact Properties:", JSON.stringify(data.results[0].properties, null, 2));
    } else {
        console.log("No contacts found.");
    }
} catch (error) {
    console.error("Error:", error);
}
