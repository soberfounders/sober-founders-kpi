
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

const accountId = envVars['ZOOM_ACCOUNT_ID'];
const clientId = envVars['ZOOM_CLIENT_ID'];
const clientSecret = envVars['ZOOM_CLIENT_SECRET'];

async function getAccessToken() {
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
  });
  const json = await res.json();
  return json.access_token;
}

async function getMeetingInstances(accessToken, meetingId) {
    const res = await fetch(`https://api.zoom.us/v2/past_meetings/${meetingId}/instances`, {
        headers: { authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    return data.meetings || [];
}

async function getParticipants(accessToken, meetingUuid) {
    const encodedUuid = encodeURIComponent(encodeURIComponent(meetingUuid));
    const res = await fetch(`https://api.zoom.us/v2/report/meetings/${encodedUuid}/participants?page_size=300`, {
        headers: { authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    return data.participants || [];
}

const token = await getAccessToken();
const ids = ["84242212480", "87199667045"];

console.log("Analyzing meetings...");

for (const id of ids) {
    console.log(`\n=== Meeting ID: ${id} ===`);
    const instances = await getMeetingInstances(token, id);
    
    // Group by date to find duplicates
    const byDate = {};
    for (const inst of instances) {
        const date = inst.start_time.substring(0, 10);
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(inst);
    }

    // Sort dates
    const dates = Object.keys(byDate).sort();

    for (const date of dates) {
        const list = byDate[date];
        if (list.length > 0) { // Check all, but especially if > 1
             console.log(`\nDate: ${date} (${list.length} instances)`);
             for (const inst of list) {
                 const participants = await getParticipants(token, inst.uuid);
                 console.log(`   - Time: ${inst.start_time.substring(11, 16)} | Duration: ${inst.duration}m | UUID: ${inst.uuid} | Participants: ${participants.length}`);
                 if (participants.length < 5) {
                     console.log(`     -> Names: ${participants.map(p => p.name).join(', ')}`);
                 }
             }
        }
    }
}
