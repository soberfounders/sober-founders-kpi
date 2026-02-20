
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
    const url = `https://api.zoom.us/v2/users/${userId}/meetings?type=${type}&page_size=300`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const json = await res.json();
    return json.meetings || [];
}

async function main() {
  console.log("=== Searching for 'Sober Founders Business Mastermind' ===\n");
  const token = await getZoomAccessToken();
  const users = await listUsers(token);
  
  const searchTopic = "sober founders business mastermind";

  for (const user of users) {
    console.log(`Checking user: ${user.email}`);
    const meetings = [];
    meetings.push(...await listMeetings(token, user.id, "scheduled"));
    meetings.push(...await listMeetings(token, user.id, "previous_meetings"));
    
    for (const m of meetings) {
        if ((m.topic || "").toLowerCase().includes(searchTopic)) {
            console.log(`\nMATCH FOUND!`);
            console.log(`  ID: ${m.id}`);
            console.log(`  Topic: "${m.topic}"`);
            console.log(`  Start: ${m.start_time}`);
        }
    }
  }
}

main();
