# Vector Search Phase 2 — Local Embeddings via Transformers.js

## TL;DR

> **Quick Summary**: Eliminate embedding API costs by running `all-MiniLM-L6-v2` (384d, ~23MB) locally inside the existing Bun grading-server sidecar. Adds a `local` provider to the embedding adapter, bundles the ONNX model into the compiled binary, and provides a one-time re-embed migration tool for existing vectors stored from Phase 1 (which may be 1536d or 768d from cloud providers — incompatible with 384d).
>
> **Deliverables**:
> - `local` embedding provider in `grading-server/embedding-adapters.js` using `@xenova/transformers`
> - ONNX model bundled into the compiled Bun sidecar binary
> - `POST /api/embed` with `provider: "local"` returns 384d vectors, no API calls
> - "Use Local Embedding Model" toggle in Settings UI
> - Model cold-start loading indicator (first use can take 5–15s)
> - Re-embed migration pipeline: Settings option to re-embed all stored vectors with the new model
> - Mandatory `embeddingModel` filtering everywhere in `vector-store.ts` (prevents dimension mismatch crashes)
>
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (spike) → Task 2 (adapter) → Task 4 (settings) → Task 5 (migration) → F1-F4

---

## Context

### Original Request
Phase 2 of the history-aware vector search system. User's goal: stop paying/calling cloud embedding APIs — laptops are capable of running the model locally for free. Multi-teacher sharing and sqlite-vec are explicitly deferred to Phase 3.

### Metis Pre-Planning Analysis
Key findings that shaped this plan:
- **sqlite-vec is skipped**: `tauri-plugin-sql` uses `sqlx` which has no `loadExtension()` API. Blocker with no clean fix. Pure JS cosine handles 5,000+ vectors in <10ms anyway.
- **Multi-teacher deferred**: Too many open design questions (sharing protocol, privacy boundaries, rubric versioning). Phase 3 material.
- **Dimension mismatch is a critical risk**: Phase 1 embeddings may be 1536d (OpenAI) or 768d (Gemini/Ollama). Switching to 384d Transformers.js breaks comparison. `embeddingModel` filter exists but is optional — must be made mandatory, and a re-embed migration pipeline is required.
- **Sidecar is the right home for Transformers.js**: Keeps the existing `POST /api/embed` contract intact. Frontend doesn't change. Server just gets a new `local` provider case.
- **Bun ONNX bundling needs a spike**: `bun build --compile` may or may not bundle `.onnx` files cleanly — must be validated in Task 1 before committing to the bundling approach.

### Scope Decisions
| Feature | Decision | Reason |
|---------|----------|--------|
| Transformers.js local embeddings | ✅ In scope | Core goal of Phase 2 |
| ONNX model bundled in sidecar | ✅ In scope | User chose bundle over download-on-demand |
| Re-embed migration pipeline | ✅ In scope | Required when switching models (dimension mismatch) |
| Mandatory embeddingModel filtering | ✅ In scope | Safety fix — prevents crashes |
| sqlite-vec extension | ❌ Deferred Phase 3 | Hard Tauri blocker, not needed at current scale |
| Multi-teacher sharing | ❌ Deferred Phase 3 | Too many open design questions |

---

## Work Objectives

### Core Objective
Make embedding generation free and offline-capable by running `all-MiniLM-L6-v2` inside the grading-server sidecar. The embedding pipeline is already abstracted behind `POST /api/embed` — Phase 2 adds a `local` provider case that calls Transformers.js instead of a cloud API.

### Concrete Deliverables
- Modified `grading-server/embedding-adapters.js` — `local` provider case
- New `grading-server/local-embedder.js` — Transformers.js model loader + inference wrapper
- Modified `grading-server/server.js` — `POST /api/embed` handles `provider: "local"`
- Modified `grading-server/package.json` — adds `@xenova/transformers`
- Modified `ogre-desktop/src/lib/vector-store.ts` — mandatory (non-optional) `embeddingModel` param everywhere
- New `ogre-desktop/src/lib/re-embed.ts` — migration pipeline: fetch all stored embeddings, re-embed, overwrite
- Modified `ogre-desktop/src/pages/Settings.svelte` (or equivalent) — "Use Local Model" toggle
- Modified `ogre-desktop/src/components/grading/` — loading indicator when local model is initializing
- New `grading-server/test/local-embedder.test.js` — bun test suite for local provider
- Modified `ogre-desktop/src/lib/vector-store.test.ts` — updated for mandatory model param

