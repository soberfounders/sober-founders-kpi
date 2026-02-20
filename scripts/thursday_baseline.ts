
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const THURSDAY_ID = "84242212480";

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

async function getPastMeetingParticipantCount(token: string, uuid: string) {
    const url = `https://api.zoom.us/v2/report/meetings/${encodeURIComponent(encodeURIComponent(uuid))}/participants?page_size=300`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return 0;
    const json = await res.json();
    return json.total_records || json.participants?.length || 0;
}

async function main() {
  const token = await getZoomAccessToken();
  const pastUrl = `https://api.zoom.us/v2/past_meetings/${THURSDAY_ID}/instances`;
  const pastRes = await fetch(pastUrl, { headers: { authorization: `Bearer ${token}` } });
  const pastJson = await pastRes.json();
  
  // Filter for Thursdays in 2026, roughly 11am EST (16:00 UTC)
  // Or just take the ones with significant duration/participants
  const instances = (pastJson.meetings || [])
      .filter((i: any) => i.start_time.startsWith("2026"))
      .sort((a: any, b: any) => b.start_time.localeCompare(a.start_time));

  console.log("Recent Thursday Meetings:");
  for (const inst of instances) {
      if (inst.start_time.includes("2026-02-19")) continue; // Skip today (incomplete)
      
      const count = await getPastMeetingParticipantCount(token, inst.uuid);
      if (count > 5) { // Filter out tests
        console.log(`  Date: ${inst.start_time.slice(0,10)} | Time: ${inst.start_time.slice(11,16)} UTC | Count: ${count}`);
      }
  }
}

main();
