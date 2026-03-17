# Cloud GPU Fallback via RunPod Serverless

## TL;DR

> **Quick Summary**: Add a serverless cloud GPU option (RunPod) so teachers without local hardware can run the finetuned `qwen3.5-9B-stat-grader` model. Uses the community `runpod-worker-ollama` Docker image (no custom Dockerfile). Includes auto-fallback from local Ollama (on ECONNREFUSED) and a manual "Ollama (Cloud)" provider toggle.
> 
> **Deliverables**:
> - RunPod adapter functions in providers.js (`buildRunPodRequest` / `parseRunPodResponse`)
> - Server-side auto-fallback logic (local ECONNREFUSED → cloud retry)
> - `ollama-cloud` provider option in settings UI
> - Cloud-specific config (env vars, extended timeouts, keep_alive override)
> - RunPod setup guide (README with community worker + Network Volume instructions)
> - Vitest tests for adapter, fallback logic, and config
> 
> **Estimated Effort**: Medium (6 implementation tasks, ~250 lines new code + tests)
> **Parallel Execution**: YES — 3 waves + final verification
> **Critical Path**: Task 1 (adapter) → Task 4 (fallback logic) → Task 6 (tests) → Final

---

## Context

### Original Request
Add a cloud GPU option for users who don't have the hardware to run the finetuned Ollama model locally. Must spin down on idle, spin up on request (~2 min cold start acceptable). Modal.com preferred, Bearer token auth, developer-hosted centrally.

### Interview Summary
**Key Discussions**:
- **Cloud provider**: RunPod Serverless — cheaper ($0.48/hr L4), faster cold starts (<200ms FlashBoot), community Ollama worker exists
- **Container**: Use community `runpod-worker-ollama` pre-built image (no custom Dockerfile). Model uploaded to RunPod Network Volume.
- **Deployment model**: Developer hosts centrally; teachers just toggle it on
- **Fallback behavior**: Both manual toggle (select "Ollama Cloud") AND auto-fallback (ECONNREFUSED → cloud)
- **Fallback trigger**: ECONNREFUSED only — Ollama 500s and slow responses don't trigger fallback
- **Auth**: RunPod API key (Bearer token in headers)
- **GPU**: L4 (24GB, $0.48/hr) sufficient for 5.6GB model
- **Tests**: After implementation, using vitest
- **Provider evolution**: Initially considered Modal (native Ollama API, simpler). Switched to RunPod for GitHub integration and cost. GitHub auto-deploy turned out to be moot (5.6GB GGUF can't go in Docker images), but RunPod's cost and cold start advantages stood.

**Research Findings**:
- RunPod Serverless: scale-to-zero, <200ms cold starts (FlashBoot), $0.48/hr L4
- Community `runpod-worker-ollama` (71 releases, actively maintained) runs Ollama in RunPod container
- RunPod API is NOT Ollama-compatible — uses `POST /v2/{endpoint_id}/runsync` with `{"input": {...}}` envelope
- Adapter layer needed: ~30 lines of `buildRunPodRequest` / `parseRunPodResponse` in providers.js
- GGUF stored on RunPod Network Volume, persists across scale-to-zero
- RunPod API key auth is native — no wrapper needed (simpler than Modal's auth)

### Metis Review
**Identified Gaps** (all addressed — original review was for Modal, adapted for RunPod):
- **API format mismatch**: RunPod uses its own request envelope, not Ollama API. RESOLVED: Adapter functions in providers.js
- **`resolveProviderConfig` bug**: `ollama-cloud` defaults to `localhost:11434`. RESOLVED: Guard + throw error if no `api_url`
- **`keep_alive` conflict**: Not directly applicable (RunPod adapter constructs its own payload), but cloud requests should still use `5m` inside the Ollama payload nested in RunPod envelope
- **Cold start UX**: RunPod FlashBoot is <200ms so less of an issue, but still add SSE progress event for fallback notification
- **Fetch timeout**: Default 30s may not survive initial model load. RESOLVED: 120s timeout for cloud requests
- **Modelfile parity**: Cloud model must match local params. RESOLVED: Upload exact Modelfile to Network Volume
- **Existing `ollama-cloud` scaffolding**: Switch case exists but currently routes to `buildOllamaRequest`. Will reroute to `buildRunPodRequest`.

---

## Work Objectives

### Core Objective
Enable teachers without local GPU hardware to grade via the finetuned `qwen3.5-9B-stat-grader` model running on Modal.com's serverless GPU, with zero cloud setup on the teacher's end and automatic fallback from local Ollama when it's not running.

### Concrete Deliverables
- Modified `grading-server/providers.js` — New `buildRunPodRequest()` and `parseRunPodResponse()` adapter functions + `keep_alive` override for cloud
- Modified `grading-server/server.js` — Reroute `ollama-cloud` through RunPod adapter, auto-fallback logic, extended timeout, SSE events
- Modified `grading-server/config.js` — Cloud env var support (`OGRE_RUNPOD_ENDPOINT_ID`, `OGRE_RUNPOD_API_KEY`)
- Modified `ogre-desktop/src/pages/settings/ProviderSettings.svelte` — Cloud provider option
- New `runpod/README.md` — Setup guide for community worker + Network Volume + model upload
- New `grading-server/test/cloud-fallback.test.js` — Vitest tests for adapter, fallback, and config

### Definition of Done
- [ ] `bun test` in `grading-server/` passes (all existing + new tests)
- [ ] `npx vitest run` in `ogre-desktop/` passes (all existing tests)
- [ ] `buildRunPodRequest` and `parseRunPodResponse` exported from providers.js
- [ ] `ollama-cloud` selectable in settings UI with endpoint URL + API key fields
- [ ] Auto-fallback triggers on ECONNREFUSED and does NOT trigger on HTTP 500
- [ ] `keep_alive` is `5m` in RunPod adapter, `60m` in local Ollama adapter
- [ ] RunPod setup guide exists in `runpod/README.md`

### Must Have
- RunPod adapter functions in providers.js (`buildRunPodRequest` / `parseRunPodResponse`)
- `ollama-cloud` routes through RunPod adapter (not Ollama adapter)
- RunPod API key auth in request headers
- Scale-to-zero via RunPod Serverless (zero cost when idle)
- Auto-fallback from local Ollama on ECONNREFUSED
- Manual toggle: teachers can explicitly select `ollama-cloud` as provider
- SSE progress event when falling back to cloud
- Extended fetch timeout (120s) for cloud cold starts
- `keep_alive: '5m'` in RunPod requests to not waste GPU credits
- Setup guide for community `runpod-worker-ollama` + Network Volume

### Must NOT Have (Guardrails)
- ❌ Cloud model management UI (upload GGUF, edit Modelfile from desktop)
- ❌ Multi-cloud support (Modal, Lambda, vast.ai, etc.) — RunPod only
- ❌ Cost dashboard or billing UI — use RunPod's dashboard
- ❌ Custom Dockerfile — use community `runpod-worker-ollama` pre-built image
- ❌ Automatic GPU tier selection — hardcode L4 with A10G fallback
- ❌ Monitoring/alerting system — use Modal's built-in
- ❌ Changes to the grading prompt/pipeline — infrastructure only
- ❌ Refactoring provider system into plugin architecture — extend minimally
- ❌ Docker/container build pipeline — single Python file via `modal deploy`
- ❌ Changes to the Chrome extension — desktop app only
- ❌ Per-user billing/accounts or multi-tenant isolation
- ❌ Fallback on HTTP 4xx/5xx — only ECONNREFUSED/network errors
- ❌ Changes to `ai-retry.js` — fallback is separate from retry

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest in both packages)
- **Automated tests**: Tests-after (write implementation first, then tests)
- **Framework**: vitest (bun test)
- **Pattern**: Follow existing test patterns in `ogre-desktop/src/lib/*.test.ts`

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Server changes**: Use Bash (curl, bun test) — call endpoints, assert responses
- **Modal script**: Use Bash (python3 syntax check) — validate without deploying
- **UI changes**: Use Playwright — navigate settings, verify cloud option appears
- **Fallback logic**: Use vitest — mock fetch, assert retry behavior

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — infrastructure + config, all parallel):
├── Task 1: Modal deployment script + FastAPI wrapper + README [unspecified-high]
├── Task 2: Server config — cloud env vars, resolveProviderConfig fix [quick]
└── Task 3: Server — keep_alive override + cloud fetch timeout [quick]

