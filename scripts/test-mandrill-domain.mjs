#!/usr/bin/env node
const MANDRILL_KEY = process.env.MANDRILL_API_KEY;
if (!MANDRILL_KEY) { console.error("Set MANDRILL_API_KEY env var"); process.exit(1); }

async function mc(endpoint, body = {}) {
  const resp = await fetch(`https://mandrillapp.com/api/1.0/${endpoint}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: MANDRILL_KEY, ...body }),
  });
  return resp.json();
}

async function main() {
  console.log("=== Mandrill Domain & Sender Check ===\n");

  // Check verified senders
  const senders = await mc("senders/list");
  console.log("Verified Senders:");
  if (Array.isArray(senders)) {
    senders.forEach(s => console.log(`  ${s.address} — status: ${s.status}, domain: ${s.domain}`));
  } else {
    console.log("  Response:", JSON.stringify(senders, null, 2));
  }

  // Check domains
  console.log("\nVerified Domains:");
  const domains = await mc("senders/domains");
  if (Array.isArray(domains)) {
    domains.forEach(d => console.log(`  ${d.domain} — dkim: ${d.dkim?.valid}, spf: ${d.spf?.valid}, verified: ${d.verified_at || "not verified"}`));
  } else {
    console.log("  Response:", JSON.stringify(domains, null, 2));
  }

  // Check account info
  console.log("\nAccount Info:");
  const info = await mc("users/info");
  console.log(`  Username: ${info.username}`);
  console.log(`  Reputation: ${info.reputation}`);
  console.log(`  Hourly quota: ${info.hourly_quota}`);
  console.log(`  Backlog: ${info.backlog}`);

  // Try sending with explicit from_email matching verified domain
  console.log("\n--- Attempting send from alassise@soberfounders.org ---");
  const result = await mc("messages/send", {
    message: {
      from_email: "alassise@soberfounders.org",
      from_name: "Andrew Lassise",
      to: [{ email: "andrewlassise@gmail.com", name: "Andrew", type: "to" }],
      subject: "Mandrill test — domain verified",
      text: "Testing after domain verification. If you see this, Mandrill delivery works.",
      track_opens: false,
      track_clicks: false,
    },
  });
  console.log("Send result:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
