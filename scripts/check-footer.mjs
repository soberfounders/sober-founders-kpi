#!/usr/bin/env node
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

const pages = ["/", "/tuesday/", "/thursday/", "/events/", "/phoenix-forum/", "/blog/", "/about/", "/our-story/"];

async function main() {
  console.log("Footer check across site\n");
  for (const path of pages) {
    const res = await fetch(`${SITE}${path}?nocache=${Date.now()}`);
    const html = await res.text();

    const contentEnd = html.indexOf("<!-- #content -->");
    const styleIdx = html.indexOf("<style>", contentEnd > 0 ? contentEnd : 0);
    const footerDiv = html.indexOf('<div class="sf-site-footer">');
    const cssInStyle = styleIdx > -1 && footerDiv > -1 && styleIdx < footerDiv;

    // Check if raw CSS appears as text (not inside <style>)
    let rawCss = false;
    if (contentEnd > -1 && footerDiv > -1) {
      const between = html.substring(contentEnd, footerDiv);
      rawCss = between.includes(".sf-site-footer") && !between.includes("<style>");
    }

    const status = rawCss ? "BROKEN" : cssInStyle ? "OK    " : "NO FTR";
    console.log(`${status} | ${path.padEnd(22)} | styled=${cssInStyle} footer=${footerDiv > -1}`);
  }
}

main().catch(console.error);
