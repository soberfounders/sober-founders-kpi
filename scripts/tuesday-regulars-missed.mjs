#!/usr/bin/env node
/**
 * Find Tuesday regulars (3+ in 60d) who missed 1, 2, or 3 consecutive weeks.
 * Usage: node scripts/tuesday-regulars-missed.mjs
 */
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fetchAll(path) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!resp.ok) throw new Error(`${path}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function main() {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString();

  // 1. Get all meeting activities in last 60 days
  const activities = await fetchAll(
    `raw_hubspot_meeting_activities?select=hubspot_activity_id,activity_type,hs_timestamp&hs_timestamp=gte.${sixtyDaysAgo}&order=hs_timestamp.desc&limit=5000`
  );
  console.log("Total activities in 60d:", activities.length);

  // Filter to Tuesdays (EST)
  const tuesdayActivities = activities.filter(a => {
    const d = new Date(a.hs_timestamp);
    const est = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
    return est.getDay() === 2;
  });
  console.log("Tuesday activities:", tuesdayActivities.length);

  const tuesdayActivityKeys = new Set(
    tuesdayActivities.map(a => `${a.hubspot_activity_id}|${a.activity_type}`)
  );

  // Get unique Tuesday dates
  const tuesdayDates = [...new Set(tuesdayActivities.map(a => {
    const d = new Date(a.hs_timestamp);
    const est = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
    return est.toISOString().split("T")[0];
  }))].sort().reverse();
  console.log("Tuesday meeting dates:", tuesdayDates);

  // 2. Get all associations
  const allAssocs = await fetchAll(
    `hubspot_activity_contact_associations?select=hubspot_activity_id,activity_type,contact_email,hubspot_contact_id&limit=10000`
  );
  console.log("Total associations:", allAssocs.length);

  // Build Tuesday attendance per person
  const tuesdayAttendance = {};
  for (const assoc of allAssocs) {
    const key = `${assoc.hubspot_activity_id}|${assoc.activity_type}`;
    if (!tuesdayActivityKeys.has(key)) continue;
    if (!assoc.contact_email) continue;

    const email = assoc.contact_email.toLowerCase();
    if (!tuesdayAttendance[email]) tuesdayAttendance[email] = new Set();

    const act = tuesdayActivities.find(
      a => a.hubspot_activity_id === assoc.hubspot_activity_id && a.activity_type === assoc.activity_type
    );
    if (act) {
      const d = new Date(act.hs_timestamp);
      const est = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
      tuesdayAttendance[email].add(est.toISOString().split("T")[0]);
    }
  }

  // Filter to 3+ Tuesday sessions
  const regulars = Object.entries(tuesdayAttendance)
    .filter(([_, dates]) => dates.size >= 3)
    .map(([email, dates]) => ({
      email,
      tuesday_count: dates.size,
      dates_attended: [...dates].sort().reverse(),
      last_tuesday: [...dates].sort().reverse()[0],
    }));

  console.log("\nTuesday regulars (3+ in 60d):", regulars.length);

  // 3. Get contact names
  const contacts = await fetchAll(
    `raw_hubspot_contacts?select=email,firstname,lastname,hubspot_contact_id&limit=5000`
  );
  const nameMap = {};
  for (const c of contacts) {
    if (c.email) nameMap[c.email.toLowerCase()] = {
      firstname: c.firstname || "",
      lastname: c.lastname || "",
      hubspot_contact_id: c.hubspot_contact_id,
    };
  }

  // 4. Check who missed recent Tuesdays
  const lastTuesday = tuesdayDates[0];
  const missed = regulars
    .filter(r => r.last_tuesday < lastTuesday)
    .map(r => {
      const info = nameMap[r.email] || {};
      let weeksMissed = 0;
      for (const td of tuesdayDates) {
        if (r.dates_attended.includes(td)) break;
        weeksMissed++;
      }
      return {
        ...r,
        firstname: info.firstname,
        lastname: info.lastname,
        hubspot_contact_id: info.hubspot_contact_id,
        weeks_missed: weeksMissed,
      };
    })
    .filter(r => r.weeks_missed >= 1 && r.weeks_missed <= 3)
    .sort((a, b) => b.weeks_missed - a.weeks_missed || b.tuesday_count - a.tuesday_count);

  console.log("\n========================================");
  console.log("TUESDAY REGULARS WHO MISSED 1-3 WEEKS");
  console.log("========================================\n");
  console.log(`Most recent Tuesday: ${lastTuesday}`);
  console.log(`Tuesday dates (60d): ${tuesdayDates.join(", ")}\n`);
  console.log(`${missed.length} people found:\n`);

  console.log(
    "Name".padEnd(28) +
    "Email".padEnd(38) +
    "Tues(60d)  " +
    "Missed  " +
    "Last Attended"
  );
  console.log("-".repeat(110));

  for (const m of missed) {
    const name = `${m.firstname || ""} ${m.lastname || ""}`.trim() || "(unknown)";
    console.log(
      name.padEnd(28) +
      m.email.padEnd(38) +
      String(m.tuesday_count).padEnd(11) +
      `${m.weeks_missed} wk`.padEnd(8) +
      m.last_tuesday
    );
  }
}

main().catch(console.error);
