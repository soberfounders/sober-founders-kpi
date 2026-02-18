const envText = await Deno.readTextFile(".env");
const env: Record<string, string> = {};

for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) continue;
  env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

const apiKey = env.MAILCHIMP_API_KEY || "";
const listId = env.MAILCHIMP_AUDIENCE_ID || env.MAILCHIMP_LIST_ID || "";
const serverPrefix = env.MAILCHIMP_SERVER_PREFIX || "";

if (!apiKey || !listId || !serverPrefix) {
  console.error("Missing MAILCHIMP_API_KEY, MAILCHIMP_AUDIENCE_ID/MAILCHIMP_LIST_ID, or MAILCHIMP_SERVER_PREFIX in .env");
  Deno.exit(1);
}

const baseUrl = `https://${serverPrefix}.api.mailchimp.com/3.0`;
const options = {
  headers: {
    Authorization: `Basic ${btoa(`user:${apiKey}`)}`,
    "Content-Type": "application/json",
  },
};

console.log(`Testing Mailchimp connection for list: ${listId}...`);

try {
  const res = await fetch(`${baseUrl}/lists/${listId}`, options);
  const data = await res.json();

  if (data.stats) {
    console.log("Connection successful.");
    console.log(`Audience Name: ${data.name}`);
    console.log(`Total Subscribers: ${data.stats.member_count}`);
    console.log(`Recent Unsubscribes: ${data.stats.unsubscribe_count}`);
  } else {
    console.error("Mailchimp API error:", data);
  }
} catch (err: any) {
  console.error("Network error:", err?.message || err);
}
