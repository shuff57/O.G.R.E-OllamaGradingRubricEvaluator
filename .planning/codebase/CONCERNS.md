# Concerns & Technical Debt

## Critical

### Plaintext credentials stored in SQLite without encryption
The `site_credentials` table in `ogre-desktop/electron-main/database.ts` (lines 97-108) stores usernames and passwords as plaintext `TEXT` columns. These are site login credentials for grading platforms. The SQLite database sits unencrypted on disk in the user's app data directory. Any process with filesystem access can read them. At minimum, credentials should use OS keychain (e.g., `safeStorage` from Electron) or be encrypted at rest.

### CORS set to `origin: '*'` on a grading server
`grading-server/server.js` line 296 sets CORS to allow all origins. While the server is meant to be localhost-only and uses a Bearer token, the wildcard CORS combined with a predictable port (3456) means any website the teacher visits could attempt cross-origin requests to the grading server. If the handshake token is leaked or guessed, any origin can hit grading endpoints. The CORS origin should be restricted to `http://localhost:*` and `http://127.0.0.1:*`.

### Handshake token exposed via unauthenticated GET endpoint
`grading-server/server.js` lines 337-346: `/api/handshake` returns the Bearer token to any request with a missing or localhost `Origin` header. The `Origin` header is trivially spoofable from non-browser contexts. Combined with `origin: '*'` CORS, any in-browser script can fetch the handshake token and then use it to call authenticated endpoints (grade students, push provider configs, read API keys via `/api/providers`).

### innerHTML injection in batch grading fill script
`ogre-desktop/src/lib/batch-grader.ts` line 839: `fbBox.innerHTML = html` injects AI-generated feedback HTML directly into the grading page DOM. If AI output contains script tags or event handlers, this is an XSS vector in the teacher's grading context. The feedback text should be sanitized or use `textContent` for plain text modes.

### OAuth tokens and API keys returned in full via `/api/providers`
`grading-server/server.js` line 353 returns the entire `providerConfigs` array including `credentials.api_key`, `credentials.access_token`, and `credentials.refresh_token`. Any caller with the handshake token (see above) can exfiltrate all configured AI provider API keys.

## Technical Debt

### `server.js` is a 2,129-line monolith
`grading-server/server.js` contains route handlers, provider dispatch, anchor generation, bridge response logic, prompt building helpers, knowledge profile generation, embedding endpoints, session logging, and startup logic all in one file. Extracting route groups (grading, embedding, profiles, rubrics, auth) into separate modules would improve maintainability.

### `batch-grader.ts` is 1,653 lines
`ogre-desktop/src/lib/batch-grader.ts` is the largest source file in the desktop app. It handles extraction, grading orchestration, score filling, and DOM manipulation for multiple grading platforms. This is the most fragile file in the codebase and should be decomposed.

### `bundle.js` is a 4,023-line vendored build artifact
`grading-server/bundle.js` appears to be a compiled/bundled version of the server (Hono framework + app logic), checked into git. It duplicates the source modules and drifts out of sync. The gitignore already lists `grading-server/bundle.js` but it remains tracked due to prior commits.

### Three deprecated endpoints with unreachable code blocks
`grading-server/server.js` has three deprecated endpoints that return 410 but keep the old implementation as unreachable dead code below the return statement:
- `/api/automation/grade` (line 842, ~210 lines of dead code)
- `/api/automation/grade-only` (line 1065, ~125 lines of dead code)
- `/api/automation/fill` (line 1200, ~60 lines of dead code)
These ~400 lines of unreachable code inflate the file and create confusion.

### Hardcoded port 3456
`grading-server/server.js` line 56 and `ogre-desktop/electron-main/server-manager.ts` line 13 both hardcode `const SERVER_PORT = 3456`. If the port is in use, the server fails with no fallback. The port should be configurable or the server should try alternative ports.

### Hardcoded Anthropic OAuth client ID
`grading-server/server.js` line 73: `const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'` is hardcoded. This should be in config or environment variables for flexibility across environments.

### Hardcoded remote debugging port
`ogre-desktop/electron-main/main.ts` line 21: `app.commandLine.appendSwitch('remote-debugging-port', '9223')`. This always opens a Chrome DevTools debug port, even in production builds. This is a security concern -- remote debugging access to the Electron app should be dev-only.

### `config.js` has inconsistent app data directory names
`grading-server/config.js` line 27 uses `ogre-desktop` as the directory name, but `grading-server/bundle.js` line 3075 uses `com.ogre.desktop`. These are two different config locations depending on whether the source or bundle is running.

