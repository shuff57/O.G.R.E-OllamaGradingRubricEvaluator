/**
 * CDP Target Discovery Spike
 *
 * Purpose: Connect to the WebView2 CDP endpoint, list all available targets,
 * and identify which target is the embedded browser vs the main app webview.
 *
 * Usage:
 *   npx tsx spike/cdp-targeting-spike.ts
 *   # or
 *   bun run spike/cdp-targeting-spike.ts
 *
 * Prerequisites:
 *   1. Launch the Tauri app with CDP enabled:
 *        set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
 *        ogre-desktop.exe
 *
 *      OR set the env var in lib.rs (see SPIKE-RESULTS.md for the code change).
 *
 *   2. Navigate to a grading page in the embedded browser so both targets exist.
 */

const CDP_PORT = 9222;
const CDP_HOST = "127.0.0.1";
const CDP_DISCOVERY_URL = `http://${CDP_HOST}:${CDP_PORT}/json`;

/**
 * Shape of a CDP target as returned by /json endpoint.
 * See: https://chromedevtools.github.io/devtools-protocol/
 */
interface CDPTarget {
  description: string;
  devtoolsFrontendUrl: string;
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
  /** Sometimes present for WebView2 targets */
  faviconUrl?: string;
}

/**
 * URL patterns that identify the Tauri main app webview.
 * Tauri v2 uses either tauri:// or https://tauri.localhost depending on config.
 */
const MAIN_APP_URL_PATTERNS = [
  /^tauri:\/\/localhost/,
  /^https:\/\/tauri\.localhost/,
  /^http:\/\/localhost:1420/, // Tauri dev mode (Vite dev server)
  /^http:\/\/localhost:5173/, // Vite dev server alternative port
];

/**
 * Check if a target URL matches the main app webview.
 */
function isMainAppTarget(url: string): boolean {
  return MAIN_APP_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Check if a target URL is an external site (embedded browser).
 * Embedded browser navigates to user's grading site — any non-Tauri URL.
 */
function isEmbeddedBrowserTarget(url: string): boolean {
  return !isMainAppTarget(url) && url !== "about:blank" && url !== "";
}

async function discoverTargets(): Promise<CDPTarget[]> {
  console.log(`\n[cdp-spike] Fetching CDP targets from ${CDP_DISCOVERY_URL}...\n`);

  const response = await fetch(CDP_DISCOVERY_URL);

  if (!response.ok) {
    throw new Error(
      `CDP discovery failed: ${response.status} ${response.statusText}. ` +
        `Is the app running with --remote-debugging-port=${CDP_PORT}?`
    );
  }

  const targets: CDPTarget[] = await response.json();
  return targets;
}

function classifyTarget(target: CDPTarget): string {
  if (isMainAppTarget(target.url)) return "MAIN_APP";
  if (isEmbeddedBrowserTarget(target.url)) return "EMBEDDED_BROWSER";
  return "UNKNOWN";
}

async function main(): Promise<void> {
  console.log("=== CDP Target Discovery Spike ===");
  console.log(`Port: ${CDP_PORT}`);
  console.log(`Host: ${CDP_HOST}`);

  try {
    const targets = await discoverTargets();

    console.log(`Found ${targets.length} target(s):\n`);
    console.log("─".repeat(80));

    for (const target of targets) {
      const classification = classifyTarget(target);
      const marker =
        classification === "EMBEDDED_BROWSER"
          ? "★ "
          : classification === "MAIN_APP"
            ? "  "
            : "? ";

      console.log(`${marker}[${classification}]`);
      console.log(`  ID:    ${target.id}`);
      console.log(`  Type:  ${target.type}`);
      console.log(`  Title: "${target.title}"`);
      console.log(`  URL:   ${target.url}`);
      console.log(`  WS:    ${target.webSocketDebuggerUrl}`);
      console.log("─".repeat(80));
    }

    // Summary
    const embedded = targets.filter((t) => isEmbeddedBrowserTarget(t.url));
    const mainApp = targets.filter((t) => isMainAppTarget(t.url));
    const unknown = targets.filter(
      (t) => !isEmbeddedBrowserTarget(t.url) && !isMainAppTarget(t.url)
    );

    console.log("\n=== Summary ===");
    console.log(`Main app targets:       ${mainApp.length}`);
    console.log(`Embedded browser targets: ${embedded.length}`);
    console.log(`Unknown targets:        ${unknown.length}`);

    if (embedded.length > 0) {
      console.log("\n✅ FEASIBLE: Embedded browser target found via CDP.");
      console.log("   Target identification strategy: Filter by URL pattern.");
      console.log("   Main app URLs match: tauri://localhost or https://tauri.localhost");
      console.log("   Embedded browser: Any other non-blank URL (the grading site).");

      console.log("\n   Embedded browser WebSocket URLs for Playwright connection:");
      for (const t of embedded) {
        console.log(`     ${t.webSocketDebuggerUrl}`);
      }
    } else if (targets.length > 0) {
      console.log(
        "\n⚠️  WARNING: CDP targets found, but no embedded browser detected."
      );
      console.log(
        "   Make sure you've navigated to a grading page in the embedded browser."
      );
    } else {
      console.log("\n❌ FAILURE: No CDP targets found at all.");
      console.log("   Feature 3 (agent mode) should be descoped.");
    }
  } catch (error) {
    if (error instanceof TypeError && String(error).includes("fetch")) {
      console.error(
        `\n❌ CONNECTION FAILED: Could not reach CDP endpoint at ${CDP_DISCOVERY_URL}`
      );
      console.error("   Possible causes:");
      console.error(
        "   1. App not running with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222"
      );
      console.error(`   2. Port ${CDP_PORT} is not open or blocked by firewall`);
      console.error(
        "   3. WebView2 runtime hasn't started yet (app still loading)"
      );
    } else {
      console.error("\n❌ ERROR:", error);
    }
    process.exit(1);
  }
}

main();
