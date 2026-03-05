# History-Aware Vector Search for O.G.R.E

## TL;DR

> **Quick Summary**: Add cross-session grading memory to O.G.R.E by embedding student responses after grading, storing them in SQLite, and retrieving similar past responses as calibration examples for future grading sessions. Pure JS cosine similarity for Phase 1 — no native extensions, no new dependencies beyond the existing stack.
> 
> **Deliverables**:
> - New `response_embeddings` SQLite table (Migration 10) with BLOB vector storage
> - `POST /api/embed` endpoint on grading server for embedding generation via configured AI provider
> - Pure JS cosine similarity module with comprehensive tests
> - Vector store CRUD module in desktop app (`vector-store.ts`)
> - Calibration retrieval service that finds similar past graded responses
> - Post-grading pipeline that embeds and stores results after each session
> - Pre-grading retrieval that injects historical calibration examples into the grading prompt
> - Rubric similarity search for reusing past calibration across similar rubrics
> - Privacy layer: student name stripping, student ID hashing
> - History page enhancement with embedding management UI
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Task 1 → Task 4 → Task 6 → Task 8 → Task 10 → F1-F4

---

## Context

### Original Request
User asked whether O.G.R.E should add a history-aware vector database for scalability, maintainability, and AI retrieval optimization. After extensive consultation, we determined that the existing SQLite infrastructure should be extended with vector embeddings stored as BLOBs, using pure JS cosine similarity for retrieval.

### Interview Summary
**Key Discussions**:
- **Goals**: Cross-session consistency, smarter rubric reuse, better AI quality, future-proofing for scale (user selected ALL options)
- **Scaling**: ALL dimensions — more history per teacher, multi-teacher/department, institutional/district SaaS, larger classes, API cost reduction
- **Technology**: sqlite-vec on existing SQLite (NOT Vectra, NOT separate DB) — user specifically asked about leveraging existing SQLite setup
- **Test Strategy**: TDD (test first) — RED-GREEN-REFACTOR for each task
- **Privacy**: Strip student names from stored embeddings, store only response text + score + rubric hash

**Research Findings**:
- **Vector DB ranking**: LanceDB > sqlite-vec > Transformers.js > Vectra — but sqlite-vec wins because SQLite already exists in the project
- **Data volume**: ~600 response embeddings + ~20 rubric embeddings per semester = ~620 vectors. Pure JS cosine similarity is perfectly adequate (<1ms for 600 vectors at 384 dimensions)
- **Embedding model compatibility**: Embeddings from different models are incompatible. Store `embedding_model` in metadata. Future: standardize on Transformers.js + all-MiniLM-L6-v2 (384d)
- **What to embed**: Student responses (whole document, 50-500 words) as primary unit. Rubric essay prompts as secondary. Score + feedback as metadata.
- **Grading patterns**: Calibration RAG (top 3 similar graded responses as few-shot examples), Explainable Grading (RATAS framework), Cross-Session Reuse

### Metis Review
**Identified Gaps** (addressed):
- **sqlite-vec extension loading is go/no-go gate**: `tauri-plugin-sql` uses `rusqlite` which may not support `loadExtension()` → **Mitigated**: Phase 1 uses pure JS cosine similarity (brute force). No native extension loading needed. sqlite-vec extension can be added in Phase 2 when dataset grows beyond ~5000 vectors.
- **Embedding API cost**: Embedding 600 responses per semester via API has negligible cost (~$0.02 with OpenAI ada-002). But Ollama users get it free. Store `embedding_model` to handle multi-model scenarios.
- **Two-runtime architecture**: Grading server (Bun/Hono) generates embeddings and grades. Desktop app (Tauri/Svelte) owns SQLite. New embedding endpoint on server; storage calls in desktop. Communication via existing HTTP bridge.

---

## Work Objectives

### Core Objective
Enable O.G.R.E to remember past grading sessions and use that memory to provide historically-calibrated, cross-session consistent grading by embedding student responses and retrieving similar past examples as calibration data for the AI grader.

### Concrete Deliverables
- `response_embeddings` table in SQLite (Migration 10 in `lib.rs`)
- `ResponseEmbedding` TypeScript interface in `db.ts`
- `cosine-similarity.ts` module with pure JS vector math
- `cosine-similarity.test.ts` comprehensive test suite
- `POST /api/embed` endpoint in `server.js`
- `embedding-adapters.js` module in grading-server (follows `providers.js` pattern)
- `embedding-adapters.test.js` test suite
- `vector-store.ts` module in desktop app for embedding CRUD
- `vector-store.test.ts` test suite
- `calibration-retrieval.ts` module for finding similar past responses
- `calibration-retrieval.test.ts` test suite
- Modified `buildBatchPrompt()` to accept and inject historical calibration examples
- Post-grading storage pipeline in desktop app
- Privacy utilities (name stripping, ID hashing)

### Definition of Done
- [x] `bun test` in grading-server passes all new embedding/adapter tests
- [x] `npx vitest run` in ogre-desktop passes all new vector-store/similarity/calibration tests
- [x] New Migration 10 compiles and runs without error on fresh SQLite database
- [x] `POST /api/embed` returns valid embedding vectors for each configured provider
- [x] After grading a session, response embeddings are stored in SQLite
- [x] Before grading, similar past responses are retrieved and injected into the grading prompt
- [x] No student names appear in stored embedding records
- [x] Rubric similarity search returns relevant past rubrics

### Must Have
- Pure JS cosine similarity (no native extension dependencies)
- Embedding vectors stored as BLOBs in existing SQLite database
- `embedding_model` stored with each vector for compatibility tracking
- Student name stripping before storage (FERPA compliance)
- `rubric_hash` field for grouping responses by rubric identity
- Works with ALL existing providers (Ollama, OpenAI, Anthropic, Gemini, GitHub Models)
- Graceful degradation: if no history exists, grading works exactly as before
- TDD: tests written before implementation for every module

### Must NOT Have (Guardrails)
- **NO native extension loading** (no sqlite-vec, no `loadExtension()`, no WASM) — Phase 1 is pure JS only
- **NO new databases** — everything in existing SQLite via `tauri-plugin-sql`
- **NO student names in embeddings** — strip before storage, hash student IDs
- **NO breaking changes to existing grading flow** — historical calibration is additive, not replacing existing anchors/bridge responses
- **NO mandatory embedding** — if user hasn't graded before (empty history), grading works exactly as today
- **NO changes to Chrome extension** — all changes are in desktop app and grading server
- **NO over-abstraction** — no abstract factory patterns, no strategy pattern interfaces. Direct, simple functions following existing codebase style
- **NO excessive JSDoc** — match existing codebase documentation density (brief `@param`/`@returns`, not paragraphs)
- **NO new npm/bun dependencies** for the core similarity search — pure JS math only

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: YES (both runtimes)
  - Desktop app: vitest (`npx vitest run`), config at `ogre-desktop/vitest.config.ts`, pattern at `src/**/*.test.ts`
  - Grading server: bun test (`bun test`), tests in `grading-server/test/*.test.js`
- **Automated tests**: TDD (test first) — RED-GREEN-REFACTOR
- **Framework**: vitest (desktop), bun test (server)
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Desktop modules (vector-store, cosine-similarity, calibration-retrieval)**: Use Bash — `npx vitest run src/lib/{module}.test.ts`
- **Server modules (embedding-adapters, embed endpoint)**: Use Bash — `bun test test/{module}.test.js`
- **Integration (post-grading pipeline, pre-grading retrieval)**: Use Bash — `bun test` + `npx vitest run` full suites
- **Migration (Rust compilation)**: Use Bash — `cargo check` in `ogre-desktop/src-tauri/`

---

## Execution Strategy

### Parallel Execution Waves

> Maximize throughput by grouping independent tasks into parallel waves.
> Each wave completes before the next begins.

