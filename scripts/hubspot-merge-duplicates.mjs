#!/usr/bin/env node
/**
 * HubSpot Duplicate Contact Merger & Cleanup
 *
 * Merges duplicate contacts (keeping the earliest-created as primary)
 * and deletes test/junk records.
 *
 * Usage:
 *   node scripts/hubspot-merge-duplicates.mjs              # dry-run (default)
 *   node scripts/hubspot-merge-duplicates.mjs --execute     # actually merge & delete
 */
import "dotenv/config";

const TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
if (!TOKEN) {
  console.error("Missing HUBSPOT_PRIVATE_APP_TOKEN in .env");
  process.exit(1);
}

const DRY_RUN = !process.argv.includes("--execute");
const BASE = "https://api.hubapi.com";

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hubspot(method, path, body) {
  const url = `${BASE}${path}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getContact(id) {
  return hubspot("GET", `/crm/v3/objects/contacts/${id}?properties=firstname,lastname,email,company,createdate`);
}

async function mergeContacts(primaryId, secondaryId) {
  return hubspot("POST", "/crm/v3/objects/contacts/merge", {
    primaryObjectId: String(primaryId),
    objectIdToMerge: String(secondaryId),
  });
}

async function deleteContact(id) {
  return hubspot("DELETE", `/crm/v3/objects/contacts/${id}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Merge pairs: [primaryId (earliest), secondaryId (to merge into primary)] ──
// Primary = first created. Secondary gets folded in.

const MERGE_PAIRS = [
  // Brian Allen -- same email with typo, same day
  [207956959511, 207957422256],
  // Ryan Austin -- both Ryan Austin Designs
  [105419502501, 160547492870],
  // Mike Bennett -- both Backyard Eats
  [178909756740, 179198525997],
  // Christopher Berg -- both On Point Construction
  [195488607544, 197110281068],
  // Alex Boarman -- same person two work emails
  [188506022323, 190565931126],
  // Brian Boronkay -- both Bboronkay LLC, same day
  [201926763935, 202154486162],
  // Ashe Bowen -- same day
  [194810956628, 194813075370],
  // John Cassidy -- same day
  [193795926559, 193911645493],
  // David Cornblatt -- same day
  [186411411772, 186583286117],
  // Mitchell D. Baumann -- both Nextgen
  [116472076859, 203925917356],
  // David Davis -- both Market Access Experts
  [185573330747, 186411385676],
  // Joseph Drolshagen -- both IFGT Coaching
  [166082505758, 167426001208],
  // Louis E. Gaetano -- same day
  [179849797258, 179860048021],
  // Austin Edgington -- personal + business email
  [188170787769, 191381210942],
  // Adam Francis -- personal + business email
  [128504164216, 145892825510],
  // Brad Garraway -- both Clear Path Intervention
  [109450839909, 198173053568],
  // Anthony Gonzalez -- both Handoff
  [166769717047, 167949180496],
  // Charlie Gonzalez -- both ABSI roofing
  [180070875746, 180631335324],
  // Charles Hanset -- both Thrive2Survive
  [98730535744, 132480404766],
  // Brett Harrison -- Sober Minds
  [188538628959, 190526603802],
  // Jaime Johanson -- both Healing Hearts Sober Living
  [106356956569, 183804650524],
  // James Kint -- both AWT Roofing
  [150332499353, 195250596119],
  // Cj Kullmann -- both CK3 Enterprises
  [173531352873, 187112940666],
  // Kate Maxwell -- both Wingmom, same day
  [198816944558, 198884283520],
  // Jeff Mcelroy -- same day
  [188527279872, 188528534078],
  // Stephen Mcniel -- both CPR
  [187501548318, 189152819060],
  // David Mcnulty -- same day
  [208185102130, 208186782559],
  // Tara Moreno -- both Serenity House Communities
  [134511779222, 135565210968],
  // Ken Nakamura
  [187801284132, 195269900803],
  // Jim Narin -- both Leadership Right Now
  [96545471413, 105803416219],
  // Dustin Nulf -- same day
  [193716100141, 193723013662],
  // Thomas Obrien -- same day
  [187920488375, 187925841266],
  // Terence P McClelland -- both Keller Williams
  [110121399920, 171925063056],
  // Rene Perez -- both Nova Center, same day
  [113356008789, 113372278622],
  // Marco Salcedo -- both Amara Event Design
  [184559370111, 184771265686],
  // Pete Servold -- both Pete's Real Food
  [158535117198, 176375593117],
  // Alex Shiyan -- both Business Debt Adjusters
  [155321334084, 170100399209],
  // Kylie Slavik -- both company "Kylie Slavik"
  [128581992086, 163946003327],
  // Travis Studer -- both Robinhood Electric
  [113553691700, 186674397590],
  // Pepin Suter -- both Pepin Suter Remodeling, same day
  [200364812057, 200365323871],
  // Russ Thornberry -- both Armor Financial, same day
  [201623072298, 201897372246],
  // Brad Werntz -- both Boulders Climbing Gym
  [103316505460, 167422358678],
  // Zain Yaqub
  [97163388959, 162286608206],
];

// ── Delete list: test contacts and junk ──

const DELETE_IDS = [
  // Andrew Lassise test contacts
  154898376106, // +test250k
  152135613444, // +testfb
  153564098687, // +test100
  154877753662, // +testbelow100k
  // "meeting lassise" test record
  119688543142,
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? "\n=== DRY RUN (pass --execute to apply) ===\n" : "\n=== EXECUTING ===\n");

  // ── Validate merge pairs by fetching both contacts ──
  console.log("--- MERGE PLAN ---\n");
  const validatedPairs = [];
  for (const [primaryId, secondaryId] of MERGE_PAIRS) {
    try {
      const [primary, secondary] = await Promise.all([getContact(primaryId), getContact(secondaryId)]);
      const pName = `${primary.properties.firstname || ""} ${primary.properties.lastname || ""}`.trim();
      const sName = `${secondary.properties.firstname || ""} ${secondary.properties.lastname || ""}`.trim();
      const pDate = primary.properties.createdate?.substring(0, 10);
      const sDate = secondary.properties.createdate?.substring(0, 10);
      console.log(
        `MERGE: "${sName}" (${secondaryId}, ${sDate}, ${secondary.properties.email || "no email"})` +
          ` -> into "${pName}" (${primaryId}, ${pDate}, ${primary.properties.email || "no email"})`
      );
      validatedPairs.push([primaryId, secondaryId]);
    } catch (e) {
      console.log(`SKIP: pair ${primaryId}/${secondaryId} -- ${e.message}`);
    }
    await sleep(100); // rate limit
  }

  // ── Validate deletes ──
  console.log("\n--- DELETE PLAN ---\n");
  const validatedDeletes = [];
  for (const id of DELETE_IDS) {
    try {
      const contact = await getContact(id);
      const name = `${contact.properties.firstname || ""} ${contact.properties.lastname || ""}`.trim();
      console.log(`DELETE: "${name}" (${id}, ${contact.properties.email || "no email"})`);
      validatedDeletes.push(id);
    } catch (e) {
      console.log(`SKIP DELETE: ${id} -- ${e.message}`);
    }
    await sleep(100);
  }

  console.log(`\nTotal merges: ${validatedPairs.length} | Total deletes: ${validatedDeletes.length}`);

  if (DRY_RUN) {
    console.log("\nDry run complete. Run with --execute to apply.\n");
    return;
  }

  // ── Execute merges ──
  console.log("\n--- EXECUTING MERGES ---\n");
  let mergeOk = 0;
  let mergeFail = 0;
  for (const [primaryId, secondaryId] of validatedPairs) {
    try {
      await mergeContacts(primaryId, secondaryId);
      console.log(`  OK: ${secondaryId} -> ${primaryId}`);
      mergeOk++;
    } catch (e) {
      console.log(`  FAIL: ${secondaryId} -> ${primaryId}: ${e.message}`);
      mergeFail++;
    }
    await sleep(200); // be kind to rate limits
  }

  // ── Execute deletes ──
  console.log("\n--- EXECUTING DELETES ---\n");
  let deleteOk = 0;
  let deleteFail = 0;
  for (const id of validatedDeletes) {
    try {
      await deleteContact(id);
      console.log(`  OK: deleted ${id}`);
      deleteOk++;
    } catch (e) {
      console.log(`  FAIL: delete ${id}: ${e.message}`);
      deleteFail++;
    }
    await sleep(200);
  }

  // ── Summary ──
  console.log("\n--- SUMMARY ---");
  console.log(`Merges: ${mergeOk} OK, ${mergeFail} failed`);
  console.log(`Deletes: ${deleteOk} OK, ${deleteFail} failed`);

  // ── QA: verify merged contacts still exist, deleted ones don't ──
  console.log("\n--- QA VERIFICATION ---\n");
  let qaPass = 0;
  let qaFail = 0;

  for (const [primaryId] of validatedPairs) {
    try {
      await getContact(primaryId);
      console.log(`  QA OK: primary ${primaryId} still exists`);
      qaPass++;
    } catch (e) {
      console.log(`  QA FAIL: primary ${primaryId} missing! ${e.message}`);
      qaFail++;
    }
    await sleep(100);
  }

  for (const id of validatedDeletes) {
    try {
      await getContact(id);
      console.log(`  QA FAIL: deleted contact ${id} still exists!`);
      qaFail++;
    } catch (e) {
      if (e.message.includes("404")) {
        console.log(`  QA OK: ${id} confirmed deleted`);
        qaPass++;
      } else {
        console.log(`  QA WARN: ${id} check returned ${e.message}`);
        qaFail++;
      }
    }
    await sleep(100);
  }

  console.log(`\nQA: ${qaPass} passed, ${qaFail} failed`);
  console.log("Done.\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
