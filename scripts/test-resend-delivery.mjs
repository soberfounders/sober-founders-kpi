#!/usr/bin/env node
/**
 * Test Resend Email Delivery
 * Sends a personal-looking email with no footer/unsubscribe.
 *
 * Usage: RESEND_API_KEY=re_xxx node scripts/test-resend-delivery.mjs
 */

const RESEND_KEY = process.env.RESEND_API_KEY;
const TEST_RECIPIENT = "andrewlassise@gmail.com";

if (!RESEND_KEY) {
  console.error("Set RESEND_API_KEY env var first");
  console.error("Usage: RESEND_API_KEY=re_xxx node scripts/test-resend-delivery.mjs");
  process.exit(1);
}

async function main() {
  console.log("=== Resend Personal Email Test ===\n");

  // Use onboarding@resend.dev for testing (no domain verification needed)
  // Switch to alassise@soberfounders.org after domain is verified in Resend
  const fromEmail = "onboarding@resend.dev";
  const fromName = "Andrew Lassise";

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [TEST_RECIPIENT],
      subject: "Hey — quick test",
      text: [
        "Hey Andrew,",
        "",
        "This is a test email sent via Resend.",
        "If you're reading this in your Gmail inbox, personal-looking email delivery is working.",
        "",
        "No unsubscribe footer, no branding — just looks like a normal email from a friend.",
        "",
        `Test sent at: ${new Date().toISOString()}`,
        "",
        "— Sober Founders KPI Dashboard (automated test)",
      ].join("\n"),
    }),
  });

  const result = await resp.json();
  console.log(`Status: ${resp.status}`);
  console.log("Response:", JSON.stringify(result, null, 2));

  if (resp.ok) {
    console.log(`\n✅ Email sent! (ID: ${result.id})`);
    console.log(`Check ${TEST_RECIPIENT} inbox — should arrive in seconds.`);
    console.log("\nNote: Test uses onboarding@resend.dev as sender.");
    console.log("Add soberfounders.org domain in Resend dashboard to send from alassise@soberfounders.org.");
  } else {
    console.log("\n❌ Send failed — check error above.");
  }
}

main().catch(console.error);
