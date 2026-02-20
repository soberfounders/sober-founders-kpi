/**
 * Deep search for Thursday meetings May-Aug 2025.
 * Lists ALL meetings that occurred on a Thursday in that range,
 * even if they aren't part of a recurring series or match specific time criteria.
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";

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
        if (res.status === 429) await new Promise(r => setTimeout(r, 2000));
        else break;
    }
    const json = await res.json();
    all.push(...(json.meetings || []));
    nextPageToken = json.next_page_token || "";
    if (!nextPageToken) break;
  }
  return all;
}

async function fetchPastInstances(token: string, meetingId: string) {
  const url = `https://api.zoom.us/v2/past_meetings/${meetingId}/instances`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const json = await res.json();
  return json.meetings || [];
}

async function main() {
  console.log("=== Deep Search for Thursday Meetings (May-Aug 2025) ===\n");
  const token = await getZoomAccessToken();
  const users = await listUsers(token);

  const foundMeetings = new Map<string, { topic: string, instances: string[], host: string }>();

  for (const user of users) {
    console.log(`Checking user: ${user.email}`);
    
    // Check all meeting occurrences (both scheduled/recurring listing AND past_meetings)
    // We'll iterate through all meetings this user has ever created
    const meetings = await listMeetings(token, user.id, "scheduled");
    meetings.push(...await listMeetings(token, user.id, "previous_meetings"));
    
    const uniqueIds = new Set(meetings.map((m: any) => String(m.id)));
    
    for (const id of uniqueIds) {
      if (id === KNOWN_THU_ID) continue;

      const instances = await fetchPastInstances(token, id);
      const relevantInstances = instances.filter((i: any) => {
        const d = new Date(i.start_time);
        // Date range: May 1 2025 to Aug 31 2025
        if (d < new Date("2025-05-01") || d > new Date("2025-08-31")) return false;
        // Day: Thursday (4)
        if (d.getUTCDay() !== 4) return false;
        return true;
      });

      if (relevantInstances.length > 0) {
        if (!foundMeetings.has(id)) {
           foundMeetings.set(id, { 
             topic: "(fetching)", 
             instances: [],
             host: user.email 
           });
        }
        relevantInstances.forEach((i: any) => foundMeetings.get(id)!.instances.push(i.start_time));
      }
      await new Promise(r => setTimeout(r, 100)); // rate limit
    }
  }

  console.log("\nRESULTS:");
  if (foundMeetings.size === 0) {
      console.log("No Thursday meetings found in May-Aug 2025.");
  } else {
      for (const [id, data] of foundMeetings) {
          console.log(`\nID: ${id}`);
          console.log(`Host: ${data.host}`);
          console.log(`Matches: ${data.instances.length}`);
          console.log(`Dates: ${data.instances.sort().join(", ")}`);
      }
  }
}

main();
