#!/usr/bin/env node
/**
 * Compare Old vs New Outreach Filters
 *
 * Queries the CURRENT (old) candidate views, then checks each person
 * against the new qualification filters to show who would be kept vs dropped.
 *
 * Usage: node scripts/compare-outreach-filters.mjs
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
      prefer: "return=representation",
    },
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Supabase ${table} query failed (${resp.status}): ${err}`);
  }
  return resp.json();
}

async function main() {
  console.log("=== Old vs New Outreach Filter Comparison ===\n");

  // Get all HubSpot contacts with qualification fields
  const contacts = await supabaseQuery("raw_hubspot_contacts", {
    select: "email,firstname,lastname,membership_s,sobriety_date,annual_revenue_in_dollars__official_",
    limit: "5000",
  });
  const contactMap = new Map();
  for (const c of contacts) {
    if (c.email) contactMap.set(c.email.toLowerCase(), c);
  }

  // Get all meeting activities to check which are group meetings
  const activities = await supabaseQuery("raw_hubspot_meeting_activities", {
    select: "hubspot_activity_id,activity_type,title,hs_timestamp",
    limit: "5000",
  });

  // Classify group vs non-group meetings
  const groupActivityIds = new Set();
  for (const act of activities) {
    if (!act.hs_timestamp) continue;
    const title = (act.title || "").toLowerCase();
    const ts = new Date(act.hs_timestamp);
    // ET offset (approximate: -5 for EST, -4 for EDT)
    const etHour = (ts.getUTCHours() - 5 + 24) % 24;
    const etMinute = etHour * 60 + ts.getUTCMinutes();
    const dow = ts.getUTCDay(); // approximate (could be off by 1 near midnight)

    let isGroup = false;
    // Title match
    if (title.includes("tactic tuesday")) isGroup = true;
    if (title.includes("mastermind on zoom")) isGroup = true;
    if (title.includes("all are welcome")) isGroup = true;
    if (title.includes("entrepreneur's big book") || title.includes("big book")) isGroup = true;
    // Day/time fallback
    if (!isGroup) {
      if (dow === 2 && etMinute >= 600 && etMinute <= 840) isGroup = true; // Tue 10am-2pm ET
      if (dow === 4 && etMinute >= 540 && etMinute <= 780) isGroup = true; // Thu 9am-1pm ET
    }

    if (isGroup) groupActivityIds.add(`${act.hubspot_activity_id}|${act.activity_type}`);
  }

  // Get all contact-activity associations
  const assocs = await supabaseQuery("hubspot_activity_contact_associations", {
    select: "contact_email,hubspot_activity_id,activity_type",
    limit: "10000",
  });

  // Build per-email: total meetings vs group-only meetings
  const emailMeetings = new Map(); // email -> { total: number, group: number }
  for (const a of assocs) {
    if (!a.contact_email) continue;
    const email = a.contact_email.toLowerCase();
    if (!emailMeetings.has(email)) emailMeetings.set(email, { total: 0, group: 0 });
    const m = emailMeetings.get(email);
    m.total++;
    if (groupActivityIds.has(`${a.hubspot_activity_id}|${a.activity_type}`)) {
      m.group++;
    }
  }

  // Now check each candidate view
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  function checkFilters(email, { skipSobrietyRevenueIf3Plus = true } = {}) {
    const reasons = [];
    const contact = contactMap.get(email?.toLowerCase());
    const meetings = emailMeetings.get(email?.toLowerCase());
    const groupCount = meetings?.group || 0;
    const trusted = skipSobrietyRevenueIf3Plus && groupCount >= 3;

    // 1. Group meeting filter
    if (!meetings || meetings.group === 0) {
      reasons.push(`NO GROUP MEETINGS (${meetings?.total || 0} total meetings are all personal/non-group)`);
    }

    // 2. Tiger 21 (always applied)
    if (contact?.membership_s && contact.membership_s.toLowerCase().includes("tiger 21")) {
      reasons.push(`TIGER 21 member (membership_s: "${contact.membership_s}")`);
    }

    // 3-4. Sobriety + Revenue: skip if 3+ group meetings (trusted member)
    if (!trusted) {
      if (!contact?.sobriety_date) {
        reasons.push("NO SOBRIETY DATE in HubSpot (under 3 group meetings)");
      } else {
        const sd = new Date(contact.sobriety_date);
        if (sd > sixMonthsAgo) {
          reasons.push(`SOBRIETY DATE < 6 months (${contact.sobriety_date})`);
        }
      }

      const rev = contact?.annual_revenue_in_dollars__official_;
      if (rev === null || rev === undefined) {
        reasons.push("NO REVENUE DATA in HubSpot (under 3 group meetings)");
      } else if (Number(rev) < 100000) {
        reasons.push(`REVENUE < $100k ($${Number(rev).toLocaleString()})`);
      }
    }

    return {
      wouldBeFiltered: reasons.length > 0,
      reasons,
      contact,
      meetings,
      trusted,
    };
  }

  // ---------------------------------------------------------------
  // At-Risk Candidates (old view)
  // ---------------------------------------------------------------
  console.log("=== AT-RISK CANDIDATES (vw_at_risk_attendees) ===\n");
  try {
    const atRisk = await supabaseQuery("vw_at_risk_attendees", {
      select: "*",
      last_nudge_sent: "is.null",
      order: "days_since_last.desc",
      limit: "50",
    });

    const kept = [];
    const dropped = [];

    for (const c of atRisk) {
      if (c.email?.includes("admin@")) continue;
      const check = checkFilters(c.email);
      const entry = {
        name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "(no name)",
        email: c.email,
        meetings_60d: c.meetings_60d,
        days_since: c.days_since_last,
        totalMeetings: check.meetings?.total || 0,
        groupMeetings: check.meetings?.group || 0,
        reasons: check.reasons,
      };
      if (check.wouldBeFiltered) dropped.push(entry);
      else kept.push(entry);
    }

    console.log(`KEPT (${kept.length}):`);
    for (const k of kept) {
      console.log(`  + ${k.name} <${k.email}> | ${k.meetings_60d} meetings/60d | ${k.groupMeetings}/${k.totalMeetings} group meetings`);
    }

    console.log(`\nDROPPED (${dropped.length}):`);
    for (const d of dropped) {
      console.log(`  x ${d.name} <${d.email}> | ${d.meetings_60d} meetings/60d | ${d.groupMeetings}/${d.totalMeetings} group meetings`);
      for (const r of d.reasons) {
        console.log(`      -> ${r}`);
      }
    }
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  // ---------------------------------------------------------------
  // Streak Break Candidates (old view)
  // ---------------------------------------------------------------
  console.log("\n\n=== STREAK BREAK CANDIDATES (vw_streak_break_candidates) ===\n");
  try {
    const streakBreak = await supabaseQuery("vw_streak_break_candidates", {
      select: "*",
      last_streak_break_sent: "is.null",
      last_at_risk_nudge_sent: "is.null",
      order: "days_since_last.asc",
      limit: "50",
    });

    const kept = [];
    const dropped = [];

    for (const c of streakBreak) {
      if (c.email?.includes("admin@")) continue;
      // Streak break = 3+ meetings, so they're always trusted. Only check group + Tiger 21.
      const check = checkFilters(c.email, { skipSobrietyRevenueIf3Plus: true });
      const entry = {
        name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "(no name)",
        email: c.email,
        total_meetings: c.total_meetings,
        days_since: c.days_since_last,
        totalMeetings: check.meetings?.total || 0,
        groupMeetings: check.meetings?.group || 0,
        trusted: check.trusted,
        reasons: check.reasons,
      };
      // Note: consecutive streak filter can't be checked here (needs the new SQL)
      if (check.wouldBeFiltered) dropped.push(entry);
      else kept.push(entry);
    }

    console.log(`KEPT (${kept.length}) — note: consecutive streak filter not applied yet, will further reduce:`);
    for (const k of kept) {
      console.log(`  + ${k.name} <${k.email}> | ${k.total_meetings} total | ${k.groupMeetings}/${k.totalMeetings} group meetings | ${k.days_since}d ago`);
    }

    console.log(`\nDROPPED (${dropped.length}):`);
    for (const d of dropped) {
      console.log(`  x ${d.name} <${d.email}> | ${d.total_meetings} total | ${d.groupMeetings}/${d.totalMeetings} group meetings | ${d.days_since}d ago`);
      for (const r of d.reasons) {
        console.log(`      -> ${r}`);
      }
    }
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  // ---------------------------------------------------------------
  // Winback Candidates (old view)
  // ---------------------------------------------------------------
  console.log("\n\n=== WINBACK CANDIDATES (vw_winback_candidates) ===\n");
  try {
    const winback = await supabaseQuery("vw_winback_candidates", {
      select: "*",
      last_winback_sent: "is.null",
      order: "days_since_last.asc",
      limit: "50",
    });

    const kept = [];
    const dropped = [];

    for (const c of winback) {
      if (c.email?.includes("admin@")) continue;
      // Winback = 1 meeting, always apply strict filters
      const check = checkFilters(c.email, { skipSobrietyRevenueIf3Plus: false });
      const entry = {
        name: `${c.firstname || ""} ${c.lastname || ""}`.trim() || "(no name)",
        email: c.email,
        first_attended: c.first_attended,
        days_since: c.days_since_last,
        totalMeetings: check.meetings?.total || 0,
        groupMeetings: check.meetings?.group || 0,
        reasons: check.reasons,
      };
      if (check.wouldBeFiltered) dropped.push(entry);
      else kept.push(entry);
    }

    console.log(`KEPT (${kept.length}):`);
    for (const k of kept) {
      console.log(`  + ${k.name} <${k.email}> | first: ${k.first_attended} | ${k.groupMeetings}/${k.totalMeetings} group meetings | ${k.days_since}d ago`);
    }

    console.log(`\nDROPPED (${dropped.length}):`);
    for (const d of dropped) {
      console.log(`  x ${d.name} <${d.email}> | first: ${d.first_attended} | ${d.groupMeetings}/${d.totalMeetings} group meetings | ${d.days_since}d ago`);
      for (const r of d.reasons) {
        console.log(`      -> ${r}`);
      }
    }
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