### `getBunExecutable()` has Unix-only paths
`ogre-desktop/electron-main/server-manager.ts` lines 31-43: Bun executable search paths are all Unix (`/opt/homebrew/bin/bun`, `/usr/local/bin/bun`, `~/.bun/bin/bun`). On Windows, where this is currently being developed, these paths never match and it falls through to bare `bun` on PATH.

## Dead Code

### ~400 lines of unreachable deprecated endpoint code
See Technical Debt section above. The code after `return c.json(...)` in the three deprecated automation endpoints is unreachable but preserved "for reference."

### `agent-browser-temp/` directory (6.7MB)
Untracked directory containing what appears to be a vendored copy of an agent-browser package with its own `node_modules`, benchmarks, docs, and scripts. Not referenced by any source file.

### `fine-tuned-model/` directory (5.3GB)
Contains a single GGUF model file (`Qwen3.5-9B.Q4_K_M.gguf`). This is untracked by git (not in `.gitignore` either) but consumes 5.3GB of disk space in the repo directory. Should either be tracked via Git LFS, stored externally, or added to `.gitignore`.

### `demo/` directory with legacy HTML fixtures
Contains 7 HTML demo files for tier-based SpeedGrader testing. These appear to be from an earlier phase when the server did browser automation directly (now deprecated). Still tracked in git.

### `runpod/` directory
Contains only a `README.md`. Appears to be a placeholder for RunPod deployment artifacts that were never completed.

### `dist/` directory
The top-level `dist/` contains only an `assets/` subdirectory. Listed in `.gitignore` but appears to be a stale build artifact from a previous architecture (pre-Electron).

### `nul` file in repo root
A 119-byte file named `nul` -- likely created accidentally on Windows when output was redirected to `NUL` (the Windows null device). It is in `.gitignore` but was previously tracked.

### `$APPDATA/` in repo root (gitignored)
Listed in `.gitignore` as `$APPDATA/` -- this directory was likely created by a Windows shell misconfiguration where `%APPDATA%` was not expanded.

### `automation.js` session management for removed feature
`grading-server/automation.js` manages browser automation sessions (grant, validate, revoke) with tab IDs and extension IDs. The browser automation endpoints that used these sessions are all deprecated. The session management code is still imported and used by the deprecated (unreachable) code paths.

## Fragile Areas

### AI response JSON parsing in `grading.js`
`grading-server/grading.js` `parseBatchResponse()` (starting at line 271) performs extensive JSON repair: stripping think blocks, removing code fences, fixing LaTeX backslashes, unwrapping wrapper objects. Each AI provider and model can return subtly different formats. A malformed response silently degrades to partial results rather than failing loudly, which could produce incorrect grades without the teacher noticing.

### Score scaling math across virtual/actual scales
`grading-server/grading.js` uses a `getScaleInfo()` function to map between the actual max score and a "virtual" 0-10 scale for the AI, then rescales back. Rounding decisions (line 57: `maxScore < 6` threshold) and multiple `Math.round` calls with `scoreFactor` multipliers create opportunities for off-by-one scoring errors, especially at edge-case max scores.

### `batch-grader.ts` DOM manipulation for multiple platforms
The batch grader constructs and evaluates JavaScript strings inside webview contexts to fill grades and feedback into third-party grading platforms. It handles multiple feedback types (`tinymce-inline`, `contenteditable`, plain input), hidden field sync, and MathJax re-rendering. Any change to the target platform's DOM structure breaks the fill logic silently.

### Site profile URL matching is substring-based
`grading-server/server.js` line 486: `url.includes(pattern)` is the entire matching logic for site profiles. A pattern like `math` would match any URL containing "math" anywhere. This could cause the wrong site profile to be applied, leading to incorrect rubric extraction or grade filling.

### Bridge response tier bucketing uses overlapping ranges
`grading-server/server.js` lines 243-252: The threshold calculations for bucketing graded results into anchor tiers have edge cases where `adequateRange[0]` and `belowAvgRange[1]` overlap (both equal `anchors.belowAverage.score + 1` and `anchors.belowAverage.score`). Students at tier boundaries could be excluded from all buckets.

## Security

### Credentials stored in plaintext SQLite
See Critical section. `site_credentials` table stores passwords unencrypted.