```
Wave 1 (Start Immediately — foundation, all independent):
├── Task 1: Schema migration + types (Migration 10 in lib.rs + TS interface) [quick]
├── Task 2: Cosine similarity module + tests (pure JS vector math) [quick]
├── Task 3: Embedding provider adapters + POST /api/embed endpoint [unspecified-high]

Wave 2 (After Wave 1 — core modules, MAX PARALLEL):
├── Task 4: Vector store module (CRUD for embeddings in SQLite) [unspecified-high]
│           depends: Task 1 (schema + types)
├── Task 5: Privacy utilities (name stripping, ID hashing) + tests [quick]
│           depends: none from Wave 1, but logically grouped here

Wave 3 (After Wave 2 — integration):
├── Task 6: Calibration retrieval service [deep]
│           depends: Task 2 (cosine similarity), Task 4 (vector store)
├── Task 7: Post-grading storage pipeline [unspecified-high]
│           depends: Task 3 (embed endpoint), Task 4 (vector store), Task 5 (privacy)

Wave 4 (After Wave 3 — prompt integration + rubric search):
├── Task 8: Pre-grading retrieval + prompt injection [deep]
│           depends: Task 6 (calibration retrieval), Task 7 (storage pipeline)
├── Task 9: Rubric similarity search [quick]
│           depends: Task 4 (vector store), Task 6 (calibration retrieval)

Wave 5 (After Wave 4 — UI enhancement):
├── Task 10: History page enhancement + embedding management UI [visual-engineering]
│            depends: Task 4 (vector store), Task 7 (pipeline stores data)

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 4 → Task 6 → Task 8 → Task 10 → F1-F4
Parallel Speedup: ~55% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4 | 1 |
| 2 | — | 6 | 1 |
| 3 | — | 7 | 1 |
| 4 | 1 | 6, 7, 9 | 2 |
| 5 | — | 7 | 2 |
| 6 | 2, 4 | 8, 9 | 3 |
| 7 | 3, 4, 5 | 8 | 3 |
| 8 | 6, 7 | 10 | 4 |
| 9 | 4, 6 | F1-F4 | 4 |
| 10 | 4, 7 | F1-F4 | 5 |
| F1-F4 | 8, 9, 10 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3 agents** — T1 → `quick`, T2 → `quick`, T3 → `unspecified-high`
- **Wave 2**: **2 agents** — T4 → `unspecified-high`, T5 → `quick`
- **Wave 3**: **2 agents** — T6 → `deep`, T7 → `unspecified-high`
- **Wave 4**: **2 agents** — T8 → `deep`, T9 → `quick`
- **Wave 5**: **1 agent** — T10 → `visual-engineering`
- **FINAL**: **4 agents** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> TDD: Tests are written FIRST (RED), then implementation (GREEN), then cleanup (REFACTOR).

<!-- TASKS_START — individual task details inserted below by Edit calls -->

### Wave 1 — Foundation (all independent, start immediately)

- [x] 1. Schema Migration + Types (Migration 10: `response_embeddings` table)

  **What to do**:
  - RED: Write test in `ogre-desktop/src/lib/db.test.ts` that verifies the `ResponseEmbedding` interface shape matches expected fields (id, session_id, rubric_hash, student_response, score, feedback, embedding, embedding_model, created_at)
  - GREEN: Add `ResponseEmbedding` interface to `ogre-desktop/src/lib/db.ts` following the existing interface pattern (see `GradingSession` interface at line 15)
  - Add Migration 10 to `ogre-desktop/src-tauri/src/lib.rs` after Migration 9 (line 951). Follow exact `Migration` struct pattern:
    ```rust
    Migration {
        version: 10,
        description: "create_response_embeddings",
        sql: "CREATE TABLE IF NOT EXISTS response_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES grading_sessions(id),
    rubric_hash TEXT NOT NULL,
    student_response TEXT,
    score REAL NOT NULL,
    feedback TEXT,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_rubric_hash ON response_embeddings(rubric_hash);
    CREATE INDEX IF NOT EXISTS idx_embeddings_model ON response_embeddings(embedding_model);",
        kind: MigrationKind::Up,
    },
    ```
  - REFACTOR: Verify `cargo check` passes in `ogre-desktop/src-tauri/`

  **Must NOT do**:
  - Do NOT add any vector extension loading (`loadExtension`, sqlite-vec WASM, etc.)
  - Do NOT modify existing migrations 1-9
  - Do NOT add foreign key enforcement pragma (SQLite FK enforcement is off by default in this project)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single schema migration + one TypeScript interface — small, well-defined scope with clear patterns to follow
  - **Skills**: `[]`
    - No special skills needed — straightforward Rust struct + TypeScript interface
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: Not needed — migration pattern is copy-paste from existing migrations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4 (vector store needs the schema and types)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src-tauri/src/lib.rs:945-951` — Migration 9 pattern (the migration immediately before ours). Copy this exact struct format for Migration 10.
  - `ogre-desktop/src-tauri/src/lib.rs:816-952` — Full migration vec showing version numbering (1-9). Ours is version 10.
  - `ogre-desktop/src/lib/db.ts:15-29` — `GradingSession` interface pattern. Our `ResponseEmbedding` follows the same field naming convention (snake_case matching SQL columns).
  - `ogre-desktop/src/lib/db.ts:59-64` — `BatchSession` interface — simplest interface example for reference.

  **API/Type References** (contracts to implement against):
  - `ogre-desktop/src/lib/db.ts:1` — `import Database from '@tauri-apps/plugin-sql'` — the Database type used for all queries.
  - `ogre-desktop/src-tauri/src/lib.rs:818-819` — `Migration` struct fields: `version` (integer), `description` (string), `sql` (string), `kind` (MigrationKind::Up).

  **Test References** (testing patterns to follow):
  - `ogre-desktop/src/lib/db.test.ts` — Existing DB test file. Follow its describe/it pattern for the new interface type check.

  **WHY Each Reference Matters**:
  - `lib.rs` migrations: The executor MUST place Migration 10 at the exact right position (after line 951, before the closing `];` at line 952) and use the exact `Migration` struct format — any deviation causes a Rust compilation error.
  - `db.ts` interfaces: The `ResponseEmbedding` interface field names MUST exactly match the SQL column names because `tauri-plugin-sql` returns rows with column-name keys.

  **Acceptance Criteria**:
  - [ ] `ResponseEmbedding` interface exists in `ogre-desktop/src/lib/db.ts` with all 9 fields
  - [ ] Migration 10 exists in `lib.rs` with version: 10, creates `response_embeddings` table
  - [ ] `cargo check` passes in `ogre-desktop/src-tauri/` (Rust compiles)
  - [ ] `npx vitest run` passes in `ogre-desktop/` (TS interface test passes)

  **QA Scenarios:**

  ```
  Scenario: Rust compilation with new migration
    Tool: Bash
    Preconditions: Working Rust toolchain, existing codebase compiles
    Steps:
      1. Run `cargo check` in ogre-desktop/src-tauri/
      2. Verify exit code is 0
      3. Grep output for "error" — should find none
    Expected Result: Clean compilation, exit code 0, no errors
    Failure Indicators: Any `error[E...]` in output, non-zero exit code
    Evidence: .sisyphus/evidence/task-1-cargo-check.txt

  Scenario: TypeScript interface type correctness
    Tool: Bash
    Preconditions: ogre-desktop dependencies installed
    Steps:
      1. Run `npx vitest run src/lib/db.test.ts` in ogre-desktop/
      2. Verify new test for ResponseEmbedding passes
    Expected Result: All tests pass including new interface shape test
    Failure Indicators: Test failure mentioning ResponseEmbedding
    Evidence: .sisyphus/evidence/task-1-vitest.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-cargo-check.txt — cargo check output
  - [ ] task-1-vitest.txt — vitest run output

  **Commit**: YES
  - Message: `feat(db): add response_embeddings schema (migration 10)`
  - Files: `ogre-desktop/src-tauri/src/lib.rs`, `ogre-desktop/src/lib/db.ts`, `ogre-desktop/src/lib/db.test.ts`
  - Pre-commit: `cargo check && npx vitest run`

---

- [x] 2. Cosine Similarity Module + Tests (Pure JS Vector Math)

  **What to do**:
  - RED: Create `ogre-desktop/src/lib/cosine-similarity.test.ts` with tests:
    - Identical vectors → similarity 1.0
    - Orthogonal vectors → similarity 0.0
    - Opposite vectors → similarity -1.0
    - Real-world-like 384-dimension vectors → correct similarity
    - Zero vector handling → returns 0 (no NaN/Infinity)
    - Mismatched dimensions → throws descriptive error
    - `findTopK()` — returns top K most similar vectors sorted by score descending
    - `findTopK()` — empty candidates → returns empty array
    - `findTopK()` — K larger than candidates → returns all candidates
    - Performance: 600 vectors × 384 dimensions completes in < 50ms
  - GREEN: Create `ogre-desktop/src/lib/cosine-similarity.ts` with:
    - `cosineSimilarity(a: Float32Array, b: Float32Array): number` — dot product / (magnitude_a × magnitude_b)
    - `findTopK(query: Float32Array, candidates: { id: number; embedding: Float32Array }[], k: number): { id: number; score: number }[]`
    - Use `Float32Array` for embeddings (memory efficient, ~1.5KB per 384d vector vs ~3KB for number[])
  - REFACTOR: Optimize hot loop if needed (precompute magnitudes for batch search)

  **Must NOT do**:
  - Do NOT import any external math/vector libraries — pure JS only
  - Do NOT use `number[]` for vectors — use `Float32Array`
  - Do NOT add HNSW or any approximate nearest neighbor algorithms — brute force is fine for <5000 vectors

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file pure math module with straightforward test cases. No external dependencies, no complex integration.
  - **Skills**: `[]`
    - No special skills needed — basic vector math
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: Simple math module doesn't need style guidance beyond matching project conventions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 6 (calibration retrieval uses cosine similarity)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/db.ts` — Module export style: named exports, no default export
  - `ogre-desktop/vitest.config.ts` — Test config: `environment: 'node'`, `include: ['src/**/*.test.ts']`. New test file must be at `src/lib/cosine-similarity.test.ts` to be discovered.

  **External References** (algorithms):
  - Cosine similarity formula: `dot(a,b) / (||a|| × ||b||)` where `||x|| = sqrt(sum(x_i^2))`
  - Float32Array docs: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Float32Array

  **WHY Each Reference Matters**:
  - `vitest.config.ts`: Test file MUST be placed at `src/lib/cosine-similarity.test.ts` (not `test/` or `__tests__/`) to be discovered by vitest's include glob.
  - `db.ts` export style: Follow named export pattern so the module integrates consistently with the rest of the codebase.

  **Acceptance Criteria**:
  - [ ] `cosine-similarity.ts` exports `cosineSimilarity()` and `findTopK()`
  - [ ] `cosine-similarity.test.ts` has ≥10 test cases covering all scenarios listed above
  - [ ] `npx vitest run src/lib/cosine-similarity.test.ts` → all tests pass
  - [ ] Performance test: 600 vectors × 384d search completes in < 50ms

  **QA Scenarios:**

  ```
  Scenario: All similarity tests pass
    Tool: Bash
    Preconditions: ogre-desktop dependencies installed
    Steps:
      1. Run `npx vitest run src/lib/cosine-similarity.test.ts` in ogre-desktop/
      2. Check output for "Tests: X passed, 0 failed"
    Expected Result: All 10+ tests pass with 0 failures
    Failure Indicators: Any test failure or "FAIL" in output
    Evidence: .sisyphus/evidence/task-2-cosine-tests.txt

  Scenario: Performance benchmark passes
    Tool: Bash
    Preconditions: cosine-similarity module implemented
    Steps:
      1. Run the vitest suite which includes a performance test
      2. Verify the performance test (600 vectors × 384d) completes in < 50ms
    Expected Result: Performance test passes within time budget
    Failure Indicators: Test timeout or assertion that elapsed > 50ms
    Evidence: .sisyphus/evidence/task-2-performance.txt

  Scenario: Zero vector edge case handled gracefully
    Tool: Bash
    Preconditions: cosine-similarity module implemented
    Steps:
      1. Run vitest — the zero-vector test case should return 0, not NaN or Infinity
    Expected Result: cosineSimilarity(zeroVec, anyVec) returns 0
    Failure Indicators: NaN, Infinity, or thrown exception
    Evidence: .sisyphus/evidence/task-2-edge-cases.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-cosine-tests.txt — full vitest output
  - [ ] task-2-performance.txt — performance test output showing elapsed time
  - [ ] task-2-edge-cases.txt — edge case test results

  **Commit**: YES
  - Message: `feat(vector): add pure JS cosine similarity module`
  - Files: `ogre-desktop/src/lib/cosine-similarity.ts`, `ogre-desktop/src/lib/cosine-similarity.test.ts`
  - Pre-commit: `npx vitest run src/lib/cosine-similarity.test.ts`

---

- [x] 3. Embedding Provider Adapters + `POST /api/embed` Endpoint

  **What to do**:
  - RED: Create `grading-server/test/embedding-adapters.test.js` with tests:
    - `buildOllamaEmbeddingRequest()` — correct URL, headers, body shape for Ollama's `/api/embeddings` endpoint
    - `buildOpenAIEmbeddingRequest()` — correct URL, headers, body for OpenAI's `/v1/embeddings` endpoint (model: `text-embedding-3-small`)
    - `buildAnthropicEmbeddingRequest()` — falls back to OpenAI-compatible endpoint (Anthropic doesn't have native embeddings; use Voyage AI or error with helpful message)
    - `buildGeminiEmbeddingRequest()` — correct URL, body for Gemini's `embedContent` endpoint
    - `buildGitHubModelsEmbeddingRequest()` — correct URL, headers for GitHub Models (OpenAI-compatible embeddings)
    - `parseEmbeddingResponse()` — extracts float array from each provider's response format
    - Error handling: missing API key → descriptive error, invalid response shape → descriptive error
  - GREEN: Create `grading-server/embedding-adapters.js` following the exact pattern of `grading-server/providers.js`:
    - One `build{Provider}EmbeddingRequest(config, text)` function per provider
    - One `parse{Provider}EmbeddingResponse(response)` function per provider
    - Each returns `{ url, headers, body }` for request, `Float32Array` for response
  - GREEN: Add `POST /api/embed` endpoint to `grading-server/server.js`:
    - Request body: `{ provider, model, apiKey?, apiUrl?, text }` (or `texts` for batch)
    - Response: `{ embedding: number[], dimensions: number, model: string }`
    - Use `withRetry()` from `ai-retry.js` for resilience
    - Use existing `resolveProviderConfig()` for provider config resolution
  - REFACTOR: Ensure error messages guide user to fix issues (e.g., "Anthropic does not support embeddings natively. Configure OpenAI or use Ollama for embeddings.")

  **Must NOT do**:
  - Do NOT add new npm/bun dependencies for embedding
  - Do NOT call embedding APIs in tests — mock all HTTP responses
  - Do NOT store embeddings in this task — just generate them. Storage is Task 4.
  - For Anthropic: Do NOT silently fail. Return a clear error explaining that Anthropic lacks native embeddings and suggest alternatives.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-provider adapter module with HTTP endpoint — touches server.js (1861 lines) and follows complex existing patterns. Needs careful attention to each provider's embedding API format.
  - **Skills**: `[]`
    - No special skills needed — follows existing providers.js pattern
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: The existing `providers.js` IS the style guide for this task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 7 (post-grading pipeline calls /api/embed)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `grading-server/providers.js:26-60` — `buildOllamaRequest()` function. The embedding adapter for Ollama follows this EXACT structure: normalize URL, build headers, build body. Ollama embedding endpoint is `/api/embeddings` (not `/api/embed`).
  - `grading-server/providers.js` (full file, 383 lines) — All 5 provider adapters. Each has a `build{Provider}Request()` and `parse{Provider}Response()`. Embedding adapters mirror this pattern exactly.
  - `grading-server/server.js:1307-1369` — `POST /api/grade` endpoint. Follow this pattern for the new `POST /api/embed` endpoint: parse body, validate required fields, resolve provider config, call adapter, return response.
  - `grading-server/server.js:49-50` — Provider config state and imports. New endpoint uses the same `resolveProviderConfig()` function.
  - `grading-server/ai-retry.js` — `withRetry()` wrapper for resilient AI calls. Use this for embedding API calls.

  **API/Type References** (embedding API contracts):
  - Ollama embeddings: `POST {apiUrl}/api/embeddings` body: `{ model, prompt }` response: `{ embedding: number[] }`
  - OpenAI embeddings: `POST {apiUrl}/v1/embeddings` body: `{ model, input }` response: `{ data: [{ embedding: number[] }] }`
  - Gemini embeddings: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent` body: `{ content: { parts: [{ text }] } }` response: `{ embedding: { values: number[] } }`
  - GitHub Models: OpenAI-compatible — same as OpenAI format with `https://models.inference.ai.azure.com` base URL

  **Test References** (testing patterns to follow):
  - `grading-server/test/providers.test.js` — Existing provider tests. Follow this exact describe/it/expect pattern for embedding adapter tests.
  - `grading-server/test/grading.test.js` — Additional test pattern reference.

  **WHY Each Reference Matters**:
  - `providers.js` adapters: Embedding adapters MUST follow the identical build/parse pattern because the new `/api/embed` endpoint dispatches to them the same way `/api/grade` dispatches to chat providers.
  - `server.js:1307` grade endpoint: The embed endpoint follows the same validation → resolve → call → respond flow.
  - `ai-retry.js`: Embedding API calls can fail transiently (rate limits, timeouts). `withRetry()` provides the same resilience as grading calls.

  **Acceptance Criteria**:
  - [ ] `embedding-adapters.js` exports build/parse functions for Ollama, OpenAI, Gemini, GitHub Models
  - [ ] Anthropic embedding request returns a clear error message (not a silent failure)
  - [ ] `POST /api/embed` endpoint exists in server.js and returns `{ embedding, dimensions, model }`
  - [ ] `bun test test/embedding-adapters.test.js` → all tests pass
  - [ ] All API calls use `withRetry()` wrapper

  **QA Scenarios:**

  ```
  Scenario: All embedding adapter tests pass
    Tool: Bash
    Preconditions: grading-server dependencies installed (bun install)
    Steps:
      1. Run `bun test test/embedding-adapters.test.js` in grading-server/
      2. Check output for all tests passing
    Expected Result: All adapter tests pass (build functions produce correct shapes, parse functions extract embeddings)
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-adapter-tests.txt

  Scenario: Anthropic embedding request returns helpful error
    Tool: Bash
    Preconditions: embedding-adapters.js implemented
    Steps:
      1. In the test file, call buildAnthropicEmbeddingRequest() and verify it throws/returns an error
      2. Verify error message contains "Anthropic" and suggests alternatives
    Expected Result: Error message like "Anthropic does not support embeddings natively. Use Ollama or OpenAI for embeddings."
    Failure Indicators: Silent failure, generic error, or successful (incorrect) response
    Evidence: .sisyphus/evidence/task-3-anthropic-error.txt

  Scenario: POST /api/embed endpoint validation
    Tool: Bash (curl)
    Preconditions: grading-server running on port 3456
    Steps:
      1. `curl -s -X POST http://localhost:3456/api/embed -H 'Content-Type: application/json' -d '{}'`
      2. Verify response is 400 with error about missing required fields
      3. `curl -s -X POST http://localhost:3456/api/embed -H 'Content-Type: application/json' -d '{"provider":"ollama","model":"nomic-embed-text"}'`
      4. Verify response is 400 with error about missing "text" field
    Expected Result: Proper 400 errors with descriptive messages for missing fields
    Failure Indicators: 500 error, empty response, or 200 with no data
    Evidence: .sisyphus/evidence/task-3-endpoint-validation.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-adapter-tests.txt — bun test output for embedding adapters
  - [ ] task-3-anthropic-error.txt — Anthropic error handling test output
  - [ ] task-3-endpoint-validation.txt — curl validation test output

  **Commit**: YES
  - Message: `feat(embed): add embedding adapters and /api/embed endpoint`
  - Files: `grading-server/embedding-adapters.js`, `grading-server/test/embedding-adapters.test.js`, `grading-server/server.js`
  - Pre-commit: `bun test`


