# Task 3: Wire ProviderSelector to Grading Server

## What was done
- Added provider API functions to existing `grading-api.ts` (fetchProviders, setActiveProvider, fetchModels)
- Added `GradingApiError` class with typed error codes (NO_TOKEN, AUTH_ERROR, NOT_FOUND, SERVER_ERROR, OFFLINE)
- Added `isServerOffline()` helper for UI to detect server-down state
- Wired `ProviderSelector.svelte` to fetch providers from `GET /api/providers` on mount
- Wired model fetching when provider changes (delegates to `fetchAvailableModels` from oauth.ts)
- Wired `POST /api/providers/active` sync on model selection (fire-and-forget)
- Added offline fallback: when server is unreachable, shows hardcoded provider list + "Server offline" badge
- Added 21 new tests covering all provider API functions + error handling

## Key patterns discovered
- `rubric-api.ts` is the canonical pattern for server API calls: tauriFetch + authHeaders() + getHandshakeToken()
- `grading-api.ts` already existed from Task 1 with solver/chat functions — appended provider functions to it
- Server has no `/api/models` endpoint — models fetched directly from provider APIs via `oauth.ts::fetchAvailableModels()`
- Provider ID mapping needed: server uses `github-models`/`google-gemini` but oauth.ts uses `github`/`google`
- `vi.hoisted()` pattern is critical for mock functions that need to be available in `vi.mock()` factory

## Provider ID mapping (server → oauth)
- `github-models` → `github`
- `google-gemini` → `google`
- `ollama-local`/`ollama-cloud`/`ollama` → `ollama`
- `openai` → `openai`
- `anthropic` → `anthropic`

## Server endpoints used
- `GET /api/providers` — returns `{ providers: ProviderConfig[] }`, requires Bearer token
- `POST /api/providers/active` — body `{ provider_id, model }`, requires Bearer token
- `GET /api/handshake` — returns `{ token }`, no auth required (used by provider-sync.ts)

## Files modified
- `ogre-desktop/src/lib/grading-api.ts` — added ProviderConfig type, GradingApiError, fetchProviders, setActiveProvider, fetchModels, isServerOffline, mapProviderIdToOAuth
- `ogre-desktop/src/components/grading/ProviderSelector.svelte` — replaced hardcoded PROVIDERS with dynamic server fetch, added loading/error/offline states
- `ogre-desktop/src/lib/grading-api.test.ts` — added 21 tests for provider API + error handling