### API keys stored in plaintext config file
`grading-server/config.js` persists provider configs (including `credentials.api_key`, `credentials.access_token`, `credentials.refresh_token`) as plain JSON on disk at the platform-specific app data path. No encryption at rest.

### Remote debugging port always enabled
`ogre-desktop/electron-main/main.ts` line 21 enables `--remote-debugging-port=9223` unconditionally (dev and production). Any local process can connect to `http://127.0.0.1:9223` and get full DevTools access to the Electron app, including the ability to read stored data, execute JavaScript, and access the embedded browser's cookies.

### CDP port written to well-known path
`ogre-desktop/electron-main/cdp-bridge.ts` line 7 writes the CDP debug port to `~/.ogre/cdp-port`. This advertises the debug port location to any process on the system.

### `evalWebviewScript` and `injectWebviewScript` exposed via preload
`ogre-desktop/electron-main/preload.ts` lines 26-27 expose `evalWebviewScript` and `injectWebviewScript` to the renderer process. While contextIsolation is enabled, if the renderer is compromised (e.g., via XSS in the Svelte app), arbitrary scripts can be injected into any webview tab -- including grading platforms where the teacher is authenticated.

### Raw SQL queries from renderer via `dbQuery`/`dbExecute`
`ogre-desktop/electron-main/preload.ts` lines 40-41 expose `dbQuery(sql, params)` and `dbExecute(sql, params)` that pass raw SQL strings from the renderer to the main process. While parameterized, the SQL itself comes from the renderer. A compromised renderer could execute arbitrary SQL against the local database (read all credentials, drop tables, etc.).

### No rate limiting on grading server endpoints
The grading server has no rate limiting on any endpoint. A misconfigured or malicious client could flood the server with grading requests, causing excessive API calls to paid AI providers (OpenAI, Anthropic) and running up costs.

## Performance

### 600-second timeout for local Ollama requests
`grading-server/server.js` line 166: Local Ollama requests have a 600-second (10 minute) timeout. A hung Ollama instance will block the grading request for 10 minutes before failing. The teacher gets no feedback during this wait.

### No connection pooling or health checking for AI providers
Each grading request creates a new `fetch()` call. There is no connection reuse, health checking, or circuit-breaking for AI providers. If Ollama is down, every batch chunk will wait the full timeout before failing.

### In-memory profile cache with no eviction
`grading-server/server.js` line 66: `const profileCache = new Map()` grows unbounded. Profiles are only added, never removed. Over long server sessions with many different grading sites, memory will grow monotonically.

### `parseBatchResponse` performs multiple regex passes
The JSON repair logic in `grading.js` runs multiple regex replacements and parse attempts sequentially. For large batch responses (many students), this could be slow, though it is unlikely to be a bottleneck compared to AI inference time.

### Embedding model loaded eagerly on warm-up
`/api/warm-embed` triggers `initLocalEmbedder()` which loads an ML model into memory. This consumes significant RAM and startup time for a feature that may not be used in every session.

## Build & Deploy

### Bun as runtime dependency with fragile discovery
`ogre-desktop/electron-main/server-manager.ts` searches hardcoded Unix paths for the `bun` executable. The grading server requires Bun to run (`bun run server.js`). If Bun is not installed or not on PATH, the server silently fails to start. There is no fallback to Node.js, no installer, and no clear error for teachers.

### `ogre-desktop/dist-electron/` is untracked but present
The `dist-electron/` directory (584KB, including a 16,449-line `main.js`) is a build output that is not tracked in git but is present in the working directory. It should either be in `.gitignore` or cleaned up.

### Multiple `node_modules` directories
Both the root and `grading-server/` have their own `node_modules`. The desktop app in `ogre-desktop/` has a third. Dependency management across three package ecosystems (root, server, desktop) adds complexity and potential version conflicts.

### No CI/CD pipeline visible
No `.github/workflows/`, no `Jenkinsfile`, no build scripts for producing release artifacts. The desktop app appears to be built manually. Automated testing, linting, and release packaging would catch many of the issues listed above.

### Build artifact confusion: `bundle.js` vs source modules
`grading-server/bundle.js` is a pre-built bundle tracked in git (though gitignored -- it may have been committed before the ignore rule). The source modules (`server.js`, `grading.js`, `providers.js`, etc.) exist alongside it. It is unclear which is used in production vs development, creating confusion about what code is actually running.

### `fine-tuned-model/` is 5.3GB in the repo directory
See Dead Code section. This model file should not be in the repo directory at all, or should be managed via Git LFS if it needs to be versioned.
