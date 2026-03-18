import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  let envPath = resolve(ROOT, ".env.local");
  try {
    readFileSync(envPath, "utf8");
  } catch {
    envPath = resolve(ROOT, ".env");
  }
  const lines = readFileSync(envPath, "utf8").replace(/\r/g, "").split("\n");
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const SITE = env.WP_SITE_URL || "https://soberfounders.org";
const AUTH = Buffer.from(`${env.WP_USERNAME}:${env.WP_APP_PASSWORD}`).toString("base64");

async function checkPage(id) {
  const url = `${SITE}/wp-json/wp/v2/pages/${id}`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${AUTH}` } });
  if (!res.ok) return `Failed: ${res.status}`;
  const json = await res.json();
  return { id: json.id, slug: json.slug, link: json.link };
}

async function main() {
  console.log("Checking page 1989:", await checkPage(1989));
  console.log("Checking page 4167:", await checkPage(4167));
}

main();
