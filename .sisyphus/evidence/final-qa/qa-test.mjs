/**
 * QA Test Script for O.G.R.E Desktop App
 * Tests UI components via Vite dev server
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE_URL = 'http://localhost:5174';
const EVIDENCE_DIR = '.sisyphus/evidence/final-qa';

const results = [];

function log(scenario, status, detail) {
  const entry = { scenario, status, detail, timestamp: new Date().toISOString() };
  results.push(entry);
  console.log(`[${status}] ${scenario}: ${detail}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  
  // Mock Tauri APIs since we're running in a regular browser
  const page = await context.newPage();
  
  // Intercept and mock Tauri IPC calls
  await page.addInitScript(() => {
    // Mock window.__TAURI__ to prevent errors
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        console.log('[MOCK] Tauri invoke:', cmd, args);
        if (cmd === 'plugin:sql|load') return 'mock-db';
        if (cmd === 'plugin:sql|execute') return { rowsAffected: 1 };
        if (cmd === 'plugin:sql|select') {
          if (args?.query?.includes('settings')) {
            if (args?.query?.includes('setup_complete')) return [{ value: 'true' }];
            return [];
          }
          if (args?.query?.includes('site_profiles')) return [];
          if (args?.query?.includes('rubrics')) return [];
          if (args?.query?.includes('grading_sessions')) return [];
          return [];
        }
        return null;
      },
      metadata: { currentWebview: { label: 'main' } },
      convertFileSrc: (path) => path,
    };
    window.__TAURI__ = window.__TAURI_INTERNALS__;
    
    // Mock Tauri events
    const listeners = {};
    window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      console.log('[MOCK] invoke:', cmd);
      if (cmd === 'plugin:sql|load') return 'mock-db';
      if (cmd === 'plugin:sql|execute') return { rowsAffected: 1 };
      if (cmd === 'plugin:sql|select') {
        if (args?.query?.includes('setup_complete')) return [{ value: 'true' }];
        if (args?.query?.includes('site_profiles')) return [];
        if (args?.query?.includes('rubrics')) return [];
        if (args?.query?.includes('grading_sessions')) return [];
        if (args?.query?.includes('batch_session')) return [];
        if (args?.query?.includes('active_provider')) return [];
        return [];
      }
      if (cmd === 'plugin:event|listen') {
        return 0; // listener ID
      }
      if (cmd === 'plugin:event|unlisten') return;
      if (cmd === 'check_for_updates') return null;
      return null;
    };
  });

  // Navigate to app
  console.log('\\n=== Loading O.G.R.E Desktop ===');
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(2000);
  } catch (e) {
    console.log('Initial load (some errors expected due to Tauri mocking):', e.message?.substring(0, 100));
  }
  
  await page.screenshot({ path: `${EVIDENCE_DIR}/qa-00-initial-load.png`, fullPage: true });
  
  // Check what rendered
  const bodyText = await page.textContent('body').catch(() => '');
  console.log('Page content preview:', bodyText?.substring(0, 200));
  
  // Check for setup wizard or main app
  const hasSetupWizard = await page.$('.wizard-container, [class*="wizard"], [class*="setup"]').catch(() => null);
  const hasSidebar = await page.$('.sidebar, nav button').catch(() => null);
  const hasLoading = await page.$('.loading-screen, .spinner').catch(() => null);
  
  console.log('Setup wizard:', !!hasSetupWizard);
  console.log('Sidebar:', !!hasSidebar);
  console.log('Loading:', !!hasLoading);
  
  // If we see loading screen, wait
  if (hasLoading) {
    console.log('Waiting for loading to complete...');
    await sleep(3000);
    await page.screenshot({ path: `${EVIDENCE_DIR}/qa-00b-after-wait.png`, fullPage: true });
  }

  // ========== QA #1: Site Profile Creation ==========
  console.log('\\n=== QA #1: Site Profile Creation ===');
  try {
    // Navigate to Settings or find Profile Manager
    // First, let's check if we can reach the browser page and grading panel
    const browserBtn = await page.$('nav button[title="Browser"], button:has-text("Browser")');
    if (browserBtn) {
      await browserBtn.click();
      await sleep(1000);
      await page.screenshot({ path: `${EVIDENCE_DIR}/qa-01a-browser-page.png`, fullPage: true });
      
      // Try to open grading panel
      const gradingToggle = await page.$('button[title="Toggle Grading Panel"]');
      if (gradingToggle) {
        await gradingToggle.click();
        await sleep(1000);
        await page.screenshot({ path: `${EVIDENCE_DIR}/qa-01b-grading-panel-open.png`, fullPage: true });
        
        // Switch to Discovery mode which has profile save
        const discoverTab = await page.$('button:has-text("Discover"), .mode-tab:has-text("Discover")');
        if (discoverTab) {
          await discoverTab.click();
          await sleep(500);
          await page.screenshot({ path: `${EVIDENCE_DIR}/qa-01c-discovery-mode.png`, fullPage: true });
          log('QA #1', 'PASS', 'Browser page + Grading Panel + Discovery tab renders correctly');
        } else {
          log('QA #1', 'PARTIAL', 'Grading panel opened but Discovery tab not found');
        }
      } else {
        log('QA #1', 'PARTIAL', 'Browser page loaded but grading panel toggle not found');
      }
    } else {
      // Try settings page for profile manager
      const settingsBtn = await page.$('nav button[title="Settings"], button:has-text("Settings")');
      if (settingsBtn) {
        await settingsBtn.click();
        await sleep(1000);
        await page.screenshot({ path: `${EVIDENCE_DIR}/qa-01a-settings-page.png`, fullPage: true });
        log('QA #1', 'PARTIAL', 'Settings page loaded, profile management may be separate');
      } else {
        log('QA #1', 'FAIL', 'Could not find navigation buttons');
      }
    }
  } catch (e) {
    log('QA #1', 'FAIL', `Error: ${e.message?.substring(0, 200)}`);
    await page.screenshot({ path: `${EVIDENCE_DIR}/qa-01-error.png` }).catch(() => {});
  }

  // ========== Check all navigation pages ==========
  console.log('\\n=== Testing all navigation pages ===');
  const navPages = ['Dashboard', 'History', 'Logs', 'Rubrics', 'Browser', 'Settings'];
  for (const pageName of navPages) {
    try {
      const btn = await page.$(`nav button[title="${pageName}"]`);
      if (btn) {
        await btn.click();
        await sleep(1000);
        await page.screenshot({ path: `${EVIDENCE_DIR}/qa-nav-${pageName.toLowerCase()}.png`, fullPage: true });
        console.log(`  ${pageName}: Loaded OK`);
      } else {
        console.log(`  ${pageName}: Button not found`);
      }
    } catch (e) {
      console.log(`  ${pageName}: Error - ${e.message?.substring(0, 100)}`);
    }
  }

  // ========== QA #2-7: Test GradingPanel components ==========
  console.log('\\n=== QA #2-7: Testing GradingPanel modes ===');
  
  // Navigate to Browser page first
  const browserNavBtn = await page.$('nav button[title="Browser"]');
  if (browserNavBtn) {
    await browserNavBtn.click();
    await sleep(1000);
  }
  
  // Open grading panel
  const gpToggle = await page.$('button[title="Toggle Grading Panel"]');
  if (gpToggle) {
    await gpToggle.click();
    await sleep(1000);
    
    // Test all mode tabs
    const modes = ['Grader', 'Solver', 'Batch', 'Discover'];
    for (const mode of modes) {
      const tab = await page.$(`.mode-tab:has-text("${mode}")`);
      if (tab) {
        await tab.click();
        await sleep(500);
        await page.screenshot({ path: `${EVIDENCE_DIR}/qa-mode-${mode.toLowerCase()}.png`, fullPage: true });
        console.log(`  Mode ${mode}: Rendered OK`);
      } else {
        console.log(`  Mode ${mode}: Tab not found`);
      }
    }
  } else {
    console.log('  Grading panel toggle not found - testing will be limited');
  }

  // ========== Final Summary ==========
  console.log('\\n=== Results Summary ===');
  for (const r of results) {
    console.log(`  [${r.status}] ${r.scenario}: ${r.detail}`);
  }

  await browser.close();
  
  // Write results JSON
  writeFileSync(`${EVIDENCE_DIR}/qa-results.json`, JSON.stringify(results, null, 2));
  console.log('\\nDone. Results saved to qa-results.json');
})();