### Definition of Done
- [ ] `POST /api/embed` with `{"provider":"local","text":"..."}` returns a 384-dimension vector with no network call
- [ ] Local model cold-start completes (first embedding generated) without UI freeze or unexplained hang
- [ ] Settings toggle switches embedding provider to `local` and persists across restarts
- [ ] Re-embed pipeline re-embeds all existing vectors and replaces them in SQLite
- [ ] After re-embed, calibration retrieval works correctly (no dimension mismatch errors)
- [ ] `embeddingModel` is now required (not optional) everywhere in `vector-store.ts`
- [ ] All existing tests pass: `npx vitest run` in `ogre-desktop/`
- [ ] All server tests pass: `bun test` in `grading-server/`
- [ ] TypeScript compiles: `npx tsc --noEmit` in `ogre-desktop/`
- [ ] Bun sidecar compiles with bundled model: `bun build --compile ...` succeeds

### Must Have
- Local model runs entirely in the sidecar process — no calls to external APIs
- `POST /api/embed` contract unchanged — only a new valid `provider` value added
- Loading/progress state surfaced to UI during model cold-start
- Re-embed pipeline is a user-triggered action (not automatic) with clear progress feedback
- Graceful fallback: if local model fails to load, fall back to the configured cloud provider with a warning
- `embeddingModel` mandatory everywhere — no silent dimension mismatch

### Must NOT Have (Guardrails)
- **NO changes to how cloud providers work** — existing OpenAI/Ollama/Gemini/GitHub paths untouched
- **NO automatic re-embedding on model switch** — must be user-triggered after explicit warning
- **NO changes to the `/api/chat` endpoint** — only `/api/embed` is modified
- **NO changes to the Chrome extension** — desktop-only feature
- **NO sqlite-vec** — not in this plan
- **NO multi-teacher sharing** — not in this plan
- **NO Transformers.js in the Svelte frontend** — sidecar only
- **NO new Tauri commands** — use existing HTTP bridge to grading-server
- **DO NOT break Phase 1 embeddings silently** — dimension mismatch must error loudly, never silently corrupt

---

## Verification Strategy

### Test Decision
- **Infrastructure**: vitest (desktop) + bun test (server) — both already configured
- **Approach**: tests-alongside (not pure TDD since Task 1 is a research spike)
- **Key test scenarios**:
  - Local provider returns 384d vector (unit)
  - Dimension mismatch throws, not silently corrupts (unit)
  - Re-embed replaces all rows (integration)
  - Settings toggle persists (vitest component test)
  - Cold-start loading state appears before first embedding (Playwright)

### QA Policy
Evidence saved to `.sisyphus/evidence/p2-task-{N}-{slug}.{ext}`.

| Deliverable | Verification Tool | Method |
|-------------|-----------------|--------|
| Local embedder | bun test | Unit test: generate embedding, check length === 384 |
| Bun compile + bundle | Bash | `bun build --compile ...` exits 0, binary runs |
| Re-embed pipeline | vitest | Mock DB: verify all rows updated, model field updated |
| Settings toggle | Playwright | Click toggle, restart-simulate, verify setting persists |
| Loading indicator | Playwright | Trigger first embedding, assert loading state visible |
| Dimension mismatch guard | vitest | Call with mismatched vectors, assert throws |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 — Research Spike (MUST COMPLETE BEFORE ANYTHING ELSE):
└── Task 1: Spike — Transformers.js in Bun + ONNX bundling validation [deep]

Wave 2 — Core Implementation (parallel after spike passes):
├── Task 2: local-embedder.js + embedding-adapters.js local case [unspecified-high]
└── Task 3: Mandatory embeddingModel filtering in vector-store.ts [quick]

Wave 3 — Integration + UI (parallel after Wave 2):
├── Task 4: Settings toggle — "Use Local Model" + persistence [visual-engineering]
├── Task 5: Re-embed migration pipeline (re-embed.ts + UI trigger) [unspecified-high]
└── Task 6: Loading indicator for model cold-start [visual-engineering]

Wave 4 — Tests + Verification:
├── Task 7: Server-side tests (bun test for local-embedder) [quick]
├── Task 8: Desktop tests (vitest for vector-store + re-embed) [unspecified-high]
└── Task 9: End-to-end: compile sidecar with model, run full embed + grade cycle [unspecified-high]

