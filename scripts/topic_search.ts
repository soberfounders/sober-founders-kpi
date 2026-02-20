/**
 * Search all meetings for topic keywords.
 */

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

async function main() {
  console.log("=== Topic Search for 'Thursday' or 'Mastermind' ===\n");
  const token = await getZoomAccessToken();
  const users = await listUsers(token);

  const keyTerms = ["thursday", "mastermind", "sober"];

  for (const user of users) {
    console.log(`Checking user: ${user.email}`);
    
    const meetings = await listMeetings(token, user.id, "scheduled");
    meetings.push(...await listMeetings(token, user.id, "previous_meetings"));
    
    const unique = new Map();
    meetings.forEach((m: any) => unique.set(m.id, m));
    
    for (const m of unique.values()) {
        const topic = (m.topic || "").toLowerCase();
        if (keyTerms.some(t => topic.includes(t))) {
            console.log(`\nMATCH: ${m.id}`);
            console.log(`  Topic: "${m.topic}"`);
            console.log(`  Type: ${m.type}`);
            console.log(`  Created: ${m.created_at}`);
            console.log(`  Start: ${m.start_time}`);
        }
    }
  }
}

main();
