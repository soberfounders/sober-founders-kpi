
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const CHECK_ID = "87281602709"; // User provided Thursday ID

async function getZoomAccessToken() {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
  
  if (!accountId || !clientId || !clientSecret) {
    console.error("Missing env vars:", { accountId: !!accountId, clientId: !!clientId, clientSecret: !!clientSecret });
    throw new Error("Missing Zoom credentials in .env");
  }

  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
  });
  
  if (!res.ok) {
    console.error("Token fetch failed:", res.status, await res.text());
    throw new Error("Failed to get Zoom access token");
  }

  const json = await res.json();
  return json.access_token as string;
}

function maybeDoubleEncodeUuid(uuid: string) {
  const once = encodeURIComponent(uuid);
  if (uuid.includes("/") || uuid.includes("+")) return encodeURIComponent(once);
  return once;
}

async function getParticipantCount(token: string, uuid: string) {
  const encodedUuid = maybeDoubleEncodeUuid(uuid);
  const url = `https://api.zoom.us/v2/report/meetings/${encodedUuid}/participants?page_size=300`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return 0;
  const json = await res.json();
  return json.total_records || json.participants?.length || 0;
}

async function main() {
  console.log(`Checking ID: ${CHECK_ID}`);
  const token = await getZoomAccessToken();

  const url = `https://api.zoom.us/v2/past_meetings/${CHECK_ID}/instances`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const json = await res.json();
  const instances = json.meetings || [];
  
  console.log(`Found ${instances.length} instances.`);

  const targetDates = [
    "2025-05-08", // Thu
    "2025-05-15", // Thu
    "2025-05-22", // Thu - User specifically mentioned
    "2025-05-29"  // Thu
  ];

  for (const date of targetDates) {
    const match = instances.find((i: any) => i.start_time.startsWith(date));
    if (match) {
      const count = await getParticipantCount(token, match.uuid);
      console.log(`${date}: FOUND instance (UUID ${match.uuid.slice(0,8)}...), Participants: ${count}`);
    } else {
      console.log(`${date}: No instance found`);
    }
  }
}

main();
