
import "https://deno.land/std@0.224.0/dotenv/load.ts";

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
  const json = await res.json();
  return json.users || [];
}

async function listLiveMeetings(token: string, userId: string) {
    const url = `https://api.zoom.us/v2/users/${userId}/meetings?type=live`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const json = await res.json();
    return json.meetings || [];
}

async function listMeetings(token: string, userId: string) {
    // Check scheduled and previous
    const all = [];
    for (const type of ['scheduled', 'previous_meetings']) {
        const url = `https://api.zoom.us/v2/users/${userId}/meetings?type=${type}&page_size=300`;
        const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
        const json = await res.json();
        all.push(...(json.meetings || []));
    }
    return all;
}

async function main() {
  console.log("=== Checking for LIVE or RECENT meetings (Feb 2026) ===\n");
  const token = await getZoomAccessToken();
  const users = await listUsers(token);

  console.log("--- Checking LIVE meetings ---");
  for (const user of users) {
      const live = await listLiveMeetings(token, user.id);
      if (live.length > 0) {
          console.log(`\nUser: ${user.email} has LIVE meetings:`);
          for (const m of live) {
              console.log(`  ID: ${m.id} | Topic: "${m.topic}" | Start: ${m.start_time}`);
              // Fetch participants for live meeting?
              // The report API might not work yet, but let's see.
          }
      }
  }

  console.log("\n--- Checking Recent Past Meetings (Feb 2026) ---");
  // We'll scan all meeting IDs again and check for instances in Feb 2026
  
  // Collect all IDs first
  const allIds = new Set<string>();
  for (const user of users) {
      const meetings = await listMeetings(token, user.id);
      meetings.forEach((m: any) => allIds.add(String(m.id)));
  }
  
  console.log(`Checking ${allIds.size} unique meeting IDs for Feb 2026 instances...`);
  
  for (const id of allIds) {
      const url = `https://api.zoom.us/v2/past_meetings/${id}/instances`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) continue;
      const json = await res.json();
      const instances = json.meetings || [];
      
      const febInstances = instances.filter((i: any) => i.start_time.startsWith("2026-02") || i.start_time.startsWith("2026-01-29") || i.start_time.startsWith("2026-01-22"));
      
      if (febInstances.length > 0) {
          console.log(`\nID: ${id}`);
          console.log(`  Instances: ${febInstances.map((i: any) => i.start_time).join(", ")}`);
          
          // Check if any is close to TODAY (Feb 19)
          const todayMatch = febInstances.find((i: any) => i.start_time.startsWith("2026-02-19"));
          if (todayMatch) {
              console.log(`  ★ MATCH TODAY: ${todayMatch.start_time} (UUID: ${todayMatch.uuid})`);
          }
      }
      await new Promise(r => setTimeout(r, 100));
  }
}

main();
