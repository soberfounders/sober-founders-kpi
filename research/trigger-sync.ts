
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

const supabaseUrl = envVars['SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_ANON_KEY']; // Try Anon Key

if (!supabaseUrl) console.error("Missing SUPABASE_URL");
if (!supabaseKey) console.error("Missing SUPABASE_ANON_KEY");

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env");
    console.log("Available keys:", Object.keys(envVars));
    Deno.exit(1);
}

// 1. Sync FB Ads
console.log("\nTriggering sync_fb_ads...");
const weekStart = "2024-02-12"; // Use a recent Monday? Or dynamic?
// Actually let's use a dynamic recent Monday.
const d = new Date();
const day = d.getDay();
const diff = d.getDate() - day + (day == 0 ? -6:1); // adjust when day is sunday
const monday = new Date(d.setDate(diff));
const mondayStr = monday.toISOString().slice(0, 10);

console.log(`Using week_start=${mondayStr}`);

const resAds = await fetch(`${supabaseUrl}/functions/v1/sync_fb_ads?week_start=${mondayStr}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${supabaseKey}` }
});

if (resAds.ok) {
    const data = await resAds.json();
    console.log("Ads Sync Success:", data);
} else {
    console.error("Ads Sync Failed:", await resAds.text());
}

// 2. Sync Zoom Attendance
console.log("\nTriggering sync_zoom_attendance...");
const resZoom = await fetch(`${supabaseUrl}/functions/v1/sync_zoom_attendance`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${supabaseKey}` }
});

if (resZoom.ok) {
    const data = await resZoom.json();
    console.log("Zoom Sync Success:", data);
} else {
    console.error("Zoom Sync Failed:", await resZoom.text());
}