Wave 2 (After Wave 1 — core logic + UI, parallel):
├── Task 4: Auto-fallback logic in callProviderDirect() + SSE events [deep]
└── Task 5: Settings UI — ollama-cloud provider option [quick]

Wave 3 (After Wave 2 — tests):
└── Task 6: Vitest tests for fallback + config + keep_alive [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel review agents):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real manual QA [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: Task 2 → Task 4 → Task 6 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | F1-F4 | 1 |
| 2 | — | 4, 5 | 1 |
| 3 | — | 6 | 1 |
| 4 | 2 | 6 | 2 |
| 5 | 2 | F1-F4 | 2 |
| 6 | 3, 4 | F1-F4 | 3 |
| F1-F4 | 1-6 | — | Final |

### Agent Dispatch Summary

- **Wave 1**: **3 agents** — T1 → `unspecified-high`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **2 agents** — T4 → `deep`, T5 → `quick`
- **Wave 3**: **1 agent** — T6 → `unspecified-high`
- **FINAL**: **4 agents** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. RunPod Adapter Functions + Cloud Provider Routing

  **What to do**:
  - In `grading-server/providers.js`:
    - Add `buildRunPodRequest(config, messages)` function:
      - URL: `https://api.runpod.ai/v2/${config.endpointId}/runsync`
      - Headers: `{ 'Content-Type': 'application/json', 'Authorization': 'Bearer ${config.apiKey}' }`
      - Body: `{ input: { model: config.model, messages: ollamaMessages, stream: false, think: false, keep_alive: '5m', options: { temperature: config.temperature ?? 0.2 } } }`
      - Reuse the same message transformation logic from `buildOllamaRequest` (extracting images from multimodal content arrays)
      - Use `keep_alive: '5m'` (not `'60m'`) to avoid holding GPU memory on RunPod workers
    - Add `parseRunPodResponse(data)` function:
      - RunPod wraps responses: `{ id, status, output: { message: { content: string } } }`
      - Extract: `data.output.message?.content || data.output.message?.thinking || ''`
      - Handle RunPod-specific errors: `status === 'FAILED'` → throw with `data.error` message
      - Handle `status === 'IN_QUEUE'` or `status === 'IN_PROGRESS'` → should not happen with `runsync` but guard anyway
    - Export both functions
  - In `grading-server/server.js` (`callProviderDirect` function):
    - Change the `'ollama-cloud'` case in the switch to use `buildRunPodRequest` instead of `buildOllamaRequest`:
      ```
      case 'ollama-cloud': requestObj = buildRunPodRequest(config, messages); break;
      ```
    - Change the response parsing for `'ollama-cloud'` to use `parseRunPodResponse` instead of `parseOllamaResponse`
    - Add `config.endpointId` to the config resolution (extract from the RunPod endpoint URL or store separately)
  - Create `runpod/README.md` — Setup guide:
    - Prerequisites: RunPod account, RunPod CLI or web console
    - Step 1: Create a Network Volume, upload GGUF + Modelfile via RunPod console or `runpodctl`
    - Step 2: Create a Serverless Endpoint using the community `runpod-worker-ollama` template/image
    - Step 3: Configure endpoint: set `OLLAMA_MODEL_NAME=qwen3.5-9B-stat-grader`, mount Network Volume
    - Step 4: Copy Endpoint ID and API Key → configure in O.G.R.E. settings or env vars
    - Step 5: Test: `curl -H "Authorization: Bearer <api-key>" https://api.runpod.ai/v2/<endpoint-id>/runsync -d '{"input": {"model": "qwen3.5-9B-stat-grader", "messages": [{"role":"user","content":"test"}]}}'`
    - Cost estimate: ~$36/mo for 300 req/day at L4 pricing, $0 when idle
    - Troubleshooting: common errors, cold start behavior, volume mount issues

  **Must NOT do**:
  - Do NOT write a Dockerfile — use the community `runpod-worker-ollama` pre-built image
  - Do NOT modify `buildOllamaRequest` — keep it unchanged for local Ollama
  - Do NOT add monitoring, alerting, or cost tracking code
  - Do NOT duplicate the Ollama message transformation logic — extract a shared helper if needed, or call the existing transformation inline

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New adapter functions requiring understanding of both RunPod API format and existing Ollama integration patterns
  - **Skills**: []
    - No project-specific skills apply — this is API integration work
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — no browser automation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `grading-server/providers.js:26-74` (`buildOllamaRequest`) — Follow this EXACT pattern for `buildRunPodRequest`. The message transformation logic (lines 36-54) that handles multimodal content arrays → Ollama `{ content, images }` format should be reused. The RunPod adapter wraps the same payload in RunPod's `{ input: {...} }` envelope.
  - `grading-server/providers.js:247-258` (`parseOllamaResponse`) — Follow this pattern for `parseRunPodResponse`. The response is nested one level deeper: `data.output.message.content` instead of `data.message.content`.
  - `grading-server/providers.js:77-120` (`buildOpenAIRequest`) — Shows how a different provider's adapter is structured. Follow the same export + naming convention.
  - `grading-server/server.js:133-181` (`callProviderDirect`) — Lines 145 and 174 handle `'ollama-cloud'` — reroute these to the RunPod functions.

  **API/Type References** (contracts to implement against):
  - RunPod runsync API: Request `POST /v2/{endpoint_id}/runsync` with `{ input: {...} }`. Response: `{ id: string, status: "COMPLETED"|"FAILED", output: {...} }`. The `output` field contains whatever the worker returns — for `runpod-worker-ollama`, this is the Ollama chat response.
  - `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` — Parameters that affect the payload: `temperature 0.2`, `num_ctx 8192`. These go in `options` inside the RunPod input.

  **External References**:
  - RunPod Serverless API docs: `https://docs.runpod.io/serverless/endpoints/job-operations` — Request/response format for `runsync`
  - Community worker: `https://github.com/SvenBrnn/runpod-worker-ollama` — Shows the expected input format and how the worker proxies to Ollama internally
  - RunPod Network Volumes: `https://docs.runpod.io/serverless/workers/volumes` — How to mount volumes for model storage

  **WHY Each Reference Matters**:
  - `buildOllamaRequest` is the exact pattern to follow — same structure, different envelope
  - The community worker's README documents the exact input schema the RunPod endpoint expects
  - The RunPod API docs define the response wrapper format for error handling

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: buildRunPodRequest produces correct URL and envelope
    Tool: Bash
    Preconditions: grading-server directory
    Steps:
      1. Run: node -e "import('./providers.js').then(p => { const req = p.buildRunPodRequest({endpointId:'test123', apiKey:'key', model:'qwen3.5-9B-stat-grader', temperature:0.2}, [{role:'user',content:'hi'}]); console.log(JSON.stringify({url:req.url, hasAuth:!!req.headers.Authorization, inputModel:req.body.input.model, keepAlive:req.body.input.keep_alive})) })"
      2. Assert: url contains "api.runpod.ai/v2/test123/runsync"
      3. Assert: hasAuth is true
      4. Assert: inputModel is "qwen3.5-9B-stat-grader"
      5. Assert: keepAlive is "5m"
    Expected Result: Correct RunPod URL, auth header, model name, and 5m keep_alive
    Failure Indicators: Wrong URL format, missing auth, wrong keep_alive
    Evidence: .sisyphus/evidence/task-1-build-request.txt

  Scenario: parseRunPodResponse extracts content from nested response
    Tool: Bash
    Preconditions: grading-server directory
    Steps:
      1. Run: node -e "import('./providers.js').then(p => { const result = p.parseRunPodResponse({id:'test',status:'COMPLETED',output:{message:{content:'graded result'}}}); console.log(result) })"
      2. Assert: output is "graded result"
    Expected Result: Content extracted from RunPod envelope
    Failure Indicators: Returns undefined or throws
    Evidence: .sisyphus/evidence/task-1-parse-response.txt

  Scenario: parseRunPodResponse throws on FAILED status
    Tool: Bash
    Preconditions: grading-server directory
    Steps:
      1. Run: node -e "import('./providers.js').then(p => { try { p.parseRunPodResponse({id:'test',status:'FAILED',error:'OOM'}); console.log('NO_THROW') } catch(e) { console.log('THREW:'+e.message) } })"
      2. Assert: output starts with "THREW:" and contains error info
    Expected Result: Throws error with RunPod error message
    Failure Indicators: Prints "NO_THROW" or throws without message
    Evidence: .sisyphus/evidence/task-1-parse-error.txt

  Scenario: README contains all RunPod setup steps
    Tool: Bash
    Preconditions: runpod/README.md exists
    Steps:
      1. Run: grep -c "Network Volume" runpod/README.md
      2. Assert: at least 1 match (volume setup step)
      3. Run: grep -c "Endpoint ID" runpod/README.md
      4. Assert: at least 1 match (endpoint config step)
      5. Run: grep -c "runpod-worker-ollama" runpod/README.md
      6. Assert: at least 1 match (community worker reference)
    Expected Result: README covers volume, endpoint, and community worker
    Failure Indicators: Missing key setup steps
    Evidence: .sisyphus/evidence/task-1-readme-completeness.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Preconditions: grading-server directory
    Steps:
      1. Run: cd grading-server && bun test
      2. Assert: all tests pass, 0 failures
    Expected Result: No regressions from new adapter functions
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-1-existing-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(server): add RunPod adapter and cloud provider routing`
  - Files: `grading-server/providers.js`, `grading-server/server.js`, `runpod/README.md`
  - Pre-commit: `cd grading-server && bun test`

- [x] 2. Server Config — Cloud Environment Variables + resolveProviderConfig Fix

  **What to do**:
  - In `grading-server/config.js`:
    - Add cloud env var reading: `OGRE_RUNPOD_ENDPOINT_ID` and `OGRE_RUNPOD_API_KEY`
    - When these env vars are present, auto-register an `ollama-cloud` provider in the config if one doesn't already exist
    - Pattern: check env vars at startup, merge into `providerConfigs` array with `{ id: 'ollama-cloud', api_url: 'https://api.runpod.ai/v2/' + process.env.OGRE_RUNPOD_ENDPOINT_ID, model: 'qwen3.5-9B-stat-grader', credentials: { api_key: process.env.OGRE_RUNPOD_API_KEY, endpoint_id: process.env.OGRE_RUNPOD_ENDPOINT_ID } }`
  - In `grading-server/server.js` (`resolveProviderConfig` function, around line 1242):
    - Fix the `ollama-cloud` default URL — currently defaults to `http://localhost:11434` which is WRONG for cloud
    - Add a guard: if provider is `ollama-cloud` and `api_url` is empty/missing/localhost, throw a descriptive error: `"Ollama Cloud provider requires a RunPod endpoint. Set OGRE_RUNPOD_ENDPOINT_ID and OGRE_RUNPOD_API_KEY or configure in settings."`
    - Ensure `config.endpointId` is extractable from the URL or credentials for `buildRunPodRequest`
    - Do NOT change the default for regular `ollama` provider

  **Must NOT do**:
  - Do NOT store cloud tokens in `.env` files — use existing `ogre-server.json` credential pattern
  - Do NOT modify the config file schema beyond adding the cloud provider entry
  - Do NOT add config UI for cloud URL (that's Task 5)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small config changes in 2 files, straightforward env var reading
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `grading-server/config.js:22-40` (`getConfigDir`) — Shows the existing pattern for env var overrides (`OGRE_CONFIG_DIR`). Follow this same pattern for `OGRE_CLOUD_URL` and `OGRE_CLOUD_TOKEN`.
  - `grading-server/config.js:42-80` (`loadConfig/saveConfig`) — Shows how provider configs are loaded from `ogre-server.json` and hot-reloaded. The cloud env var merge should happen AFTER file load, so env vars take precedence.
  - `grading-server/server.js:1230-1260` (`resolveProviderConfig`) — The function that resolves provider configs by ID. Line 1242 has the `ollama-cloud` case with the wrong localhost default. This is what needs fixing.

  **API/Type References**:
  - `grading-server/server.js:133-145` (`callProviderDirect` switch) — Shows that `'ollama-cloud'` is already handled in the switch. Confirms no new provider adapter is needed.

  **WHY Each Reference Matters**:
  - `config.js` env var pattern ensures consistency with existing override mechanism
  - `resolveProviderConfig` is the exact function with the bug — line 1242 defaults cloud to localhost

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cloud env vars are read and auto-register provider
    Tool: Bash
    Preconditions: grading-server directory, no existing ollama-cloud in config
    Steps:
      1. Run: OGRE_RUNPOD_ENDPOINT_ID=ep123 OGRE_RUNPOD_API_KEY=key456 node -e "import('./config.js').then(c => { const cfg = c.loadConfig(); console.log(JSON.stringify(cfg.providers?.find(p => p.id === 'ollama-cloud'))) })"
      2. Assert: output contains {"id":"ollama-cloud"} with api_url containing "api.runpod.ai/v2/ep123"
    Expected Result: Cloud provider auto-registered from RunPod env vars with correct endpoint URL
    Failure Indicators: null output or missing api_url or wrong endpoint ID
    Evidence: .sisyphus/evidence/task-2-env-var-config.txt

  Scenario: resolveProviderConfig throws on empty cloud URL
    Tool: Bash
    Preconditions: grading-server directory
    Steps:
      1. Run: node -e "import('./server.js')" with no OGRE_RUNPOD_ENDPOINT_ID set, then call resolveProviderConfig('ollama-cloud', 'model')
      2. Assert: throws error containing "RunPod endpoint"
    Expected Result: Descriptive error message about missing RunPod endpoint config
    Failure Indicators: Returns localhost:11434 silently
    Evidence: .sisyphus/evidence/task-2-config-guard.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Preconditions: grading-server directory
    Steps:
      1. Run: cd grading-server && bun test
      2. Assert: all tests pass, 0 failures
    Expected Result: No regressions from config changes
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-2-existing-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(server): add cloud config env vars and fix resolveProviderConfig`
  - Files: `grading-server/config.js`, `grading-server/server.js`
  - Pre-commit: `cd grading-server && bun test`

- [x] 3. Server — Cloud Fetch Timeout (120s)

  **What to do**:
  - In `grading-server/server.js` (`callProviderDirect` function):
    - Add an `AbortController` with timeout for cloud requests
    - When provider is `ollama-cloud`: set fetch timeout to 120,000ms (120s) to survive cold starts + model loading
    - When provider is `ollama` / `ollama-local`: keep default behavior (no explicit timeout, or 30s)
    - Pattern: `const isCloud = provider.toLowerCase() === 'ollama-cloud'; const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), isCloud ? 120000 : 30000); try { const response = await fetch(url, { ...opts, signal: controller.signal }); } finally { clearTimeout(timeoutId); }`
  - Note: `keep_alive: '5m'` is already handled in Task 1 inside `buildRunPodRequest()` — no change needed to `buildOllamaRequest()`. Local Ollama keeps `60m`.

  **Must NOT do**:
  - Do NOT modify `buildOllamaRequest` — `keep_alive` for cloud is handled in `buildRunPodRequest` (Task 1)
  - Do NOT add the timeout to `ai-retry.js` — keep it in `callProviderDirect`
  - Do NOT change existing behavior for non-cloud providers

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single small change — adding AbortController to one function
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `grading-server/server.js:133-181` (`callProviderDirect`) — Line 160: `const response = await fetch(requestObj.url, {...})`. This is where the AbortController signal needs to be added. The `provider` parameter is available to check if it's `'ollama-cloud'`.

  **WHY Each Reference Matters**:
  - The fetch call on line 160 is the exact insertion point for the timeout logic

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cloud requests use 120s timeout
    Tool: Bash
    Preconditions: grading-server directory, Task 3 implemented
    Steps:
      1. Verify in code: callProviderDirect with provider='ollama-cloud' creates AbortController with 120000ms timeout
      2. Run: grep -n "120000\|120_000" grading-server/server.js
      3. Assert: at least 1 match in the callProviderDirect function
    Expected Result: 120s timeout configured for cloud provider
    Failure Indicators: No 120s timeout found, or timeout applied to all providers
    Evidence: .sisyphus/evidence/task-3-cloud-timeout.txt

  Scenario: Local requests do NOT use 120s timeout
    Tool: Bash
    Preconditions: grading-server directory
    Steps:
      1. Verify in code: callProviderDirect with provider='ollama' uses 30000ms (or no explicit timeout)
      2. Assert: 120s timeout is conditional on 'ollama-cloud' only
    Expected Result: Local Ollama keeps default/30s timeout
    Failure Indicators: All providers get 120s timeout
    Evidence: .sisyphus/evidence/task-3-local-timeout.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Preconditions: grading-server directory
    Steps:
      1. Run: cd grading-server && bun test
      2. Assert: all tests pass, 0 failures
    Expected Result: No regressions from timeout changes
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-existing-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(server): add extended fetch timeout for cloud requests`
  - Files: `grading-server/server.js`
  - Pre-commit: `cd grading-server && bun test`

