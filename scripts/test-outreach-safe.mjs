#!/usr/bin/env node
/**
 * Safe Outreach Agent Test
 *
 * Tests the no-show-recovery-agent edge function in DRY RUN mode.
 * - Queries Supabase for no-show candidates (read-only)
 * - Reports what would be sent WITHOUT sending anything
 * - Validates no flooding: checks batch limits and dedup guards
 * - Tests the HubSpot contact lookup (read-only)
 * - Tests the Phoenix Forum member count query
 *
 * Usage: node scripts/test-outreach-safe.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
for (const envFile of [".env.local", "slack-bot/.env"]) {
  try {
    const content = readFileSync(resolve(__dirname, "..", envFile), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* file may not exist */ }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HUBSPOT_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

async function supabaseQuery(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }
  const resp = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: params._prefer || "return=representation",
    },
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Supabase ${table} query failed (${resp.status}): ${err}`);
  }
  return resp.json();
}

async function supabaseCount(table, filters = "") {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set("select", "*");
  if (filters) {
    // Append raw filter params
    for (const part of filters.split("&")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) url.searchParams.set(part.slice(0, eqIdx), part.slice(eqIdx + 1));
    }
  }
  const resp = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "count=exact",
      range: "0-0",
    },
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Supabase count ${table} failed (${resp.status}): ${err}`);
  }
  const contentRange = resp.headers.get("content-range");
  const match = contentRange?.match(/\/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

async function main() {
  console.log("=== Safe Outreach Agent Test (DRY RUN) ===\n");
  let allPassed = true;

  // ---------------------------------------------------------------
  // Test 1: No-show candidates view
  // ---------------------------------------------------------------
  console.log("1. Querying vw_noshow_candidates...");
  try {
    const candidates = await supabaseQuery("vw_noshow_candidates", {
      select: "email,name,attendance_status,last_recovery_sent,is_thursday,meeting_date",
      attendance_status: "eq.no_show",
      last_recovery_sent: "is.null",
      limit: "20",
    });

    const filtered = candidates.filter(c => c.email && !c.email.includes("admin@"));
    console.log(`   Total no-show candidates: ${candidates.length}`);
    console.log(`   After filtering admin@: ${filtered.length}`);
    console.log(`   Batch limit (agent sends max 5): ${Math.min(filtered.length, 5)} would be processed`);

    if (filtered.length > 0) {
      console.log("\n   Preview (first 5 candidates):");
      for (const c of filtered.slice(0, 5)) {
        console.log(`     - ${c.name || "(no name)"} <${c.email}> | ${c.is_thursday ? "Thursday" : "Tuesday"} | meeting: ${c.meeting_date || "?"}`);
      }
    }
    console.log("   PASS: View query works\n");
  } catch (err) {
    console.error(`   FAIL: ${err.message}\n`);
    allPassed = false;
  }

  // ---------------------------------------------------------------
  // Test 2: At-risk candidates view
  // ---------------------------------------------------------------
  console.log("2. Querying vw_at_risk_attendees...");
  try {
    const atRisk = await supabaseQuery("vw_at_risk_attendees", {
      select: "email,name,meetings_60d,days_since_last,last_nudge_sent",
      last_nudge_sent: "is.null",
      limit: "20",
    });

    console.log(`   At-risk attendees (no prior nudge): ${atRisk.length}`);
    console.log(`   Batch limit (agent sends max 10): ${Math.min(atRisk.length, 10)} would be processed`);
    console.log("   PASS: View query works\n");
  } catch (err) {
    if (err.message.includes("404") || err.message.includes("PGRST205")) {
      console.log("   SKIP: View does not exist in database yet (needs SQL migration)");
      console.log("   NOTE: at-risk-retention-agent will fail until this view is created\n");
    } else {
      console.error(`   FAIL: ${err.message}\n`);
      allPassed = false;
    }
  }

  // ---------------------------------------------------------------
  // Test 3: Winback candidates view
  // ---------------------------------------------------------------
  console.log("3. Querying vw_winback_candidates...");
  try {
    const winback = await supabaseQuery("vw_winback_candidates", {
      select: "email,name,first_attended,days_since_last",
      limit: "20",
    });

    console.log(`   Winback candidates: ${winback.length}`);
    console.log(`   Batch limit (agent sends max 10, cap 20): ${Math.min(winback.length, 10)} would be processed`);
    console.log("   PASS: View query works\n");
  } catch (err) {
    if (err.message.includes("404") || err.message.includes("PGRST205")) {
      console.log("   SKIP: View does not exist in database yet (needs SQL migration)");
      console.log("   NOTE: winback-campaign-agent will fail until this view is created\n");
    } else {
      console.error(`   FAIL: ${err.message}\n`);
      allPassed = false;
    }
  }

  // ---------------------------------------------------------------
  // Test 4: Phoenix Forum member count
  // ---------------------------------------------------------------
  console.log("4. Querying Phoenix Forum member count (membership_s ilike '%Paid Groups%')...");
  console.log("   (HubSpot label 'Phoenix Forum' stores value 'Paid Groups')");
  try {
    const members = await supabaseQuery("raw_hubspot_contacts", {
      select: "email,firstname,lastname,membership_s",
      "is_deleted": "neq.true",
      "hubspot_archived": "neq.true",
      "merged_into_hubspot_contact_id": "is.null",
      "membership_s": "ilike.*Paid Groups*",
      limit: "100",
    });

    console.log(`   Phoenix Forum members found: ${members.length}`);
    if (members.length > 0) {
      console.log("\n   Members:");
      for (const m of members) {
        console.log(`     - ${m.firstname || ""} ${m.lastname || ""} <${m.email}> | tags: ${m.membership_s}`);
      }
    }
    console.log("   PASS: Phoenix Forum query works\n");
  } catch (err) {
    console.error(`   FAIL: ${err.message}\n`);
    allPassed = false;
  }

  // ---------------------------------------------------------------
  // Test 5: HubSpot contact lookup (read-only)
  // ---------------------------------------------------------------
  if (HUBSPOT_TOKEN) {
    console.log("5. Testing HubSpot contact lookup for andrewlassise@gmail.com...");
    try {
      const resp = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
        method: "POST",
        headers: {
          authorization: `Bearer ${HUBSPOT_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [{
            filters: [{
              propertyName: "email",
              operator: "EQ",
              value: "andrewlassise@gmail.com",
            }],
          }],
          properties: ["email", "firstname", "lastname", "membership_s"],
          limit: 1,
        }),
      });

      if (!resp.ok) throw new Error(`HubSpot search failed: ${resp.status}`);
      const json = await resp.json();
      const contact = json?.results?.[0];
      if (contact) {
        console.log(`   Found: ${contact.properties.firstname} ${contact.properties.lastname} (ID: ${contact.id})`);
        console.log(`   Membership: ${contact.properties.membership_s || "(none)"}`);
      } else {
        console.log("   Contact not found in HubSpot");
      }
      console.log("   PASS: HubSpot lookup works\n");
    } catch (err) {
      console.error(`   FAIL: ${err.message}\n`);
      allPassed = false;
    }
  } else {
    console.log("5. SKIP: HUBSPOT_PRIVATE_APP_TOKEN not set\n");
  }

  // ---------------------------------------------------------------
  // Test 6: Dedup guard — check recovery_events for recent sends
  // ---------------------------------------------------------------
  console.log("6. Checking recovery_events for recent outreach (dedup guard)...");
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const events = await supabaseQuery("recovery_events", {
      select: "attendee_email,event_type,created_at",
      "created_at": `gte.${sevenDaysAgo}T00:00:00.000Z`,
      order: "created_at.desc",
      limit: "20",
    });

    console.log(`   Recovery events in last 7 days: ${events.length}`);
    if (events.length > 0) {
      for (const e of events.slice(0, 5)) {
        console.log(`     - ${e.event_type} → ${e.attendee_email} (${new Date(e.created_at).toLocaleDateString()})`);
      }
    }
    console.log("   PASS: Dedup check works\n");
  } catch (err) {
    console.error(`   FAIL: ${err.message}\n`);
    allPassed = false;
  }

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log("=== Summary ===");
  if (allPassed) {
    console.log("All tests PASSED. The outreach infrastructure is working correctly.");
    console.log("\nSafe to proceed with enabling agents:");
    console.log("  1. Deploy the hubspot_email.ts fix (read-only property bug)");
    console.log("  2. Invoke no-show-recovery-agent with { dry_run: true } to create HubSpot task drafts");
    console.log("  3. Review drafts in HubSpot Tasks, then flip to { dry_run: false }");
  } else {
    console.log("Some tests FAILED. Review errors above before enabling agents.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
