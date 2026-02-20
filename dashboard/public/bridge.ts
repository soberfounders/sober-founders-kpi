/**
 * Antigravity Browser Bridge
 * This script allows the AI agent to interact with your local browser.
 */

import { chromium } from "npm:playwright";

const url = "http://localhost:5173";

console.log("------------------------------------------");
console.log("🚀 Starting Antigravity Browser Bridge...");
console.log(`🔗 Target: ${url}`);
console.log("------------------------------------------");

try {
  const browser = await chromium.launch({ 
    headless: false, // Set to false so you can see it!
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log("Opening dashboard...");
  await page.goto(url);
  
  console.log("✅ Bridge is LIVE.");
  console.log("I can now see and interact with this browser window.");
  console.log("Keep this terminal open to maintain the bridge.");

  // Keep the process alive
  await new Promise(() => {});

} catch (error) {
  console.error("❌ Failed to start bridge:", error);
}
