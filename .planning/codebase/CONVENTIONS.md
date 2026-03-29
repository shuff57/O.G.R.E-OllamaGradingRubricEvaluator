# Code Conventions

## Project Structure

The repo is a monorepo with two main packages at the root:

- `grading-server/` -- Node/Bun HTTP server (Hono framework), plain JavaScript (`.js`), runs as a sidecar process
- `ogre-desktop/` -- Electron + Svelte 5 desktop app, TypeScript (`.ts`) frontend with Svelte (`.svelte`) components
- Root `package.json` is `ogre-root`, type `"module"`, and exists only as a workspace anchor

Both packages declare `"type": "module"` and use **ESM** exclusively (`import`/`export`, never `require`).

## Style

### Formatting

- **No project-level ESLint or Prettier config.** The only `.prettierrc` found is inside `agent-browser-temp/` (an auxiliary tool). Formatting relies on editor defaults and developer discipline.
- **Indentation:** 2 spaces throughout (JS, TS, Svelte, JSON, shell scripts).
- **Semicolons:** Omitted in `electron-main/*.ts` and `vite.config.js`. Present everywhere else (grading-server JS files, `ogre-desktop/src/lib/*.ts`, Svelte `<script>` blocks). The dominant convention is **semicolons on**.
- **Quotes:** Single quotes are the dominant style in both packages. Double quotes appear in JSDoc `@param` tags and occasionally in test strings.
- **Trailing commas:** Used consistently in multi-line objects, arrays, and function parameter lists (ES2017+ trailing comma style).
- **Line length:** No enforced limit. Lines commonly reach 100-120 characters; long prompt strings go well beyond.

### Whitespace Conventions

- Section headers inside files use box-drawing comment separators:
  ```js
  // ── Section Name ──────────────────────────────────────────────────
  ```
  This pattern appears in server JS, desktop TS, test files, and Svelte components. It is the signature visual delimiter.

## Naming

### Variables and Functions

- **camelCase** for all variables, functions, and method names: `buildBatchPrompt`, `parseSSEStream`, `withRetry`, `loadConfig`.
- **UPPER_SNAKE_CASE** for constants: `GRADING_PHILOSOPHY`, `SCORING_SCALE_DESCRIPTORS`, `SEND_TIMEOUT_MS`, `MAIN_APP_PATTERNS`, `TOKEN_REFRESH_BUFFER_MS`.
- **PascalCase** for TypeScript interfaces, types, and classes: `CDPClient`, `RetryOptions`, `ConfirmationFlow`, `SelectorMap`, `BatchGradingCallbacks`.

### Files

- **grading-server:** kebab-case `.js` files: `ai-retry.js`, `rubric-store.js`, `grading-constants.js`, `embedding-adapters.js`.
- **ogre-desktop/src/lib:** kebab-case `.ts` files: `ai-retry.ts`, `cdp-client.ts`, `sse-parser.ts`, `cosine-similarity.ts`.
- **ogre-desktop/src/components:** PascalCase `.svelte` files: `RubricCard.svelte`, `AgentChat.svelte`, `BatchPanel.svelte`, `ScreenshotOverlay.svelte`.
- **ogre-desktop/electron-main:** kebab-case `.ts` files: `main.ts`, `ipc-handlers.ts`, `server-manager.ts`, `cdp-bridge.ts`.
- **Test files:** Co-located next to source with `.test.ts` suffix (desktop) or in a `test/` directory with `.test.js` suffix (server).

### Svelte Components

- PascalCase names matching the component purpose (`RubricCard`, `DiscoveryChat`, `BatchResults`).
- Subdirectories group by feature: `grading/`, `skills/`, `icons/`, `batch/`.
- `__tests__/` directories exist for some component groups (e.g. `ogre-desktop/src/components/skills/__tests__/`).

## Patterns

### Module System

- **ESM only.** All files use `import`/`export`. No CommonJS anywhere except Electron preload output (`format: 'cjs'` in the build config).
- Relative imports with `.js` extension in grading-server (required for Node ESM): `import { withRetry } from './ai-retry.js'`.
- Bare imports (no extension) in ogre-desktop TS/Svelte (handled by Vite bundler): `import { withRetry } from './ai-retry'`.
- `import type` used for TypeScript type-only imports (enforced by `verbatimModuleSyntax: true` in both tsconfigs).

### Async/Await

- Dominant pattern. All async operations use `async`/`await`. No raw `.then()` chains in application code.
- `void` prefix used for fire-and-forget promises: `void win.loadURL(...)`.

### Function Declarations

