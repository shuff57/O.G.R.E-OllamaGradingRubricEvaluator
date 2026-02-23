# CDP Client Plan — Learnings

## 2026-02-23 Session ses_37427ec41ffeOFenLFcpP0pPB6 — Initial Analysis

### Codebase Conventions
- TypeScript with vitest for tests. `vi.mock()` pattern used throughout.
- All action functions return `ActionResult = { success: boolean; error?: string; data?: unknown }` — NEVER throw.
- `DANGEROUS_JS_PATTERNS` from `agent-types.ts` must be checked before any `Runtime.evaluate` with user content.
- Tauri IPC: `invoke()` from `@tauri-apps/api/core`.
- Rust managed state pattern: `.manage(SomeState { ... })` + `State<SomeState>` in command params.

### Key File Locations
- `ogre-desktop/src/lib/playwright-executor.ts` — module being replaced (330 lines)
- `ogre-desktop/src/lib/playwright-executor.test.ts` — test file being replaced (80 lines)
- `ogre-desktop/src/lib/browser-actions.ts:20` — THE integration point (one import line to swap)
- `ogre-desktop/src/lib/browser.ts:254` — `captureWebviewScreenshot()` to add CDP path
- `ogre-desktop/src-tauri/src/lib.rs:607` — `run()` function, CDP env var already set at top
- `ogre-desktop/src-tauri/src/lib.rs:763-780` — `invoke_handler!` macro, add `get_cdp_port` here
- `ogre-desktop/src-tauri/src/lib.rs:798-801` — `.manage()` calls, add `CdpPortState` here

### CRITICAL: lib.rs Already Has CDP Code
The `run()` function in lib.rs ALREADY has CDP env var setting code (lines 608-631):
- Debug builds: hardcoded port 9222
- Production: reads `OGRE_CDP_PORT` env var
- Task 2 needs to REPLACE this with dynamic port allocation (9222-9242 sequential try)
- The existing code is the STARTING POINT, not something to add from scratch

### CRITICAL: lib.rs invoke_handler location
- `tauri::Builder::default()` starts at line 763
- `.invoke_handler(tauri::generate_handler![...])` at lines 764-780
- `.manage()` calls at lines 798-801
- New `get_cdp_port` command goes in BOTH the handler list AND a new `.manage(CdpPortState {...})`

### Target Filtering (MAIN_APP_PATTERNS)
```typescript
const MAIN_APP_PATTERNS = [
  /^tauri:\/\/localhost/,
  /^https:\/\/tauri\.localhost/,
  /^http:\/\/localhost:(1420|5173)/, // Vite dev server
];
```
Embedded browser = type === 'page' AND url !== 'about:blank' AND url !== '' AND NOT matching MAIN_APP_PATTERNS.

### CDP WebSocket Protocol
- Request: `{ id: number, method: string, params?: object }`
- Response: `{ id: number, result: any }` or `{ id: number, error: { message: string } }`
- Events: `{ method: string, params: any }` (no id field)
- Use browser-native `WebSocket` (NOT Node.js `ws` library — runs in Tauri frontend/browser context)

### Port Allocation Pattern (from lib.rs:538-549)
```rust
for offset in 0u16..20 {
    let try_port = port.checked_add(offset).ok_or("Port overflow")?;
    match tokio::net::TcpListener::bind(format!("0.0.0.0:{}", try_port)).await {
        Ok(l) => { bound = Some(l); break; }
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
        ...
    }
}
```
For CDP: try ports 9222-9242 (range of 21). Use `127.0.0.1` not `0.0.0.0` for CDP (localhost only).

### vite.config.js Current State
Currently has `optimizeDeps: { exclude: ['playwright-core'] }` — remove this in Task 5.

### browser.ts captureWebviewScreenshot (line 254)
Currently: loads html2canvas then captures. 
Task 6 adds CDP-first path at the TOP of the function (before ensureHtml2CanvasLoaded call).

# CDP Client Learnings

## Task 1: cdp-client.ts

