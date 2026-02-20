/**
 * Diagnostic script: Check how far back Zoom API returns data
 * for both meeting IDs, and test participant fetch for old instances.
 *
 * Run: deno run -A scripts/diagnose_zoom_history.ts
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";

const TUE_MEETING_ID = "87199667045";
const THU_MEETING_ID = "84242212480";

function maybeDoubleEncodeUuid(uuid: string) {
  const once = encodeURIComponent(uuid);
  if (uuid.includes("/") || uuid.includes("+")) return encodeURIComponent(once);
  return once;
}

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

async function fetchAllInstances(accessToken: string, meetingId: string) {
  const all: any[] = [];
  let nextPageToken = "";
  while (true) {
    const url = new URL(`https://api.zoom.us/v2/past_meetings/${meetingId}/instances`);
    url.searchParams.set("page_size", "300");
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);
    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error(`Error fetching instances for ${meetingId}: ${res.status} ${await res.text()}`);
      return all;
    }
    const json = await res.json();
    all.push(...(json.meetings || []).map((m: any) => ({ ...m, meeting_id: meetingId })));
    nextPageToken = json.next_page_token || "";
    if (!nextPageToken) break;
  }
  return all;
}

async function testParticipantFetch(accessToken: string, uuid: string) {
  const encodedUuid = maybeDoubleEncodeUuid(uuid);
  const url = `https://api.zoom.us/v2/report/meetings/${encodedUuid}/participants?page_size=5`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return { status: 404, count: 0, error: "Not Found (data expired)" };
  if (!res.ok) return { status: res.status, count: 0, error: await res.text() };
  const json = await res.json();
  return { status: 200, count: json.total_records || json.participants?.length || 0 };
}

async function main() {
  console.log("=== Zoom Historical Data Diagnostic ===\n");
  const token = await getZoomAccessToken();
  console.log("✓ Authenticated with Zoom\n");

  for (const [label, meetingId] of [["TUESDAY", TUE_MEETING_ID], ["THURSDAY", THU_MEETING_ID]]) {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`${label} Meeting ID: ${meetingId}`);
    console.log(`${"─".repeat(50)}`);

    const instances = await fetchAllInstances(token, meetingId);
    instances.sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    console.log(`Total instances returned: ${instances.length}`);
    
    if (instances.length === 0) {
      console.log("  → No instances found!");
      continue;
    }

    const earliest = instances[0];
    const latest = instances[instances.length - 1];
    console.log(`Earliest: ${earliest.start_time}`);
    console.log(`Latest:   ${latest.start_time}`);
    console.log();

    // Print all instances with dates
    console.log("All instances:");
    for (const inst of instances) {
      const d = new Date(inst.start_time);
      const dateStr = d.toISOString().slice(0, 10);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
      console.log(`  ${dateStr} (${dayName}) — uuid: ${inst.uuid?.slice(0, 20)}...`);
    }

    // Test participant fetch for oldest 3 and newest 3
    console.log("\nParticipant fetch test (oldest 3):");
    for (const inst of instances.slice(0, 3)) {
      const result = await testParticipantFetch(token, inst.uuid);
      const dateStr = new Date(inst.start_time).toISOString().slice(0, 10);
      console.log(`  ${dateStr}: status=${result.status}, participants=${result.count}${result.error ? `, error=${result.error}` : ''}`);
    }

    console.log("\nParticipant fetch test (newest 3):");
    for (const inst of instances.slice(-3)) {
      const result = await testParticipantFetch(token, inst.uuid);
      const dateStr = new Date(inst.start_time).toISOString().slice(0, 10);
      console.log(`  ${dateStr}: status=${result.status}, participants=${result.count}${result.error ? `, error=${result.error}` : ''}`);
    }

    // Test specific dates the user mentioned
    if (label === "TUESDAY") {
      console.log("\nUser-specified date checks (Tuesday):");
      for (const targetDate of ["2025-02-04", "2025-02-18", "2025-02-24"]) {
        const match = instances.find((i: any) => new Date(i.start_time).toISOString().slice(0, 10) === targetDate);
        if (match) {
          const result = await testParticipantFetch(token, match.uuid);
          console.log(`  ${targetDate}: FOUND instance, participants=${result.count}, status=${result.status}`);
        } else {
          console.log(`  ${targetDate}: NO INSTANCE FOUND for this date`);
        }
      }
    }

    if (label === "THURSDAY") {
      console.log("\nUser-specified date checks (Thursday):");
      for (const targetDate of ["2025-05-08", "2025-05-15", "2025-05-22", "2025-05-29", "2025-06-05", "2025-06-12", "2025-06-19"]) {
        const match = instances.find((i: any) => new Date(i.start_time).toISOString().slice(0, 10) === targetDate);
        if (match) {
          const result = await testParticipantFetch(token, match.uuid);
          console.log(`  ${targetDate}: FOUND instance, participants=${result.count}, status=${result.status}`);
        } else {
          console.log(`  ${targetDate}: NO INSTANCE FOUND for this date`);
        }
      }
    }
  }

  console.log("\n=== Diagnostic Complete ===");
}

main();
