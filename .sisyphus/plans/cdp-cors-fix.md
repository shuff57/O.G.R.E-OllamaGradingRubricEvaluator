# Fix CDP CORS Blocking in Batch Grading Pipeline

## TL;DR

> **Quick Summary**: Proxy the CDP target discovery HTTP call through a Rust Tauri command to bypass CORS blocking that prevents the batch grading pipeline from connecting to the embedded WebView2 browser.
>
> **Deliverables**:
> - New `discover_cdp_target` Rust command in lib.rs
> - New `connectToUrl()` public method on CDPClient
> - Rewired `connectCDP()` flow in cdp-actions.ts
>
> **Estimated Effort**: Quick
> **Parallel Execution**: YES — 2 waves (T1→T2 sequential, T3 parallel with T1-T2, T4 after all)
> **Critical Path**: Cargo.toml → lib.rs → cdp-actions.ts

---

## Context

### Original Request
The batch grading pipeline (Turndown + CDP) fails because `CDPClient.connect()` at `cdp-client.ts:49` does a `fetch('http://127.0.0.1:{port}/json')` directly from the Svelte frontend (running at `localhost:5173` in dev, `tauri://localhost` in prod). Chrome DevTools Protocol's HTTP endpoint doesn't include CORS headers, so the browser blocks the request. Every subsequent call to `extractRubric`, `extractStudents`, and `extractPageContent` fails because CDP never connects.

### Interview Summary
**Key Discussions**:
- Root cause identified: only the HTTP discovery fetch to `/json` is CORS-blocked — WebSocket connections are NOT subject to CORS
- User confirmed Rust proxy command approach (over Vite proxy or tauri-plugin-http frontend)
- This follows the existing pattern (`get_cdp_port` command already exists)

**Research Findings**:
- `tauri_plugin_http::init()` is registered in Rust (lib.rs:811) but npm package not installed — irrelevant since Rust handles the fetch
- `reqwest 0.12.28` is already compiled transitively via `tauri-plugin-http` — zero additional compile time
- `cdp-client.ts` is intentionally framework-agnostic ("Zero npm dependencies") — must NOT add `invoke()` to it
- `cdp-actions.ts` is the Tauri-aware orchestration layer (already imports `invoke`) — correct place for the change

### Metis Review
**Identified Gaps** (addressed):
- `invoke()` must NOT go in cdp-client.ts — stays in cdp-actions.ts (guardrail G1)
- Need `connectToUrl()` public wrapper instead of modifying `connect()` — preserves fallback path
- 4 files, not 3 — Cargo.toml was missed in initial estimate
- Must set HTTP timeout on Rust reqwest client (no default timeout → could hang forever)
- Target filtering logic must be replicated with exact parity in Rust
- `CdpPortState.port` can be `None` — early exit case must be handled

---

## Work Objectives

### Core Objective
Route the CDP `/json` discovery HTTP call through a Rust Tauri command so it bypasses browser CORS restrictions, enabling the batch grading pipeline to connect to the embedded WebView2 browser.

### Concrete Deliverables
- `discover_cdp_target` async Tauri command in `src-tauri/src/lib.rs`
- `connectToUrl(wsUrl: string): Promise<boolean>` method on `CDPClient` in `cdp-client.ts`
- Updated `connectCDP()` flow in `cdp-actions.ts` using the new Rust command
- Updated test expectations in `cdp-actions.test.ts` (if they exist)

### Definition of Done
- [ ] `cargo build` succeeds with zero errors
- [ ] `npx vitest run` passes all tests
- [ ] Batch grading pipeline connects to CDP without CORS errors

### Must Have
- Rust command fetches `http://127.0.0.1:{port}/json` with 3-second timeout
- Target filtering in Rust matches TypeScript logic exactly (type=page, not blank, not main app URL)
- `cdp-client.ts` remains framework-agnostic (zero Tauri imports)
- Existing `cdp.connect(port)` method preserved unchanged
- `MAIN_APP_PATTERNS` in cdp-client.ts preserved unchanged

### Must NOT Have (Guardrails)
- DO NOT import `invoke` or any `@tauri-apps/api` in `cdp-client.ts`
- DO NOT remove or modify `CDPClient.connect(port)` or `MAIN_APP_PATTERNS`
- DO NOT touch any CDP action functions below `connectCDP`/`disconnectCDP`/`isConnected` in cdp-actions.ts
- DO NOT install any npm packages
- DO NOT modify `capabilities/default.json`
- DO NOT add Rust test files or test infrastructure
- DO NOT add retry logic to the Rust command
- DO NOT touch the CDP port allocation code in `lib.rs:636-658`
- DO NOT refactor CDPClient to support multiple targets

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after (update existing test expectations)
- **Framework**: vitest

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Rust build**: `cargo build` in src-tauri directory
- **TS tests**: `npx vitest run` in ogre-desktop directory

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — Rust + TS can run in parallel):
├── Task 1: Add reqwest to Cargo.toml + discover_cdp_target command [quick]
└── Task 2: Add connectToUrl() to CDPClient [quick]

