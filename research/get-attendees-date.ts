
// Load env vars
const envText = await Deno.readTextFile('.env');
const envVars = {};
for (const line of envText.split('\n')) {
  const [key, value] = line.split('=');
  if (key && value) envVars[key.trim()] = value.trim();
}

const account_id = envVars['ZOOM_ACCOUNT_ID'];
const client_id = envVars['ZOOM_CLIENT_ID'];
const client_secret = envVars['ZOOM_CLIENT_SECRET'];

async function log(msg) { console.log(msg); }

async function getAttendeesForDate(targetDate) {
  // targetDate format: 'YYYY-MM-DD'
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${account_id}`;
  let accessToken = '';

  try {
      const tokenRes = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`${client_id}:${client_secret}`)}` }
      });
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
  } catch (err) {
      console.error("Auth Error", err);
      return;
  }

  const targets = ['84242212480', '87199667045'];
  
  console.log(`\nChecking meetings on ${targetDate}...`);

  for (const meetingId of targets) {
      const instancesRes = await fetch(`https://api.zoom.us/v2/past_meetings/${meetingId}/instances`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (instancesRes.status !== 200) continue;

      const data = await instancesRes.json();
      const meetings = data.meetings || [];
      const match = meetings.find(m => m.start_time.startsWith(targetDate));

      if (match) {
          console.log(`\n✅ Found Meeting (${meetingId}) at ${match.start_time}`);
          
          let uuid = match.uuid;
          if (uuid.includes('/') || uuid.includes('+')) {
              uuid = encodeURIComponent(encodeURIComponent(uuid));
          }

          const participantsRes = await fetch(`https://api.zoom.us/v2/report/meetings/${uuid}/participants?page_size=300`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          const pData = await participantsRes.json();
          const allParticipants = pData.participants || [];
          
          const exclusionKeywords = ['note', 'notetaker', 'fireflies.ai', 'fathom', 'read.ai', 'otter.ai'];
          const uniqueMap = new Map();

          for (const p of allParticipants) {
             const name = (p.name || "").toLowerCase();
             const email = p.user_email || "";

             if (exclusionKeywords.some(k => name.includes(k))) continue;

             const key = email || name; // Dedupe
             if (!uniqueMap.has(key)) {
                 uniqueMap.set(key, p.name); // Store original name
             }
          }

          console.log(`Total: ${allParticipants.length} | Net: ${uniqueMap.size}`);
          console.log("--- Attendees ---");
          Array.from(uniqueMap.values()).sort().forEach(name => console.log(name));
      }
  }
}

getAttendeesForDate('2026-02-12');