- [x] 4. Auto-Fallback Logic in callProviderDirect + SSE Cloud Events

  **What to do**:
  - In `grading-server/server.js` (`callProviderDirect` function):
    - After the `fetch()` call fails, check if the error is a connection error:
      - `error.code === 'ECONNREFUSED'` or `error.cause?.code === 'ECONNREFUSED'`
      - `error.message.includes('fetch failed')` or `error.message.includes('ENOTFOUND')`
    - If it IS a connection error AND provider is `ollama` or `ollama-local`:
      - Look up `ollama-cloud` from `providerConfigs` (via `resolveProviderConfig('ollama-cloud', config.model)`)
      - If cloud config exists and has a valid `api_url`:
        - Log: `[timestamp] [fallback] Local Ollama unreachable, falling back to cloud`
        - Recursively call `callProviderDirect('ollama-cloud', cloudConfig, messages, timestamp)`
        - Return the cloud result
      - If cloud config doesn't exist: throw original error
    - If it is NOT a connection error (HTTP 500, model not found, etc.): throw original error — no fallback
    - Add a `fallbackUsed` flag to the return value or make it available to callers
  - In `grading-server/server.js` (`/api/grade` SSE handler):
    - When fallback is used, emit an SSE event before the chunk results:
      - `{ event: 'progress', data: JSON.stringify({ phase: 'cloud-fallback', reason: 'Local Ollama unreachable. Using cloud GPU.' }) }`
    - For mid-batch fallback: if a chunk fails with ECONNREFUSED after earlier chunks succeeded locally, the remaining chunks should use cloud (don't fail the whole batch)
  - In `ogre-desktop/src/lib/grading-api.ts`:
    - Handle the new `cloud-fallback` phase in SSE parsing
    - Surface it in the progress callback so the UI can show "Switched to cloud GPU..."

  **Must NOT do**:
  - Do NOT modify `ai-retry.js` — fallback is separate from retry
  - Do NOT fallback on HTTP 4xx/5xx — ONLY on connection/network errors
  - Do NOT create infinite fallback loops — if cloud also fails, throw the cloud error
  - Do NOT change the return type of `callProviderDirect` — just add fallback internally
  - Do NOT add provider selection UI here (that's Task 5)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core logic change requiring careful error handling, async flow, and SSE event coordination across server + desktop client
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — this is server-side logic

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 5)
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 2 (needs cloud config to exist)

  **References**:

  **Pattern References**:
  - `grading-server/server.js:133-181` (`callProviderDirect`) — This is the function to modify. Lines 160-169 handle the fetch + error. The fallback logic inserts in the `catch` block.
  - `grading-server/ai-retry.js:13-36` (`withRetry`) — Shows how errors are classified (status codes, client errors). Follow this pattern for distinguishing connection errors from API errors. Do NOT modify this file.
  - `grading-server/server.js:1450-1470` (batch grading chunk loop) — Shows where `callProviderDirect` is called for each chunk. This is where mid-batch fallback applies — if chunk N fails, remaining chunks use cloud.
  - `grading-server/server.js:1386-1420` (SSE stream setup) — Shows the SSE event emitting pattern: `stream.writeSSE({ event: 'progress', data: JSON.stringify({...}) })`. Follow this exact pattern for the cloud-fallback event.

  **API/Type References**:
  - `ogre-desktop/src/lib/grading-api.ts:200-250` (SSE event handler) — Shows how the desktop client parses `progress`, `chunk`, `done`, `error` events. The new `cloud-fallback` phase must be handled here (likely in the existing `progress` event handler).
  - `grading-server/server.js:1230-1260` (`resolveProviderConfig`) — How to look up the `ollama-cloud` config. Call this to check if cloud is configured before attempting fallback.

  **WHY Each Reference Matters**:
  - `callProviderDirect` is the ONLY place fallback logic should live — it's the provider dispatcher
  - `withRetry` is the anti-pattern — do NOT put cross-provider fallback there
  - The SSE event pattern must match exactly or the desktop client won't parse it
  - The chunk loop is where mid-batch fallback manifests — each chunk calls `callProviderDirect` independently

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Fallback triggers on ECONNREFUSED
    Tool: Bash (vitest via Task 6, but logic should be verifiable)
    Preconditions: grading-server with cloud config set
    Steps:
      1. Set OGRE_CLOUD_URL=https://mock.cloud OGRE_CLOUD_TOKEN=test
      2. Call callProviderDirect('ollama', config_with_unreachable_localhost, messages)
      3. Assert: function catches ECONNREFUSED, retries with 'ollama-cloud'
    Expected Result: Returns cloud response instead of throwing
    Failure Indicators: Throws ECONNREFUSED error without attempting cloud
    Evidence: .sisyphus/evidence/task-4-fallback-econnrefused.txt

  Scenario: Does NOT fallback on HTTP 500
    Tool: Bash
    Preconditions: grading-server with mock Ollama returning 500
    Steps:
      1. Mock local Ollama to return HTTP 500
      2. Call callProviderDirect('ollama', config, messages)
      3. Assert: throws the 500 error WITHOUT attempting cloud fallback
    Expected Result: HTTP 500 propagates as-is
    Failure Indicators: Cloud fallback is attempted
    Evidence: .sisyphus/evidence/task-4-no-fallback-500.txt

  Scenario: Does NOT fallback when no cloud config exists
    Tool: Bash
    Preconditions: grading-server with NO OGRE_CLOUD_URL set
    Steps:
      1. Call callProviderDirect('ollama', config_with_unreachable_localhost, messages)
      2. Assert: throws ECONNREFUSED error (no cloud to fall back to)
    Expected Result: Original error thrown when cloud isn't configured
    Failure Indicators: Hangs or throws different error
    Evidence: .sisyphus/evidence/task-4-no-cloud-config.txt

  Scenario: SSE cloud-fallback event is emitted
    Tool: Bash (curl with SSE parsing)
    Preconditions: grading-server running, local Ollama stopped, cloud configured
    Steps:
      1. Start grading server with OGRE_CLOUD_URL set
      2. Send POST /api/grade request
      3. Parse SSE stream for event: progress with phase: cloud-fallback
      4. Assert: cloud-fallback event appears before chunk results
    Expected Result: SSE stream includes cloud-fallback progress event
    Failure Indicators: No cloud-fallback event in stream
    Evidence: .sisyphus/evidence/task-4-sse-fallback-event.txt
  ```

  **Commit**: YES
  - Message: `feat(server): add auto-fallback from local to cloud Ollama`
  - Files: `grading-server/server.js`, `ogre-desktop/src/lib/grading-api.ts`
  - Pre-commit: `cd grading-server && bun test`

- [x] 5. Settings UI — Ollama Cloud Provider Option

  **What to do**:
  - In `ogre-desktop/src/pages/settings/ProviderSettings.svelte`:
    - Add `ollama-cloud` to the `PROVIDER_OPTIONS` array (or equivalent provider list):
      ```
      { id: 'ollama-cloud', name: 'Ollama (Cloud GPU)', apiUrl: '', model: 'qwen3.5-9B-stat-grader', keyUrl: '', placeholderKey: 'Bearer token from your cloud admin', placeholderUrl: 'https://your-modal-endpoint.modal.run' }
      ```
    - The ProviderSelector label `'ollama-cloud': 'Ollama (Cloud)'` already exists (confirmed by Metis) — verify it still works or update the label to "Ollama (Cloud GPU)" for clarity
    - Ensure the api_url and api_key fields render when editing an `ollama-cloud` provider
    - When `ollama-cloud` is selected, pre-fill model with `qwen3.5-9B-stat-grader` (this is the only model available on cloud)
    - Add a small info note below the provider: "Cloud GPU is managed by your administrator. Enter the endpoint URL and bearer token provided to you."
  - In `ogre-desktop/src/lib/provider-sync.ts`:
    - Verify that `ollama-cloud` configs are synced to the server via `pushProvidersToServer()` — this should already work since the sync pushes ALL provider configs, but verify it doesn't filter by provider ID
  - In `ogre-desktop/src/pages/SetupWizard.svelte`:
    - Add `ollama-cloud` as an option in the setup wizard provider list (alongside local Ollama)
    - Skip the "detect local Ollama" step when `ollama-cloud` is selected

  **Must NOT do**:
  - Do NOT add GGUF upload or Modelfile editing UI
  - Do NOT add cloud deployment controls (deploy/destroy/status)
  - Do NOT add cost estimation or usage tracking UI
  - Do NOT modify existing provider entries (Ollama, OpenAI, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding an entry to existing UI patterns — follows established provider config UI
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: Not needed — following existing UI patterns, no new components
    - `playwright`: Not needed for implementation (used in QA only)

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 4)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2 (needs config schema to exist)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/pages/settings/ProviderSettings.svelte:20-50` (PROVIDER_OPTIONS) — The existing provider list. Add `ollama-cloud` following the exact same shape as the `ollama` entry. Note line 46 comment: "ollama-cloud and ollama-local were merged" — this was partially backed out, so `ollama-cloud` should be re-added as a separate entry.
  - `ogre-desktop/src/pages/settings/ProviderSettings.svelte:60-80` (ProviderSelector) — Line 65 already has `'ollama-cloud': 'Ollama (Cloud)'` — verify this label mapping is still present and update to "Ollama (Cloud GPU)" if desired.
  - `ogre-desktop/src/pages/SetupWizard.svelte:26-42` (wizard provider list) — The setup wizard's provider array. Add `ollama-cloud` here too for first-time setup flow.

  **API/Type References**:
  - `ogre-desktop/src/lib/provider-sync.ts:10-40` (`pushProvidersToServer`) — Verify this function sends ALL providers to the server. If it filters by ID, ensure `ollama-cloud` is included.
  - `ogre-desktop/src/lib/db.ts:50-80` (provider_configs schema) — Verify the SQLite schema supports the `ollama-cloud` ID without issues.

  **WHY Each Reference Matters**:
  - PROVIDER_OPTIONS defines what appears in the settings UI — must add cloud entry here
  - ProviderSelector label already partially exists — confirm and extend
  - SetupWizard is the first-time experience — cloud should be an option from day one
  - provider-sync must not filter out cloud configs or the server won't know about it

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Ollama Cloud appears in settings provider list
    Tool: Playwright (playwright skill)
    Preconditions: ogre-desktop running
    Steps:
      1. Navigate to Settings page
      2. Click "Add Provider" or equivalent
      3. Look for "Ollama (Cloud GPU)" in provider dropdown/list
      4. Assert: option is present and selectable
    Expected Result: ollama-cloud provider appears as a selectable option
    Failure Indicators: Option missing from dropdown/list
    Evidence: .sisyphus/evidence/task-5-settings-cloud-option.png

  Scenario: Cloud provider form shows URL and token fields
    Tool: Playwright (playwright skill)
    Preconditions: ogre-desktop running, settings page open
    Steps:
      1. Select "Ollama (Cloud GPU)" provider
      2. Assert: API URL field is visible with placeholder "https://your-modal-endpoint.modal.run"
      3. Assert: API Key/Token field is visible with placeholder mentioning "bearer token"
      4. Assert: Model field shows "qwen3.5-9B-stat-grader"
    Expected Result: Cloud-specific form fields render correctly
    Failure Indicators: Missing fields, wrong placeholders, empty model
    Evidence: .sisyphus/evidence/task-5-cloud-form-fields.png

  Scenario: Existing desktop tests still pass
    Tool: Bash
    Preconditions: ogre-desktop directory
    Steps:
      1. Run: cd ogre-desktop && npx vitest run
      2. Assert: all tests pass, 0 failures
    Expected Result: No regressions from UI changes
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-5-existing-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(ui): add ollama-cloud provider to settings`
  - Files: `ogre-desktop/src/pages/settings/ProviderSettings.svelte`, `ogre-desktop/src/pages/SetupWizard.svelte`
  - Pre-commit: `cd ogre-desktop && npx vitest run`

- [x] 6. Vitest Tests for Cloud Fallback + Config + keep_alive

  **What to do**:
  - Create `grading-server/test/cloud-fallback.test.js` with the following test cases:
    - **Fallback trigger tests**:
      1. `test('falls back to cloud on ECONNREFUSED from local Ollama')` — mock fetch to throw ECONNREFUSED for local, succeed for cloud. Assert cloud response returned.
      2. `test('falls back to cloud on fetch failed error')` — mock fetch to throw "fetch failed" for local. Assert cloud fallback.
      3. `test('does NOT fall back on HTTP 500 from local Ollama')` — mock fetch to return 500. Assert 500 error propagated, cloud NOT called.
      4. `test('does NOT fall back on HTTP 404 from local Ollama')` — mock fetch to return 404. Assert error propagated.
      5. `test('does NOT fall back when no cloud provider configured')` — no OGRE_CLOUD_URL. Assert original ECONNREFUSED thrown.
      6. `test('throws cloud error when both local and cloud fail')` — both fail. Assert cloud error thrown (not infinite loop).
    - **Config tests**:
      7. `test('cloud env vars auto-register ollama-cloud provider')` — set OGRE_CLOUD_URL + OGRE_CLOUD_TOKEN, load config, assert provider exists.
      8. `test('resolveProviderConfig throws on empty cloud URL')` — no api_url for ollama-cloud. Assert descriptive error.
    - **RunPod adapter tests**:
      9. `test('buildRunPodRequest produces correct URL with endpoint ID')` — Assert URL contains `api.runpod.ai/v2/{endpointId}/runsync`.
      10. `test('buildRunPodRequest uses 5m keep_alive')` — Assert `body.input.keep_alive === '5m'`.
      11. `test('parseRunPodResponse extracts content from COMPLETED response')` — Nested `output.message.content`. Assert correct extraction.
      12. `test('parseRunPodResponse throws on FAILED status')` — Assert error thrown with message.
  - Mock strategy: use vitest's `vi.fn()` to mock `global.fetch` at the module level. Follow patterns from existing test files.
  - Import directly from `providers.js` and `config.js` for unit-testable functions.
  - For `callProviderDirect` tests, may need to import from `server.js` or extract the fallback logic into a testable helper.

  **Must NOT do**:
  - Do NOT modify existing test files — create a new `cloud-fallback.test.js`
  - Do NOT add integration tests that require a running Modal endpoint
  - Do NOT test UI components here (that's Playwright QA in Final Verification)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Writing 10 test cases requires understanding the full fallback flow, mock setup, and config patterns
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: Tests are after implementation, not TDD

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 3, 4 (needs implementation to exist before testing it)

  **References**:

  **Pattern References**:
  - `ogre-desktop/src/lib/site-profiles.test.ts` — Example vitest test file in the project. Shows import pattern, describe/it blocks, assertion style. Follow this structure.
  - `ogre-desktop/src/lib/heuristic-detector.test.ts` — Another test example showing more complex test setup with multiple describe blocks and edge cases.

  **API/Type References**:
  - `grading-server/providers.js:26-74` (`buildOllamaRequest`) — Function under test for keep_alive tests. Import directly.
  - `grading-server/server.js:133-181` (`callProviderDirect`) — Function under test for fallback tests. May need to be exported or have fallback logic extracted into a testable helper.
  - `grading-server/config.js:42-80` (`loadConfig`) — Function under test for config tests. Import directly.

  **External References**:
  - Vitest mock docs: `https://vitest.dev/api/vi.html#vi-fn` — For mocking fetch and module imports

  **WHY Each Reference Matters**:
  - Existing test files show the project's testing conventions (import style, assertion patterns)
  - The functions under test define the exact signatures and behaviors to verify
  - Vitest mock docs needed for proper fetch mocking pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 12 cloud fallback tests pass
    Tool: Bash
    Preconditions: grading-server directory, Tasks 1-4 implemented
    Steps:
      1. Run: cd grading-server && bun test test/cloud-fallback.test.js
      2. Assert: 12 tests pass, 0 failures
    Expected Result: All fallback, config, and RunPod adapter tests green
    Failure Indicators: Any test failure or test not found
    Evidence: .sisyphus/evidence/task-6-test-results.txt

  Scenario: Full test suite still passes with new tests included
    Tool: Bash
    Preconditions: grading-server directory
    Steps:
      1. Run: cd grading-server && bun test
      2. Assert: all tests pass (existing + new), 0 failures
    Expected Result: New tests don't interfere with existing tests
    Failure Indicators: Any failure in existing tests
    Evidence: .sisyphus/evidence/task-6-full-suite.txt

  Scenario: No test uses real network calls
    Tool: Bash
    Preconditions: grading-server/test/cloud-fallback.test.js exists
    Steps:
      1. Run: grep -c "vi.fn\|vi.mock\|vi.spyOn" grading-server/test/cloud-fallback.test.js
      2. Assert: count >= 3 (fetch is mocked)
      3. Run: grep -c "localhost:11434\|modal.run" grading-server/test/cloud-fallback.test.js
      4. Assert: these appear only in mock setup, not real fetch calls
    Expected Result: All network calls are mocked
    Failure Indicators: Real URLs used without mocking
    Evidence: .sisyphus/evidence/task-6-mock-verification.txt
  ```

  **Commit**: YES
  - Message: `test(server): add cloud fallback and config tests`
  - Files: `grading-server/test/cloud-fallback.test.js`
  - Pre-commit: `cd grading-server && bun test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun test` in grading-server + `npx vitest run` in ogre-desktop. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill for UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (fallback + UI + config working together). Test edge cases: both services down, mid-batch fallback, missing cloud config. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| # | Message | Files | Pre-commit |
|---|---------|-------|-----------|
| 1 | `feat(server): add RunPod adapter and cloud provider routing` | `grading-server/providers.js`, `grading-server/server.js`, `runpod/README.md` | `cd grading-server && bun test` |
| 2 | `feat(server): add cloud config env vars and fix resolveProviderConfig` | `grading-server/config.js`, `grading-server/server.js` | `cd grading-server && bun test` |
| 3 | `feat(server): add extended fetch timeout for cloud requests` | `grading-server/server.js` | `cd grading-server && bun test` |
| 4 | `feat(server): add auto-fallback from local to cloud Ollama` | `grading-server/server.js`, `ogre-desktop/src/lib/grading-api.ts` | `cd grading-server && bun test` |
| 5 | `feat(ui): add ollama-cloud provider to settings` | `ogre-desktop/src/pages/settings/ProviderSettings.svelte`, `ogre-desktop/src/pages/SetupWizard.svelte` | `cd ogre-desktop && npx vitest run` |
| 6 | `test(server): add cloud fallback and config tests` | `grading-server/test/cloud-fallback.test.js` | `cd grading-server && bun test` |

---

## Success Criteria

### Verification Commands
```bash
cd grading-server && bun test              # Expected: all tests pass including cloud-fallback.test.js
cd ogre-desktop && npx vitest run          # Expected: all existing tests pass
```

### Final Checklist
- [ ] All "Must Have" items present and verified
- [ ] All "Must NOT Have" items absent (grep codebase)
- [ ] All tests pass (grading-server + ogre-desktop)
- [ ] `buildRunPodRequest` and `parseRunPodResponse` exported from providers.js
- [ ] `callProviderDirect` routes `ollama-cloud` through RunPod adapter
- [ ] Settings UI shows ollama-cloud option with endpoint + API key fields
- [ ] Auto-fallback triggers on ECONNREFUSED, does NOT trigger on 500
- [ ] `keep_alive` is `5m` in RunPod adapter, `60m` in local Ollama
- [ ] Fetch timeout is 120s for cloud, 30s for local
- [ ] SSE progress event emitted on cloud fallback
- [ ] `resolveProviderConfig` throws on empty config for `ollama-cloud`
- [ ] `runpod/README.md` exists with complete setup guide