- **grading-server:** Mix of `export function name()` and `function name()` (named function declarations). No arrow functions for top-level exports.
- **ogre-desktop:** `export function name()` and `export async function name()` for library functions. Arrow functions used for inline callbacks, `.map()`, `.filter()`, event handlers.

### JSDoc vs TypeScript

- **grading-server (JS):** Extensive JSDoc with `@param`, `@returns`, `@throws` annotations on every exported function. Inline `/** @type {...} */` annotations for complex variables.
- **ogre-desktop (TS):** TypeScript interfaces and type annotations replace JSDoc. Docstrings still used as block comments (`/** ... */`) for module-level and function-level documentation.

### Svelte 5 Runes

- Uses Svelte 5 runes API (`$state`, `$props`, `$bindable`, `$effect`). No legacy `writable`/`readable` stores.
- Props declared via `interface Props` + destructured `$props()`:
  ```svelte
  interface Props {
    selectedRubric?: SavedRubric | null;
    rubricText?: string;
  }
  let { selectedRubric = $bindable(null), rubricText = $bindable('') }: Props = $props();
  ```
- State declared inline: `let loading = $state(true);`

### Builder/Parser Pattern (Provider Adapters)

- Each AI provider has a paired `buildXRequest()` / `parseXResponse()` function in `grading-server/providers.js`.
- Request builders return `{ url, headers, body }` objects.
- Response parsers extract the content string from provider-specific response shapes.
- This pattern keeps provider-specific logic isolated and testable.

### Atomic File Writes

- Config and rubric persistence use a write-tmp-then-rename pattern for crash safety:
  ```js
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmpPath, configPath);
  ```

## Error Handling

### Server-Side (grading-server)

- **try/catch with console.error logging**: Errors are caught, logged with a `[module]` prefix tag (e.g. `[config]`, `[rubric-store]`, `[copilot]`), and either:
  - Returned as HTTP JSON errors: `return c.json({ error: 'message' }, 400)`
  - Gracefully degraded (e.g. config parse failure falls back to defaults)
- **HTTP status code awareness**: The `withRetry` pattern distinguishes retryable (429, 500, 502, 503) from non-retryable (400, 401, 403, 404) errors.
- **Descriptive throw messages**: `throw new Error('Invalid Ollama response: missing message.content')` -- always includes context about what was expected.

### Client-Side (ogre-desktop)

- Functions that interact with external systems (CDP, server API) return `false` or `null` on failure rather than throwing: `async connect(): Promise<boolean>` with `catch { return false; }`.
- Error state tracked in component-level `$state` variables: `let error = $state('')`.
- `console.warn` used for non-fatal issues (malformed SSE data).

### Common Pattern: Guard Clauses

- Early return with explicit checks at function entry:
  ```js
  if (!messages || !Array.isArray(messages)) {
    return c.json({ error: 'Missing required field: messages (must be array)' }, 400);
  }
  ```

## Code Organization

### File Internal Structure

Files consistently follow this internal order:

1. **Module docstring** (JSDoc block comment describing the file's purpose)
2. **Imports** (node builtins first, then dependencies, then local modules)
3. **Constants / module-level config**
4. **Type definitions** (TypeScript interfaces/types in TS files)
5. **Internal helper functions** (non-exported)
6. **Exported functions / classes**
7. **File watchers / side effects** (at end of file, if any)

Section separators (`// ── Name ──`) divide logical groups within longer files.

### Server Route Organization (`server.js`)

- Single `Hono` app instance
- Routes grouped by feature with section comments
- Middleware (CORS) applied globally at top
- Config state managed as module-level `let` variables
- Helper functions (e.g. `callProviderDirect`) defined between config and routes

### Component Organization (Svelte)

- `<script lang="ts">` block first with: docstring, imports, Props interface, `$props()` destructure, `$state` declarations, lifecycle hooks, handler functions
- HTML template in the middle
- `<style>` block at the bottom (scoped by default)

### Electron Main Process (`electron-main/`)

- Each concern in its own file: `main.ts`, `ipc-handlers.ts`, `database.ts`, `server-manager.ts`, `cdp-bridge.ts`, `updater.ts`, `oauth-server.ts`
- `main.ts` is the slim orchestrator that calls `init*` and `register*` functions from the other modules
- IPC handler registration is centralized in `ipc-handlers.ts`

### TypeScript Configuration

- **grading-server:** Strict mode (`strict: true`), ESNext target, bundler module resolution, `noUncheckedIndexedAccess`, `noImplicitOverride`. However code is all `.js` with JSDoc.
- **ogre-desktop:** `jsconfig.json` with `checkJs: true`, `verbatimModuleSyntax: true`, ESNext target. Actual TS files in `src/lib/` and `electron-main/`.
- Both use `skipLibCheck: true`.
