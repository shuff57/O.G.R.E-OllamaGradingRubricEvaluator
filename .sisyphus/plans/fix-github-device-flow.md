# Fix GitHub Device Flow CORS Error

## TL;DR

> **Quick Summary**: The GitHub OAuth device flow on the Model Providers settings page fails with "Failed to fetch" because it uses raw `fetch()` from the Electron renderer, which is blocked by CORS. The fix is swapping two `fetch()` calls to `mainFetch()`, which routes through the Electron main process via IPC — a pattern already used by the Anthropic OAuth flow in the same file.
> 
> **Deliverables**:
> - `oauth.ts` patched: both GitHub device flow fetch calls routed through `mainFetch()`
> - Manual QA verification that sign-in completes successfully
> 
> **Estimated Effort**: Quick (2-line mechanical change + verification)
> **Parallel Execution**: NO — single task, sequential
> **Critical Path**: Task 1 (fix) → F1-F4 (verification) → user okay

---

## Context

### Original Request
User reported that on the Model Providers settings page, the "Sign in with GitHub" device flow is broken — clicking the button produces a "Failed to fetch" error.

### Interview Summary
**Key Discussions**:
- **Root cause confirmed**: `startGitHubDeviceFlow()` in `oauth.ts` uses raw `fetch()` for both the device code request (line 85) and the token polling request (line 125). In packaged Electron builds, the renderer runs from `file://` or `app://` origins, and `github.com` rejects CORS preflight from those origins.
- **Existing pattern**: The same file already has `mainFetch()` (lines 8-30), which routes through `window.electronAPI.invoke('oauth:fetch', ...)` in the Electron main process using `net.fetch` — this bypasses CORS entirely. The Anthropic OAuth flow already uses `mainFetch()` correctly.
- **Ollama issue self-resolved**: User confirmed "ollama is no longer a problem" — no fix needed.
- **Test strategy**: User chose "No tests needed — just fix the bug, manually verify it works."

**Research Findings**:
- `mainFetch()` returns `{ ok, status, text(), json() }` — same interface as native `fetch` Response, so the swap is mechanical with no interface changes needed.
- `mainFetch()` gracefully falls back to regular `fetch()` when `electronAPI` isn't available, preserving dev/browser compatibility.
- GitHub flow body uses `JSON.stringify()` which produces `string` — compatible with `mainFetch`'s `body?: string` parameter.
- The IPC handler (`oauth:fetch` in `ipc-handlers.ts`) and preload bridge (`preload.ts`) are already wired and working — no backend changes needed.

### Metis Review
**Identified Gaps** (addressed):
- **openUrl reliability**: `window.open(url, '_blank')` may not reliably open external browser in sandboxed Electron. Classified as MINOR — out of scope for this bug fix since user hasn't reported this as broken.
- **Other provider flows**: OpenAI/ChatGPT and Google device flows also use raw `fetch()` with the same CORS vulnerability. Classified as OUT OF SCOPE — only fix what's reported broken.
- **Body type compatibility**: Confirmed `JSON.stringify()` returns `string`, which `mainFetch` accepts. No `.toString()` conversion needed (unlike `URLSearchParams`-based flows).

---

## Work Objectives

### Core Objective
Fix the "Failed to fetch" error in the GitHub device flow sign-in by routing both fetch calls through `mainFetch()`.

### Concrete Deliverables
- `ogre-desktop/src/lib/oauth.ts`: Two `fetch()` calls changed to `mainFetch()` (lines ~85 and ~125)

### Definition of Done
- [ ] GitHub device flow sign-in completes without "Failed to fetch" error
- [ ] Device code is successfully obtained from GitHub
- [ ] Token polling completes and token is stored
- [ ] User sees their GitHub models after sign-in

### Must Have
- Both fetch calls in `startGitHubDeviceFlow()` use `mainFetch()` instead of `fetch()`
- No other lines in `oauth.ts` are modified
- The fix preserves dev/browser fallback behavior (mainFetch already handles this)

### Must NOT Have (Guardrails)
- Do NOT modify `mainFetch()` itself — it already works correctly
- Do NOT modify `ipc-handlers.ts` or `preload.ts` — the IPC bridge is already wired
- Do NOT fix other provider flows (OpenAI, Google) — out of scope
- Do NOT modify `openUrl()` — out of scope
- Do NOT add, modify, or remove any test files
- Do NOT refactor, reorganize, or "improve" surrounding code
- Do NOT add comments explaining the change (the git commit message is sufficient)
- Do NOT modify any file other than `ogre-desktop/src/lib/oauth.ts`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None (user chose "just fix the bug, manually verify it works")
- **Framework**: N/A
- **QA only**: Agent-executed manual QA via embedded browser

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Desktop App UI**: Use embedded-browser skill (Electron CDP) — Navigate to settings, trigger sign-in, verify flow completes

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Single task — the fix):
└── Task 1: Swap fetch→mainFetch in GitHub device flow [quick]

