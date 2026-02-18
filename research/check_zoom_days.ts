
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

async function checkMeeting(accessToken, meetingId) {
    const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
        headers: { authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    console.log(`\nID: ${meetingId}`);
    console.log(`Topic: ${data.topic}`);
    console.log(`Start Time: ${data.start_time}`);
    console.log(`Timezone: ${data.timezone}`);
    
    // Check recurrence or recent occurrences if generic
    if (data.occurrences && data.occurrences.length > 0) {
        console.log(`First Occurrence: ${data.occurrences[0].start_time}`);
    }
}

const token = await getAccessToken();
const ids = ["84242212480", "87199667045"];

for (const id of ids) {
    await checkMeeting(token, id);
}
