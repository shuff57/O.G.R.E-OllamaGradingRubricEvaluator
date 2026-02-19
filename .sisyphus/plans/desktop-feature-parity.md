# Desktop GradingPanel — Full Feature Parity with Chrome Extension

## TL;DR

> **Quick Summary**: Complete the desktop app's GradingPanel (in Browser page) to match all Chrome extension functionality — real AI grading, solver chat, batch grading via SSE, rubric library, webview screenshots, and inline provider/model selector. Moving away from the Chrome extension entirely.
> 
> **Deliverables**:
> - New `/api/chat` endpoint on grading server for single grading + solver chat
> - GradingPanel decomposed into 5 child components (ProviderSelector, RubricCard, StudentWorkCard, SolverChat, BatchPanel)
> - Real AI grading wired for all 3 modes (Grader, Solver, Batch)
> - Compact inline provider/model selector fetching from server
> - Rubric library integration with server CRUD
> - Webview-based screenshot capture (V1)
> - Unit tests for critical paths
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (server endpoint) + Task 2 (decompose) → Task 3 (provider selector) → Tasks 4/5/6 (AI wiring) → Task 9 (tests)

---

## Context

### Original Request
User wants to move all buttons and parts from each section of the Chrome extension into the desktop app's Browser page. The extension was recreated in the desktop's browser tab but is missing features present in the actual extension. Goal is to move away from the extension entirely and simplify to desktop-only.

### Interview Summary
**Key Discussions**:
- **Migration scope**: Full feature parity — UI + AI wiring, not just visual
- **AI integration**: Wire real AI calls (not simulated). Grading server sidecar at localhost:3456 handles all AI provider communication
- **Screenshots**: Implement capture. V1 uses webview-based capture (native Rust screen capture deferred)
- **Provider selector**: Compact inline dropdown in GradingPanel header
- **Solver chat**: Wire real multi-turn AI chat
- **Tests**: Critical paths only (service-layer, not Svelte component tests)

**Research Findings**:
- GradingPanel.svelte is 875 lines with simulated AI (TODO: Wave 3) — needs decomposition before adding features
- Grading server has no `/api/chat` endpoint — extension calls providers directly via `callProviderAI()` in providers.js. Desktop MUST go through server (API keys are server-side)
- SSE streaming for batch requires manual fetch+ReadableStream parsing (EventSource doesn't support Bearer auth headers)
- Server requires Bearer token auth on `/api/*` routes — must use `getHandshakeToken()` from provider-sync.ts
- `ScreenshotOverlay.svelte` is explicitly a placeholder ("coming in future update")
- `batch-grader.ts` has working DOM extraction/filling via webview `evalScript`, but grading step is stubbed (`applyGrade(student.index, 0, '')`)

### Metis Review
**Identified Gaps** (addressed):
- No `/api/chat` server endpoint → Task 1 adds it
- GradingPanel monolith (875 lines) → Task 2 decomposes into 5 components
- SSE auth header incompatibility → Task 6 uses manual fetch+ReadableStream
- Prompt templates needed for grading → Task 4 builds prompts following `prompts.js` patterns
- Server offline edge case → Tasks 3/4/5/6 all handle server-down gracefully
- Concurrent batch+single grading risk → Task 6 disables mode switching during batch

---

## Work Objectives

### Core Objective
Make the desktop GradingPanel a fully functional standalone replacement for the Chrome extension's sidepanel — real AI grading across all modes, rubric library, screenshots, and inline provider selection.

### Concrete Deliverables
- `grading-server/server.js` — new `POST /api/chat` endpoint
- `ogre-desktop/src/components/grading/` — 5 new child components
- `ogre-desktop/src/lib/grading-api.ts` — new service module for AI calls
- `ogre-desktop/src/lib/sse-parser.ts` — SSE stream parser with auth
- Updated `GradingPanel.svelte` — orchestrator wiring child components
- Updated `ScreenshotOverlay.svelte` — functional webview capture
- Test files for new service modules + server endpoint

### Definition of Done
- [ ] `cd grading-server && bun test` passes with new /api/chat tests
- [ ] `cd ogre-desktop && npx vitest run` passes with new service tests
- [ ] Grader mode produces real AI feedback (not simulated)
- [ ] Solver mode supports multi-turn conversation
- [ ] Batch mode grades students via /api/grade SSE and fills scores
- [ ] Provider/model selector fetches from server and changes are persisted
- [ ] Screenshot capture works on webview content

### Must Have
- Real AI grading calls via grading server (not simulated)
- Decomposed component architecture (not monolithic)
- Provider/model selector with server sync
- Rubric library integration
- Batch grading with SSE streaming and progress
- Solver multi-turn chat
- Webview screenshot capture
- Error handling for server-down and unconfigured provider states
- Unit tests for service modules

### Must NOT Have (Guardrails)
- **No rich contenteditable editor** — use plain textarea + MathField for V1 (contenteditable is a rabbit hole)
- **No discovery wizard** — use built-in MyOpenMath profile only. Site discovery is V2
- **No batch review mode** (per-student approve/skip) — auto mode only for V1
- **No native Rust screenshot capture** — V1 uses webview-based capture. Full-screen native capture is V2
- **No rubric AI import** (import from screenshot/highlighted text using AI) — V2
- **No rubric table editor** — text mode + library select only for V1
- **No image attachments in solver chat** — text-only chat for V1
- **No OAuth flows in GradingPanel** — OAuth handled by Settings page. GradingPanel reads active provider
- **No changes to existing /api/grade SSE contract** — extension still depends on it
- **No duplication of `callProviderDirect()`** — all AI calls go through grading server
- **No importing sidepanel.js patterns** — port behavior to Svelte 5 runes, not vanilla JS getElementById patterns
- **No TypeScript strict mode or linting changes** as part of this work

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest in ogre-desktop, bun test in grading-server)
- **Automated tests**: Tests-after (service layer tests after implementation)
- **Framework**: vitest (desktop), bun test (server)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