Wave FINAL (4 parallel):
├── F1: Plan Compliance Audit [oracle]
├── F2: Code Quality Review [unspecified-high]
├── F3: Real Manual QA [unspecified-high + playwright]
└── F4: Scope Fidelity Check [deep]
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 (spike) | — | ALL | 1 |
| 2 (local embedder) | 1 | 4, 5, 7, 9 | 2 |
| 3 (mandatory filter) | 1 | 5, 8 | 2 |
| 4 (settings toggle) | 2 | 9 | 3 |
| 5 (re-embed pipeline) | 2, 3 | 9 | 3 |
| 6 (loading indicator) | 2 | 9 | 3 |
| 7 (server tests) | 2 | F1-F4 | 4 |
| 8 (desktop tests) | 3, 5 | F1-F4 | 4 |
| 9 (e2e) | 4, 5, 6 | F1-F4 | 4 |

---

## TODOs

MJ|- [x] 1. **Spike — Transformers.js in Bun sidecar + ONNX model bundling**

  **What to do**:
  - Install `@xenova/transformers` in `grading-server/`: `bun add @xenova/transformers`
  - Write a minimal `test-local-embed.js` that imports `pipeline` from `@xenova/transformers`, loads `Xenova/all-MiniLM-L6-v2`, and generates an embedding for the string `"This student showed partial work using substitution"`
  - Measure: cold-start time (first load), per-inference time (subsequent calls)
  - Attempt `bun build --compile --target=bun-windows-x64 test-local-embed.js --outfile test-embed.exe` and run the compiled binary
  - If the ONNX model file cannot be inlined into the binary, identify where Bun places it (likely adjacent to binary or in a temp dir), and confirm it can be shipped as a separate file alongside the sidecar
  - Document: cold-start ms, per-call ms, binary size delta, whether model is inline or adjacent
  - Save evidence to `.sisyphus/evidence/p2-task-1-spike-results.txt`
  - **GO / NO-GO decision**: if Transformers.js crashes in compiled Bun binary, stop and consult Oracle before proceeding
  - Clean up `test-local-embed.js` after spike

  **Must NOT do**:
  - Do NOT modify any production files yet — this is pure investigation
  - Do NOT commit the test file or compiled binary
  - Do NOT proceed to Task 2 if the spike shows Transformers.js is incompatible with compiled Bun

  **Recommended Agent**: `deep` (needs to research Bun compile + Transformers.js compatibility, may need to consult docs/issues)

  **References**:
  - `grading-server/package.json` — current dependencies
  - `README.md` (ogre-desktop section) — current sidecar build command: `bun build --compile --target=bun-windows-x64 server.js --outfile ...`
  - Transformers.js docs: https://huggingface.co/docs/transformers.js

---