Wave 2 (After Wave 1 — integration):
└── Task 3: Rewire connectCDP() + update tests + verify build [quick]
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 3 |
| 2 | — | 3 |
| 3 | 1, 2 | — |

> Tasks 1 and 2 are independent (Rust vs TypeScript). Task 3 integrates both.

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`, T2 → `quick` (parallel)
- **Wave 2**: T3 → `quick`

---

## TODOs

- [ ] 1. Add reqwest dependency and `discover_cdp_target` Rust command

  **What to do**:
  - Add `reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }` to `[dependencies]` in `src-tauri/Cargo.toml`
  - Add a new `#[tauri::command]` async function `discover_cdp_target` in `src-tauri/src/lib.rs`
  - The command reads the port from `CdpPortState` (follow `get_cdp_port` pattern at lib.rs:627-630)
  - If port is `None`, return `Ok(None)` immediately
  - Create a `reqwest::Client` with 3-second timeout
  - Fetch `http://127.0.0.1:{port}/json` and deserialize as `Vec<CdpTarget>`
  - Define a local `CdpTarget` struct with `#[derive(serde::Deserialize)]`: fields `id: String`, `r#type: String` (or `target_type`), `title: String`, `url: String`, `webSocketDebuggerUrl: Option<String>`
  - Filter targets with **exact parity** to TypeScript logic at cdp-client.ts:53-59:
    - `type == "page"`
    - `url != "about:blank"` and `url != ""`
    - URL does NOT start with `tauri://localhost`
    - URL does NOT start with `https://tauri.localhost`
    - URL does NOT match `http://localhost:1420` or `http://localhost:5173`
  - Return `Ok(Some(webSocketDebuggerUrl))` for first matching target, or `Ok(None)` if no match
  - Register `discover_cdp_target` in `generate_handler![]` at lib.rs:791 (after `get_cdp_port`)
  - Use `Result<Option<String>, String>` return type with `.map_err(|e| format!("..."))` error pattern

  **Must NOT do**:
  - DO NOT touch `get_cdp_port` or `CdpPortState` struct
  - DO NOT add retry logic
  - DO NOT touch the port allocation code (lib.rs:636-658)
  - DO NOT use `tauri_plugin_http::reqwest` — add reqwest directly to Cargo.toml

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file Rust changes with clear pattern to follow
  - **Skills**: []
    - No specialized skills needed — straightforward Rust/Tauri pattern

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src-tauri/src/lib.rs:627-630` — `get_cdp_port` command pattern (state access, return type, registration)
  - `ogre-desktop/src-tauri/src/lib.rs:42-44` — `CdpPortState` struct (state to read port from)
  - `ogre-desktop/src-tauri/src/lib.rs:791-809` — `generate_handler![]` list (where to register new command)
  - `ogre-desktop/src-tauri/src/lib.rs:636-658` — CDP port allocation (DO NOT MODIFY — context only)

  **API/Type References** (contracts to implement against):
  - `ogre-desktop/src/lib/cdp-client.ts:9-15` — `CDPTarget` interface showing the JSON shape from `/json` endpoint
  - `ogre-desktop/src/lib/cdp-client.ts:20-24` — `MAIN_APP_PATTERNS` — the filtering regexes to replicate in Rust

  **External References**:
  - reqwest docs: `https://docs.rs/reqwest/0.12/reqwest/` — Client builder with timeout

  **WHY Each Reference Matters**:
  - `get_cdp_port` is the exact pattern to copy for state access and error handling
  - `CDPTarget` interface shows the JSON field names to deserialize
  - `MAIN_APP_PATTERNS` defines the exact filtering rules — must match 1:1

  **Acceptance Criteria**:
  - [ ] `reqwest` added to Cargo.toml dependencies
  - [ ] `discover_cdp_target` function compiles (check with `cargo build`)
  - [ ] Command registered in `generate_handler![]`
  - [ ] Return type is `Result<Option<String>, String>`
  - [ ] HTTP timeout is 3 seconds

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rust build succeeds with new command
    Tool: Bash
    Preconditions: Cargo.toml has reqwest dependency added
    Steps:
      1. Run `cargo build` in ogre-desktop/src-tauri directory
      2. Check exit code is 0
      3. Grep output for "error" — should find none
    Expected Result: Build completes with "Finished" message, exit code 0
    Failure Indicators: Any "error[E" in output, non-zero exit code
    Evidence: .sisyphus/evidence/task-1-cargo-build.txt

  Scenario: Command is registered (grep verification)
    Tool: Bash (grep)
    Preconditions: lib.rs has been modified
    Steps:
      1. Search lib.rs for "discover_cdp_target" in generate_handler macro
      2. Search lib.rs for "async fn discover_cdp_target"
      3. Search lib.rs for "timeout" in the new function
    Expected Result: All three searches find matches
    Failure Indicators: Any search returns empty
    Evidence: .sisyphus/evidence/task-1-registration-check.txt
  ```

  **Commit**: YES (groups with all tasks)
  - Message: `fix(cdp): proxy CDP target discovery through Rust to bypass CORS`
  - Files: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`

