# Testing

## Framework

- **Test runner:** [Vitest](https://vitest.dev/) v4.x in both packages
- **Assertion library:** Vitest's built-in `expect` API (Chai-compatible matchers)
- **Mocking:** Vitest `vi.fn()`, `vi.mock()`, `vi.spyOn()`, `vi.hoisted()`
- **DOM environment:** `jsdom` available in `ogre-desktop` devDependencies but tests run in `environment: 'node'` by default (per `ogre-desktop/vitest.config.ts`)
- **E2E:** Bash shell scripts for desktop app integration tests (no Playwright/Cypress)

## Structure

### grading-server

Tests live in a dedicated `grading-server/test/` directory:

- `grading-server/test/retry.test.js`
- `grading-server/test/providers.test.js`
- `grading-server/test/grading.test.js`
- `grading-server/test/parsers.test.js`
- `grading-server/test/prompts.test.js`
- `grading-server/test/agent.test.js`
- `grading-server/test/chat.test.js`
- `grading-server/test/cloud-fallback.test.js`
- `grading-server/test/e2e-ollama.test.js`
- `grading-server/test/embedding-adapters.test.js`
- `grading-server/test/knowledge-profile.test.js`
- `grading-server/test/local-embedder.test.js`
- `grading-server/test/profiles.test.js`
- `grading-server/test/fixtures/` (test data directory)

No vitest.config file found -- uses Vitest defaults with `vitest run`.

### ogre-desktop

Tests are **co-located** next to source files with a `.test.ts` suffix:

- `ogre-desktop/src/lib/ai-retry.test.ts` (tests `ogre-desktop/src/lib/ai-retry.ts`)
- `ogre-desktop/src/lib/sse-parser.test.ts`
- `ogre-desktop/src/lib/cdp-client.test.ts`
- `ogre-desktop/src/lib/cosine-similarity.test.ts`
- `ogre-desktop/src/lib/db.test.ts`
- `ogre-desktop/src/lib/discover.test.ts`
- `ogre-desktop/src/lib/discover.integration.test.ts`
- `ogre-desktop/src/lib/discover.regression.test.ts`
- `ogre-desktop/src/lib/agent-loop.diagnostic.test.ts`
- `ogre-desktop/src/lib/agent-loop.integration.test.ts`
- `ogre-desktop/src/lib/agent-loop.skill-injection.test.ts`
- `ogre-desktop/src/lib/agent-loop.text-resilience.test.ts`
- `ogre-desktop/src/lib/agent-prompt.test.ts`
- `ogre-desktop/src/lib/batch-grader.test.ts`
- `ogre-desktop/src/lib/confirmation-flow.test.ts`
- `ogre-desktop/src/lib/grading-api.test.ts`
- `ogre-desktop/src/lib/grading-pipeline.test.ts`
- `ogre-desktop/src/lib/heuristic-detector.test.ts`
- ... and many more in `ogre-desktop/src/lib/`

Component tests use `__tests__/` subdirectories:

- `ogre-desktop/src/components/skills/__tests__/SkillCard.test.ts`
- `ogre-desktop/src/components/skills/__tests__/SkillSearch.test.ts`
- `ogre-desktop/src/components/grading/AgentChat.test.ts` (some co-located at component level too)

Test utilities:

- `ogre-desktop/src/lib/__test-utils__/agent-fixtures.ts` (shared helpers and `collectEvents()`)
- `ogre-desktop/src/lib/__test-utils__/agent-fixtures.test.ts` (tests for the test utils themselves)

### E2E Tests (Shell Scripts)

Located in `ogre-desktop/tests/e2e/`:

- `helpers.sh` -- shared functions (`wait_for_health`, `cleanup`, `launch_app`, `get_db_path`)
- `golden-path.test.sh` -- full app launch, sidecar health check, mock session, DB verification, shutdown
- `lifecycle.test.sh`, `config.test.sh`, `history.test.sh`, `tray.test.sh`
- `run-all.sh` -- orchestrator script

### Vitest Configuration

`ogre-desktop/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/lib/browser-eval.integration.test.ts'],
  },
});
```

Key points:
- `globals: true` -- `describe`, `it`, `expect`, `vi` available without imports (but most files import them explicitly anyway)
- `environment: 'node'` -- no JSDOM by default
- Integration tests that require a browser (`browser-eval.integration.test.ts`) are excluded from the default run

## Patterns

### Test Organization

Tests use `describe`/`it` nesting with section separator comments matching the source convention:

```ts
describe('withRetry', () => {
  // ── Success path ────────────────────────────────────────────────────
  it('returns the value on first-call success', async () => { ... });

  // ── Retryable HTTP statuses ─────────────────────────────────────────
  describe('retries on transient HTTP errors', () => {
    for (const status of [429, 500, 502, 503]) {
      it(`retries on HTTP ${status}`, async () => { ... });
    }
  });
});
```

### Mocking Approaches

**Module mocking with `vi.mock()`:**

```ts
vi.mock('./browser', () => ({
  captureWebviewScreenshot: vi.fn().mockResolvedValue(undefined),
  getEmbeddedUrl: vi.fn().mockResolvedValue('https://myopenmath.com'),
}));
```

**Hoisted mock setup with `vi.hoisted()`** for mocks that need to be defined before imports:

```ts
const { mockDbQuery, mockDbExecute } = vi.hoisted(() => ({
  mockDbQuery: vi.fn(),
  mockDbExecute: vi.fn(),
}));
```

**Spy-based mocking for globals:**

```ts
vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as typeof fetch);
vi.spyOn(console, 'warn').mockImplementation(() => {});
```

**No external mocking libraries.** All mocking uses Vitest's built-in `vi` utilities.

### Test Helper Functions

Tests define local helper functions at the top of the file with JSDoc-style comments:

```ts
/** Create an Error with a `.status` property, mimicking HTTP error responses. */
function httpError(message: string, status: number): Error { ... }

/** Near-instant retries to keep tests fast without fake timers. */
const FAST = { baseDelay: 1 };
```

Factory helpers for creating test data:

```ts
function makeCred(overrides: Partial<SiteCredential> = {}): SiteCredential {
  return { id: 1, site_name: 'MyOpenMath', ...overrides };
}
```

### Async Testing

- All async tests use `async`/`await` with Vitest's `expect(...).rejects.toThrow()` for error assertions.
- Real timers with tiny delays (`baseDelay: 1`) preferred over fake timers for simplicity.
- `setTimeout` spying used when testing specific delay values.

### Parameterized Tests

Loop-based parameterized tests (not Vitest's `it.each`):

```ts
for (const status of [429, 500, 502, 503]) {
  it(`retries on HTTP ${status}`, async () => { ... });
}
```

### Server Tests (JS)

- Import from parent directory with `.js` extension: `import { withRetry } from '../ai-retry.js'`
- Use `describe`/`it`/`test` interchangeably (`test` used in `providers.test.js`, `it` used in `retry.test.js`)
- Some tests depend on external fixture files outside the repo (`../../shuff57-llm-finetune/ogre/test-data/`)

### Test Lifecycle

- `beforeEach` for reset: `vi.resetAllMocks()`, mock state cleanup
- `afterEach` for spy restoration: `warnSpy.mockRestore()`
- `vi.mocked()` used to access mock implementations on imported functions

## Coverage

- No coverage tool explicitly configured in either package.
- No coverage thresholds or CI gates observed.
- No `c8`, `istanbul`, or `@vitest/coverage-*` in dependencies.

## Running Tests

### grading-server

```bash
cd grading-server
bun run test          # vitest run (single pass)
bun run test:watch    # vitest (watch mode)
```

### ogre-desktop

```bash
cd ogre-desktop
npm test              # vitest run (single pass, src/**/*.test.ts)
npm run test:watch    # vitest (watch mode)
npm run test:e2e      # bash tests/e2e/run-all.sh (requires built app)
```

### Notes

- The grading-server uses `bun` as its package manager/runtime. Tests run via `bun run test` which invokes `vitest run`.
- The ogre-desktop uses `npm` scripts. Tests run via `npm test` which invokes `vitest run`.
- E2E shell tests require a debug build of the desktop app (`npm run tauri build -- --debug`) and are Windows-specific (use `taskkill`, Windows paths).
- The `@vitest/ui` package is a devDependency of ogre-desktop, enabling `vitest --ui` for a browser-based test dashboard.
- Integration tests (`.integration.test.ts`) are excluded from the default vitest run but can be run directly: `npx vitest run src/lib/browser-eval.integration.test.ts`.
