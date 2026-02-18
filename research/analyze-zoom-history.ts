
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

async function log(msg) {
    console.log(msg); 
}

async function analyzeZoom() {
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

  const targets = [
      { id: '84242212480', label: 'Tuesday Mastermind' },
      { id: '87199667045', label: 'Thursday Mastermind' }
  ];

  // Calculate date 6 weeks ago
  const now = new Date();
  const sixWeeksAgo = new Date(now.getTime() - (6 * 7 * 24 * 60 * 60 * 1000));
  await log(`\nAnalyzing meetings since: ${sixWeeksAgo.toISOString().split('T')[0]}`);

  const results = [];

  for (const target of targets) {
      await log(`\nFetching history for: ${target.label} (${target.id})...`);
      
      try {
          const instancesRes = await fetch(`https://api.zoom.us/v2/past_meetings/${target.id}/instances`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          if (instancesRes.status === 404) {
              await log(`   ❌ No past instances found for ${target.id}`);
              continue;
          }

          const instancesData = await instancesRes.json();
          let meetings = instancesData.meetings || [];
          
          // Filter for last 6 weeks
          meetings = meetings.filter(m => new Date(m.start_time) >= sixWeeksAgo);
          
          // Sort by date desc
          meetings.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

          await log(`   Found ${meetings.length} relevant instances.`);

          for (const meeting of meetings) {
               // UUID needs to be double encoded if it contains / or + (Zoom API quirk)
              let uuid = meeting.uuid;
              if (uuid.includes('/') || uuid.includes('+')) {
                  uuid = encodeURIComponent(encodeURIComponent(uuid));
              }
              
              const participantsRes = await fetch(`https://api.zoom.us/v2/report/meetings/${uuid}/participants?page_size=300`, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
              });

              if (participantsRes.status !== 200) {
                  await log(`      ❌ Error fetching participants for ${meeting.start_time}: ${participantsRes.status}`);
                  continue;
              }

              const participantsData = await participantsRes.json();
              const allParticipants = participantsData.participants || [];
              
              const uniqueMap = new Map();
              const excludedCount = 0;
              const exclusionKeywords = ['note', 'notetaker', 'fireflies.ai', 'fathom', 'read.ai', 'otter.ai'];
              
              let filteredCount = 0;
              let grossCount = allParticipants.length;

              for (const p of allParticipants) {
                  const name = (p.name || "").toLowerCase();
                  const email = p.user_email || "";
                  
                  // Exclusion logic
                  const isExcluded = exclusionKeywords.some(keyword => name.includes(keyword));
                  if (isExcluded) continue;

                  // Deduplication logic for "Net" count
                  const key = email || name;
                  if (key && !uniqueMap.has(key)) {
                      uniqueMap.set(key, true);
                  }
              }
              
              filteredCount = uniqueMap.size;

              results.push({
                  date: meeting.start_time.split('T')[0],
                  day: target.label.includes('Tuesday') ? 'Tuesday' : 'Thursday',
                  gross: grossCount, // Total records returned (including duplicates/bots)
                  net: filteredCount, // Unique humans
                  raw_diff: grossCount - filteredCount
              });
              
              await log(`      ${meeting.start_time.split('T')[0]}: Gross ${grossCount} -> Net ${filteredCount}`);
          }

      } catch (err) {
          await log(`❌ Error processing ${target.label}: ` + err);
      }
  }

  // Verify Sort Results by Date
  results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  await log("\n\n=== 6-WEEK ATTENDANCE REPORT ===");
  await log("Date        | Day       | Gross | Net (Minus Note Takers)");
  await log("------------|-----------|-------|------------------------");
  for (const r of results) {
      await log(`${r.date}  | ${r.day.padEnd(9)} | ${r.gross.toString().padEnd(5)} | ${r.net}`);
  }
}

analyzeZoom();
