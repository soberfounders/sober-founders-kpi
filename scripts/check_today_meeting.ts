
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

async function main() {
  console.log(`Checking for today's meeting instance (ID: ${THURSDAY_ID})...`);
  const token = await getZoomAccessToken();

  const url = `https://api.zoom.us/v2/past_meetings/${THURSDAY_ID}/instances`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  
  if (!res.ok) {
      console.log(`Error fetching instances: ${res.status} ${await res.text()}`);
      return;
  }

  const json = await res.json();
  const instances = json.meetings || [];
  
  // Look for today's date (UTC)
  const today = new Date().toISOString().slice(0, 10);
  console.log(`Looking for date: ${today}`);

  const match = instances.find((i: any) => i.start_time.startsWith(today));
  
  if (match) {
      console.log(`\nFOUND today's meeting!`);
      console.log(`Start Time: ${match.start_time}`);
      console.log(`UUID: ${match.uuid}`);
      
      // Check participants
      const partUrl = `https://api.zoom.us/v2/report/meetings/${encodeURIComponent(encodeURIComponent(match.uuid))}/participants?page_size=300`;
      const partRes = await fetch(partUrl, { headers: { authorization: `Bearer ${token}` } });
      const partJson = await partRes.json();
      const count = partJson.total_records || partJson.participants?.length || 0;
      console.log(`Participants so far: ${count}`);
  } else {
      console.log(`\nNO instance found for today yet.`);
      console.log(`Latest instance was: ${instances.length > 0 ? instances[instances.length-1].start_time : 'none'}`);
  }
}

main();
