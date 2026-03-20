#!/usr/bin/env node
/**
 * HubSpot Duplicate Merge -- Round 2 (high-confidence probable dupes)
 *
 * Usage:
 *   node scripts/hubspot-merge-duplicates-round2.mjs            # dry-run
 *   node scripts/hubspot-merge-duplicates-round2.mjs --execute   # apply
 */
import "dotenv/config";

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
if (!TOKEN) { console.error("Missing HUBSPOT_PRIVATE_APP_TOKEN"); process.exit(1); }

const DRY_RUN = !process.argv.includes("--execute");
const BASE = "https://api.hubapi.com";
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function hs(method, path, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) { const t = await res.text(); throw new Error(`${method} ${path} -> ${res.status}: ${t}`); }
  return res.status === 204 ? null : res.json();
}
const getContact = (id) => hs("GET", `/crm/v3/objects/contacts/${id}?properties=firstname,lastname,email,company,createdate`);
const mergeContacts = (pri, sec) => hs("POST", "/crm/v3/objects/contacts/merge", { primaryObjectId: String(pri), objectIdToMerge: String(sec) });
const deleteContact = (id) => hs("DELETE", `/crm/v3/objects/contacts/${id}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Merge pairs: [primaryId (keep), secondaryId (fold in)] ──

const MERGE_PAIRS = [
  // 1. Therry/Theresa Hansen -- both at Theresa C Hansen CPA
  [171247956409, 171919814197],
  // 2. Steve Surkis -- clean record vs one with NMLS junk in last name
  [137268723238, 129252593939],
  // 3. Stephen/Steve Martin -- smartin6044@gmail.com vs smartin6044@gmaill.com (typo)
  [203048249753, 203170353986],
  // 4a. Greg George -- blank record into main Greg
  [156204057263, 206421895348],
  // 4b. Gregory George (Peach Cobbler Factory) into Greg George
  [156204057263, 205951248740],
  // 5. Jen/Jennifer Blodgett -- minfo@ vs info@ at spajema.com
  [139600366399, 176653889650],
  // 6. Gabriel German -- same day creation, 2025-10-12
  [163190604812, 163200908892],
  // 7. Jd/James Gibson -- Hartstone & Craft (typo "Abd" vs "and")
  [190953411427, 190955829543],
  // 8. Daune Turner -- unique name, newdaunestrength + breakadaune
  [185277560705, 191442808897],
  // 9. Michael Morris -- both at Recovered Mechanical (third at TWI Capital is different)
  [175478017962, 175176212487],
  // 10. Kate Wade -- blank record into real one with Get Her Hired
  [194806246170, 169432387449],
  // 11. Aaron (no last) + Aaron Schumacher -- both at Carnation Draperies
  [163245791528, 165909740611],
  // 12. Jacob (no last) + Jacob N/A -- both at Urban Coastal Capital
  [177070495074, 181265551389],
  // 13. Nate Jenkins -- Urban Oasis + Nate Jenkins Group
  [183789276461, 188940718695],
  // 14. Marie Hannaman -- Six20 + mysideofthestreet
  [134692568183, 185470020185],
  // 15. Ryan L. Nuss / Ryan Nuss -- both at PuraVidaWay
  [120051216914, 120411394412],
];

// ── Zap Name cleanup: strip "Zap name " / "Zap Name " prefix from firstname ──

const ZAP_NAME_FIXES = [
  179309965584, // Zap name Devon
  177471333752, // Zap name Carrie
  101066548485, // Zap name Jason Baba Kwaghe
  161957795358, // Zap name Sean Baker
  164325754940, // Zap name Heather Burson
  111514202786, // Zap name Jimmy Capps
  100512527538, // Zap Name Gabriel Capri
  168544111456, // Zap name Nohealani Casperson
  172596304740, // Zap name Melvin Clark
  140542127230, // Zap name Anna Corsi
  175231757226, // Zap Name Matt Daly
  174735844011, // Zap name Matt Errico
  168274365192, // Zap Name Roger Fisher
  151262592279, // Zap name Rheta Flanders
  149754410145, // Zap name Sacha Goolsby
  179876907549, // Zap name John Hardin
  167727837068, // Zap name Jordan Jagers
  96300388484,  // Zap name Pedro Jose Rivera
  160260604541, // Zap name Deneige Kapor
  159247771184, // Zap Name Ramez Khoja
  98752907173,  // Zap name Tamara Kirby
  169889449488, // Zap name Heather Lipman
  172734355061, // Zap name Kenny N/A
  176102740902, // Zap name David P
  107989433513, // Zap name Bennett Ponder
  178603704708, // Zap Name Dondrea Scott
  171056779626, // Zap name Jason Scott Miller
  96937986074,  // Zap name Nikki Tate
];

async function main() {
  console.log(DRY_RUN ? "\n=== DRY RUN (pass --execute to apply) ===\n" : "\n=== EXECUTING ===\n");

  // ── Validate merges ──
  console.log("--- MERGE PLAN ---\n");
  const validPairs = [];
  for (const [pri, sec] of MERGE_PAIRS) {
    try {
      const [p, s] = await Promise.all([getContact(pri), getContact(sec)]);
      const pn = `${p.properties.firstname || ""} ${p.properties.lastname || ""}`.trim();
      const sn = `${s.properties.firstname || ""} ${s.properties.lastname || ""}`.trim();
      console.log(`MERGE: "${sn}" (${sec}, ${s.properties.email || "no email"}) -> into "${pn}" (${pri}, ${p.properties.email || "no email"})`);
      validPairs.push([pri, sec]);
    } catch (e) {
      console.log(`SKIP: ${pri}/${sec} -- ${e.message}`);
    }
    await sleep(100);
  }

  // ── Validate Zap Name fixes ──
  console.log("\n--- ZAP NAME CLEANUP PLAN ---\n");
  const validZaps = [];
  for (const id of ZAP_NAME_FIXES) {
    try {
      const c = await getContact(id);
      const oldFirst = c.properties.firstname || "";
      const newFirst = oldFirst.replace(/^Zap [Nn]ame\s*/i, "").trim();
      if (newFirst !== oldFirst) {
        console.log(`FIX: "${oldFirst}" -> "${newFirst}" (${id}, ${c.properties.email || "no email"})`);
        validZaps.push({ id, newFirst });
      } else {
        console.log(`SKIP: ${id} -- no Zap prefix found in "${oldFirst}"`);
      }
    } catch (e) {
      console.log(`SKIP: ${id} -- ${e.message}`);
    }
    await sleep(100);
  }

  console.log(`\nTotal merges: ${validPairs.length} | Zap fixes: ${validZaps.length}`);

  if (DRY_RUN) {
    console.log("\nDry run complete. Run with --execute to apply.\n");
    return;
  }

  // ── Execute merges ──
  console.log("\n--- EXECUTING MERGES ---\n");
  let mergeOk = 0, mergeFail = 0;
  for (const [pri, sec] of validPairs) {
    try {
      await mergeContacts(pri, sec);
      console.log(`  OK: ${sec} -> ${pri}`);
      mergeOk++;
    } catch (e) {
      console.log(`  FAIL: ${sec} -> ${pri}: ${e.message}`);
      mergeFail++;
    }
    await sleep(200);
  }

  // ── Execute Zap Name fixes ──
  console.log("\n--- EXECUTING ZAP NAME FIXES ---\n");
  let zapOk = 0, zapFail = 0;
  for (const { id, newFirst } of validZaps) {
    try {
      await hs("PATCH", `/crm/v3/objects/contacts/${id}`, { properties: { firstname: newFirst } });
      console.log(`  OK: ${id} -> "${newFirst}"`);
      zapOk++;
    } catch (e) {
      console.log(`  FAIL: ${id}: ${e.message}`);
      zapFail++;
    }
    await sleep(200);
  }

  // ── Summary ──
  console.log("\n--- SUMMARY ---");
  console.log(`Merges: ${mergeOk} OK, ${mergeFail} failed`);
  console.log(`Zap fixes: ${zapOk} OK, ${zapFail} failed`);

  // ── QA ──
  console.log("\n--- QA VERIFICATION ---\n");
  let qaPass = 0, qaFail = 0;

  for (const [pri] of validPairs) {
    try {
      await getContact(pri);
      console.log(`  QA OK: primary ${pri} exists`);
      qaPass++;
    } catch (e) {
      console.log(`  QA FAIL: primary ${pri} missing! ${e.message}`);
      qaFail++;
    }
    await sleep(100);
  }

  for (const { id, newFirst } of validZaps) {
    try {
      const c = await getContact(id);
      const actual = (c.properties.firstname || "").trim();
      if (actual === newFirst) {
        console.log(`  QA OK: ${id} firstname = "${actual}"`);
        qaPass++;
      } else {
        console.log(`  QA FAIL: ${id} expected "${newFirst}", got "${actual}"`);
        qaFail++;
      }
    } catch (e) {
      console.log(`  QA FAIL: ${id} -- ${e.message}`);
      qaFail++;
    }
    await sleep(100);
  }

  console.log(`\nQA: ${qaPass} passed, ${qaFail} failed`);
  console.log("Done.\n");
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
