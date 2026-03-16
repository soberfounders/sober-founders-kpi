#!/usr/bin/env node
/**
 * Test Mandrill (Mailchimp Transactional) Email Delivery
 * Sends a personal-looking email with no footer/unsubscribe.
 */

const MANDRILL_KEY = process.env.MANDRILL_API_KEY;
if (!MANDRILL_KEY) { console.error("Set MANDRILL_API_KEY env var"); process.exit(1); }

async function main() {
  console.log("=== Mandrill Personal Email Test ===\n");

  const resp = await fetch("https://mandrillapp.com/api/1.0/messages/send.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: MANDRILL_KEY,
      message: {
        from_email: "alassise@soberfounders.org",
        from_name: "Andrew Lassise",
        to: [{ email: "andrewlassise@gmail.com", name: "Andrew", type: "to" }],
        subject: "Hey — quick test",
        text: [
          "Hey Andrew,",
          "",
          "This is a test email sent via Mandrill (Mailchimp Transactional).",
          "If you're reading this in your Gmail inbox, personal-looking email delivery is working.",
          "",
          "No unsubscribe footer, no branding — just looks like a normal email from a friend.",
          "",
          `Test sent at: ${new Date().toISOString()}`,
          "",
          "— Sober Founders KPI Dashboard (automated test)",
        ].join("\n"),
        tags: ["test"],
        track_opens: false,
        track_clicks: false,
        auto_text: false,
        auto_html: true,
      },
    }),
  });

  const result = await resp.json();
  console.log("Response:", JSON.stringify(result, null, 2));

  if (Array.isArray(result) && result[0]?.status === "sent") {
    console.log("\n✅ Email sent! Check andrewlassise@gmail.com inbox.");
    console.log("   It should look like a personal email — no Mailchimp branding.");
  } else if (Array.isArray(result) && result[0]?.status === "queued") {
    console.log("\n⏳ Email queued (domain may still be verifying). Should deliver shortly.");
  } else if (Array.isArray(result) && result[0]?.reject_reason) {
    console.log(`\n⚠️  Rejected: ${result[0].reject_reason}`);
    console.log("   Domain verification may still be pending in Mandrill.");
  } else {
    console.log("\n❌ Unexpected response — check above for details.");
  }
}

main().catch(console.error);
