import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const supabase_url = envVars['SUPABASE_URL'];
const supabase_key = envVars['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabase_url, supabase_key);

async function log(msg) { console.log(msg); }

// --- DEDUPE LOGIC (Reused) ---
function getUniqueAttendees(participants) {
    let candidates = [];
    const seenEmails = new Set();
    const exclusionKeywords = ['note', 'notetaker', 'fireflies.ai', 'fathom', 'read.ai', 'otter.ai'];

    for (const p of participants) {
        const name = (p.name || "").trim();
        const email = (p.user_email || "").toLowerCase();
        const lowerName = name.toLowerCase();

        if (exclusionKeywords.some(k => lowerName.includes(k))) continue;
        if (email && seenEmails.has(email)) continue;
        if (email) seenEmails.add(email);

        candidates.push({ name, email, lowerName });
    }

    candidates.forEach(p => {
       p.isDevice = /iphone|ipad|android|galaxy/i.test(p.lowerName);
       p.score = (p.email ? 2 : 0) + (p.isDevice ? 0 : 1);
       p.cleanName = p.lowerName.replace(/['’]s\s*(iphone|ipad|android|galaxy)/i, '').trim();
    });

    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.name.length - a.name.length;
    });

    const unique = [];
    for (const p of candidates) {
        const isDuplicate = unique.some(existing => {
            if (p.email && existing.email === p.email) return true;
            if (existing.lowerName.includes(p.lowerName)) return true;
            if (p.isDevice && existing.lowerName.includes(p.cleanName)) return true;
            if (existing.lowerName.startsWith(p.lowerName)) return true;
            return false;
        });
        if (!isDuplicate) unique.push(p);
    }
    return unique.map(p => p.name); // Return just names
}

async function analyzeTrends() {
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${account_id}`;
  let accessToken = '';

  try {
      const tokenRes = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`${client_id}:${client_secret}`)}` }
      });
      const data = await tokenRes.json();
      accessToken = data.access_token;
  } catch (err) {
      console.error("Auth Error", err);
      return;
  }

  // CLEAR EXISTING DATA
  console.log("Clearing existing Zoom metrics from Supabase...");
  await supabase.from('kpi_metrics').delete().eq('metric_name', 'Zoom Meeting Attendees');

  const targets = ['84242212480', '87199667045'];
  let allMeetings = [];

  console.log("Fetching meeting history...");

  for (const id of targets) {
      const res = await fetch(`https://api.zoom.us/v2/past_meetings/${id}/instances`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.meetings) {
          allMeetings = allMeetings.concat(data.meetings.map(m => ({ ...m, meetingId: id })));
      }
  }

  // Sort Chronologically
  allMeetings.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  console.log(`Found ${allMeetings.length} total meeting instances.`);

  // --- Analysis State ---
  const attendeeHistory = new Map(); // Name -> { firstSeen: Date, count: 0, dates: [] }
  const meetingStats = []; // { date: string, total: num, new: num, returning: num }

  for (const meeting of allMeetings) {
      const dateStr = meeting.start_time.split('T')[0];
      // Skip very old meetings if needed, but let's do all
      
      let uuid = meeting.uuid;
      if (uuid.includes('/') || uuid.includes('+')) uuid = encodeURIComponent(encodeURIComponent(uuid));

      const pRes = await fetch(`https://api.zoom.us/v2/report/meetings/${uuid}/participants?page_size=300`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (pRes.status !== 200) continue;
      
      const pData = await pRes.json();
      const attendees = getUniqueAttendees(pData.participants || []);
      
      if (attendees.length < 2) continue; // Skip empty/test meetings

      let newCount = 0;
      let existingCount = 0;

      for (const name of attendees) {
          if (!attendeeHistory.has(name)) {
              attendeeHistory.set(name, { firstSeen: dateStr, count: 0, dates: [] });
              newCount++;
          } else {
              existingCount++;
          }
          
          const record = attendeeHistory.get(name);
          record.count++;
          record.dates.push(dateStr);
      }

      meetingStats.push({
          date: dateStr,
          total: attendees.length,
          new: newCount,
          returning: existingCount,
          day: new Date(meeting.start_time).getDay() === 2 ? 'Tue' : 'Thu'
      });
      
      console.log(`Processed ${dateStr}: ${attendees.length} attendees (${newCount} new)`);

      // INSERT INTO SUPABASE
      await supabase.from('kpi_metrics').insert({
          metric_name: 'Zoom Meeting Attendees',
          metric_value: attendees.length,
          metric_date: dateStr,
          source_slug: 'zoom',
          metadata: {
              meeting_id: meeting.meetingId,
              start_time: meeting.start_time,
              attendees: attendees
          }
      });

      // Rate limit safety
      await new Promise(r => setTimeout(r, 100)); 
  }

  // --- Generate Report ---
  let report = `=== ATTENDANCE TRENDS REPORT ===\n`;
  report += `Analyzed ${meetingStats.length} meetings.\n\n`;

  report += `--- MEETING LOG ---\n`;
  report += `Date       | Day | Total | New | Returning\n`;
  report += `-----------|-----|-------|-----|----------\n`;
  meetingStats.forEach(m => {
      report += `${m.date} | ${m.day} | ${m.total.toString().padEnd(5)} | ${m.new.toString().padEnd(3)} | ${m.returning}\n`;
  });

  // Calculate Average Attendance
  // Calculate Average Attendance
  const totalAttendees = attendeeHistory.size;
  let totalAppearances = 0;
  
  // Day-Specific Stats
  let tueUnique = new Set();
  let thuUnique = new Set();
  let tueAppearances = 0;
  let thuAppearances = 0;
  let tueRepeats = 0;
  let thuRepeats = 0;

  attendeeHistory.forEach((r, name) => {
      totalAppearances += r.count;
      
      let tueCount = 0;
      let thuCount = 0;
      
      r.dates.forEach(d => {
          const dateObj = new Date(d);
          // Simple check: getDay() 2=Tue, 4=Thu. NOTE: verify timezone if needed, but date string usually stable.
          // Better: check the meetingStats day for that date? 
          // Actually, let's just use the day logic from earlier.
          // Note: "2025-09-04" is Thu. new Date("2025-09-04").getDay() -> 4 (if local zone aligns or UTC)
          // To be safe, let's look up the day from meetingStats.
          const stat = meetingStats.find(m => m.date === d);
          if (stat) {
              if (stat.day === 'Tue') tueCount++;
              if (stat.day === 'Thu') thuCount++;
          }
      });

      if (tueCount > 0) {
          tueUnique.add(name);
          tueAppearances += tueCount;
          if (tueCount > 1) tueRepeats++;
      }
      if (thuCount > 0) {
          thuUnique.add(name);
          thuAppearances += thuCount;
          if (thuCount > 1) thuRepeats++;
      }
  });

  const avgAttendance = totalAppearances / totalAttendees;
  const avgTue = tueUnique.size > 0 ? tueAppearances / tueUnique.size : 0;
  const avgThu = thuUnique.size > 0 ? thuAppearances / thuUnique.size : 0;
  
  const tueRetention = tueUnique.size > 0 ? (tueRepeats / tueUnique.size) * 100 : 0;
  const thuRetention = thuUnique.size > 0 ? (thuRepeats / thuUnique.size) * 100 : 0;

  report += `\n--- GLOBAL STATS ---\n`;
  report += `Total Unique People: ${totalAttendees}\n`;
  report += `Avg Attendance (Overall): ${avgAttendance.toFixed(2)}\n`;
  
  report += `\n--- TUESDAY STATS ---\n`;
  report += `Unique Attendees: ${tueUnique.size}\n`;
  report += `Avg Attendance:   ${avgTue.toFixed(2)}\n`;
  report += `Repeat Rate (>1): ${tueRetention.toFixed(1)}%\n`;

  report += `\n--- THURSDAY STATS ---\n`;
  report += `Unique Attendees: ${thuUnique.size}\n`;
  report += `Avg Attendance:   ${avgThu.toFixed(2)}\n`;
  report += `Repeat Rate (>1): ${thuRetention.toFixed(1)}%\n`;

  // Bucket Distribution
  const distribution = { '1': 0, '2-4': 0, '5-10': 0, '11+': 0 };
  attendeeHistory.forEach(r => {
      if (r.count === 1) distribution['1']++;
      else if (r.count <= 4) distribution['2-4']++;
      else if (r.count <= 10) distribution['5-10']++;
      else distribution['11+']++;
  });

  report += `\nAttendance Distribution:\n`;
  report += `1 time:    ${distribution['1']} people (${(distribution['1']/totalAttendees*100).toFixed(1)}%)\n`;
  report += `2-4 times: ${distribution['2-4']} people\n`;
  report += `5-10 times:${distribution['5-10']} people\n`;
  report += `11+ times: ${distribution['11+']} people\n`;

  report += `\n--- TUESDAY ATTENDEES (${tueUnique.size}) ---\n`;
  Array.from(tueUnique).sort().forEach(name => report += `+ ${name}\n`);

  report += `\n--- NEWEST ATTENDEES (Last 3 Meetings) ---\n`;
  const recentMeetings = meetingStats.slice(-3).map(m => m.date);
  attendeeHistory.forEach((r, name) => {
      if (recentMeetings.includes(r.firstSeen)) {
          report += `[${r.firstSeen}] ${name}\n`;
      }
  });
  
  await Deno.writeTextFile('research/attendance_trends.txt', report);
  console.log("\nDone! Saved to research/attendance_trends.txt");
}

analyzeTrends();