---

- [ ] 2. Add `connectToUrl()` public method to CDPClient

  **What to do**:
  - Add a new public method `connectToUrl(wsUrl: string): Promise<boolean>` to the `CDPClient` class in `cdp-client.ts`
  - This method should: disconnect any existing connection (call `this.disconnect()`), then call the existing private `openWebSocket(url)` method, then if successful enable `Page.enable` via `this.send('Page.enable')`
  - Place it immediately after the existing `connect(port)` method (after line 66)
  - Method must follow the same never-throws pattern: wrap in try/catch, return false on any error

  **Must NOT do**:
  - DO NOT modify the existing `connect(port)` method
  - DO NOT modify `MAIN_APP_PATTERNS`
  - DO NOT add any imports (especially not `invoke` or `@tauri-apps/api`)
  - DO NOT change the `openWebSocket` method visibility (it stays private, called internally)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single method addition to existing class, ~15 lines
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/cdp-client.ts:44-66` — `connect(port)` method — follow its error handling pattern (try/catch, return false)
  - `ogre-desktop/src/lib/cdp-client.ts:133-145` — `openWebSocket(url)` private method — the method to call internally

  **WHY Each Reference Matters**:
  - `connect()` shows the exact error handling contract (never throws, returns boolean)
  - `openWebSocket()` is the existing private method that handles WebSocket setup — reuse it

  **Acceptance Criteria**:
  - [ ] `connectToUrl(wsUrl: string): Promise<boolean>` method exists on CDPClient
  - [ ] Method disconnects existing connection before connecting
  - [ ] Method calls `openWebSocket(wsUrl)` internally
  - [ ] Method enables `Page.enable` after successful WebSocket connection
  - [ ] Method never throws (wraps in try/catch, returns false on error)
  - [ ] No new imports added to cdp-client.ts

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: cdp-client.ts has no Tauri imports
    Tool: Bash (grep)
    Preconditions: cdp-client.ts has been modified
    Steps:
      1. Search cdp-client.ts for "@tauri-apps" — should find zero matches
      2. Search cdp-client.ts for "invoke" — should find zero matches
      3. Search cdp-client.ts for "connectToUrl" — should find the new method
    Expected Result: No Tauri imports found, connectToUrl method present
    Failure Indicators: Any Tauri import found in the file
    Evidence: .sisyphus/evidence/task-2-import-check.txt

  Scenario: connect(port) method is unchanged
    Tool: Bash (grep)
    Preconditions: cdp-client.ts modified
    Steps:
      1. Verify `async connect(port: number = 9222): Promise<boolean>` still exists
      2. Verify `MAIN_APP_PATTERNS` array still exists with same patterns
      3. Verify the fetch call `fetch(\`http://127.0.0.1:` still exists in connect()
    Expected Result: All original code preserved alongside new method
    Failure Indicators: Any of the original signatures missing
    Evidence: .sisyphus/evidence/task-2-preservation-check.txt
  ```

  **Commit**: YES (groups with all tasks)
  - Message: `fix(cdp): proxy CDP target discovery through Rust to bypass CORS`
  - Files: `src/lib/cdp-client.ts`

---

- [ ] 3. Rewire `connectCDP()` to use Rust discovery + update tests

  **What to do**:
  - Modify `connectCDP()` in `cdp-actions.ts` (lines 51-69) to:
    1. Keep the existing port resolution logic (invoke `get_cdp_port` if no port given)
    2. Replace `const ok = await cdp.connect(resolvedPort)` with:
       - `const wsUrl = await invoke<string | null>('discover_cdp_target', { port: resolvedPort })`
       - If `wsUrl` is null/undefined, return false
       - `const ok = await cdp.connectToUrl(wsUrl)`
    3. Remove the `await cdp.send('Page.enable')` line — `connectToUrl()` now handles that internally
  - Update `cdp-actions.test.ts` if it exists — update mock expectations for the new invoke call
  - Run `cargo build` in `src-tauri/` to verify Rust compiles
  - Run `npx vitest run` in `ogre-desktop/` to verify all tests pass

  **Must NOT do**:
  - DO NOT touch anything below line 69 in cdp-actions.ts (the action functions)
  - DO NOT change the `connectCDP` function signature
  - DO NOT remove the `port` parameter from `connectCDP`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small integration change, ~10 lines modified + test update
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Tasks 1 and 2)
  - **Blocks**: None
  - **Blocked By**: Task 1, Task 2

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/cdp-actions.ts:51-69` — `connectCDP()` function — the function to modify
  - `ogre-desktop/src/lib/cdp-actions.ts:55` — existing `invoke('get_cdp_port')` call — pattern for the new invoke
  - `ogre-desktop/src/lib/cdp-actions.ts:60` — `await cdp.connect(resolvedPort)` — the line to replace

  **Test References**:
  - Search for `cdp-actions.test.ts` or any test file that mocks `connectCDP` — update expectations

  **WHY Each Reference Matters**:
  - Line 60 is the exact line being replaced
  - Line 55 shows the invoke pattern already in use in this function
  - Tests need updating to expect `invoke('discover_cdp_target')` instead of `cdp.connect()`

  **Acceptance Criteria**:
  - [ ] `connectCDP()` calls `invoke('discover_cdp_target', { port })` instead of `cdp.connect(port)`
  - [ ] `connectCDP()` calls `cdp.connectToUrl(wsUrl)` with the result
  - [ ] `connectCDP()` signature unchanged: `async function connectCDP(port?: number): Promise<boolean>`
  - [ ] `cargo build` succeeds in src-tauri/
  - [ ] `npx vitest run` passes in ogre-desktop/
  - [ ] No changes to action functions (pwClick, pwType, etc.)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full Rust build succeeds
    Tool: Bash
    Preconditions: All Rust changes from Task 1 in place
    Steps:
      1. Run `cargo build` in ogre-desktop/src-tauri/
      2. Assert exit code 0
    Expected Result: "Finished" message, zero errors
    Failure Indicators: Any "error[E" in output
    Evidence: .sisyphus/evidence/task-3-cargo-build.txt

  Scenario: All vitest tests pass
    Tool: Bash
    Preconditions: All TS changes from Tasks 2-3 in place
    Steps:
      1. Run `npx vitest run` in ogre-desktop/
      2. Assert exit code 0
      3. Check output for "Tests: X passed" with 0 failures
    Expected Result: All tests pass
    Failure Indicators: Any test failures or "FAIL" in output
    Evidence: .sisyphus/evidence/task-3-vitest.txt

  Scenario: connectCDP uses new discovery path (code verification)
    Tool: Bash (grep)
    Preconditions: cdp-actions.ts modified
    Steps:
      1. Verify `invoke.*discover_cdp_target` exists in connectCDP function
      2. Verify `cdp.connectToUrl` is called (not `cdp.connect`)
      3. Verify `connectCDP(port?: number): Promise<boolean>` signature unchanged
    Expected Result: New invoke call present, old cdp.connect replaced with cdp.connectToUrl
    Failure Indicators: Old `cdp.connect(resolvedPort)` still present in connectCDP
    Evidence: .sisyphus/evidence/task-3-integration-check.txt
  ```

  **Commit**: YES (groups with all tasks)
  - Message: `fix(cdp): proxy CDP target discovery through Rust to bypass CORS`
  - Files: `src/lib/cdp-actions.ts`, `src/lib/cdp-actions.test.ts` (if exists)
  - Pre-commit: `cargo build && npx vitest run`

---

## Commit Strategy

- **Single commit**: `fix(cdp): proxy CDP target discovery through Rust to bypass CORS` — Cargo.toml, lib.rs, cdp-client.ts, cdp-actions.ts, cdp-actions.test.ts (if exists)
- Pre-commit verification: `cargo build && npx vitest run`

---

## Success Criteria

### Verification Commands
```bash
cd ogre-desktop/src-tauri && cargo build  # Expected: "Finished" with zero errors
cd ogre-desktop && npx vitest run          # Expected: All tests pass
```

### Final Checklist
- [ ] `discover_cdp_target` registered in `generate_handler![]`
- [ ] `connectToUrl()` exported from cdp-client.ts
- [ ] `cdp-client.ts` has zero imports from `@tauri-apps/api`
- [ ] `cdp-client.ts::connect(port)` and `MAIN_APP_PATTERNS` unchanged
- [ ] Rust HTTP request has timeout configured (3s)
- [ ] Target filtering in Rust matches TypeScript exactly
- [ ] `cargo build` succeeds
- [ ] `npx vitest run` passes