### Wave 2 — Core Modules (after Wave 1)

- [x] 4. Vector Store Module (CRUD for Embeddings in SQLite)

  **What to do**:
  - RED: Create `ogre-desktop/src/lib/vector-store.test.ts` with tests:
    - `storeEmbedding()` — inserts a row into `response_embeddings` with correct fields
    - `storeEmbedding()` — embedding stored as BLOB, retrievable as Float32Array
    - `getEmbeddingsByRubricHash()` — returns all embeddings for a given rubric hash
    - `getEmbeddingsByRubricHash()` — returns empty array when no matches
    - `getEmbeddingsByModel()` — filters by embedding_model
    - `getAllEmbeddings()` — returns all stored embeddings with metadata
    - `deleteEmbeddingsBySessionId()` — removes embeddings for a specific session
    - `getEmbeddingCount()` — returns total count of stored embeddings
    - BLOB serialization roundtrip: `Float32Array → Buffer → BLOB → Buffer → Float32Array` preserves values exactly
  - GREEN: Create `ogre-desktop/src/lib/vector-store.ts`:
    - `storeEmbedding(params: { sessionId: number, rubricHash: string, studentResponse: string, score: number, feedback: string, embedding: Float32Array, embeddingModel: string }): Promise<number>` — returns inserted row ID
    - `getEmbeddingsByRubricHash(rubricHash: string, embeddingModel?: string): Promise<StoredEmbedding[]>`
    - `getAllEmbeddings(embeddingModel?: string): Promise<StoredEmbedding[]>`
    - `deleteEmbeddingsBySessionId(sessionId: number): Promise<void>`
    - `getEmbeddingCount(): Promise<number>`
    - `StoredEmbedding` type: `{ id, sessionId, rubricHash, studentResponse, score, feedback, embedding: Float32Array, embeddingModel, createdAt }`
    - BLOB serialization helpers: `float32ToBuffer(arr: Float32Array): ArrayBuffer` and `bufferToFloat32(buf: ArrayBuffer): Float32Array`
    - Follow `db.ts` singleton pattern: `const database = await initDB()`
  - REFACTOR: Ensure all queries use parameterized `$1`, `$2` etc. (never string interpolation) matching existing `db.ts` pattern

  **Must NOT do**:
  - Do NOT add any vector search SQL (no `vec_distance`, no extension functions) — retrieval is done in JS via cosine-similarity module
  - Do NOT import or depend on cosine-similarity.ts — this module is pure CRUD, similarity search is in calibration-retrieval
  - Do NOT store student names — the `studentResponse` field contains response text only, names are stripped before calling storeEmbedding()
  - Do NOT add a new database file — use existing `sqlite:ogre.db` via `initDB()`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: CRUD module with BLOB serialization is straightforward but requires careful attention to the tauri-plugin-sql query patterns and Float32Array → Buffer → BLOB roundtrip correctness.
  - **Skills**: `[]`
    - No special skills needed — follows existing db.ts patterns
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: db.ts IS the style guide for this module

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Tasks 6, 7, 9 (all need vector store for reading/writing embeddings)
  - **Blocked By**: Task 1 (needs ResponseEmbedding type and schema)

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/db.ts:87-92` — `initDB()` singleton pattern. Vector store uses the SAME database instance via `await initDB()`.
  - `ogre-desktop/src/lib/db.ts:99-104` — `getProviderConfigs()` — SELECT query pattern with typed return.
  - `ogre-desktop/src/lib/db.ts:124-138` — `saveProviderConfig()` — INSERT with parameterized queries (`$1`, `$2`). Follow this for `storeEmbedding()`.
  - `ogre-desktop/src/lib/db.ts:1` — `import Database from '@tauri-apps/plugin-sql'` — same import needed.

  **API/Type References** (contracts to implement against):
  - `ogre-desktop/src/lib/db.ts:15-29` — `GradingSession` interface — the `session_id` foreign key references this table.
  - Task 1 output: `ResponseEmbedding` interface — the type returned by SELECT queries on `response_embeddings`.

  **Test References** (testing patterns to follow):
  - `ogre-desktop/src/lib/db.test.ts` — Existing DB test patterns. For vector-store tests, you'll need to mock `initDB()` since tests run in Node (not Tauri). Use vitest mocking: `vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }))`.

  **External References**:
  - Float32Array → Buffer conversion: `Buffer.from(float32Array.buffer)` and `new Float32Array(new Uint8Array(buffer).buffer)` — standard JS typed array serialization.

  **WHY Each Reference Matters**:
  - `db.ts` patterns: Vector store MUST use the same `initDB()` singleton and same query style (`database.select()`, `database.execute()`) because it shares the same SQLite database connection.
  - `db.test.ts` mocking: Tauri plugin-sql is not available in vitest's Node environment, so tests MUST mock the database module. This is the established pattern.
  - Float32Array serialization: Incorrect serialization (e.g., losing endianness or buffer offset) would corrupt embeddings silently. Roundtrip test is critical.

  **Acceptance Criteria**:
  - [ ] `vector-store.ts` exports all 5 CRUD functions + 2 serialization helpers
  - [ ] `vector-store.test.ts` has ≥9 test cases covering all scenarios above
  - [ ] `npx vitest run src/lib/vector-store.test.ts` → all tests pass
  - [ ] Float32Array roundtrip: store → retrieve produces identical values

  **QA Scenarios:**

  ```
  Scenario: All vector store CRUD tests pass
    Tool: Bash
    Preconditions: ogre-desktop dependencies installed, Task 1 complete (types exist)
    Steps:
      1. Run `npx vitest run src/lib/vector-store.test.ts` in ogre-desktop/
      2. Check output for all tests passing
    Expected Result: All 9+ tests pass with 0 failures
    Failure Indicators: Any test failure, especially BLOB serialization roundtrip
    Evidence: .sisyphus/evidence/task-4-vector-store-tests.txt

  Scenario: Float32Array → BLOB → Float32Array roundtrip integrity
    Tool: Bash
    Preconditions: vector-store module implemented
    Steps:
      1. Run the specific roundtrip test in vitest
      2. Verify that stored and retrieved Float32Array values match exactly (no precision loss)
    Expected Result: Byte-for-byte identical Float32Array after roundtrip through SQLite BLOB
    Failure Indicators: Value mismatch, NaN values, wrong array length
    Evidence: .sisyphus/evidence/task-4-blob-roundtrip.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-vector-store-tests.txt — full vitest output
  - [ ] task-4-blob-roundtrip.txt — roundtrip test output

  **Commit**: YES
  - Message: `feat(vector): add vector store CRUD module`
  - Files: `ogre-desktop/src/lib/vector-store.ts`, `ogre-desktop/src/lib/vector-store.test.ts`
  - Pre-commit: `npx vitest run src/lib/vector-store.test.ts`

