
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

async function listRecordings(token: string, userId: string, from: string, to: string) {
    const url = `https://api.zoom.us/v2/users/${userId}/recordings?from=${from}&to=${to}&page_size=300`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.meetings || [];
}

async function main() {
  console.log("=== Searching Cloud Recordings for Thursday ID (May-Aug 2025) ===\n");
  const token = await getZoomAccessToken();
  const users = await listUsers(token);

  // Zoom recording API allows max 1 month range.
  const ranges = [
      ["2025-05-01", "2025-05-31"],
      ["2025-06-01", "2025-06-30"],
      ["2025-07-01", "2025-07-31"],
      ["2025-08-01", "2025-08-31"]
  ];

  const foundIds = new Set<string>();

  for (const user of users) {
      console.log(`Checking recordings for: ${user.email}`);
      
      for (const [from, to] of ranges) {
          const recordings = await listRecordings(token, user.id, from, to);
          
          for (const rec of recordings) {
              const d = new Date(rec.start_time);
              const dow = d.getUTCDay();
              const hour = d.getUTCHours();
              
              // Thursday is 4.
              // 11am EST is 15:00 UTC or 16:00 UTC.
              // Let's be broad: Thursday, 14:00 - 18:00 UTC
              
              if (dow === 4 && hour >= 14 && hour <= 18) {
                  if (!foundIds.has(rec.id)) {
                      console.log(`\n★ MATCH FOUND!`);
                      console.log(`  Meeting ID: ${rec.id}`);
                      console.log(`  Topic: "${rec.topic}"`);
                      console.log(`  Start: ${rec.start_time}`);
                      console.log(`  Host: ${user.email}`);
                      foundIds.add(String(rec.id));
                  }
              }
          }
          await new Promise(r => setTimeout(r, 200));
      }
  }

  console.log("\n=== Search Complete ===");
}

main();
