
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

async function analyzeDate(targetDate) {
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
          
          // --- Logic Start ---
          let candidates = [];
          const seenEmails = new Set();
          const exclusionKeywords = ['note', 'notetaker', 'fireflies.ai', 'fathom', 'read.ai', 'otter.ai'];
          const removedBots = [];

          // 1. Filter Bots & Basic
          for (const p of allParticipants) {
              const name = (p.name || "").trim();
              const email = (p.user_email || "").toLowerCase();
              const lowerName = name.toLowerCase();

              // Exclusion
              if (exclusionKeywords.some(k => lowerName.includes(k))) {
                  removedBots.push(name);
                  continue;
              }

              // Basic Dedupe
              if (email && seenEmails.has(email)) continue; // Silently skip exact email dupes? Or log them.
              // Let's keep them in candidates for the "verbose" logic to handle/show merging.
              // Actually, email dupes are usually same person joining twice. We can skip silently or show.
              // The user asked "duplicates that were removed".
              
              if (email) seenEmails.add(email);
              
              candidates.push({ name, email, lowerName });
          }

          // 2. Advanced Dedupe
          candidates.forEach(p => {
             p.isDevice = /iphone|ipad|android|galaxy/i.test(p.lowerName);
             p.score = (p.email ? 2 : 0) + (p.isDevice ? 0 : 1);
             p.cleanName = p.lowerName.replace(/['’]s\s*(iphone|ipad|android|galaxy)/i, '').trim();
          });

          candidates.sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              return b.name.length - a.name.length;
          });

          const included = [];
          const removedDupes = [];

          for (const p of candidates) {
              const match = included.find(existing => {
                  if (p.email && existing.email === p.email) return true;
                  if (existing.lowerName.includes(p.lowerName)) return true;
                  if (p.isDevice && existing.lowerName.includes(p.cleanName)) return true;
                  if (existing.lowerName.startsWith(p.lowerName)) return true;
                  return false;
              });

              if (!match) {
                  included.push(p);
              } else {
                  removedDupes.push({
                      name: p.name,
                      mergedInto: match.name,
                      reason: p.isDevice ? "Device Match" : "Name Match"
                  });
              }
          }

          // --- Report ---
          let report = `=== REPORT FOR ${targetDate} ===\n`;
          report += `Total Joined: ${allParticipants.length}\n`;
          report += `Net Attendees: ${included.length}\n`;
          
          report += `\n--- INCLUDED (${included.length}) ---\n`;
          const sorted = included.sort((a,b) => a.name.localeCompare(b.name));
          sorted.forEach(p => report += `+ ${p.name}\n`);

          report += `\n--- REMOVED DUPLICATES (${removedDupes.length}) ---\n`;
          for (const d of removedDupes) {
              report += `- ${d.name} -> ${d.mergedInto} (${d.reason})\n`;
          }
          
          report += `\n--- REMOVED BOTS (${removedBots.length}) ---\n`;
          removedBots.forEach(b => report += `x ${b}\n`);
          
          console.log(report);
          await Deno.writeTextFile('research/report_feb17.txt', report);
          console.log("\nReport saved to research/report_feb17.txt");
      }
  }
}

analyzeDate('2026-02-17');