---

- [x] 5. Privacy Utilities (Name Stripping + ID Hashing)

  **What to do**:
  - RED: Create `ogre-desktop/src/lib/privacy.test.ts` with tests:
    - `stripStudentName(response, name)` — removes exact name occurrences from response text
    - `stripStudentName()` — handles case variations ("John Smith", "john smith", "JOHN SMITH")
    - `stripStudentName()` — handles first-name-only mentions
    - `stripStudentName()` — returns original text if name not found
    - `stripStudentName()` — handles null/undefined name gracefully (returns response unchanged)
    - `hashStudentId(name)` — returns consistent hash for same input
    - `hashStudentId(name)` — different inputs produce different hashes
    - `hashStudentId()` — hash is not reversible (can't extract name from hash)
    - `sanitizeForStorage(response, studentName)` — convenience function combining strip + hash
  - GREEN: Create `ogre-desktop/src/lib/privacy.ts`:
    - `stripStudentName(response: string, name: string | null): string` — regex-based case-insensitive name removal, replaces with `[STUDENT]`
    - `hashStudentId(name: string): string` — SHA-256 hash (truncated to 16 hex chars) using Web Crypto API (`crypto.subtle.digest`)
    - `sanitizeForStorage(response: string, studentName: string | null): { sanitizedResponse: string, studentHash: string | null }` — combines both operations
  - REFACTOR: Ensure regex escapes special characters in names (e.g., names with hyphens, apostrophes)

  **Must NOT do**:
  - Do NOT import external hashing libraries — use Web Crypto API (available in both Node and browser)
  - Do NOT log or console.log student names during processing
  - Do NOT store original student names anywhere — only the hash and sanitized response

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small utility module with straightforward string operations and one hashing function. Well-scoped, no dependencies.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: Too simple to benefit from style guidance

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 7 (post-grading pipeline uses privacy utilities)
  - **Blocked By**: None (could have been Wave 1, but logically grouped with Wave 2)

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/lib/db.ts` — Module export style: named exports, TypeScript
  - `ogre-desktop/vitest.config.ts` — Test file must be at `src/lib/privacy.test.ts`

  **External References**:
  - Web Crypto API: `crypto.subtle.digest('SHA-256', data)` — available in Node 15+ and all modern browsers
  - `test-data/test-students.json` — Example student names and responses for understanding the data shape that privacy utils will process

  **WHY Each Reference Matters**:
  - `test-students.json`: Understanding the actual student data shape helps write realistic tests — students have `name` and `response` fields.
  - Web Crypto API: Using the built-in API avoids adding a dependency and works in both Tauri's webview and vitest's Node environment.

  **Acceptance Criteria**:
  - [ ] `privacy.ts` exports `stripStudentName()`, `hashStudentId()`, `sanitizeForStorage()`
  - [ ] `privacy.test.ts` has ≥9 test cases covering all scenarios above
  - [ ] `npx vitest run src/lib/privacy.test.ts` → all tests pass
  - [ ] Names with special characters (O'Brien, hyphenated names) handled correctly

  **QA Scenarios:**

  ```
  Scenario: All privacy utility tests pass
    Tool: Bash
    Preconditions: ogre-desktop dependencies installed
    Steps:
      1. Run `npx vitest run src/lib/privacy.test.ts` in ogre-desktop/
      2. Check output for all tests passing
    Expected Result: All 9+ tests pass with 0 failures
    Failure Indicators: Any test failure, especially name stripping edge cases
    Evidence: .sisyphus/evidence/task-5-privacy-tests.txt

  Scenario: Hash consistency and non-reversibility
    Tool: Bash
    Preconditions: privacy module implemented
    Steps:
      1. Run the hash tests — same input always produces same hash
      2. Verify hash is hex string of exactly 16 characters
      3. Verify different names produce different hashes
    Expected Result: Consistent, deterministic, non-reversible hashing
    Failure Indicators: Different hashes for same input, or identical hashes for different inputs
    Evidence: .sisyphus/evidence/task-5-hash-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-privacy-tests.txt — full vitest output
  - [ ] task-5-hash-tests.txt — hash-specific test output

  **Commit**: YES
  - Message: `feat(privacy): add name stripping and ID hashing utilities`
  - Files: `ogre-desktop/src/lib/privacy.ts`, `ogre-desktop/src/lib/privacy.test.ts`
  - Pre-commit: `npx vitest run src/lib/privacy.test.ts`


### Wave 3 — Integration (after Wave 2)

- [x] 6. Calibration Retrieval Service (Find Similar Past Responses)

  **What to do**:
  - RED: Create `ogre-desktop/src/lib/calibration-retrieval.test.ts` with tests:
    - `findSimilarResponses(queryEmbedding, rubricHash, options)` — returns top K similar past responses sorted by similarity score
    - Same rubric hash only: does NOT return responses from different rubrics
    - Respects `embeddingModel` filter: only searches vectors from matching model
    - Returns `{ id, score (similarity), studentResponse, gradingScore, feedback }` for each match
    - Empty embedding store → returns empty array (graceful degradation)
    - `getCalibrationExamples(queryEmbedding, rubricHash, options)` — returns tiered examples:
      - 1 excellent (highest score among similar), 1 adequate (median), 1 minimal (lowest) — mirroring existing bridge response tiers
    - Minimum similarity threshold: does NOT return results below 0.5 similarity
    - Multiple rubric hashes: correctly isolates per-rubric results
  - GREEN: Create `ogre-desktop/src/lib/calibration-retrieval.ts`:
    - `findSimilarResponses(queryEmbedding: Float32Array, rubricHash: string, options?: { k?: number, embeddingModel?: string, minSimilarity?: number }): Promise<SimilarResponse[]>`
    - `getCalibrationExamples(queryEmbedding: Float32Array, rubricHash: string, options?: { embeddingModel?: string, minSimilarity?: number }): Promise<CalibrationExamples>`
    - `CalibrationExamples` type: `{ excellent?: SimilarResponse, adequate?: SimilarResponse, minimal?: SimilarResponse, total: number }`
    - `SimilarResponse` type: `{ id: number, similarity: number, studentResponse: string, gradingScore: number, feedback: string }`
    - Internal flow: fetch embeddings from vector-store → compute cosine similarity → sort → filter → tier
    - Default `k = 10`, default `minSimilarity = 0.5`
  - REFACTOR: Add JSDoc for public functions only (brief, matching existing style)

  **Must NOT do**:
  - Do NOT call the embedding API — this module receives pre-computed embeddings as input
  - Do NOT modify vector-store.ts — use it as a dependency only
  - Do NOT implement any SQL-level similarity search — all similarity computation is in JS via cosine-similarity module

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Orchestrates two modules (cosine-similarity + vector-store) into a coherent retrieval pipeline. Requires understanding of tiered calibration examples and how they map to existing bridge response patterns.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: The existing `grading.js` bridge response pattern IS the design guide for tiered examples

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: Tasks 8, 9 (pre-grading retrieval and rubric search depend on calibration retrieval)
  - **Blocked By**: Task 2 (cosine similarity), Task 4 (vector store)

  **References**:

  **Pattern References** (existing code to follow):
  - `grading-server/grading.js:183-206` — `buildBridgeResponses()` tiered structure. **CRITICAL**: The `getCalibrationExamples()` output MUST mirror this tier structure (`excellent`, `adequate`, `minimal`) because Task 8 will inject these into the same prompt location where bridge responses go. The tier labels (`HIGH QUALITY`, `AVERAGE QUALITY`, `LOW QUALITY`) at line 191 are the exact labels the calibration examples will use.
  - `grading-server/grading.js:97` — `buildBatchPrompt()` signature shows `bridgeResponses` parameter. Historical calibration examples will be formatted identically to bridge responses.

  **API/Type References** (contracts to implement against):
  - Task 2 output: `cosineSimilarity(a, b)` and `findTopK(query, candidates, k)` from `cosine-similarity.ts`
  - Task 4 output: `getEmbeddingsByRubricHash()` and `StoredEmbedding` type from `vector-store.ts`

  **WHY Each Reference Matters**:
  - Bridge response structure: Historical calibration MUST use the same tier format because it's injected into the same prompt section. Mismatched formats would confuse the AI or be ignored.
  - cosine-similarity API: The retrieval service is the primary consumer of `findTopK()` — must match its return type exactly.

  **Acceptance Criteria**:
  - [ ] `calibration-retrieval.ts` exports `findSimilarResponses()` and `getCalibrationExamples()`
  - [ ] `calibration-retrieval.test.ts` has ≥8 test cases covering all scenarios above
  - [ ] `npx vitest run src/lib/calibration-retrieval.test.ts` → all tests pass
  - [ ] Tiered examples match bridge response structure (excellent/adequate/minimal)

  **QA Scenarios:**

  ```
  Scenario: All calibration retrieval tests pass
    Tool: Bash
    Preconditions: Tasks 2, 4 complete (cosine-similarity and vector-store exist)
    Steps:
      1. Run `npx vitest run src/lib/calibration-retrieval.test.ts` in ogre-desktop/
      2. Check output for all tests passing
    Expected Result: All 8+ tests pass with 0 failures
    Failure Indicators: Any test failure, especially tier assignment logic
    Evidence: .sisyphus/evidence/task-6-calibration-tests.txt

  Scenario: Graceful degradation with empty store
    Tool: Bash
    Preconditions: calibration-retrieval module implemented
    Steps:
      1. Run the empty-store test case — verify findSimilarResponses returns []
      2. Verify getCalibrationExamples returns { total: 0 } with no tier fields
    Expected Result: Empty array / zero-total object, no errors thrown
    Failure Indicators: Exception thrown, null/undefined returned instead of empty array
    Evidence: .sisyphus/evidence/task-6-empty-store.txt

  Scenario: Similarity threshold filtering
    Tool: Bash
    Preconditions: calibration-retrieval module implemented
    Steps:
      1. Run test with vectors that have similarity < 0.5 to query
      2. Verify they are excluded from results
    Expected Result: Only results with similarity >= 0.5 returned
    Failure Indicators: Low-similarity results included in output
    Evidence: .sisyphus/evidence/task-6-threshold.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-calibration-tests.txt — full vitest output
  - [ ] task-6-empty-store.txt — empty store graceful degradation test
  - [ ] task-6-threshold.txt — threshold filtering test

  **Commit**: YES
  - Message: `feat(calibration): add retrieval service for similar past responses`
  - Files: `ogre-desktop/src/lib/calibration-retrieval.ts`, `ogre-desktop/src/lib/calibration-retrieval.test.ts`
  - Pre-commit: `npx vitest run src/lib/calibration-retrieval.test.ts`

---

- [x] 7. Post-Grading Embedding Storage Pipeline

  **What to do**:
  - RED: Create `ogre-desktop/src/lib/grading-pipeline.test.ts` with tests:
    - `storeGradingResults(sessionId, rubric, results, providerConfig)` — calls embed endpoint for each student response, stores embeddings via vector-store
    - Batch mode: processes all results, not just one at a time
    - Privacy: student names are stripped before storage using privacy utilities
    - Rubric hash: SHA-256 hash of `rubric.essayPrompt + JSON.stringify(rubric.checklistItems)` for consistent rubric identity
    - Error resilience: if embedding fails for one student, continues with others (logs warning, doesn't throw)
    - Empty response handling: skips students with empty/null responses (no embedding generated)
    - Returns summary: `{ stored: number, skipped: number, errors: number }`
  - GREEN: Create `ogre-desktop/src/lib/grading-pipeline.ts`:
    - `storeGradingResults(params: { sessionId: number, rubric: Rubric, results: GradingResult[], providerConfig: { provider: string, model: string, apiUrl?: string, apiKey?: string } }): Promise<StorageSummary>`
    - `computeRubricHash(rubric: Rubric): Promise<string>` — SHA-256 of canonical rubric content (essay prompt + checklist items)
    - Internal flow per student:
      1. Skip if response is empty/null
      2. Strip student name using `sanitizeForStorage()`
      3. Call `POST /api/embed` on grading server with sanitized response text
      4. Call `storeEmbedding()` from vector-store with embedding + metadata
    - Use `Promise.allSettled()` for batch processing (don't fail on individual errors)
  - REFACTOR: Add progress logging that matches existing server console.log style

  **Must NOT do**:
  - Do NOT call embedding APIs directly — always go through the grading server's `/api/embed` endpoint
  - Do NOT block the grading UI — storage is fire-and-forget (async, non-blocking)
  - Do NOT store student names — use sanitizeForStorage() from privacy module
  - Do NOT retry failed embeddings in this task — the `/api/embed` endpoint already has `withRetry()`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Orchestrates 3 modules (privacy, embed endpoint, vector-store) into a pipeline. Needs to handle async batch processing with error resilience.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: Pipeline pattern is straightforward Promise.allSettled() — doesn't need style guidance

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: Task 8 (pre-grading retrieval needs stored data to retrieve)
  - **Blocked By**: Task 3 (embed endpoint), Task 4 (vector store), Task 5 (privacy)

  **References**:

  **Pattern References** (existing code to follow):
  - `grading-server/server.js:1307-1369` — POST /api/grade endpoint. The pipeline calls this server similarly to how the desktop app calls /api/grade. HTTP fetch pattern.
  - `ogre-desktop/src/lib/db.ts:124-138` — `saveProviderConfig()` — pattern for calling database write operations from the desktop app.

  **API/Type References** (contracts to implement against):
  - Task 3 output: `POST /api/embed` endpoint — `{ provider, model, apiKey?, apiUrl?, text }` → `{ embedding, dimensions, model }`
  - Task 4 output: `storeEmbedding()` from `vector-store.ts` — stores embedding with metadata
  - Task 5 output: `sanitizeForStorage()` from `privacy.ts` — strips names, returns hash
  - `test-data/test-rubric.json` — Example rubric shape (essayPrompt, checklistItems, rubricItems, modelText, maxScore)
  - `test-data/test-students.json` — Example student data shape (name, response)

  **WHY Each Reference Matters**:
  - `/api/embed` endpoint: The pipeline is the primary client of this endpoint. Must send correct request shape.
  - `test-data/` files: Understanding the rubric and student shapes is critical for computing the rubric hash correctly and extracting the right fields.
  - Privacy module: MUST be called before storage — this is the FERPA compliance boundary.

  **Acceptance Criteria**:
  - [ ] `grading-pipeline.ts` exports `storeGradingResults()` and `computeRubricHash()`
  - [ ] `grading-pipeline.test.ts` has ≥7 test cases covering all scenarios above
  - [ ] `npx vitest run src/lib/grading-pipeline.test.ts` → all tests pass
  - [ ] Student names are stripped before any storage call (verified by test)
  - [ ] Empty responses are skipped, not embedded
  - [ ] Failed embeddings don't crash the pipeline

  **QA Scenarios:**

  ```
  Scenario: All pipeline tests pass
    Tool: Bash
    Preconditions: Tasks 3, 4, 5 complete
    Steps:
      1. Run `npx vitest run src/lib/grading-pipeline.test.ts` in ogre-desktop/
      2. Check output for all tests passing
    Expected Result: All 7+ tests pass with 0 failures
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-7-pipeline-tests.txt

  Scenario: Privacy enforcement — no student names stored
    Tool: Bash
    Preconditions: pipeline module implemented
    Steps:
      1. Run the privacy test case that verifies storeEmbedding() is called with sanitized text
      2. Verify the mock shows studentResponse does NOT contain original student name
    Expected Result: sanitizeForStorage() called for every student, names replaced with [STUDENT]
    Failure Indicators: Original student name appears in storeEmbedding() call arguments
    Evidence: .sisyphus/evidence/task-7-privacy-check.txt

  Scenario: Error resilience — individual failures don't crash batch
    Tool: Bash
    Preconditions: pipeline module implemented
    Steps:
      1. Run the error-resilience test: mock embed endpoint to fail for student 3 of 5
      2. Verify pipeline completes with { stored: 4, errors: 1 }
    Expected Result: 4 students stored, 1 error logged, no exception thrown
    Failure Indicators: Pipeline throws exception, or stored count is wrong
    Evidence: .sisyphus/evidence/task-7-error-resilience.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-pipeline-tests.txt — full vitest output
  - [ ] task-7-privacy-check.txt — privacy enforcement test output
  - [ ] task-7-error-resilience.txt — error resilience test output

  **Commit**: YES
  - Message: `feat(pipeline): add post-grading embedding storage pipeline`
  - Files: `ogre-desktop/src/lib/grading-pipeline.ts`, `ogre-desktop/src/lib/grading-pipeline.test.ts`
  - Pre-commit: `npx vitest run src/lib/grading-pipeline.test.ts`


### Wave 4 — Prompt Integration + Rubric Search (after Wave 3)

- [x] 8. Pre-Grading Retrieval + Prompt Injection

  **What to do**:
  - RED: Add tests to `grading-server/test/grading.test.js`:
    - `buildBatchPrompt()` with `calibrationExamples` parameter — injects historical examples into prompt in the same format as bridge responses
    - `calibrationExamples` present → prompt contains `HISTORICAL CALIBRATION EXAMPLES` section with tiered examples
    - `calibrationExamples` null/empty → prompt is unchanged (graceful degradation)
    - `calibrationExamples` AND `bridgeResponses` both present → both appear in prompt (historical calibration comes BEFORE bridge responses)
  - RED: Add test to `grading-server/test/embedding-adapters.test.js` (or new file):
    - `POST /api/grade` with `calibrationExamples` field → examples are passed through to `buildBatchPrompt()`
  - GREEN: Modify `grading-server/grading.js`:
    - Add `calibrationExamples` parameter to `buildBatchPrompt()` signature: `buildBatchPrompt(rubric, students, anchors, bridgeResponses, calibrationExamples)`
    - After bridge responses section (line ~206), add `HISTORICAL CALIBRATION EXAMPLES` section:
      ```
      HISTORICAL CALIBRATION EXAMPLES (from previous grading sessions with similar rubrics — use to calibrate your scoring standard):
      HIGH QUALITY:
        - "[STUDENT]" = 9/10: Strong understanding of...
      AVERAGE QUALITY:
        - "[STUDENT]" = 6/10: Partial understanding...
      LOW QUALITY:
        - "[STUDENT]" = 3/10: Minimal engagement...
      ```
    - Format using same tier labels as bridge responses (line 191): `HIGH QUALITY`, `AVERAGE QUALITY`, `LOW QUALITY`
    - Add `HISTORICAL CONSISTENCY RULES` similar to existing `CONSISTENCY RULES` at line 200-204
  - GREEN: Modify `grading-server/server.js`:
    - In `POST /api/grade` handler (line 1307+), extract `calibrationExamples` from request body
    - Pass `calibrationExamples` to `buildBatchPrompt()` in the grading loop
  - GREEN: Create `ogre-desktop/src/lib/pre-grading-retrieval.ts` (or add to calibration-retrieval.ts):
    - `getHistoricalCalibration(rubric, providerConfig): Promise<CalibrationExamples | null>`
    - Flow:
      1. Compute rubric hash from rubric
      2. Embed the rubric's essay prompt (call `/api/embed`)
      3. Call `getCalibrationExamples()` from calibration-retrieval with the rubric embedding
      4. Return formatted examples ready for injection into grading request
    - If no historical data exists, return null (grading proceeds as normal)
  - REFACTOR: Ensure the prompt changes don't break existing grading.test.js tests

  **Must NOT do**:
  - Do NOT remove or modify existing bridge response logic — historical calibration is ADDITIVE
  - Do NOT make historical calibration mandatory — if null, prompt is unchanged
  - Do NOT change the JSON output format of the grading response — only the prompt input changes
  - Do NOT modify how existing `customInstructions` or `scoringAnchors` work

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Most complex task in the plan. Modifies the core grading prompt (grading.js is 969 lines), touches the main API endpoint, and creates a new retrieval orchestrator. Requires deep understanding of the existing prompt structure to inject historical examples WITHOUT disrupting the existing calibration chain.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: The existing grading.js prompt construction IS the pattern — must match exactly

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 9)
  - **Blocks**: Final verification wave
  - **Blocked By**: Task 6 (calibration retrieval), Task 7 (storage pipeline — needs stored data to exist)

  **References**:

  **Pattern References** (existing code to follow — CRITICAL):
  - `grading-server/grading.js:97` — `buildBatchPrompt(rubric, students, anchors, bridgeResponses)` — THE function being modified. Add `calibrationExamples` as 5th parameter with default `null`.
  - `grading-server/grading.js:178-206` — Bridge responses section. **READ THIS ENTIRE BLOCK CAREFULLY.** Historical calibration is formatted IDENTICALLY and placed immediately after this section. Same tier grouping, same label constants, same consistency rules format.
  - `grading-server/grading.js:191` — `tierLabels` constant: `{ excellent: 'HIGH QUALITY', adequate: 'AVERAGE QUALITY', ... }`. Historical calibration uses the SAME labels.
  - `grading-server/grading.js:199-205` — `CONSISTENCY RULES` block. Historical calibration adds a similar `HISTORICAL CONSISTENCY RULES` block.
  - `grading-server/server.js:1319` — Request body destructuring. Add `calibrationExamples` here.
  - `grading-server/server.js:1363-1369` — Chunk grading loop where `buildBatchPrompt()` is called. Pass `calibrationExamples` here.

  **API/Type References**:
  - Task 6 output: `getCalibrationExamples()` from `calibration-retrieval.ts` — returns `CalibrationExamples` type
  - Task 7 output: `computeRubricHash()` from `grading-pipeline.ts` — generates rubric hash for retrieval

  **Test References**:
  - `grading-server/test/grading.test.js` — Existing grading tests. Add new describe block for `calibrationExamples` parameter. Must NOT break existing tests.
  - `grading-server/test/prompts.test.js` — Existing prompt tests — additional pattern reference.

  **WHY Each Reference Matters**:
  - `grading.js:178-206` bridge responses: Historical calibration MUST be formatted identically because the AI model is already trained to interpret this format during grading. A different format would confuse calibration.
  - `server.js:1319` body destructuring: The new field must be extracted alongside existing fields in the same destructuring statement.
  - Existing tests: The `buildBatchPrompt()` signature change (adding 5th parameter) must be backward-compatible (default null) so ALL existing tests pass without modification.

  **Acceptance Criteria**:
  - [ ] `buildBatchPrompt()` accepts `calibrationExamples` as 5th parameter (default null)
  - [ ] When calibrationExamples provided, prompt contains `HISTORICAL CALIBRATION EXAMPLES` section
  - [ ] When calibrationExamples is null, prompt is IDENTICAL to before (no regression)
  - [ ] `POST /api/grade` accepts `calibrationExamples` in request body
  - [ ] All existing grading tests STILL PASS (no regressions)
  - [ ] `pre-grading-retrieval.ts` (or function) orchestrates: rubric hash → embed → retrieve → format
  - [ ] `bun test` passes in grading-server/
  - [ ] `npx vitest run` passes in ogre-desktop/

  **QA Scenarios:**

  ```
  Scenario: Existing grading tests pass (no regression)
    Tool: Bash
    Preconditions: grading.js modified with new parameter
    Steps:
      1. Run `bun test test/grading.test.js` in grading-server/
      2. Verify ALL existing tests pass with 0 failures
    Expected Result: Zero regressions — all existing tests pass unchanged
    Failure Indicators: Any existing test fails (signature change broke backward compat)
    Evidence: .sisyphus/evidence/task-8-no-regression.txt

  Scenario: Historical calibration injected into prompt
    Tool: Bash
    Preconditions: buildBatchPrompt modified, new tests written
    Steps:
      1. Run `bun test test/grading.test.js` in grading-server/
      2. Verify new calibrationExamples tests pass
      3. Verify prompt output contains "HISTORICAL CALIBRATION EXAMPLES" when examples provided
    Expected Result: New tests pass, prompt contains historical examples section with tier labels
    Failure Indicators: Missing section, wrong tier labels, or format mismatch with bridge responses
    Evidence: .sisyphus/evidence/task-8-prompt-injection.txt

  Scenario: Graceful degradation with null calibrationExamples
    Tool: Bash
    Preconditions: buildBatchPrompt modified
    Steps:
      1. Run test that calls buildBatchPrompt with calibrationExamples=null
      2. Compare prompt output to baseline (before any modifications)
    Expected Result: Identical prompt output when calibrationExamples is null
    Failure Indicators: Any difference in prompt output
    Evidence: .sisyphus/evidence/task-8-graceful-degradation.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-no-regression.txt — existing test suite output (proving no breakage)
  - [ ] task-8-prompt-injection.txt — new calibration test output
  - [ ] task-8-graceful-degradation.txt — null/empty calibration test output

  **Commit**: YES
  - Message: `feat(grading): inject historical calibration into grading prompt`
  - Files: `grading-server/grading.js`, `grading-server/server.js`, `grading-server/test/grading.test.js`, `ogre-desktop/src/lib/calibration-retrieval.ts` (or new pre-grading-retrieval.ts)
  - Pre-commit: `bun test && npx vitest run`

---

- [x] 9. Rubric Similarity Search

  **What to do**:
  - RED: Add tests to `ogre-desktop/src/lib/calibration-retrieval.test.ts`:
    - `findSimilarRubrics(rubricEmbedding, options)` — returns past rubric hashes sorted by similarity to current rubric
    - Different rubric with similar essay prompt → high similarity score
    - Completely unrelated rubric → low similarity / excluded by threshold
    - Returns rubric hash + similarity + sample grading statistics (mean score, count) per rubric
    - Empty store → returns empty array
  - GREEN: Add to `ogre-desktop/src/lib/calibration-retrieval.ts`:
    - `findSimilarRubrics(rubricEmbedding: Float32Array, options?: { k?: number, minSimilarity?: number, embeddingModel?: string }): Promise<SimilarRubric[]>`
    - `SimilarRubric` type: `{ rubricHash: string, similarity: number, responseCount: number, meanScore: number }`
    - Internal flow: get all unique rubric hashes from vector store → for each, compute average embedding → find top K similar
    - This enables: "You're grading a new rubric, but we found similar past rubrics with grading history. Want to use their calibration data?"
  - REFACTOR: Optimize if needed (pre-compute rubric centroid embeddings)

  **Must NOT do**:
  - Do NOT embed rubrics separately in their own table — compute rubric similarity from the response embeddings grouped by rubric_hash
  - Do NOT modify the response_embeddings schema — rubric similarity is computed from existing data
  - Do NOT auto-enable cross-rubric calibration — just make the search available for future UI integration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function addition to existing calibration-retrieval module. Builds on established patterns from Task 6.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `coding-standards`: Extends existing module — style is already established

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 8)
  - **Blocks**: Final verification wave
  - **Blocked By**: Task 4 (vector store), Task 6 (calibration retrieval patterns)

  **References**:

  **Pattern References** (existing code to follow):
  - Task 6 output: `calibration-retrieval.ts` — `findSimilarResponses()` pattern. `findSimilarRubrics()` follows the same retrieve → compute → sort → filter pattern.
  - Task 4 output: `vector-store.ts` — `getEmbeddingsByRubricHash()` for fetching per-rubric data, `getAllEmbeddings()` for getting all unique rubric hashes.

  **API/Type References**:
  - Task 2 output: `cosineSimilarity()` and `findTopK()` from `cosine-similarity.ts`
  - Task 4 output: `StoredEmbedding` type and CRUD functions from `vector-store.ts`

  **WHY Each Reference Matters**:
  - `calibration-retrieval.ts`: This function EXTENDS the existing module. Must follow the same export pattern, error handling, and type conventions.
  - `vector-store.ts`: Rubric similarity is computed by averaging embeddings per rubric hash — needs to fetch all embeddings grouped by hash.

  **Acceptance Criteria**:
  - [ ] `findSimilarRubrics()` exported from `calibration-retrieval.ts`
  - [ ] New tests in `calibration-retrieval.test.ts` for rubric similarity
  - [ ] `npx vitest run src/lib/calibration-retrieval.test.ts` → all tests pass (old + new)
  - [ ] Returns rubric hash, similarity score, response count, and mean score per rubric

  **QA Scenarios:**

  ```
  Scenario: Rubric similarity tests pass
    Tool: Bash
    Preconditions: Task 6 complete (calibration-retrieval module exists)
    Steps:
      1. Run `npx vitest run src/lib/calibration-retrieval.test.ts` in ogre-desktop/
      2. Verify ALL tests pass (Task 6 tests + new Task 9 rubric tests)
    Expected Result: All tests pass including new rubric similarity tests
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-9-rubric-similarity.txt

  Scenario: Cross-rubric discovery with similar prompts
    Tool: Bash
    Preconditions: calibration-retrieval extended with findSimilarRubrics
    Steps:
      1. Run test with two rubrics having similar essay prompts
      2. Verify similarity score is > 0.7
      3. Run test with unrelated rubrics
      4. Verify similarity score is < 0.5 or excluded by threshold
    Expected Result: Similar rubrics score high, dissimilar rubrics score low
    Failure Indicators: Similar rubrics score low, or dissimilar rubrics score high
    Evidence: .sisyphus/evidence/task-9-cross-rubric.txt
  ```

  **Evidence to Capture:**
  - [ ] task-9-rubric-similarity.txt — full vitest output
  - [ ] task-9-cross-rubric.txt — cross-rubric discovery test

  **Commit**: YES
  - Message: `feat(rubric): add rubric similarity search`
  - Files: `ogre-desktop/src/lib/calibration-retrieval.ts`, `ogre-desktop/src/lib/calibration-retrieval.test.ts`
  - Pre-commit: `npx vitest run src/lib/calibration-retrieval.test.ts`


### Wave 5 — UI Enhancement (after Wave 4)

- [x] 10. History Page Enhancement + Embedding Management UI

  **What to do**:
  - Enhance `ogre-desktop/src/pages/History.svelte` to surface embedding data:
    - Add an "Embeddings" column to the existing session table showing embedding count per session (e.g., "12 vectors" or "—" if none)
    - Add an "Embedding Status" badge per session row: "✓ Embedded" (green) / "Not Embedded" (grey)
    - Add a "Vector Database" summary card above the table showing:
      - Total embeddings stored
      - Unique rubrics with embeddings
      - Storage size estimate (count × ~1.5KB per 384d vector)
      - Embedding model(s) in use
    - Add "Delete Embeddings" button per session (calls `deleteEmbeddingsBySessionId()` from vector-store)
    - Add "Clear All Embeddings" button in the summary card (with confirmation dialog matching existing `clearHistory()` pattern)
    - When `clearHistory()` is called (existing button), also delete all embeddings for those sessions
  - Create a new `ogre-desktop/src/lib/embedding-stats.ts` module:
    - `getEmbeddingStats(): Promise<{ totalEmbeddings: number, uniqueRubrics: number, embeddingModels: string[], estimatedSizeKB: number }>`
    - `getSessionEmbeddingCounts(): Promise<Map<number, number>>` — maps session_id → embedding count
  - Tests for `embedding-stats.ts` in `ogre-desktop/src/lib/embedding-stats.test.ts`:
    - `getEmbeddingStats()` returns correct counts
    - `getSessionEmbeddingCounts()` returns correct per-session map
    - Empty database returns zeros

  **Must NOT do**:
  - Do NOT redesign the History page layout — add to existing table/structure
  - Do NOT show student response text in the UI (privacy — only show counts and metadata)
  - Do NOT add a separate "Embeddings" page — integrate into existing History page
  - Do NOT add any embedding generation or search controls in this task — this is display/management only

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Svelte UI component work. Adding columns to existing table, creating summary cards, styling badges — all frontend/UI tasks.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: The existing History.svelte already has established styling patterns — we're extending, not designing

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all prior tasks)
  - **Parallel Group**: Wave 5 (sequential after Wave 4)
  - **Blocks**: Final verification wave
  - **Blocked By**: Task 4 (vector store CRUD), Task 7 (post-grading pipeline stores data)

  **References**:

  **Pattern References** (existing code to follow):
  - `ogre-desktop/src/pages/History.svelte:1-90` — Existing History page script section. Import pattern, `loadData()`, `clearHistory()`, `onMount()`. New imports: `getEmbeddingCount`, `deleteEmbeddingsBySessionId` from vector-store, `getSessionEmbeddingCounts` from embedding-stats.
  - `ogre-desktop/src/pages/History.svelte:92-159` — Table structure with column visibility toggling (`visibleColumns.includes()`). Add new "embeddings" column following this exact pattern.
  - `ogre-desktop/src/pages/History.svelte:69-83` — `clearHistory()` pattern. Extend this to also delete embeddings: `await db.execute("DELETE FROM response_embeddings")`.
  - `ogre-desktop/src/pages/History.svelte:99` — `clear-btn` button styling. New "Delete Embeddings" button follows same style.

  **API/Type References**:
  - Task 4 output: `deleteEmbeddingsBySessionId()`, `getEmbeddingCount()` from `vector-store.ts`
  - New module: `embedding-stats.ts` — created in this task

  **WHY Each Reference Matters**:
  - `History.svelte:92-159` table structure: New column MUST follow the exact same conditional rendering pattern (`{#if visibleColumns.includes("embeddings")}`) to integrate with the existing column visibility system.
  - `clearHistory()` pattern: When user clears grading history, embeddings for those sessions become orphaned. Must cascade the delete.

  **Acceptance Criteria**:
  - [ ] History page shows embedding count per session row
  - [ ] "Vector Database" summary card displays total embeddings, unique rubrics, models, and estimated size
  - [ ] Delete embeddings per session works (calls vector-store.deleteEmbeddingsBySessionId)
  - [ ] "Clear All Embeddings" button works with confirmation dialog
  - [ ] Existing `clearHistory()` also clears associated embeddings
  - [ ] `embedding-stats.ts` exports `getEmbeddingStats()` and `getSessionEmbeddingCounts()`
  - [ ] `npx vitest run src/lib/embedding-stats.test.ts` → all tests pass
  - [ ] No student response text visible in the UI (privacy)

  **QA Scenarios:**

  ```
  Scenario: Embedding stats module tests pass
    Tool: Bash
    Preconditions: Tasks 1, 4 complete (schema and vector store exist)
    Steps:
      1. Run `npx vitest run src/lib/embedding-stats.test.ts` in ogre-desktop/
      2. Check output for all tests passing
    Expected Result: All 3+ tests pass with 0 failures
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-10-stats-tests.txt

  Scenario: History page renders without errors
    Tool: Bash
    Preconditions: All prior tasks complete, app buildable
    Steps:
      1. Run `npm run build` in ogre-desktop/ (Svelte compilation check)
      2. Verify no TypeScript or Svelte compilation errors
    Expected Result: Clean build with no errors
    Failure Indicators: TypeScript errors in History.svelte, import errors for new modules
    Evidence: .sisyphus/evidence/task-10-build-check.txt

  Scenario: Clear history cascades to embeddings
    Tool: Bash
    Preconditions: embedding-stats module implemented
    Steps:
      1. Run the cascade delete test — clearHistory should also delete from response_embeddings
      2. Verify getEmbeddingCount returns 0 after clearHistory
    Expected Result: Zero embeddings after clearing history
    Failure Indicators: Orphaned embeddings remain after history clear
    Evidence: .sisyphus/evidence/task-10-cascade-delete.txt
  ```

  **Evidence to Capture:**
  - [ ] task-10-stats-tests.txt — embedding-stats vitest output
  - [ ] task-10-build-check.txt — Svelte build output
  - [ ] task-10-cascade-delete.txt — cascade delete test

  **Commit**: YES
  - Message: `feat(ui): enhance History page with embedding management`
  - Files: `ogre-desktop/src/pages/History.svelte`, `ogre-desktop/src/lib/embedding-stats.ts`, `ogre-desktop/src/lib/embedding-stats.test.ts`
  - Pre-commit: `npx vitest run && npm run build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo check` in `ogre-desktop/src-tauri/`. Run `bun test` in grading-server. Run `npx vitest run` in ogre-desktop. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify TDD evidence (test files committed before or with implementation).
  Output: `Build [PASS/FAIL] | Server Tests [N pass/N fail] | Desktop Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: embed a response → store it → retrieve it → verify it appears in grading prompt. Test edge cases: empty history, mismatched embedding models, large response text, zero-score responses. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no native extensions loaded, no new databases, no student names in stored data, no breaking changes to existing grading flow. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message | Key Files | Pre-commit Check |
|------|---------------|-----------|-----------------|
| 1 | `feat(db): add response_embeddings schema (migration 10)` | `lib.rs`, `db.ts` | `cargo check` |
| 2 | `feat(vector): add pure JS cosine similarity module` | `cosine-similarity.ts`, `cosine-similarity.test.ts` | `npx vitest run` |
| 3 | `feat(embed): add embedding adapters and /api/embed endpoint` | `embedding-adapters.js`, `server.js`, `embedding-adapters.test.js` | `bun test` |
| 4 | `feat(vector): add vector store CRUD module` | `vector-store.ts`, `vector-store.test.ts` | `npx vitest run` |
| 5 | `feat(privacy): add name stripping and ID hashing utilities` | `privacy.ts`, `privacy.test.ts` | `npx vitest run` |
| 6 | `feat(calibration): add retrieval service for similar past responses` | `calibration-retrieval.ts`, `calibration-retrieval.test.ts` | `npx vitest run` |
| 7 | `feat(pipeline): add post-grading embedding storage pipeline` | `grading-pipeline.ts`, integration in UI | `npx vitest run` |
| 8 | `feat(grading): inject historical calibration into grading prompt` | `grading.js`, `server.js` | `bun test` |
| 9 | `feat(rubric): add rubric similarity search` | `calibration-retrieval.ts` (extended) | `npx vitest run` |
| 10 | `feat(ui): enhance History page with embedding management` | `History.svelte`, `embedding-stats.ts`, `embedding-stats.test.ts` | `npx vitest run && npm run build` |

---

## Success Criteria

### Verification Commands
```bash
# Desktop app tests (from ogre-desktop/)
npx vitest run                    # Expected: all tests pass including new vector/similarity/calibration tests

# Grading server tests (from grading-server/)
bun test                          # Expected: all tests pass including new embedding adapter tests

# Rust compilation check (from ogre-desktop/src-tauri/)
cargo check                       # Expected: compiles with Migration 10

# Full integration verification
# 1. Start desktop app → grading server starts as sidecar
# 2. Grade a batch of students (creates session)
# 3. Verify response_embeddings table has rows
# 4. Grade a second batch with same rubric
# 5. Verify grading prompt includes historical calibration examples
```

### Final Checklist
- [x] All "Must Have" present (pure JS similarity, BLOB storage, embedding_model field, name stripping, rubric_hash, all providers, graceful degradation, TDD)
- [x] All "Must NOT Have" absent (no native extensions, no new DBs, no student names in storage, no breaking changes, no Chrome extension changes, no over-abstraction, no excessive JSDoc, no new dependencies)
- [x] All server tests pass (`bun test`)
- [x] All desktop tests pass (`npx vitest run`)
- [x] Rust compiles (`cargo check`)
- [x] Empty history gracefully falls back to current behavior
- [x] Privacy: no student names in `response_embeddings` table

---

## Future Phases (Breadcrumb for Phase 2 & 3 Planning)

> **Context for future Prometheus session**: This plan is Phase 1 of a 3-phase scaling strategy for history-aware vector search in O.G.R.E. When the user asks about Phase 2 or Phase 3, use this breadcrumb to understand what was decided and what remains.

### Phase 1 (THIS PLAN) — Single Teacher, Local Machine
- Pure JS cosine similarity (brute force, <1ms for 600 vectors)
- Embeddings stored as BLOBs in existing SQLite via `tauri-plugin-sql`
- Embeddings generated by configured AI provider (OpenAI, Ollama, Gemini, GitHub Models)
- ~620 vectors/semester capacity (600 responses + 20 rubrics)
- "Download and double-click" deployment preserved
- `embedding_model` tracked per vector for future compatibility
- `GradingHistory` pattern designed for backend swappability

### Phase 2 (FUTURE) — Multi-Teacher, Local Embeddings
**Trigger**: When dataset grows beyond ~5,000 vectors OR multi-teacher sharing is needed.

**Key changes from Phase 1**:
- **sqlite-vec extension**: Replace pure JS cosine with SQL-level `vec_distance()` for faster search. Requires solving the `loadExtension()` gate in `tauri-plugin-sql`/`rusqlite`. Alternatives: compile sqlite-vec statically into the Tauri binary, or use a custom Tauri command that bypasses `tauri-plugin-sql`.
- **Transformers.js + all-MiniLM-L6-v2**: Local embedding model (384 dimensions, ~23MB, MIT license). Runs in-browser via WASM. Eliminates embedding API costs. All teachers use the same model = embeddings are comparable across users.
- **Multi-teacher shared calibration**: Department-level consistency. Design decisions needed:
  - How to share embeddings? (Shared SQLite file on network drive? REST API? Cloud sync?)
  - How to handle rubric versioning across teachers?
  - Privacy: teacher A shouldn't see teacher B's raw student responses, only aggregated calibration vectors
- **Migration**: Existing Phase 1 embeddings may need re-embedding if model changes (store `embedding_model` makes this detectable)

**Estimated prerequisite research**:
- Test sqlite-vec loading in `rusqlite` via Tauri custom command
- Benchmark Transformers.js WASM performance in Tauri webview
- Design multi-teacher data sharing protocol

### Phase 3 (FUTURE) — Institutional SaaS, Cloud Vector DB
**Trigger**: When O.G.R.E goes multi-school or SaaS.

**Key changes from Phase 2**:
- **pgvector on Supabase** or **Qdrant Cloud**: Replace SQLite with cloud-hosted vector database for horizontal scaling
- **Tenant isolation**: School/district-level data boundaries. Each institution's embeddings are isolated.
- **FERPA compliance suite**: Full audit logging, data retention policies, right-to-delete, encryption at rest
- **Embedding pipeline as microservice**: Separate embedding generation from the grading server. Batch embedding jobs, queue-based processing.
- **Cross-institutional calibration** (opt-in): Anonymized, aggregated calibration data shared across institutions for standardized grading benchmarks
- **Cost model**: Per-institution pricing based on embedding storage and API usage

**Architecture shift**:
- Desktop app becomes thin client (UI only)
- Grading server becomes a cloud API
- Vector store swaps from local SQLite to cloud pgvector/Qdrant
- The `GradingHistory` interface designed in Phase 1 enables this swap with minimal code changes

### Design Decisions Made in Phase 1 That Enable Future Phases
- **`embedding_model` field**: Tracks which model generated each vector. Enables re-embedding when switching models.
- **`rubric_hash` field**: Consistent rubric identity across sessions/teachers. Enables per-rubric retrieval without storing full rubric copies.
- **Privacy by default**: Student names already stripped in Phase 1. Phase 3 just adds audit logging and encryption.
- **Additive calibration**: Historical examples are injected alongside (not replacing) existing anchors/bridge responses. Phase 2 can add more calibration sources without redesign.
- **Provider-agnostic embedding**: The `/api/embed` endpoint abstracts the embedding provider. Swapping to Transformers.js in Phase 2 just adds a new adapter.

### Key Research Sessions (for context)
- **librarian** `ses_34bcb856cffeSWqFtzQ1VPKf89`: Embedded vector DB comparison (LanceDB, sqlite-vec, Vectra, Transformers.js)
- **librarian** `ses_34bcb5a0cffehk7CMrHg4Ne2ni`: Vector DB patterns for AI grading (Calibration RAG, FERPA, embedding strategies)
- **metis** `ses_34bb97209ffeDniKGt6WnBCMPJ`: Gap analysis identifying sqlite-vec loading as go/no-go gate