RT|- [x] 2. **Add `local` embedding provider — `local-embedder.js` + `embedding-adapters.js`**

  **What to do**:
  - Create `grading-server/local-embedder.js`:
    - Export `initLocalEmbedder()` — loads the pipeline once, caches it (singleton pattern)
    - Export `generateLocalEmbedding(text: string): Promise<number[]>` — returns 384d vector
    - Handle cold-start: first call loads model (~5-15s), subsequent calls are fast (<100ms)
    - Expose a `isModelLoaded(): boolean` helper for the loading indicator
    - Model: `Xenova/all-MiniLM-L6-v2` (384 dimensions)
    - If model load fails, throw a clear error (do NOT silently fall back — let the server handle fallback)
  - Modify `grading-server/embedding-adapters.js`:
    - Add `'local'` to `SUPPORTED_EMBED_PROVIDERS` array
    - Add `case 'local':` to `buildEmbedRequest()` — return a sentinel object `{ provider: 'local', text }` (local path doesn't use HTTP)
    - Add `case 'local':` to `parseEmbedResponse()` — return the embedding directly (already resolved)
  - Modify `grading-server/server.js` at `POST /api/embed` (line ~1773):
    - Detect `provider === 'local'` before the HTTP call path
    - Call `generateLocalEmbedding(text)` directly
    - Return `{ embedding, dimensions: 384, model: 'Xenova/all-MiniLM-L6-v2' }` in the same shape as cloud providers

  **Must NOT do**:
  - Do NOT modify any existing cloud provider cases (ollama, openai, gemini, github)
  - Do NOT change the response shape of `POST /api/embed` — it must remain `{ embedding, dimensions, model }`
  - Do NOT auto-initialize the model on server start — lazy-init on first call

  **Recommended Agent**: `unspecified-high`

  **References**:
  - `grading-server/embedding-adapters.js` — existing provider pattern (lines 1-120)
  - `grading-server/server.js:1769-1820` — `POST /api/embed` handler
  - Phase 1 spike result from Task 1 (model load pattern)

---

- [x] 3. **Make `embeddingModel` mandatory everywhere in `vector-store.ts`**

  **What to do**:
  - In `ogre-desktop/src/lib/vector-store.ts`, change ALL functions where `embeddingModel` is currently optional (`embeddingModel?: string`) to required (`embeddingModel: string`)
  - Functions to update: `getEmbeddingsByRubricHash`, `getAllEmbeddings`, and any other query function that filters by model
  - Update all callers of these functions (in `calibration-retrieval.ts`, any batch pipeline code, any post-grading storage) to pass the model string explicitly
  - Add a clear JSDoc comment explaining WHY this is mandatory: `// REQUIRED: mixing vectors from different models causes dimension mismatch crashes (384d vs 1536d)`
  - Run `npx tsc --noEmit` to confirm all callers are updated

  **Must NOT do**:
  - Do NOT change the database schema — this is a TypeScript-layer safety fix only
  - Do NOT add any new database columns
  - Do NOT change the behavior of the queries — same SQL, just mandatory parameter

  **Recommended Agent**: `quick`

  **References**:
  - `ogre-desktop/src/lib/vector-store.ts` — current optional param signatures
  - `ogre-desktop/src/lib/calibration-retrieval.ts` — primary caller
  - `ogre-desktop/src/lib/cosine-similarity.ts` — the function that throws on dimension mismatch

---

- [x] 4. **Settings toggle — "Use Local Embedding Model"**

  **What to do**:
  - Find the Settings page/component in `ogre-desktop/src/` (likely `src/pages/Settings.svelte` or similar)
  - Add a toggle/checkbox: **"Use local embedding model (free, no API calls)"**
  - Subtext: `"Uses all-MiniLM-L6-v2 running locally. First use takes ~10 seconds to load. Switching models requires re-embedding your history."`
  - Save the setting as `useLocalEmbedding: boolean` in the existing config/settings store (follow existing settings persistence pattern)
  - When the toggle is switched ON and existing embeddings exist from a different model, show a warning banner: `"You have stored embeddings from a different model. Run 'Re-embed History' in the History section to update them."`
  - The setting must persist across app restarts
  - Pass the selected provider to `POST /api/embed` calls: when `useLocalEmbedding` is true, send `provider: "local"`; otherwise send the configured cloud provider as before

  **Must NOT do**:
  - Do NOT auto-trigger re-embedding when the toggle is switched — just show the warning
  - Do NOT change any other settings behavior
  - Do NOT break the existing provider selector (Ollama, OpenAI, etc.) — this is an additional toggle, not a replacement

  **Recommended Agent**: `visual-engineering`

  **References**:
  - Existing Settings UI — find and read before modifying
  - `ogre-desktop/src/lib/` — look for config/settings store pattern
  - `ogre-desktop/src/lib/vector-store.ts` — to understand what `embeddingModel` string to pass

---

- [x] 5. **Re-embed migration pipeline (`re-embed.ts` + UI trigger)**

  **What to do**:
  - Create `ogre-desktop/src/lib/re-embed.ts`:
    - Export `reEmbedAll(newModel: string, onProgress: (done: number, total: number) => void): Promise<{ updated: number, failed: number }>`
    - Fetches all stored embeddings from `response_embeddings` via `getAllEmbeddings()` (no model filter — get everything)
    - For each stored response text, calls `POST /api/embed` with the new provider (local or cloud)
    - Overwrites the existing row's `embedding` BLOB and `embedding_model` field in SQLite
    - Reports progress via `onProgress` callback (for UI progress bar)
    - Returns count of updated + failed rows
    - If embedding fails for a row, log the error and continue (don't abort the whole migration)
  - Add a **"Re-embed History"** button to the History page (or wherever embedding management lives — check `ogre-desktop/src/pages/` for a History page)
    - Button triggers `reEmbedAll()` with progress bar
    - Shows final result: `"Updated 47 embeddings to all-MiniLM-L6-v2"`
    - Only enabled when at least one embedding exists with a different model than the current setting

  **Must NOT do**:
  - Do NOT delete embeddings — overwrite in place (preserve session metadata, rubric_hash, score, etc.)
  - Do NOT make re-embedding automatic — user-triggered only
  - Do NOT run more than 1 embedding call at a time (sequential, not parallel) — avoid hammering the local model
  - Do NOT change the `response_embeddings` schema

  **Recommended Agent**: `unspecified-high`

  **References**:
  - `ogre-desktop/src/lib/vector-store.ts` — `getAllEmbeddings`, update functions
  - `ogre-desktop/src/lib/db.ts` — SQLite access pattern
  - Existing History page — read before modifying

---

- [x] 6. **Loading indicator for local model cold-start**

  **What to do**:
  - The first call to the local model takes 5–15 seconds. Without a loading state, the UI looks frozen.
  - Add a `/api/embed-status` GET endpoint to `grading-server/server.js` that returns `{ modelLoaded: boolean }` — reads from `isModelLoaded()` in `local-embedder.js`
  - In `ogre-desktop/src/`, find where grading sessions start (likely the BatchPanel or GradingPanel component)
  - Before the first embedding call in a session: check `/api/embed-status`. If `{ modelLoaded: false }`, show a loading banner: `"Loading local embedding model... (first use only)"`
  - Poll `/api/embed-status` every 2 seconds until loaded, then hide the banner
  - The banner should be non-blocking — the user can see it while waiting, but it shouldn't prevent navigation

  **Must NOT do**:
  - Do NOT block the UI thread waiting for model load — poll with setInterval or reactive polling
  - Do NOT show this indicator when using cloud providers (`useLocalEmbedding` is false)
  - Do NOT add the endpoint if the local provider case isn't enabled

  **Recommended Agent**: `visual-engineering`

  **References**:
  - `grading-server/server.js` — existing GET endpoint pattern
  - `grading-server/local-embedder.js` (created in Task 2) — `isModelLoaded()`
  - `ogre-desktop/src/components/grading/BatchPanel.svelte` — grading entry point

---

- [x] 7. **Server-side tests: `grading-server/test/local-embedder.test.js`**

  **What to do**:
  - Add test file `grading-server/test/local-embedder.test.js` using bun test
  - Tests:
    - `generateLocalEmbedding("hello world")` returns an array of length 384
    - All values in the returned array are finite numbers (no NaN, no Infinity)
    - Two calls with the same text return identical vectors (deterministic)
    - Two calls with different text return different vectors
    - `isModelLoaded()` returns false before first call, true after
  - Run `bun test test/local-embedder.test.js` and confirm all pass
  - Also run the full `bun test` suite to confirm no regressions in existing adapter tests

  **Must NOT do**:
  - Do NOT mock Transformers.js — these tests should use the real model (integration tests)
  - Do NOT set a short timeout — model load may take 10-15s on first run

  **Recommended Agent**: `quick`

  **References**:
  - `grading-server/test/embedding-adapters.test.js` — existing test pattern
  - `grading-server/local-embedder.js` (Task 2)

---

- [x] 8. **Desktop tests: vector-store + re-embed**

  **What to do**:
  - Update `ogre-desktop/src/lib/vector-store.test.ts`:
    - Update all test calls that passed optional `embeddingModel` to now pass required `embeddingModel` (fixes broken tests from Task 3 change)
    - Add test: calling `getEmbeddingsByRubricHash` without a model string is a TypeScript compile error (type-level test)
  - Create `ogre-desktop/src/lib/re-embed.test.ts`:
    - Mock `getAllEmbeddings` to return 3 fake embeddings with model `"openai-ada"` (1536d)
    - Mock the `POST /api/embed` call to return 384d vectors
    - Assert `reEmbedAll("Xenova/all-MiniLM-L6-v2", progress)` calls the embed endpoint 3 times
    - Assert all 3 rows are updated with new embedding and new model name
    - Assert `onProgress` is called with (1,3), (2,3), (3,3)
    - Assert return value is `{ updated: 3, failed: 0 }`
    - Add failure case: one embed call fails → assert `{ updated: 2, failed: 1 }`, other rows still updated
  - Run `npx vitest run` — all 1118+ tests pass

  **Must NOT do**:
  - Do NOT use real SQLite in unit tests — mock the DB layer
  - Do NOT test the Transformers.js model directly from desktop tests — that's the server's responsibility

  **Recommended Agent**: `unspecified-high`

  **References**:
  - `ogre-desktop/src/lib/vector-store.test.ts` — existing test file
  - `ogre-desktop/src/lib/re-embed.ts` (Task 5)
  - `ogre-desktop/src/lib/vector-store.ts` (Task 3)

---

- [x] 9. **End-to-end: compile sidecar with bundled model + full embed→grade cycle**

  **What to do**:
  - Run the full sidecar build command with the local model included:
    ```
    bun build --compile --target=bun-windows-x64 server.js --outfile ../ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe
    ```
  - Confirm the compiled binary starts correctly and `POST /api/embed` with `provider: "local"` returns a 384d vector
  - If the ONNX model can't be inlined, confirm the model file is adjacent to the binary and the binary finds it at startup
  - Perform a mock end-to-end test:
    1. Enable "Use Local Model" in Settings
    2. Grade 1 student in BatchPanel
    3. Confirm embedding is stored in SQLite with `embedding_model = "Xenova/all-MiniLM-L6-v2"` and embedding has 384 dimensions
    4. Trigger "Re-embed History" — confirm it runs successfully
    5. Disable "Use Local Model" in Settings — confirm cloud provider is used again for next session
  - Save evidence: screenshot of Settings toggle, console log showing "provider: local" embedding call, SQLite row with correct model

  **Must NOT do**:
  - Do NOT ship a binary without verifying it actually produces embeddings
  - Do NOT mark this task done without the full cycle test

  **Recommended Agent**: `unspecified-high` (+ `playwright` for UI steps)

  **References**:
  - `README.md` (ogre-desktop section) — sidecar build command
  - `grading-server/local-embedder.js` (Task 2)
  - `ogre-desktop/src/lib/re-embed.ts` (Task 5)
  - `ogre-desktop/src/pages/Settings.svelte` (Task 4)

---

- [x] F1. **Plan Compliance Audit** — `oracle`
- [x] F2. **Code Quality Review** — `unspecified-high`
- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
- [x] F4. **Scope Fidelity Check** — `deep`

---

## Future Phases (Breadcrumb for Phase 3 Planning)

> **Context for future Prometheus session**: Phase 2 completes local embedding via Transformers.js in the sidecar. Phase 3 introduces sqlite-vec for SQL-level vector search and multi-teacher calibration sharing.

### Phase 2 (THIS PLAN) — Local Embeddings, Single Teacher
- Transformers.js `all-MiniLM-L6-v2` in Bun sidecar (384d, ~23MB)
- No API calls for embeddings — fully offline capable
- Re-embed migration for switching from Phase 1 cloud embeddings
- Mandatory model filtering everywhere in vector-store.ts

### Phase 3 (FUTURE) — sqlite-vec + Multi-Teacher
**Trigger**: Dataset exceeds ~5,000 vectors (not realistic until 8+ semesters) OR multi-teacher sharing becomes an explicit product requirement.

**Key changes:**
- **sqlite-vec**: SQL-level `vec_distance()` instead of JS brute-force. Requires custom Tauri command with raw `rusqlite` (bypassing `tauri-plugin-sql`) OR statically compiling sqlite-vec into the Tauri binary. Needs a dedicated research spike.
- **Multi-teacher sharing**: Design decisions needed: shared network SQLite? REST sync API? How to handle privacy boundaries (teacher A shouldn't see teacher B's raw responses, only calibration vectors)? Rubric versioning across teachers?
- **GradingHistory interface**: If not implemented in Phase 2, formalize the abstraction boundary to make the SQLite→cloud vector DB swap possible in a future Phase 4.

### Design Decisions from Phase 2 That Enable Phase 3
- **Mandatory `embeddingModel` filtering**: All teachers on the same local model = embeddings are comparable across users — prerequisite for sharing.
- **`rubric_hash` field**: Enables cross-teacher rubric identity matching without sharing rubric text.
- **Privacy by default**: Student names already stripped. Phase 3 adds audit logging + encryption.
- **`/api/embed` contract stability**: Adding sqlite-vec doesn't change this endpoint — Phase 3 only changes the retrieval side.

### Key Research Spikes for Phase 3
1. **sqlite-vec in Tauri**: Test custom `rusqlite` Tauri command that bypasses `tauri-plugin-sql`. Can it coexist with the existing `tauri-plugin-sql` connection?
2. **Multi-teacher sharing protocol**: Design doc needed before any implementation — this is a product decision, not a technical one.
