# Task 1: Fix Anthropic OAuth Models - Learnings

## Date
2026-02-22

## Summary
Added `ANTHROPIC_KNOWN_MODELS` constant and OAuth short-circuit in `ogre-desktop/src/lib/oauth.ts` to fix 401 errors when fetching models with Anthropic OAuth tokens.

## Changes Made
1. Added `ANTHROPIC_KNOWN_MODELS` constant after line 252 (after `ANTHROPIC_REDIRECT_URI`)
2. Added OAuth short-circuit at top of `case "anthropic"` block (before calling `/v1/models`)

## Key Details
- Constant location: Line 253
- Short-circuit location: Line 559-561
- When OAuth token (Bearer) is detected, returns hardcoded model list instead of calling `/v1/models`
- API key users still hit `/v1/models` endpoint

## Models Included
- claude-sonnet-4-20250514
- claude-opus-4-20250514
- claude-haiku-4-20250414
- claude-3-5-sonnet-20241022
- claude-3-5-haiku-20241022
- claude-3-opus-20240229

## Issue Fixed
- OAuth tokens cannot access `/v1/models` - returns 401
- Root cause: Anthropic OAuth scope `user:inference` covers inference but NOT model listing
- Reference: OpenCode uses `autoload: false` for Anthropic - never hits `/v1/models`

## Verification
```bash
grep -n 'ANTHROPIC_KNOWN_MODELS' ogre-desktop/src/lib/oauth.ts
```
Output:
- 253:const ANTHROPIC_KNOWN_MODELS: string[] = [
- 561:    if (oauthData?.token_type === 'Bearer') return ANTHROPIC_KNOWN_MODELS;



---

## Task 2: Fix Svelte 4 Reactivity in Settings.svelte

### Summary
Fixed Svelte 4 reactivity in `ogre-desktop/src/pages/Settings.svelte` by adding object/array reassignment after property mutations in `fetchModels()` and `handleSignOut()` functions.

### Problem
Svelte 4 reactivity requires explicit reassignment (`obj = {...obj}` or `arr = [...arr]`) after mutating object properties or array elements. Without this, the UI doesn't update.

### Solution Applied
Added 7 reactivity triggers:
1. **handleSignOut()** (line 309): `fetchedModels = { ...fetchedModels }` after clearing models on sign out
2. **fetchModels()** (line 321): `fetchingModels = { ...fetchingModels }` after setting true
3. **fetchModels()** (line 323): `modelFetchErrors = { ...modelFetchErrors }` after clearing errors
4. **fetchModels()** (line 330): `fetchedModels = { ...fetchedModels }` after fetching models
5. **fetchModels()** (line 336): `providers = [...providers]` after updating provider.model
6. **fetchModels()** (line 341): `modelFetchErrors = { ...modelFetchErrors }` in catch block
7. **fetchModels()** (line 344): `fetchingModels = { ...fetchingModels }` in finally block

### Key Pattern
Follow the existing pattern in the file (e.g., line 261 in handleDeviceFlow):
```javascript
oauthStatus[providerId] = true;
oauthStatus = { ...oauthStatus }; // Trigger reactivity
```

### Tools Used
- Edit tool with `replace` operation (using old_text/new_text instead of line#ID)
- bash for grep verification

### Verification Commands
```bash
grep -n "fetchingModels = {" Settings.svelte  # Shows 2 occurrences
grep -n "fetchedModels = {" Settings.svelte   # Shows 2 occurrences
```

### Date
2026-02-22