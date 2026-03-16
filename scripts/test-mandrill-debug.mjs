#!/usr/bin/env node
/**
 * Deep debug of Mandrill sending — try every angle.
 */

const KEY = process.env.MANDRILL_API_KEY;
if (!KEY) { console.error("Set MANDRILL_API_KEY env var"); process.exit(1); }

async function mc(endpoint, body = {}) {
  const resp = await fetch(`https://mandrillapp.com/api/1.0/${endpoint}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: KEY, ...body }),
  });
  return resp.json();
}

async function main() {
  console.log("=== Mandrill Deep Debug ===\n");

  // 1. Check sender info
  console.log("1. Sender info for alassise@soberfounders.org:");
  const senderInfo = await mc("senders/info", { address: "alassise@soberfounders.org" });
  console.log(JSON.stringify(senderInfo, null, 2));

  // 2. Check all domains with full detail
  console.log("\n2. Domain details:");
  const domains = await mc("senders/domains");
  console.log(JSON.stringify(domains, null, 2));

  // 3. Check if there's a sending domain check
  console.log("\n3. Verify domain:");
  const verify = await mc("senders/check-domain", { domain: "soberfounders.org" });
  console.log(JSON.stringify(verify, null, 2));

  // 4. Try adding sender explicitly
  console.log("\n4. Adding sender explicitly:");
  const addSender = await mc("senders/add-sender", { address: "alassise@soberfounders.org" });
  console.log(JSON.stringify(addSender, null, 2));

  // 5. Try sending with return_path_domain
  console.log("\n5. Trying send with explicit return_path_domain:");
  const result1 = await mc("messages/send", {
    message: {
      from_email: "alassise@soberfounders.org",
      from_name: "Andrew Lassise",
      to: [{ email: "andrewlassise@gmail.com", type: "to" }],
      subject: "Mandrill debug test 1",
      text: "Testing with explicit settings.",
      track_opens: false,
      track_clicks: false,
      return_path_domain: "soberfounders.org",
    },
  });
  console.log("Result:", JSON.stringify(result1, null, 2));

  // 6. Try with auto_html and headers
  console.log("\n6. Trying with headers and HTML body:");
  const result2 = await mc("messages/send", {
    message: {
      from_email: "alassise@soberfounders.org",
      from_name: "Andrew Lassise",
      to: [{ email: "andrewlassise@gmail.com", type: "to" }],
      subject: "Mandrill debug test 2",
      html: "<p>Testing with HTML body instead of text-only.</p>",
      track_opens: false,
      track_clicks: false,
    },
  });
  console.log("Result:", JSON.stringify(result2, null, 2));

  // 7. Try sending to the same domain (soberfounders.org)
  console.log("\n7. Trying send to same domain (alassise@soberfounders.org):");
  const result3 = await mc("messages/send", {
    message: {
      from_email: "alassise@soberfounders.org",
      from_name: "Andrew Lassise",
      to: [{ email: "alassise@soberfounders.org", type: "to" }],
      subject: "Mandrill same-domain test",
      text: "Testing same-domain delivery.",
    },
  });
  console.log("Result:", JSON.stringify(result3, null, 2));

  // 8. Check account-level settings/restrictions
  console.log("\n8. Account info (full):");
  const info = await mc("users/info");
  console.log(JSON.stringify(info, null, 2));

  // 9. Check if there are any allowlist/denylist rules
  console.log("\n9. Checking allowlist/denylist:");
  const allowlist = await mc("allowlists/list");
  console.log("Allowlist:", JSON.stringify(allowlist, null, 2));
  const denylist = await mc("rejects/list");
  console.log("Denylist:", JSON.stringify(denylist, null, 2));
}

main().catch(console.error);
