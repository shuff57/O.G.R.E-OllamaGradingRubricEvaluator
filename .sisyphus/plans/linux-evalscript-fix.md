# Fix evalScript on Linux — wry Callback-Based Script Evaluation

## TL;DR

> **Quick Summary**: The O.G.R.E desktop app's `evalScript()` function throws "Cannot evaluate script: CDP not connected" on Linux because the CDP enablement mechanism (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`) is Windows-only. Fix by implementing a Rust Tauri command that uses wry's `evaluate_script_with_callback()` on Linux, then updating the TypeScript `evalScript()` to fall back to this command when CDP is unavailable.
> 
> **Deliverables**:
> - Rust `eval_webview_script` on Linux returns actual values (not fire-and-forget)
> - TypeScript `evalScript()` auto-falls back to Tauri IPC when CDP unavailable
> - All 189 call sites across 22 files work on Linux through the fixed choke point
> - Page discovery, batch grading, screenshots, element picker all functional on Linux
> 
> **Estimated Effort**: Medium (3 waves, ~8 tasks)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7 → Task 8

---

## Context

### Original Request
User reported "Cannot evaluate script: CDP not connected" when clicking "Discover Page" in the O.G.R.E desktop app running on Linux (Pop!_OS 24.04).

### Interview Summary
**Key Discussions**:
- Root cause: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` env var (lib.rs:1294) is Windows-only; WebKitGTK ignores it
- Linux `eval_webview_script` Rust command (lib.rs:963) is fire-and-forget, always returns `"null"`
- 189 call sites across 22 files all funnel through `evalScript()`/`evalScriptJSON()` in browser.ts
- Linux is a first-class platform, not just dev-only
- TDD approach confirmed

**Research Findings**:
- wry 0.54.1 supports `evaluate_script_with_callback()` on Linux/WebKitGTK — returns JSON-serialized values
- WebKitGTK does NOT support Chrome DevTools Protocol — cannot reuse CDP client
- Tauri v2 does not expose callback eval — must use raw wry handle via thread-local `LINUX_WEBVIEWS`
- wry silently drops callbacks if called before `LoadEvent::Committed` (pending-scripts queue)
- Screenshots: `Page.captureScreenshot` not available on WebKit — use existing html2canvas fallback

### Metis Review
**Identified Gaps** (addressed in plan):
- `with_webview()` is wrong approach — must use `LINUX_WEBVIEWS` thread-local directly (already used in existing Linux code)
- Exception swallowing requires try-catch envelope in JS wrapper — wry callback doesn't surface JS errors
- CDP failure must be cached — or every `evalScript` call eats a 3-second HTTP timeout
- `Fn` callback bound needs `Mutex<Option<Sender>>` pattern — oneshot sender is `FnOnce`
- Promise await must be in the JS wrapper — wry doesn't do it automatically
- `_activeTabId` must be passed — the fallback needs explicit tab routing

---

## Work Objectives

### Core Objective
Make `evalScript()` and `evalScriptJSON()` return actual JavaScript evaluation results on Linux, unblocking all 189 downstream call sites including page discovery, batch grading, screenshots, and element interaction.

### Concrete Deliverables
- `ogre-desktop/src-tauri/src/lib.rs`: Linux `eval_webview_script` rewritten with callback-based return values
- `ogre-desktop/src/lib/browser.ts`: `evalScript()` falls back to Tauri IPC when CDP unavailable
- `ogre-desktop/src/lib/cdp-actions.ts`: `connectCDP()` caches failure to avoid repeated 3s timeouts
- All existing tests pass; new tests cover the Linux eval path

### Definition of Done
- [ ] `evalScript('document.title')` returns the actual page title on Linux
- [ ] `captureWebviewScreenshot()` returns a valid data URL on Linux
- [ ] "Discover Selectors" button completes successfully on Linux
- [ ] `vitest run` passes with zero failures

### Must Have
- Rust `eval_webview_script` on Linux uses wry callback to return actual values
- JS wrapper handles async/Promise results and catches exceptions
- `evalScript()` TypeScript function transparently falls back when CDP unavailable
- CDP connect failure is cached (no repeated 3s timeout per call)
- Page-load guard prevents callback-drop race condition

### Must NOT Have (Guardrails)
- Do NOT implement a WebKit Inspector Protocol translation layer
- Do NOT attempt CDP parity on Linux (different protocol, massive scope)
- Do NOT modify the Windows `eval_webview_script` — it works; leave it alone
- Do NOT change any of the 189 downstream call sites — fix only the choke point
- Do NOT add WebKitGTK remote debugging env vars (`WEBKIT_INSPECTOR_SERVER` etc.)
- Do NOT introduce new npm dependencies
- Do NOT touch the `cdp-client.ts` WebSocket client (Windows-only, works fine)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: TDD (RED-GREEN-REFACTOR)
- **Framework**: vitest
- **Each task follows**: RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Rust changes**: Use Bash — `cargo check`, `cargo clippy`, `cargo build`
- **TypeScript changes**: Use Bash — `npx vitest run`
- **Integration**: Use Bash — `npm run tauri:dev` then verify in running app

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — types + test infrastructure + CDP cache):
├── Task 1: RED — Write failing test for Linux eval_webview_script [quick]
├── Task 2: Cache CDP connection failure in connectCDP() [quick]
└── Task 3: GREEN — Implement Rust eval_webview_script with wry callback [deep]

Wave 2 (TypeScript integration — parallel after Wave 1):
├── Task 4: RED — Write failing test for evalScript IPC fallback [quick]
├── Task 5: GREEN — Implement evalScript Tauri IPC fallback in browser.ts [deep]
└── Task 6: Verify screenshot capture works via html2canvas fallback [quick]

Wave 3 (Verification — after Wave 2):
├── Task 7: Integration test — full discovery flow on Linux [deep]
└── Task 8: Run full test suite + cargo check [quick]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 3 → Task 5 → Task 7 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1    | —         | 3      |
| 2    | —         | 5      |
| 3    | 1         | 5, 7   |
| 4    | —         | 5      |
| 5    | 2, 3, 4   | 6, 7   |
| 6    | 5         | 7      |
| 7    | 5, 6      | 8      |
| 8    | 7         | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `deep`
- **Wave 2**: 3 tasks — T4 → `quick`, T5 → `deep`, T6 → `quick`
- **Wave 3**: 2 tasks — T7 → `deep`, T8 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo clippy` + `npx vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Run the desktop app with `npm run tauri:dev`. Navigate embedded browser to a grading page. Click "Discover Selectors". Verify the full discovery workflow completes without "CDP not connected" error. Test screenshot capture. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `fix(rust): implement callback-based eval_webview_script on Linux` — `src-tauri/src/lib.rs`
- **Wave 2**: `fix(browser): add Tauri IPC fallback for evalScript when CDP unavailable` — `src/lib/browser.ts`, `src/lib/cdp-actions.ts`
- **Wave 3**: `test(linux): add integration tests for Linux eval path` — test files

---

## Success Criteria

### Verification Commands
```bash
cargo check --manifest-path ogre-desktop/src-tauri/Cargo.toml  # Expected: success
cargo clippy --manifest-path ogre-desktop/src-tauri/Cargo.toml  # Expected: no warnings
cd ogre-desktop && npx vitest run  # Expected: all tests pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All vitest tests pass
- [ ] cargo check + clippy clean
- [ ] Discovery flow works on Linux without "CDP not connected" error
