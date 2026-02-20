/**
 * Find old Zoom meeting IDs using the Meetings API (not Reports).
 * Lists all previous and scheduled meetings for each user.
 *
 * Run: deno run -A scripts/find_old_meeting_ids.ts
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";

const KNOWN_TUE_ID = "87199667045";
const KNOWN_THU_ID = "84242212480";

async function getZoomAccessToken() {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID")!;
  const clientId = Deno.env.get("ZOOM_CLIENT_ID")!;
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET")!;
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
  });
  const json = await res.json();
  return json.access_token as string;
}

async function listUsers(token: string) {
  const res = await fetch("https://api.zoom.us/v2/users?page_size=300&status=active", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) { console.error("Failed to list users:", res.status, await res.text()); return []; }
  const json = await res.json();
  return json.users || [];
}

async function listMeetings(token: string, userId: string, type: string) {
  const all: any[] = [];
  let nextPageToken = "";
  while (true) {
    const url = new URL(`https://api.zoom.us/v2/users/${userId}/meetings`);
    url.searchParams.set("page_size", "300");
    url.searchParams.set("type", type);
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);
    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 429) {
        console.log("  Rate limited, waiting 3s...");
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      console.error(`  Error listing meetings for ${userId}: ${res.status}`);
      return all;
    }
    const json = await res.json();
    all.push(...(json.meetings || []));
    nextPageToken = json.next_page_token || "";
    if (!nextPageToken) break;
  }
  return all;
}

function maybeDoubleEncodeUuid(uuid: string) {
  const once = encodeURIComponent(uuid);
  if (uuid.includes("/") || uuid.includes("+")) return encodeURIComponent(once);
  return once;
}

async function testPastMeetingInstances(token: string, meetingId: string) {
  const url = `https://api.zoom.us/v2/past_meetings/${meetingId}/instances`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { count: 0, error: await res.text() };
  const json = await res.json();
  const meetings = json.meetings || [];
  if (meetings.length === 0) return { count: 0 };
  meetings.sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  return { 
    count: meetings.length, 
    earliest: meetings[0].start_time,
    latest: meetings[meetings.length - 1].start_time,
    dates: meetings.map((m: any) => new Date(m.start_time).toISOString().slice(0, 10))
  };
}

async function getParticipantCount(token: string, uuid: string) {
  const encodedUuid = maybeDoubleEncodeUuid(uuid);
  const url = `https://api.zoom.us/v2/report/meetings/${encodedUuid}/participants?page_size=5`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return -1;
  const json = await res.json();
  return json.total_records || json.participants?.length || 0;
}

async function main() {
  console.log("=== Finding Old Zoom Meeting IDs ===\n");
  const token = await getZoomAccessToken();
  console.log("✓ Authenticated\n");

  const users = await listUsers(token);
  console.log(`Found ${users.length} users:`);
  for (const u of users) {
    console.log(`  ${u.first_name} ${u.last_name} (${u.email})`);
  }

  // Collect all unique meeting IDs across all users
  const candidateIds = new Map<string, { topic: string, type: number, createdAt: string, userId: string }>();

  for (const user of users) {
    console.log(`\n── Searching meetings for ${user.first_name} ${user.last_name} ──`);
    
    // List previous_meetings, scheduled, and live meetings
    for (const mType of ["previous_meetings", "scheduled"]) {
      console.log(`  Type: ${mType}`);
      const meetings = await listMeetings(token, user.id, mType);
      console.log(`    Found ${meetings.length} meetings`);
      
      for (const m of meetings) {
        const id = String(m.id);
        if (id === KNOWN_TUE_ID || id === KNOWN_THU_ID) continue; // Skip current known IDs
        if (!candidateIds.has(id)) {
          candidateIds.set(id, {
            topic: m.topic || "(no topic)",
            type: m.type || 0,
            createdAt: m.created_at || m.start_time || "",
            userId: user.email,
          });
        }
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\n\nTotal unique meeting IDs found (excluding current): ${candidateIds.size}`);
  
  // Filter for recurring meetings (type 8 = recurring with fixed time, type 3 = recurring no fixed time)
  // But also check all meeting IDs by testing for past instances
  const recurringCandidates = Array.from(candidateIds.entries())
    .filter(([_id, info]) => info.type === 8 || info.type === 3 || info.type === 2);
  
  console.log(`\nRecurring meeting candidates: ${recurringCandidates.length}`);

  // For each candidate, check if it has instances in our gap periods
  const potentialOldIds: any[] = [];

  for (const [id, info] of candidateIds.entries()) {
    const result = await testPastMeetingInstances(token, id);
    if (result.count > 0) {
      // Check if the dates fall in our gap periods
      const earliest = new Date(result.earliest!);
      const latest = new Date(result.latest!);
      
      // Tuesday gap: Oct 2024 - Feb 2025
      const inTueGap = earliest < new Date("2025-03-01") && result.dates!.some((d: string) => {
        const dt = new Date(d);
        return dt.getUTCDay() === 2 && dt >= new Date("2024-10-01");
      });
      
      // Thursday gap: May 2025 - Aug 2025
      const inThuGap = earliest < new Date("2025-09-01") && result.dates!.some((d: string) => {
        const dt = new Date(d);
        return dt.getUTCDay() === 4 && dt >= new Date("2025-05-01");
      });

      if (inTueGap || inThuGap) {
        potentialOldIds.push({
          id,
          topic: info.topic,
          type: info.type,
          userId: info.userId,
          instanceCount: result.count,
          earliest: result.earliest,
          latest: result.latest,
          inTueGap,
          inThuGap,
          dates: result.dates,
        });
        console.log(`\n  ★ MATCH: ID ${id}`);
        console.log(`    Topic: "${info.topic}"`);
        console.log(`    Instances: ${result.count} (${result.earliest} → ${result.latest})`);
        console.log(`    In Tue gap: ${inTueGap}, In Thu gap: ${inThuGap}`);
        if (result.dates!.length <= 30) {
          console.log(`    Dates: ${result.dates!.join(', ')}`);
        }
      }
    }
    await new Promise(r => setTimeout(r, 200)); // rate limit buffer
  }

  console.log("\n\n═══════════════════════════════════════════");
  console.log("  FINAL RESULTS");
  console.log("═══════════════════════════════════════════");

  if (potentialOldIds.length === 0) {
    console.log("No matching old meeting IDs found in this Zoom account.");
    console.log("The old meetings were likely hosted on a different Zoom account or have been deleted.");
  } else {
    for (const m of potentialOldIds) {
      console.log(`\n  Meeting ID: ${m.id}`);
      console.log(`  Topic: "${m.topic}"`);
      console.log(`  Hosted by: ${m.userId}`);
      console.log(`  Instances: ${m.instanceCount}`);
      console.log(`  Date range: ${m.earliest} → ${m.latest}`);
      console.log(`  Tuesday match: ${m.inTueGap}`);
      console.log(`  Thursday match: ${m.inThuGap}`);
    }
  }

  console.log("\n=== Complete ===");
}

main();
