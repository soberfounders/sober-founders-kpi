#!/usr/bin/env node
/**
 * deploy-event-schema.mjs — Create a Code Snippet that injects Event JSON-LD
 * schema into the <head> of /events/, /tuesday/, and /thursday/ pages.
 *
 * This is backend-only — no visual changes to these pages.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  let envPath = resolve(ROOT, ".env.local");
  try { readFileSync(envPath, "utf8"); } catch { envPath = resolve(ROOT, ".env"); }
  const lines = readFileSync(envPath, "utf8").replace(/\r/g, "").split("\n");
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL;
const auth = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");
const headers = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };

// PHP snippet that injects Event schema on /events/, /tuesday/, /thursday/
const phpCode = `// Inject Event JSON-LD schema on session landing pages
add_action('wp_head', function() {
    // Only run on specific session pages
    if (!is_page(['events', 'tuesday', 'thursday'])) return;

    $slug = get_post_field('post_name', get_the_ID());

    $events = [];

    // EventSeries (shared across all session pages)
    $events[] = [
        '@context' => 'https://schema.org',
        '@type' => 'EventSeries',
        '@id' => 'https://www.soberfounders.org/#event-series-weekly-sessions',
        'name' => 'Sober Founders Weekly Mastermind Sessions',
        'description' => 'Free recurring online mastermind sessions for entrepreneurs in recovery. Held every Tuesday and Thursday.',
        'url' => 'https://www.soberfounders.org/events/',
        'eventAttendanceMode' => 'https://schema.org/OnlineEventAttendanceMode',
        'eventStatus' => 'https://schema.org/EventScheduled',
        'isAccessibleForFree' => true,
        'organizer' => [
            '@type' => 'Organization',
            '@id' => 'https://www.soberfounders.org/#organization',
            'name' => 'Sober Founders Inc.',
            'url' => 'https://www.soberfounders.org/',
        ],
        'offers' => [
            '@type' => 'Offer',
            'price' => '0',
            'priceCurrency' => 'USD',
            'availability' => 'https://schema.org/InStock',
        ],
        'location' => [
            '@type' => 'VirtualLocation',
            'url' => 'https://www.soberfounders.org/events/',
        ],
    ];

    // Tuesday event (on /events/ and /tuesday/)
    if ($slug === 'events' || $slug === 'tuesday') {
        $next_tue = date('Y-m-d', strtotime('next tuesday'));
        $events[] = [
            '@context' => 'https://schema.org',
            '@type' => 'Event',
            '@id' => 'https://www.soberfounders.org/#tuesday-session',
            'name' => 'Sober Founders Tuesday Mastermind',
            'description' => 'Weekly Tuesday mastermind session for sober entrepreneurs. Free, community-led discussions on business and sobriety.',
            'eventAttendanceMode' => 'https://schema.org/OnlineEventAttendanceMode',
            'eventStatus' => 'https://schema.org/EventScheduled',
            'isAccessibleForFree' => true,
            'startDate' => $next_tue . 'T12:00:00-05:00',
            'endDate' => $next_tue . 'T13:00:00-05:00',
            'eventSchedule' => [
                '@type' => 'Schedule',
                'byDay' => 'https://schema.org/Tuesday',
                'repeatFrequency' => 'P1W',
                'scheduleTimezone' => 'America/New_York',
                'startTime' => '12:00:00',
                'endTime' => '13:00:00',
            ],
            'superEvent' => ['@id' => 'https://www.soberfounders.org/#event-series-weekly-sessions'],
            'organizer' => ['@type' => 'Organization', 'name' => 'Sober Founders Inc.'],
            'offers' => ['@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'USD'],
            'location' => ['@type' => 'VirtualLocation', 'url' => 'https://www.soberfounders.org/tuesday/'],
        ];
    }

    // Thursday event (on /events/ and /thursday/)
    if ($slug === 'events' || $slug === 'thursday') {
        $next_thu = date('Y-m-d', strtotime('next thursday'));
        $events[] = [
            '@context' => 'https://schema.org',
            '@type' => 'Event',
            '@id' => 'https://www.soberfounders.org/#thursday-session',
            'name' => 'Sober Founders Thursday Mastermind',
            'description' => 'Weekly Thursday mastermind session for sober entrepreneurs. Free, community-led discussions on business and sobriety.',
            'eventAttendanceMode' => 'https://schema.org/OnlineEventAttendanceMode',
            'eventStatus' => 'https://schema.org/EventScheduled',
            'isAccessibleForFree' => true,
            'startDate' => $next_thu . 'T11:00:00-05:00',
            'endDate' => $next_thu . 'T12:00:00-05:00',
            'eventSchedule' => [
                '@type' => 'Schedule',
                'byDay' => 'https://schema.org/Thursday',
                'repeatFrequency' => 'P1W',
                'scheduleTimezone' => 'America/New_York',
                'startTime' => '11:00:00',
                'endTime' => '12:00:00',
            ],
            'superEvent' => ['@id' => 'https://www.soberfounders.org/#event-series-weekly-sessions'],
            'organizer' => ['@type' => 'Organization', 'name' => 'Sober Founders Inc.'],
            'offers' => ['@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'USD'],
            'location' => ['@type' => 'VirtualLocation', 'url' => 'https://www.soberfounders.org/thursday/'],
        ];
    }

    echo '<script type="application/ld+json">' . wp_json_encode($events, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . '</script>' . "\\n";
});`;

async function main() {
  // Check if a similar snippet already exists
  const listRes = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, { headers });
  const snippets = await listRes.json();

  let existingId = null;
  for (const s of snippets) {
    if (s.name && s.name.includes("Event") && s.name.includes("Session") && s.name.includes("Schema")) {
      existingId = s.id;
      break;
    }
  }

  if (existingId) {
    console.log(`Updating existing snippet #${existingId}...`);
    const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets/${existingId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ code: phpCode, active: true }),
    });
    const data = await res.json();
    console.log(`Updated | Active: ${data.active} | Error: ${data.code_error || "none"}`);
  } else {
    console.log("Creating new snippet...");
    const res = await fetch(`${SITE}/wp-json/code-snippets/v1/snippets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "SF Event Schema — Session Landing Pages (/events, /tuesday, /thursday)",
        desc: "Injects EventSeries + individual Tuesday/Thursday Event JSON-LD into <head> on session pages. No visual changes.",
        code: phpCode,
        active: true,
        scope: "global",
        priority: 10,
      }),
    });
    const data = await res.json();
    console.log(`Created snippet #${data.id} | Active: ${data.active} | Error: ${data.code_error || "none"}`);
  }

  // Quick verification — check if schema appears on /thursday/
  console.log("\nVerifying schema on /thursday/...");
  const pageRes = await fetch(`${SITE}/thursday/`);
  const html = await pageRes.text();
  const hasEventSchema = html.includes('"@type":"Event"') || html.includes('"@type": "Event"');
  const hasEventSeries = html.includes('"@type":"EventSeries"') || html.includes('"@type": "EventSeries"');
  console.log(`EventSeries schema: ${hasEventSeries ? "FOUND" : "NOT FOUND"}`);
  console.log(`Event schema: ${hasEventSchema ? "FOUND" : "NOT FOUND"}`);

  console.log("\nVerifying schema on /events/...");
  const eventsRes = await fetch(`${SITE}/events/`);
  const eventsHtml = await eventsRes.text();
  const eventsHasSchema = eventsHtml.includes('"@type":"Event"') || eventsHtml.includes('"@type": "Event"');
  console.log(`Event schema on /events/: ${eventsHasSchema ? "FOUND" : "NOT FOUND"}`);

  console.log("\nDone. Validate at: https://search.google.com/test/rich-results");
}

main().catch(console.error);
