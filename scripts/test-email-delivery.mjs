#!/usr/bin/env node
/**
 * Test HubSpot Email Deliverability
 *
 * Sends a single test email engagement to andrewlassise@gmail.com via HubSpot.
 * This tests whether the HubSpot connected inbox actually delivers
 * engagement-logged emails to the recipient's inbox.
 *
 * Usage: node scripts/test-email-delivery.mjs
 *
 * Requires: HUBSPOT_PRIVATE_APP_TOKEN and HUBSPOT_SENDER_EMAIL in .env.local
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv dependency needed)
const envPath = resolve(__dirname, "../.env.local");
try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
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
} catch (e) {
  console.error("Could not read .env.local:", e.message);
}

const HUBSPOT_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const SENDER_EMAIL = process.env.HUBSPOT_SENDER_EMAIL;
const TEST_RECIPIENT = "andrewlassise@gmail.com";

if (!HUBSPOT_TOKEN) {
  console.error("❌ HUBSPOT_PRIVATE_APP_TOKEN not found in .env.local");
  process.exit(1);
}

if (!SENDER_EMAIL) {
  console.error("❌ HUBSPOT_SENDER_EMAIL not found in .env.local");
  console.error("   This should be the email address connected in HubSpot.");
  console.error("   Add it to .env.local: HUBSPOT_SENDER_EMAIL=you@domain.com");
  process.exit(1);
}

async function hubspotFetch(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${HUBSPOT_TOKEN}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  return resp;
}

async function main() {
  console.log("=== HubSpot Email Deliverability Test ===\n");
  console.log(`Sender:    ${SENDER_EMAIL}`);
  console.log(`Recipient: ${TEST_RECIPIENT}`);
  console.log();

  // Step 1: Look up contact
  console.log("1. Looking up contact in HubSpot...");
  const searchResp = await hubspotFetch(
    "https://api.hubapi.com/crm/v3/objects/contacts/search",
    {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: "email",
            operator: "EQ",
            value: TEST_RECIPIENT.toLowerCase(),
          }],
        }],
        properties: ["email", "firstname", "lastname", "membership_s"],
        limit: 1,
      }),
    }
  );

  if (!searchResp.ok) {
    const err = await searchResp.text();
    console.error(`   ❌ Contact search failed (${searchResp.status}): ${err}`);
    process.exit(1);
  }

  const searchJson = await searchResp.json();
  const contact = searchJson?.results?.[0];

  if (!contact) {
    console.error(`   ❌ Contact not found in HubSpot for ${TEST_RECIPIENT}`);
    process.exit(1);
  }

  const contactId = contact.id;
  const firstName = contact.properties?.firstname || "there";
  const lastName = contact.properties?.lastname || "";
  const membership = contact.properties?.membership_s || "(none)";

  console.log(`   ✅ Found: ${firstName} ${lastName} (ID: ${contactId})`);
  console.log(`   📋 Membership(s): ${membership}`);
  console.log();

  // Step 2: Create engagement email
  console.log("2. Creating email engagement on HubSpot timeline...");
  const now = new Date().toISOString();
  const subject = `[TEST] Sober Founders Email Delivery Test — ${now.slice(0, 16)}`;
  const htmlBody = `<p>Hey ${firstName},</p>
<p>This is an automated test to verify that HubSpot engagement emails are being delivered to your inbox.</p>
<p><strong>If you're reading this in your Gmail inbox</strong>, email delivery is working correctly.</p>
<p><strong>If you only see this on the HubSpot CRM timeline</strong> but NOT in Gmail, the connected inbox needs to be configured.</p>
<p>Test sent at: ${now}</p>
<p>— Sober Founders KPI Dashboard (automated test)</p>`;

  // Note: hs_email_to_email, hs_email_sender_email are READ-ONLY in HubSpot.
  // Sender/recipient info goes in hs_email_headers JSON only.
  // hs_email_campaign_type does not exist as a property — omit it.
  const createResp = await hubspotFetch(
    "https://api.hubapi.com/crm/v3/objects/emails",
    {
      method: "POST",
      body: JSON.stringify({
        properties: {
          hs_timestamp: now,
          hs_email_direction: "EMAIL",
          hs_email_status: "SENT",
          hs_email_subject: subject,
          hs_email_text: htmlBody.replace(/<[^>]*>/g, ""),
          hs_email_html: htmlBody,
          hs_email_headers: JSON.stringify({
            from: { email: SENDER_EMAIL },
            to: [{ email: TEST_RECIPIENT }],
          }),
        },
      }),
    }
  );

  if (!createResp.ok) {
    const err = await createResp.text();
    console.error(`   ❌ Email creation failed (${createResp.status}): ${err}`);
    process.exit(1);
  }

  const emailObj = await createResp.json();
  const emailId = emailObj?.id;

  if (!emailId) {
    console.error("   ❌ No email ID returned from HubSpot");
    process.exit(1);
  }

  console.log(`   ✅ Email engagement created (ID: ${emailId})`);
  console.log();

  // Step 3: Associate email with contact
  console.log("3. Associating email with contact...");
  const assocResp = await hubspotFetch(
    `https://api.hubapi.com/crm/v3/objects/emails/${emailId}/associations/contacts/${contactId}/198`,
    { method: "PUT" }
  );

  if (!assocResp.ok) {
    const err = await assocResp.text();
    console.error(`   ⚠️  Association failed (${assocResp.status}): ${err}`);
    console.log("   Email was created but not linked to the contact.");
  } else {
    console.log(`   ✅ Email associated with contact ${contactId}`);
  }

  console.log();
  console.log("=== Test Complete ===");
  console.log();
  console.log("What to check:");
  console.log(`  1. Check ${TEST_RECIPIENT} inbox for the test email`);
  console.log(`  2. Check HubSpot CRM → Contact → ${firstName} ${lastName} → Activity timeline`);
  console.log();
  console.log("If the email appears on the HubSpot timeline but NOT in Gmail:");
  console.log("  → HubSpot connected inbox is NOT configured for outbound delivery");
  console.log("  → The outreach agents are logging emails but not actually sending them");
  console.log("  → Fix: Connect the sender inbox in HubSpot Settings → Email → Connected Emails");
  console.log("  → Or: Switch to HubSpot Single Send API for transactional email delivery");
  console.log();
  console.log("If the email arrives in Gmail:");
  console.log("  → ✅ Email delivery is working! Safe to enable outreach agents.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
