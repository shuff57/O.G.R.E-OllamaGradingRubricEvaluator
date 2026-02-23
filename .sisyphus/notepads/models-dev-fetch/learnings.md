# models-dev-fetch learnings

## Task Completed
Added `fetchAnthropicModelsFromModelsDev()` function with 1-hour in-memory cache and updated OAuth short-circuit in `ogre-desktop/src/lib/oauth.ts`.

## Key Implementation Details

### Cache Implementation
- Used in-memory cache with module-level variable `_modelsDevCache`
- TTL set to 1 hour (`MODELS_DEV_TTL_MS = 60 * 60 * 1000`)
- Cache stores `{ models: string[], fetchedAt: number }`

### models.dev API Integration
- Fetches from `https://models.dev/api.json`
- Parses `data['anthropic']?.models` 
- Filters out alpha and deprecated models
- Throws if empty model list returned

### OAuth Short-Circuit Update
- When `oauthData?.token_type === 'Bearer'` (OAuth token present)
- Tries `fetchAnthropicModelsFromModelsDev()` first
- Falls back to `ANTHROPIC_KNOWN_MODELS` on any error
- Preserves existing fallback behavior

## Verification
```bash
grep -n 'fetchAnthropicModelsFromModelsDev' ogre-desktop/src/lib/oauth.ts
# Returns 2 lines:
# 268:async function fetchAnthropicModelsFromModelsDev(): Promise<string[]> {
# 585:          return await fetchAnthropicModelsFromModelsDev();
```

## Files Modified
- `ogre-desktop/src/lib/oauth.ts` - Added cache + function (lines 264-282), updated short-circuit (lines 583-589)
