/**
 * Playwright CDP Connection Spike
 *
 * Purpose: Validate that playwright-core can connect to a running
 * WebView2/Chromium instance via CDP (Chrome DevTools Protocol).
 *
 * Usage:
 *   npx tsx spike/playwright-bun-spike.ts
 *   # or
 *   bun run spike/playwright-bun-spike.ts
 *
 * Prerequisites:
 *   - A Chromium-based browser running with --remote-debugging-port=9222
 *   - OR a Tauri WebView2 app launched with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
 */

import { chromium } from "playwright-core";

const CDP_ENDPOINT = "http://127.0.0.1:9222";

async function main(): Promise<void> {
  console.log(`[spike] Attempting CDP connection to ${CDP_ENDPOINT}...`);

  try {
    const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    console.log("[spike] Connected successfully!");

    // List all browser contexts
    const contexts = browser.contexts();
    console.log(`[spike] Browser contexts: ${contexts.length}`);

    // List all pages/targets
    for (const context of contexts) {
      const pages = context.pages();
      console.log(`[spike] Context has ${pages.length} page(s):`);
      for (const page of pages) {
        console.log(`  - Title: "${await page.title()}" | URL: ${page.url()}`);
      }
    }

    // Also try listing via CDP session for raw target info
    const cdpSession = await browser.newBrowserCDPSession();
    const { targetInfos } = await cdpSession.send("Target.getTargets");
    console.log(`\n[spike] Raw CDP targets: ${targetInfos.length}`);
    for (const target of targetInfos) {
      console.log(
        `  - type=${target.type} title="${target.title}" url=${target.url}`
      );
    }

    await browser.close();
    console.log("\n[spike] SUCCESS - playwright-core CDP connection works!");
  } catch (error) {
    console.error("[spike] FAILURE - Could not connect via CDP:");
    console.error(
      `  ${error instanceof Error ? error.message : String(error)}`
    );
    console.error("\nTroubleshooting:");
    console.error(
      "  1. Ensure a Chromium instance is running with --remote-debugging-port=9222"
    );
    console.error(`  2. Verify ${CDP_ENDPOINT}/json/version is reachable`);
    console.error(
      "  3. For WebView2: set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222"
    );
    process.exit(1);
  }
}

main();
