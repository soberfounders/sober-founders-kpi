
// Load env vars from .env file for local testing
const envText = await Deno.readTextFile('.env');
const envVars = {};
for (const line of envText.split('\n')) {
  const [key, value] = line.split('=');
  if (key && value) envVars[key.trim()] = value.trim();
}

const account_id = envVars['ZOOM_ACCOUNT_ID'];
const client_id = envVars['ZOOM_CLIENT_ID'];
const client_secret = envVars['ZOOM_CLIENT_SECRET'];

const logFile = 'research/zoom-output.txt';
async function log(msg) {
    console.log(msg); 
    await Deno.writeTextFile(logFile, msg + '\n', { append: true });
}

await Deno.writeTextFile(logFile, ''); // Clear log

async function testZoom() {
  await log("1. Authenticating with Zoom...");
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${account_id}`;
  let accessToken = '';

  try {
      const tokenRes = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
              'Authorization': `Basic ${btoa(`${client_id}:${client_secret}`)}`
          }
      });
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
      if (!accessToken) throw new Error("No access token provided: " + JSON.stringify(tokenData));
      await log("✅ Authenticated!");
  } catch (err) {
      await log("❌ Auth Error: " + err);
      return;
  }

  const meetingId = '84242212480';
  await log(`\n2. Checking Instances for Meeting ID: ${meetingId}...`);

  try {
      // 1. Get Past Meeting Instances
      const instancesRes = await fetch(`https://api.zoom.us/v2/past_meetings/${meetingId}/instances`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (instancesRes.status === 404) {
          await log("❌ Meeting ID not found or no past instances.");
          return;
      }

      const instancesData = await instancesRes.json();
      const meetings = instancesData.meetings || [];
      await log(`   Found ${meetings.length} past instances.`);

      // 2. Filter for Feb 2026
      const relevantMeetings = meetings.filter(m => m.start_time.startsWith('2026-02'));
      
      if (relevantMeetings.length === 0) {
          await log("   No instances found in Feb 2026. Listing last 5:");
          meetings.slice(0, 5).forEach(m => log(`    - ${m.start_time}`));
          return;
      }

      for (const meeting of relevantMeetings) {
          await log(`\n   🔎 Analyzing Instance: ${meeting.start_time} (UUID: ${meeting.uuid})`);
          
          // 3. Get Participants for this instance
          // UUID needs to be double encoded if it contains / or + (Zoom API quirk)
          let uuid = meeting.uuid;
          if (uuid.includes('/') || uuid.includes('+')) {
              uuid = encodeURIComponent(encodeURIComponent(uuid));
          }
          
          const participantsRes = await fetch(`https://api.zoom.us/v2/report/meetings/${uuid}/participants?page_size=300`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          if (participantsRes.status !== 200) {
              const errBody = await participantsRes.text();
              await log(`      ❌ Error fetching participants: ${participantsRes.status} ${participantsRes.statusText}`);
              await log(`      Body: ${errBody}`);
              continue;
          }

          const participantsData = await participantsRes.json();
          // await log(`      RAW DATA: ${JSON.stringify(participantsData)}`);
          const allParticipants = participantsData.participants || [];
          
          const uniqueMap = new Map();
          const excluded = [];
          const exclusionKeywords = ['note', 'notetaker', 'fireflies.ai', 'fathom', 'read.ai', 'otter.ai'];

          for (const p of allParticipants) {
              const name = (p.name || "").toLowerCase();
              const email = p.user_email || "";
              
              const isExcluded = exclusionKeywords.some(keyword => name.includes(keyword));
              if (isExcluded) {
                  excluded.push(`${p.name}`);
                  continue;
              }

              // Deduplicate by email if present, otherwise name
              const key = email || name;
              if (key && !uniqueMap.has(key)) {
                  uniqueMap.set(key, p);
              }
          }

          await log(`      ✅ Raw Count: ${allParticipants.length}`);
          await log(`      ✅ Filtered Count: ${uniqueMap.size}`);
          await log(`      ❌ Excluded: ${excluded.length} (${excluded.join(', ')})`);
          
          if (uniqueMap.size > 0) {
              await log(`      Attendees:`);
              uniqueMap.forEach(p => log(`        - ${p.name} (${p.user_email})`));
          }
      }

  } catch (err) {
      await log("❌ Error processing meeting ID: " + err);
  }
}

testZoom();