Wave FINAL (After Task 1 — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1    | —         | F1-F4  |
| F1   | 1         | —      |
| F2   | 1         | —      |
| F3   | 1         | —      |
| F4   | 1         | —      |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `quick`
- **Wave FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Swap `fetch()` → `mainFetch()` in GitHub device flow

  **What to do**:
  - Open `ogre-desktop/src/lib/oauth.ts`
  - At line ~85: change `fetch(GITHUB_DEVICE_CODE_URL, {` to `mainFetch(GITHUB_DEVICE_CODE_URL, {`
  - At line ~125: change `fetch(GITHUB_ACCESS_TOKEN_URL, {` to `mainFetch(GITHUB_ACCESS_TOKEN_URL, {`
  - That's it. Two lines. No other changes.

  **Must NOT do**:
  - Do NOT modify `mainFetch()` itself
  - Do NOT modify any other file
  - Do NOT touch other provider flows (OpenAI, Google, Anthropic)
  - Do NOT add comments, refactor, or reorganize code
  - Do NOT modify or create test files
  - Do NOT change `openUrl()` behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: This is a 2-line mechanical change with zero design decisions. The pattern is already established in the same file.
  - **Skills**: [`embedded-browser`]
    - `embedded-browser`: Needed for QA verification — agent must launch the Electron app and test the sign-in flow via CDP
  - **Skills Evaluated but Omitted**:
    - `playwriter`: Not needed — this is a desktop Electron app, not a web page in Chrome
    - `systematic-debugging`: Not needed — root cause is already confirmed, no debugging required

  **Parallelization**:
  - **Can Run In Parallel**: NO (only task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/oauth.ts:8-30` — `mainFetch()` helper definition. Read this to understand the function signature: `mainFetch(url: string, options: { method, headers, body? })` returns `{ ok, status, text(), json() }`. Note it falls back to regular `fetch()` when `electronAPI` isn't available.
  - `ogre-desktop/src/lib/oauth.ts:180-220` — Anthropic OAuth flow. This already uses `mainFetch()` correctly. Copy this exact calling pattern for the GitHub flow.

  **Fix Target References** (exact lines to change):
  - `ogre-desktop/src/lib/oauth.ts:85` — First fix: `fetch(GITHUB_DEVICE_CODE_URL, {` in `startGitHubDeviceFlow()`. This is the initial device code request. Change `fetch` to `mainFetch`.
  - `ogre-desktop/src/lib/oauth.ts:125` — Second fix: `fetch(GITHUB_ACCESS_TOKEN_URL, {` in the polling loop inside `startGitHubDeviceFlow()`. This polls for the access token. Change `fetch` to `mainFetch`.

  **Infrastructure References** (already working, do NOT modify):
  - `ogre-desktop/electron-main/ipc-handlers.ts` — Contains the `oauth:fetch` IPC handler that uses Electron's `net.fetch`. Already wired and working. DO NOT TOUCH.
  - `ogre-desktop/electron-main/preload.ts` — Exposes `electronAPI.invoke()` to the renderer. Already wired. DO NOT TOUCH.

  **WHY Each Reference Matters**:
  - `mainFetch` definition (lines 8-30): Executor must verify the function signature accepts the same args as the current `fetch()` calls — it does, since both use `{ method, headers, body: JSON.stringify(...) }` which maps to `mainFetch`'s `{ method, headers, body?: string }`.
  - Anthropic flow (lines 180-220): This is the **proven pattern** — same file, same approach, already working in production. Copy this pattern, don't invent a new one.
  - Fix targets (lines 85 and 125): These are the **exact locations** of the bug. Line numbers may shift slightly — search for `fetch(GITHUB_DEVICE_CODE_URL` and `fetch(GITHUB_ACCESS_TOKEN_URL` if line numbers don't match.

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY**

  - [ ] `oauth.ts` line ~85: `mainFetch(GITHUB_DEVICE_CODE_URL, {` (was `fetch(`)
  - [ ] `oauth.ts` line ~125: `mainFetch(GITHUB_ACCESS_TOKEN_URL, {` (was `fetch(`)
  - [ ] `npm run build` in `ogre-desktop/` succeeds with no errors
  - [ ] `git diff --name-only` shows only `ogre-desktop/src/lib/oauth.ts`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GitHub device flow sign-in initiates successfully (happy path)
    Tool: embedded-browser (Electron CDP via embedded-browser skill)
    Preconditions: OGRE desktop app is running; user is NOT signed in to GitHub provider
    Steps:
      1. Navigate to Settings page → Model Providers section
      2. Find the GitHub Models provider card
      3. Click the "Sign in" / "Connect" button for GitHub Models
      4. Wait up to 10s for the device code dialog/modal to appear
      5. Assert: A user code is displayed (8-character alphanumeric, e.g., "ABCD-1234")
      6. Assert: The verification URL "https://github.com/login/device" is shown or opened
      7. Assert: No "Failed to fetch" error appears anywhere on the page
    Expected Result: Device code dialog appears with a valid user code and verification URL. No CORS errors.
    Failure Indicators: "Failed to fetch" error, empty/missing device code, JavaScript console errors mentioning CORS or network
    Evidence: .sisyphus/evidence/task-1-github-device-flow-happy.png

  Scenario: Error handling when GitHub API is unreachable (negative path)
    Tool: embedded-browser (Electron CDP via embedded-browser skill)
    Preconditions: OGRE desktop app is running; network is available but simulate error by temporarily checking error UI
    Steps:
      1. Navigate to Settings page → Model Providers section
      2. Open browser DevTools console via CDP
      3. Verify no unhandled promise rejections or CORS errors in console after page load
      4. Check that the GitHub provider card renders without errors before any sign-in attempt
    Expected Result: Page loads cleanly, no CORS errors in console, provider card renders correctly
    Failure Indicators: Console shows CORS-related errors, unhandled rejections, or fetch failures on page load
    Evidence: .sisyphus/evidence/task-1-github-device-flow-console-clean.png
  ```

  **Evidence to Capture:**
  - [ ] `task-1-github-device-flow-happy.png` — Screenshot of device code dialog
  - [ ] `task-1-github-device-flow-console-clean.png` — Screenshot of clean console (no CORS errors)

  **Commit**: YES
  - Message: `fix(oauth): route GitHub device flow through main process to bypass CORS`
  - Files: `ogre-desktop/src/lib/oauth.ts`
  - Pre-commit: `npm run build` in `ogre-desktop/`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read `oauth.ts`, confirm both `mainFetch` calls). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if any other file was modified. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run build` in `ogre-desktop/`. Review the diff in `oauth.ts` for: accidental deletions, whitespace damage, import changes, type errors. Verify `mainFetch` call signatures match the existing pattern (compare with Anthropic flow usage). Confirm no `as any` or `@ts-ignore` was added.
  Output: `Build [PASS/FAIL] | Diff Clean [YES/NO] | Signature Match [YES/NO] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `embedded-browser` skill)
  Start the app. Navigate to Settings → Model Providers. Click "Sign in with GitHub". Verify: device code screen appears (not "Failed to fetch"), user code is displayed, verification URL opens. If possible, complete the flow and verify token is stored and models load. Save screenshots to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Run `git diff` on the working tree. Verify ONLY `ogre-desktop/src/lib/oauth.ts` was modified. Verify exactly 2 lines changed (fetch→mainFetch). Verify no other files were touched. Flag any unaccounted changes.
  Output: `Tasks [N/N compliant] | Files Modified [1 expected] | Lines Changed [2 expected] | VERDICT`

---

## Commit Strategy

- **Task 1**: `fix(oauth): route GitHub device flow through main process to bypass CORS` — `ogre-desktop/src/lib/oauth.ts`
  - Pre-commit: `npm run build` in `ogre-desktop/`

---

## Success Criteria

### Verification Commands
```bash
# Build succeeds
cd ogre-desktop && npm run build  # Expected: no errors

# Only oauth.ts was modified
git diff --name-only  # Expected: ogre-desktop/src/lib/oauth.ts

# Exactly 2 fetch→mainFetch swaps
git diff ogre-desktop/src/lib/oauth.ts | grep "^[+-]" | grep -c "Fetch"  # Expected: 4 (2 removed, 2 added)
```

### Final Checklist
- [ ] Both GitHub device flow fetch calls use `mainFetch()`
- [ ] No other files modified
- [ ] Build passes
- [ ] Sign-in flow works (no "Failed to fetch")
- [ ] All "Must NOT Have" guardrails respected
