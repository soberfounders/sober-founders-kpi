/**
 * Antigravity Browser Bridge
 * Run with: deno run -A scripts/bridge.ts
 */

import { chromium } from "npm:playwright";

const url = "http://localhost:5173";

console.log("------------------------------------------");
console.log("🚀 Starting Antigravity Browser Bridge...");
console.log(`🔗 Target: ${url}`);
console.log("------------------------------------------");

try {
  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  console.log("Opening dashboard...");
  await page.goto(url, { waitUntil: "networkidle" });

  console.log("✅ Bridge is LIVE.");
  console.log("Browser window is open — keep this terminal running.");
  console.log("Press Ctrl+C to close.");

  // Keep process alive
  await new Promise(() => {});
} catch (error) {
  console.error("❌ Failed to start bridge:", error);
  Deno.exit(1);
}
