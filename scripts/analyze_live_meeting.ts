
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
  console.log("=== Analyzing LIVE Thursday Meeting ===");
  const token = await getZoomAccessToken();

  // 1. Get Live Meeting UUID
  const userId = "alassise@soberfounders.org"; // Found in previous step
  const liveUrl = `https://api.zoom.us/v2/users/${userId}/meetings?type=live`;
  const liveRes = await fetch(liveUrl, { headers: { authorization: `Bearer ${token}` } });
  const liveJson = await liveRes.json();
  const liveMeeting = (liveJson.meetings || []).find((m: any) => String(m.id) === THURSDAY_ID);

  if (!liveMeeting) {
      console.log("❌ No LIVE meeting found for Thursday ID.");
      return;
  }

  console.log(`✅ Meeting is LIVE! (UUID: ${liveMeeting.uuid})`);
  
  // 2. Get Live Participants (using Dashboard API "metrics/meetings/{id}/participants" is better for live, but we'll try Report first)
  // Report API often lags by 15-30 mins. Dashboard API is more real-time.
  // Dashboard Metrics: GET /metrics/meetings/{meetingId}/participants
  
  const dashboardUrl = `https://api.zoom.us/v2/metrics/meetings/${liveMeeting.uuid}/participants?type=live&page_size=300`;
  // Note: 'type=live' is for dashboard metrics listing, but for specific meeting we use meeting ID or UUID
  
  // Actually, standard Report API usually doesn't show live participants. 
  // We need "Dashboard" > "Get meeting participant QoS" or "Get meeting participants"
  // GET /metrics/meetings/{meetingId}/participants
  
  const metricsUrl = `https://api.zoom.us/v2/metrics/meetings/${encodeURIComponent(encodeURIComponent(liveMeeting.uuid))}/participants?page_size=300`;
  const metricsRes = await fetch(metricsUrl, { headers: { authorization: `Bearer ${token}` } });
  
  if (!metricsRes.ok) {
      console.log(`⚠️ Dashboard API failed: ${metricsRes.status} ${await metricsRes.text()}`);
      console.log("Trying Report API (might be empty if live)...");
      const count = await getPastMeetingParticipantCount(token, liveMeeting.uuid);
      console.log(`Report API Count: ${count}`);
  } else {
      const metricsJson = await metricsRes.json();
      const count = metricsJson.total_records || metricsJson.participants?.length || 0;
      console.log(`📊 LIVE Participant Count: ${count}`);
      
      // List a few names for verification
      const names = (metricsJson.participants || []).map((p: any) => p.user_name).slice(0, 5);
      console.log(`   Attendees: ${names.join(", ")}...`);
  }

  // 3. Compare with recent Thursdays
  console.log("\n--- Comparison with recent Thursdays ---");
  const pastUrl = `https://api.zoom.us/v2/past_meetings/${THURSDAY_ID}/instances`;
  const pastRes = await fetch(pastUrl, { headers: { authorization: `Bearer ${token}` } });
  const pastJson = await pastRes.json();
  const instances = (pastJson.meetings || [])
      .filter((i: any) => i.start_time.startsWith("2026")) // Filter 2026
      .sort((a: any, b: any) => b.start_time.localeCompare(a.start_time))
      .slice(0, 3); // Last 3

  for (const inst of instances) {
      const c = await getPastMeetingParticipantCount(token, inst.uuid);
      console.log(`Date: ${inst.start_time.slice(0,10)} | Count: ${c}`);
  }
}

main();
