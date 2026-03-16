#!/usr/bin/env node
/**
 * Test Mailchimp Email Delivery
 *
 * Verifies Mailchimp API connectivity and sends a real test email
 * to andrewlassise@gmail.com via a test campaign.
 *
 * Usage: node scripts/test-mailchimp-delivery.mjs
 */

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
if (!MAILCHIMP_API_KEY) { console.error("Set MAILCHIMP_API_KEY env var"); process.exit(1); }
const SERVER_PREFIX = MAILCHIMP_API_KEY.split("-").pop(); // "us8"
const BASE_URL = `https://${SERVER_PREFIX}.api.mailchimp.com/3.0`;
const TEST_RECIPIENT = "andrewlassise@gmail.com";

const authHeader = "Basic " + Buffer.from(`anystring:${MAILCHIMP_API_KEY}`).toString("base64");

async function mc(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      authorization: authHeader,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { ok: resp.ok, status: resp.status, json, text };
}

async function main() {
  console.log("=== Mailchimp Email Delivery Test ===\n");
  console.log(`API Key: ${MAILCHIMP_API_KEY.slice(0, 8)}...${MAILCHIMP_API_KEY.slice(-4)}`);
  console.log(`Server:  ${SERVER_PREFIX}`);
  console.log(`To:      ${TEST_RECIPIENT}\n`);

  // Step 1: Verify API key
  console.log("1. Verifying Mailchimp API key...");
  const ping = await mc("/ping");
  if (!ping.ok) {
    console.error(`   ❌ API key invalid (${ping.status}): ${ping.text}`);
    process.exit(1);
  }
  console.log(`   ✅ API key valid — ${ping.json?.health_status}`);

  // Step 2: Get account info
  console.log("\n2. Getting account info...");
  const account = await mc("/");
  if (!account.ok) {
    console.error(`   ❌ Account fetch failed: ${account.text}`);
    process.exit(1);
  }
  const acct = account.json;
  console.log(`   ✅ Account: ${acct.account_name} (${acct.email})`);
  console.log(`   📧 Contact email: ${acct.contact?.email || acct.email}`);
  console.log(`   🏢 Company: ${acct.contact?.company || "(none)"}`);

  // Step 3: List audiences
  console.log("\n3. Finding audiences (lists)...");
  const lists = await mc("/lists?count=10");
  if (!lists.ok || !lists.json?.lists?.length) {
    console.error(`   ❌ No lists found: ${lists.text}`);
    process.exit(1);
  }
  for (const list of lists.json.lists) {
    console.log(`   📋 "${list.name}" (ID: ${list.id}) — ${list.stats?.member_count || 0} members`);
  }
  const targetList = lists.json.lists[0]; // use first list
  console.log(`   → Using list: "${targetList.name}" (${targetList.id})`);

  // Step 4: Check if recipient is a subscriber
  console.log(`\n4. Checking if ${TEST_RECIPIENT} is a subscriber...`);
  const crypto = await import("node:crypto");
  const subscriberHash = crypto.createHash("md5").update(TEST_RECIPIENT.toLowerCase()).digest("hex");
  const member = await mc(`/lists/${targetList.id}/members/${subscriberHash}`);
  if (member.ok) {
    console.log(`   ✅ Found subscriber: ${member.json.full_name || member.json.email_address} (status: ${member.json.status})`);
  } else {
    console.log(`   ⚠️  Not a subscriber on this list (${member.status})`);
    console.log("   → Adding as subscriber for test...");
    const addResp = await mc(`/lists/${targetList.id}/members`, {
      method: "POST",
      body: JSON.stringify({
        email_address: TEST_RECIPIENT,
        status: "subscribed",
        merge_fields: { FNAME: "Andrew", LNAME: "Lassise" },
      }),
    });
    if (addResp.ok) {
      console.log("   ✅ Added as subscriber");
    } else if (addResp.json?.title === "Member Exists") {
      console.log("   ℹ️  Already exists (possibly on different status)");
      // Try to update status
      const updateResp = await mc(`/lists/${targetList.id}/members/${subscriberHash}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "subscribed" }),
      });
      console.log(`   → Update status: ${updateResp.ok ? "✅" : "❌"}`);
    } else {
      console.error(`   ❌ Failed to add: ${addResp.text}`);
    }
  }

  // Step 5: Create a test campaign
  console.log("\n5. Creating test campaign...");
  const now = new Date().toISOString().slice(0, 16);
  const createCampaign = await mc("/campaigns", {
    method: "POST",
    body: JSON.stringify({
      type: "regular",
      recipients: {
        list_id: targetList.id,
        segment_opts: {
          match: "all",
          conditions: [{
            condition_type: "EmailAddress",
            field: "EMAIL",
            op: "is",
            value: TEST_RECIPIENT,
          }],
        },
      },
      settings: {
        subject_line: `[TEST] Sober Founders Email Delivery — ${now}`,
        preview_text: "Testing email delivery pipeline",
        title: `Delivery Test ${now}`,
        from_name: "Sober Founders",
        reply_to: acct.email,
      },
    }),
  });

  if (!createCampaign.ok) {
    console.error(`   ❌ Campaign creation failed (${createCampaign.status}): ${createCampaign.text}`);
    process.exit(1);
  }

  const campaignId = createCampaign.json.id;
  console.log(`   ✅ Campaign created (ID: ${campaignId})`);

  // Step 6: Set campaign content
  console.log("\n6. Setting campaign content...");
  const setContent = await mc(`/campaigns/${campaignId}/content`, {
    method: "PUT",
    body: JSON.stringify({
      html: `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2d3748;">Sober Founders — Email Delivery Test</h2>
  <p>Hey Andrew,</p>
  <p>This is an automated test to verify that emails sent through our Mailchimp pipeline are actually being delivered.</p>
  <p><strong>If you're reading this in your Gmail inbox — email delivery via Mailchimp is working. ✅</strong></p>
  <p style="color: #718096; font-size: 14px;">
    Test sent at: ${new Date().toISOString()}<br>
    Campaign ID: ${campaignId}<br>
    Source: scripts/test-mailchimp-delivery.mjs
  </p>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
  <p style="color: #a0aec0; font-size: 12px;">Sober Founders KPI Dashboard — Automated Test</p>
</body>
</html>`,
    }),
  });

  if (!setContent.ok) {
    console.error(`   ❌ Content update failed (${setContent.status}): ${setContent.text}`);
    // Clean up campaign
    await mc(`/campaigns/${campaignId}`, { method: "DELETE" });
    process.exit(1);
  }
  console.log("   ✅ Content set");

  // Step 7: Send the campaign
  console.log("\n7. Sending campaign...");
  const sendResp = await mc(`/campaigns/${campaignId}/actions/send`, {
    method: "POST",
  });

  if (!sendResp.ok) {
    console.error(`   ❌ Send failed (${sendResp.status}): ${sendResp.text}`);
    console.log("\n   Trying test send instead...");
    const testResp = await mc(`/campaigns/${campaignId}/actions/test`, {
      method: "POST",
      body: JSON.stringify({
        test_emails: [TEST_RECIPIENT],
        send_type: "html",
      }),
    });
    if (testResp.ok) {
      console.log("   ✅ Test email sent (check inbox for '[Test] ' prefixed subject)");
    } else {
      console.error(`   ❌ Test send also failed (${testResp.status}): ${testResp.text}`);
    }
    // Clean up the unsent campaign
    console.log("\n   Cleaning up unsent campaign...");
    await mc(`/campaigns/${campaignId}`, { method: "DELETE" });
    process.exit(sendResp.ok ? 0 : 1);
  }

  console.log("   ✅ Campaign sent!");

  console.log("\n=== Test Complete ===\n");
  console.log("Check andrewlassise@gmail.com inbox in the next 1-2 minutes.");
  console.log("The email subject will be:");
  console.log(`  [TEST] Sober Founders Email Delivery — ${now}`);
  console.log("\nIf it arrives → Mailchimp delivery works and we can wire the outreach agents to use it.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