| Deliverable Type | Verification Tool | Method |
|------------------|-------------------|--------|
| Server endpoint | Bash (curl) | Send requests, assert status + response fields |
| Svelte components | Bash (vitest) | Import, render, assert state |
| Service modules | Bash (vitest) | Import, call functions, compare output |
| Integration | Bash (curl + vitest) | End-to-end service calls |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — no dependencies, MAX PARALLEL):
├── Task 1: Add /api/chat endpoint to grading server [unspecified-high]
└── Task 2: Decompose GradingPanel into child components [unspecified-high]

Wave 2 (After Wave 1 — core AI wiring, MAX PARALLEL):
├── Task 3: Build ProviderSelector + wire to server (depends: 1, 2) [unspecified-high]
├── Task 4: Wire single grading (Grader mode) to /api/chat (depends: 1, 2) [unspecified-high]
├── Task 5: Wire solver chat to /api/chat (depends: 1, 2) [unspecified-high]
└── Task 6: Wire batch grading to /api/grade SSE (depends: 1, 2) [deep]

Wave 3 (After Wave 2 — polish + tests):
├── Task 7: Build RubricCard with library integration (depends: 2) [unspecified-high]
├── Task 8: Implement webview screenshot capture V1 (depends: 2, 4) [unspecified-high]
└── Task 9: Add unit tests for new service functions (depends: 1, 4, 5, 6) [unspecified-high]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 3 → Task 4 → Task 9 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| 1 | — | 3, 4, 5, 6, 9 | 1 |
| 2 | — | 3, 4, 5, 6, 7, 8 | 1 |
| 3 | 1, 2 | 4, 5, 6 | 2 |
| 4 | 1, 2, 3 | 8, 9 | 2 |
| 5 | 1, 2, 3 | 9 | 2 |
| 6 | 1, 2, 3 | 9 | 2 |
| 7 | 2 | — | 3 |
| 8 | 2, 4 | — | 3 |
| 9 | 1, 4, 5, 6 | — | 3 |

### Agent Dispatch Summary

| Wave | # Parallel | Tasks → Agent Category |
|------|------------|----------------------|
| 1 | **2** | T1 → `unspecified-high`, T2 → `unspecified-high` |
| 2 | **4** | T3 → `unspecified-high`, T4 → `unspecified-high`, T5 → `unspecified-high`, T6 → `deep` |
| 3 | **3** | T7 → `unspecified-high`, T8 → `unspecified-high`, T9 → `unspecified-high` |
| FINAL | **4** | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx vitest run` in ogre-desktop + `bun test` in grading-server. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify Svelte 5 runes patterns are used correctly (`$state`, `$derived`, not legacy `let` reactivity).
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (provider selector → grading → response rendering). Test edge cases: empty state, server offline, invalid provider. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes. Verify "V1 Scope" / "Deferred to V2" boundaries were respected.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(server): add /api/chat endpoint for single grading and solver` | grading-server/server.js, grading-server/test/ | `bun test` |
| 2 | `refactor(desktop): decompose GradingPanel into child components` | ogre-desktop/src/components/grading/*.svelte, GradingPanel.svelte | `npx vitest run` |
| 3 | `feat(desktop): add ProviderSelector with server sync` | ogre-desktop/src/components/grading/ProviderSelector.svelte, grading-api.ts | `npx vitest run` |
| 4 | `feat(desktop): wire real AI grading for Grader mode` | StudentWorkCard.svelte, grading-api.ts, GradingPanel.svelte | `npx vitest run` |
| 5 | `feat(desktop): wire solver chat with multi-turn AI` | SolverChat.svelte, grading-api.ts | `npx vitest run` |
| 6 | `feat(desktop): wire batch grading via /api/grade SSE` | BatchPanel.svelte, sse-parser.ts, grading-api.ts | `npx vitest run` |
| 7 | `feat(desktop): add RubricCard with library integration` | RubricCard.svelte | `npx vitest run` |
| 8 | `feat(desktop): implement webview screenshot capture V1` | ScreenshotOverlay.svelte, browser.ts | `npx vitest run` |
| 9 | `test(desktop): add unit tests for grading API and SSE parser` | *.test.ts, *.test.js | `npx vitest run && bun test` |

---

## Success Criteria

### Verification Commands
```bash
cd grading-server && bun test           # Expected: all tests pass
cd ogre-desktop && npx vitest run       # Expected: all tests pass
curl -s http://localhost:3456/health    # Expected: {"status":"ok"}
curl -s http://localhost:3456/api/chat  # Expected: 405 (no GET) or 401 (no auth)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Server tests pass (`bun test`)
- [ ] Desktop tests pass (`npx vitest run`)
- [ ] GradingPanel decomposed into ≥5 child components
- [ ] No simulated/hardcoded AI responses remain
- [ ] Provider selector fetches from live server
- [ ] Batch grading uses SSE streaming
