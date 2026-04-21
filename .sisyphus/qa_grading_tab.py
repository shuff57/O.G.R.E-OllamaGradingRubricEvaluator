"""
QA script for O.G.R.E grading tab single/batch mode UI changes.

Strategy to bypass Setup Wizard:
  - Inject a fake window.electronAPI mock via addInitScript before page load
  - This makes getSetting('setup_complete') return 'true' immediately
  - App skips wizard and goes directly to dashboard
  - Then click "Grade Now" nav button to reach Browser page / GradingPanel
"""

import sys
import io
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

EVIDENCE_DIR = Path(
    r"C:\Users\shuff57\Documents\GitHub\O.G.R.E-OllamaGradingRubricEvaluator\.sisyphus\evidence"
)
APP_URL = "http://localhost:5173"

results = {}


def log(msg):
    print(msg, flush=True)


# Inject script: mock window.electronAPI so all DB calls succeed
# getSetting('setup_complete') must return 'true' to skip wizard
# All other calls return safe defaults
MOCK_ELECTRON_API = """
(function() {
  const DB = {
    settings: { setup_complete: 'true' },
    providers: [],
  };

  window.electronAPI = {
    // DB bridge — called by lib/db.ts
    dbQuery: async function(sql, params) {
      // SELECT for getSetting
      if (sql && sql.toLowerCase().includes('app_settings')) {
        const key = params && params[0];
        const val = DB.settings[key] ?? null;
        return val !== null ? [{ key: key, value: val }] : [];
      }
      // SELECT for provider configs
      if (sql && sql.toLowerCase().includes('provider_configs')) {
        return DB.providers;
      }
      // SELECT for grading_sessions
      if (sql && sql.toLowerCase().includes('grading_sessions')) {
        return [];
      }
      // SELECT for site_profiles
      if (sql && sql.toLowerCase().includes('site_profiles')) {
        return [];
      }
      // SELECT for rubrics
      if (sql && sql.toLowerCase().includes('rubrics')) {
        return [];
      }
      return [];
    },
    dbExecute: async function(sql, params) {
      return { rowsAffected: 1, lastInsertId: 1 };
    },
    // IPC handlers expected by various modules
    invoke: async function(channel, ...args) {
      if (channel === 'grading-server:status') return 'running';
      if (channel === 'get-server-port') return 3001;
      if (channel === 'browser:get-tabs') return [];
      if (channel === 'browser:get-active-tab') return null;
      if (channel === 'get-platform') return 'win32';
      if (channel === 'check-updates') return { available: false };
      if (channel === 'skills:load-all') return [];
      if (channel === 'skills:sync') return [];
      if (channel === 'get-grading-server-url') return 'http://localhost:3001';
      return null;
    },
    on: function(channel, callback) { return function() {}; },
    off: function(channel, callback) {},
    // Grading server listener stubs
    onSessionComplete: function(cb) { return function() {}; },
    onProviderChanged: function(cb) { return function() {}; },
    onServerStatus: function(cb) {
      // Fire 'running' once so pushOnStartup gets called (fire and forget)
      setTimeout(function() { try { cb('running'); } catch(e) {} }, 100);
      return function() {};
    },
    onUpdateAvailable: function(cb) { return function() {}; },
    // Browser/webview stubs
    'browser:hide': async function() {},
    'browser:show': async function() {},
    'browser:hide-all': async function() {},
    'browser:show-all': async function() {},
    'browser:navigate': async function() {},
    'browser:get-tabs': async function() { return []; },
    'browser:get-active-tab': async function() { return null; },
    'browser:close-tab': async function() {},
    'browser:create-tab': async function() { return null; },
    'browser:set-bounds': async function() {},
    // Skills API stubs
    'skills:load-all': async function() { return []; },
    'skills:sync': async function() { return []; },
    // Version info
    'get-app-version': async function() { return '0.0.0-test'; },
    // Stub for anything else
    sendSync: function() { return null; },
  };
  console.log('[QA-MOCK] window.electronAPI injected successfully');
})();
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1400, "height": 900})

    # Inject the mock BEFORE any page script runs
    context.add_init_script(MOCK_ELECTRON_API)

    page = context.new_page()

    # Capture console for debugging
    page.on(
        "console",
        lambda msg: (
            log(f"  [BROWSER-CONSOLE] {msg.type}: {msg.text}")
            if "error" in msg.type.lower() or "QA-MOCK" in msg.text
            else None
        ),
    )

    # ── Navigate and wait for app to load ──
    log("=== App Load: navigating to dev server ===")
    try:
        page.goto(APP_URL, wait_until="domcontentloaded", timeout=30000)
        # Wait for Svelte to mount and the app to finish loading
        # setupComplete=true means wizard is skipped → dashboard renders
        page.wait_for_timeout(2000)

        # Take a diagnostic screenshot to see what loaded
        page.screenshot(path=str(EVIDENCE_DIR / "00-app-load.png"), full_page=False)
        log("  [SCREENSHOT] 00-app-load.png (diagnostic)")

        # Check if wizard is still showing
        wizard_visible = page.locator(".wizard-container").count() > 0
        loading_visible = page.locator(".loading-screen").count() > 0
        log(f"  wizard-container visible: {wizard_visible}")
        log(f"  loading-screen visible: {loading_visible}")

        if wizard_visible:
            log("  [INFO] Wizard still showing — walking through wizard steps")

            # Step 1: Welcome — click "Get Started"
            get_started = page.locator("button.btn-primary", has_text="Get Started")
            get_started.wait_for(state="visible", timeout=5000)
            get_started.click()
            page.wait_for_timeout(500)
            log("  [WIZARD] Clicked 'Get Started' (Step 1 → 2)")

            # Step 2: Provider Selection — enable Ollama (pre-filled URL) and click Next
            # Find the Ollama checkbox by label text
            ollama_checkbox = (
                page.locator(".checkbox-label")
                .filter(has_text="Ollama")
                .locator("input[type=checkbox]")
                .first
            )
            if ollama_checkbox.count() > 0 and not ollama_checkbox.is_checked():
                ollama_checkbox.click()
                page.wait_for_timeout(300)
                log("  [WIZARD] Enabled Ollama provider")

            next_btn = page.locator("button.btn-primary", has_text="Next")
            next_btn.click()
            page.wait_for_timeout(500)
            log("  [WIZARD] Clicked 'Next' (Step 2 → 3)")

            # Check for validation error
            err_msg = page.locator(".error-message")
            if err_msg.count() > 0 and err_msg.is_visible():
                log(f"  [WIZARD-WARNING] Validation error: {err_msg.text_content()}")
                # Try skipping validation by going directly — or fall back to js injection
                # Inject setupComplete via direct evaluate
                log("  [WIZARD] Falling back to JS state injection")
                page.evaluate("""
                  document.dispatchEvent(new CustomEvent('ogre:force-setup-complete'));
                """)
                page.wait_for_timeout(500)

            # Step 3: Model Config — just click Next
            next_btns = page.locator("button.btn-primary")
            for i in range(next_btns.count()):
                btn = next_btns.nth(i)
                if btn.is_visible() and btn.text_content().strip() in (
                    "Next",
                    "Save & Start",
                ):
                    btn.click()
                    page.wait_for_timeout(500)
                    log(f"  [WIZARD] Clicked '{btn.text_content().strip()}'")
                    break

            # Step 4: Confirmation — click "Save & Start"
            save_btn = page.locator("button.btn-primary", has_text="Save & Start")
            if save_btn.count() > 0 and save_btn.is_visible():
                save_btn.click()
                page.wait_for_timeout(1000)
                log("  [WIZARD] Clicked 'Save & Start'")

            page.wait_for_timeout(1500)
            page.screenshot(
                path=str(EVIDENCE_DIR / "01-after-wizard.png"), full_page=False
            )
            log("  [SCREENSHOT] 01-after-wizard.png (post-wizard state)")

        elif loading_visible:
            log("  [INFO] Loading screen visible — waiting for it to clear")
            page.wait_for_selector(".loading-screen", state="hidden", timeout=10000)
            page.wait_for_timeout(1000)

        # ── Navigate to "Grade Now" (Browser page with GradingPanel) ──
        log("\n=== Navigating to 'Grade Now' page ===")
        # Look for the Grade Now nav button in sidebar
        grade_now_btn = page.locator("nav button", has_text="Grade Now")
        if grade_now_btn.count() == 0:
            # Maybe sidebar is collapsed — try icon-only button (title="Grade Now")
            grade_now_btn = page.locator("nav button[title='Grade Now']")

        if grade_now_btn.count() > 0:
            grade_now_btn.first.click()
            page.wait_for_timeout(1500)
            log("  [OK] Clicked 'Grade Now' nav button")
        else:
            log(
                "  [WARN] 'Grade Now' button not found — may already be on browser page or need different approach"
            )

        page.screenshot(path=str(EVIDENCE_DIR / "02-browser-page.png"), full_page=False)
        log("  [SCREENSHOT] 02-browser-page.png (browser/grading page)")

        # ── Open the GradingPanel drawer ──
        log("\n=== Opening GradingPanel drawer ===")
        toggle_drawer_btn = page.locator("button[title='Toggle Grading Panel']")
        if toggle_drawer_btn.count() > 0:
            toggle_drawer_btn.first.click()
            page.wait_for_timeout(1000)
            log("  [OK] Clicked 'Toggle Grading Panel' button")
        else:
            log(
                "  [WARN] 'Toggle Grading Panel' button not found — GradingPanel may not render"
            )

        page.screenshot(
            path=str(EVIDENCE_DIR / "03-grading-panel.png"), full_page=False
        )
        log("  [SCREENSHOT] 03-grading-panel.png (with GradingPanel open)")

        # Check GradingPanel toggle is visible
        toggle_present = page.locator("label.single-mode-toggle").count()
        log(f"  label.single-mode-toggle count: {toggle_present}")

    except Exception as e:
        log(f"  [ERROR] App load/navigation failed: {e}")
        try:
            page.screenshot(path=str(EVIDENCE_DIR / "00-load-ERROR.png"))
        except:
            pass

    # ════════════════════════════════════════════════════
    # Scenario 1: batch-default
    # ════════════════════════════════════════════════════
    log("\n=== Scenario 1: batch-default ===")
    try:
        sub_toggle_count = page.locator(".sub-mode-toggle").count()
        assert sub_toggle_count == 0, (
            f"FAIL: .sub-mode-toggle exists ({sub_toggle_count}) - expected 0"
        )
        log("  [OK] .sub-mode-toggle not present")

        toggle_label = page.locator("label.single-mode-toggle")
        assert toggle_label.count() > 0, "FAIL: label.single-mode-toggle not found"
        toggle_label.wait_for(state="visible", timeout=5000)
        log("  [OK] label.single-mode-toggle is visible")

        checkbox = page.locator("label.single-mode-toggle input[type=checkbox]")
        assert checkbox.count() > 0, (
            "FAIL: checkbox inside single-mode-toggle not found"
        )
        assert not checkbox.is_checked(), (
            "FAIL: checkbox should be unchecked by default"
        )
        log("  [OK] Single student mode checkbox exists and is unchecked")

        name_input = page.locator("input.student-name-input")
        is_visible = name_input.count() > 0 and name_input.is_visible()
        assert not is_visible, (
            "FAIL: student-name-input should NOT be visible in batch mode"
        )
        log("  [OK] student-name-input not visible (batch default)")

        panel_content = page.locator(".panel-content")
        assert panel_content.count() > 0, "FAIL: .panel-content not found"
        log("  [OK] panel-content (batch UI area) is present")

        page.screenshot(
            path=str(EVIDENCE_DIR / "task-1-batch-default.png"), full_page=False
        )
        log("  [SCREENSHOT] task-1-batch-default.png")
        results["Scenario 1: batch-default"] = "PASS"
    except AssertionError as e:
        log(f"  [FAIL] {e}")
        results["Scenario 1: batch-default"] = f"FAIL - {e}"
        try:
            page.screenshot(path=str(EVIDENCE_DIR / "task-1-batch-default-FAIL.png"))
        except:
            pass
    except Exception as e:
        log(f"  [ERROR] {e}")
        results["Scenario 1: batch-default"] = f"FAIL - {e}"
        try:
            page.screenshot(path=str(EVIDENCE_DIR / "task-1-batch-default-ERROR.png"))
        except:
            pass

    # ════════════════════════════════════════════════════
    # Scenario 2: single-mode-active
    # ════════════════════════════════════════════════════
    log("\n=== Scenario 2: single-mode-active ===")
    try:
        checkbox = page.locator("label.single-mode-toggle input[type=checkbox]")
        checkbox.click()
        page.wait_for_timeout(500)

        name_input = page.locator("input.student-name-input")
        name_input.wait_for(state="visible", timeout=5000)
        log("  [OK] student-name-input is now visible")

        name_input.fill("Alice Johnson")
        page.wait_for_timeout(200)

        val = name_input.input_value()
        assert val == "Alice Johnson", (
            f"FAIL: input value is '{val}', expected 'Alice Johnson'"
        )
        log(f"  [OK] student name input value = '{val}'")

        page.screenshot(
            path=str(EVIDENCE_DIR / "task-1-single-mode-active.png"), full_page=False
        )
        log("  [SCREENSHOT] task-1-single-mode-active.png")
        results["Scenario 2: single-mode-active"] = "PASS"
    except AssertionError as e:
        log(f"  [FAIL] {e}")
        results["Scenario 2: single-mode-active"] = f"FAIL - {e}"
        try:
            page.screenshot(
                path=str(EVIDENCE_DIR / "task-1-single-mode-active-FAIL.png")
            )
        except:
            pass
    except Exception as e:
        log(f"  [ERROR] {e}")
        results["Scenario 2: single-mode-active"] = f"FAIL - {e}"
        try:
            page.screenshot(
                path=str(EVIDENCE_DIR / "task-1-single-mode-active-ERROR.png")
            )
        except:
            pass

    # ════════════════════════════════════════════════════
    # Scenario 3: single-mode-off
    # ════════════════════════════════════════════════════
    log("\n=== Scenario 3: single-mode-off ===")
    try:
        checkbox = page.locator("label.single-mode-toggle input[type=checkbox]")
        assert checkbox.is_checked(), (
            "FAIL: checkbox should be checked coming from Scenario 2"
        )
        checkbox.click()
        page.wait_for_timeout(500)

        name_input = page.locator("input.student-name-input")
        visible = name_input.count() > 0 and name_input.is_visible()
        assert not visible, (
            "FAIL: student-name-input should NOT be visible after unchecking"
        )
        log("  [OK] student-name-input no longer visible")

        panel_content = page.locator(".panel-content")
        assert panel_content.count() > 0, "FAIL: .panel-content not found"
        log("  [OK] batch UI (panel-content) is shown again")

        page.screenshot(
            path=str(EVIDENCE_DIR / "task-1-single-mode-off.png"), full_page=False
        )
        log("  [SCREENSHOT] task-1-single-mode-off.png")
        results["Scenario 3: single-mode-off"] = "PASS"
    except AssertionError as e:
        log(f"  [FAIL] {e}")
        results["Scenario 3: single-mode-off"] = f"FAIL - {e}"
        try:
            page.screenshot(path=str(EVIDENCE_DIR / "task-1-single-mode-off-FAIL.png"))
        except:
            pass
    except Exception as e:
        log(f"  [ERROR] {e}")
        results["Scenario 3: single-mode-off"] = f"FAIL - {e}"
        try:
            page.screenshot(path=str(EVIDENCE_DIR / "task-1-single-mode-off-ERROR.png"))
        except:
            pass

    browser.close()

# ════════════════════════════════════════════════════
# Scenario 4: source verification — {#if studentName} above <ResponseRenderer>
# ════════════════════════════════════════════════════
log("\n=== Scenario 4: name-label-in-result source verification ===")
src_file = Path(
    r"C:\Users\shuff57\Documents\GitHub\O.G.R.E-OllamaGradingRubricEvaluator\ogre-desktop\src\components\grading\StudentWorkCard.svelte"
)

evidence_text = []
try:
    content = src_file.read_text(encoding="utf-8")
    file_lines = content.splitlines()

    if_idxs = [i for i, l in enumerate(file_lines) if "{#if studentName}" in l]
    rr_idxs = [i for i, l in enumerate(file_lines) if "<ResponseRenderer" in l]

    log(f"  studentName if-block lines: {[i + 1 for i in if_idxs]}")
    log(f"  ResponseRenderer lines: {[i + 1 for i in rr_idxs]}")

    for i in if_idxs:
        evidence_text.append(f"Line {i + 1}: {file_lines[i]}")
    for i in rr_idxs:
        evidence_text.append(f"Line {i + 1}: {file_lines[i]}")

    found_pair = any(rr_idx > if_idx for if_idx in if_idxs for rr_idx in rr_idxs)

    if if_idxs and found_pair:
        log("  [OK] {#if studentName} found above <ResponseRenderer>")
        results["Scenario 4: name-label-in-result"] = "PASS"
    elif if_idxs:
        log("  [FAIL] {#if studentName} found but ResponseRenderer not after it")
        results["Scenario 4: name-label-in-result"] = (
            "FAIL - ResponseRenderer not after {#if studentName}"
        )
    else:
        log("  [FAIL] {#if studentName} block NOT found")
        results["Scenario 4: name-label-in-result"] = (
            "FAIL - {#if studentName} block missing"
        )
except Exception as e:
    log(f"  [ERROR] {e}")
    results["Scenario 4: name-label-in-result"] = f"FAIL - {e}"

# ════════════════════════════════════════════════════
# Scenario 5: prompt-embed — lines 94-96 construct workWithName
# ════════════════════════════════════════════════════
log("\n=== Scenario 5: prompt-embed verification (lines 94-96) ===")
try:
    file_lines = src_file.read_text(encoding="utf-8").splitlines()
    snippet = file_lines[93:96]
    evidence_text.append("\n--- Scenario 5: Lines 94-96 ---")
    for i, l in enumerate(snippet):
        evidence_text.append(f"Line {94 + i}: {l}")
        log(f"  Line {94 + i}: {l}")

    combined = " ".join(snippet)
    if "workWithName" in combined and "studentName" in combined:
        log("  [OK] workWithName constructed with studentName on lines 94-96")
        results["Scenario 5: prompt-embed"] = "PASS"
    else:
        log("  [FAIL] workWithName or studentName NOT found on lines 94-96")
        results["Scenario 5: prompt-embed"] = (
            "FAIL - workWithName/studentName not on expected lines"
        )
except Exception as e:
    log(f"  [ERROR] {e}")
    results["Scenario 5: prompt-embed"] = f"FAIL - {e}"

evidence_file = EVIDENCE_DIR / "task-2-prompt-embed.txt"
with open(evidence_file, "w", encoding="utf-8") as f:
    f.write("=== Scenario 4 & 5: Source Code Evidence ===\n\n")
    f.write(f"File: {src_file}\n\n")
    for line in evidence_text:
        f.write(line + "\n")
log(f"\n[TEXT EVIDENCE] task-2-prompt-embed.txt saved")

# ════════════════════════════════════════════════════
# Final Report
# ════════════════════════════════════════════════════
log("\n" + "=" * 60)
log("FINAL RESULTS")
log("=" * 60)
pass_count = 0
total = len(results)
for name, verdict in results.items():
    status = "PASS" if verdict == "PASS" else "FAIL"
    if status == "PASS":
        pass_count += 1
    log(f"{name} --- {verdict}")

log(f"\nScenarios [{pass_count}/{total} pass]")
overall = "APPROVE" if pass_count == total else "REJECT"
log(f"VERDICT: {overall}")

import sys as _sys

_sys.exit(0 if pass_count == total else 1)
