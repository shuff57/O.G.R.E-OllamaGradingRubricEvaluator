# Vector Search Phase 2 - Notepad

## Session Context
- **Plan**: vector-search-phase2
- **Started**: 2026-03-04
- **Goal**: Local embeddings via Transformers.js in Bun sidecar

## Inherited Wisdom

## Spike Findings (Task 1) - 2026-03-04

### Package Choice
- Use `@huggingface/transformers@3.x` (v3), NOT `@xenova/transformers` (v2 legacy)
- v3 explicitly supports Bun, Deno, Node.js
- Model name `Xenova/all-MiniLM-L6-v2` works with both v2 and v3

### Performance (bun run, native backend, cached model)
- Cold start: 143ms (cached), 10.7s (first download)
- Per-inference: 2.3-3.1ms avg (384d embeddings)
- First inference after cold start: 7.7ms
- These are excellent numbers - 100x faster than cloud API round-trip

### Compiled Binary Blocker
- `bun build --compile` fails: NAPI v21 required by onnxruntime-node v1.21.0
- Bun 1.3.9 compiled binary only supports NAPI v[1, 17]
- Static import of onnxruntime-node means it loads even with globalThis override
- Workarounds: --external, symbol override, version pin - ALL failed
- This is a Bun limitation, tracked implicitly in Bun NAPI support roadmap

### Architecture Decision
- RECOMMENDED: Run embedding service via `bun run` (not compiled)
- Alternative: subprocess sidecar spawned by compiled server
- Model is NOT bundled inline - cached/downloaded at runtime (~22MB)
- Binary size delta with transformers.js JS code: only +1.4MB

### Cosine Similarity Validation
- Same sentence similarity: 1.0000 (correct)
- Different sentences: 0.384 (correct, < 0.5 threshold)
- 384d embeddings match expected MiniLM-L6-v2 output

## Task 2: Local Embedding Provider Integration - 2026-03-04

### Files Created/Modified
- `grading-server/local-embedder.js` — NEW: singleton pipeline wrapper
- `grading-server/embedding-adapters.js` — Added 'local' to SUPPORTED_EMBED_PROVIDERS + switch cases
- `grading-server/server.js` — Added local branch in existing /api/embed endpoint

### Pattern: Lazy Singleton for ML Models
- Dynamic `import()` of @huggingface/transformers (not top-level) so server starts fast
- `initPromise` guards against concurrent initialization (race condition safe)
- Error resets both `extractor` and `initPromise` so retry is possible
- Model loads on first `/api/embed?provider=local` call, not on server start

### API Shape Consistency
- Local provider returns same `{ embedding, dimensions, model }` as cloud providers
- `model` field is `'Xenova/all-MiniLM-L6-v2'` (not user-specified)
- `dimensions` is always 384 for this model
- `provider !== 'local' && !model` validation skip: local doesn't need model param

### Embedding Adapters Pattern
- `buildEmbedRequest` for 'local' returns sentinel `{ provider: 'local', text }` — no URL/headers
- `parseEmbedResponse` for 'local' reads `responseJson.embedding` (same as ollama format)
- Server short-circuits before calling buildEmbedRequest when provider='local'

### Context7 API Reference
- `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' })`
- `extractor(text, { pooling: 'mean', normalize: true })` → Tensor
- `.tolist()[0]` extracts the flat number array from the Tensor