### Key Design Decisions
 Used browser-native `WebSocket` (not Node.js `ws`) since this runs in Tauri frontend context
 `127.0.0.1` instead of `localhost` — WebView2 on Windows may bind IPv4 only
 Singleton pattern (`export const cdp`) for convenience; class also exported for testing
 `connect()` wraps everything in try/catch, always returns `boolean` — never throws
 `disconnect()` nulls all event handlers before `close()` to prevent stale callbacks
 Message routing: messages with `id` → resolve pending Promise; messages with `method` (no `id`) → event listeners
 Added `off()` method beyond spec for symmetry with `on()` — good practice for cleanup

### Project Structure Notes
 No tsconfig.json in ogre-desktop — Vite handles TS transpilation directly
 TypeScript verification requires explicit flags: `--target es2022 --module es2022 --moduleResolution bundler --lib dom,es2022 --strict`
 Existing .ts files in src/lib/ follow the pattern: module-level state, exported functions/classes, JSDoc comments
 MAIN_APP_PATTERNS duplicated from playwright-executor.ts (intentional — cdp-client has zero imports)

### Gotchas
 `wc -l` on Windows Git Bash works but file lines include trailing newline
 Initial version was 251 lines — had to compact by removing decorative separators and inline-collapsing short handler bodies
 Final: 185 lines, well under 200 limit
## Task 2: Dynamic CDP Port Allocation (lib.rs)

 `std::net::TcpListener::bind()` is sync — works fine in non-async `run()` fn
 Listener drops immediately after probe, releasing port for WebView2
 `CdpPortState` is read-only after init, no Mutex needed
 Port range 9222-9242 gives 21 attempts (same idea as OAuth port fallback pattern at line 544)
 `cargo check` compiles cleanly — no new dependencies needed
 `get_cdp_port` registered in both `invoke_handler!` and `.manage()` chain
 Replaced both `#[cfg(debug_assertions)]` and `#[cfg(not(debug_assertions))]` blocks with unified dynamic allocation


## Task 3: cdp-actions.ts

### Patterns
 CDPClient.send() returns `Promise<unknown>` — cast results with `as { ... }` at call sites
 DOM.getBoxModel content array: [x1,y1, x2,y2, x3,y3, x4,y4] — corners of content box
  - Center calc: x=(content[0]+content[4])/2, y=(content[1]+content[5])/2 works for non-rotated rects
 Runtime.evaluate with `returnByValue: false` gives objectId for DOM nodes
 Runtime.evaluate with `returnByValue: true` serializes result to value
 Input.insertText requires element to be focused first via Runtime.evaluate focus()
 DOM.scrollIntoViewIfNeeded takes objectId (not nodeId)
 DANGEROUS_JS_PATTERNS in agent-types.ts differs from task spec — always import from source of truth

### Conventions
 All pw* functions: NEVER throw, return `{ success: false, error: ... }` on any failure
 cdpScreenshot: THROWS on failure (different contract, caller handles)
 connectCDP without port → invoke('get_cdp_port') from Tauri
 After connect → send 'Page.enable' for navigation events
 checkDangerousPatterns runs on ALL Runtime.evaluate expressions, not just pwReadText


## Task 4: Unit Tests for cdp-client and cdp-actions

### Patterns
 `vi.stubGlobal()` needed for `WebSocket` and `fetch` in node test env (cdp-client uses browser-native APIs)
 `MockWebSocket.OPEN = 1` required because `isConnected()` references `WebSocket.OPEN` static property
 `vi.mock('./cdp-client', () => ({ cdp: {...} }))` — mock the entire module with typed mock object for cdp-actions tests
 Cast mock with `as { method: ReturnType<typeof vi.fn> }` pattern for type safety on mock methods
 `mockCdp.send.mockImplementation(async (method) => { switch(method) {...} })` routes different CDP methods to different return values

### Gotchas
 Test env is `node` with `globals: true` — vitest globals available but NO browser globals (WebSocket, fetch)
 `CDPClient.isConnected()` short-circuits on `this.connected` before reaching `WebSocket.OPEN`, so not-connected tests pass even without perfect WebSocket stub
 `pwWaitFor` polls with `setTimeout(r, 200)` — mock must return `{ result: { value: true } }` (strict `=== true` check) to avoid actual polling delay
 The `cdpScreenshot()` function does NOT check `isConnected()` — it just calls `cdp.send` directly, relying on send() to reject if not connected
