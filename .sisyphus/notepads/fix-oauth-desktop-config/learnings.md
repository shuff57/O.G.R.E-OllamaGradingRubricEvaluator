# Learnings — fix-oauth-desktop-config

## Task 1: oauth.ts rewrite

- `saveOAuthToken` accepts optional fields: `refresh_token`, `token_type`, `expires_at` — all nullable
- `getOAuthToken` and `deleteOAuthToken` both take `provider: string`
- Settings.svelte and SetupWizard.svelte still import old `signInWithGoogle`/`signInWithGitHub` — Tasks 2/3 must update these
- Google device flow uses `verification_url` (not `verification_uri` like GitHub) — the field name differs between providers
- OpenAI uses JSON body for device code requests, GitHub/Google use form-urlencoded
- OpenAI uses `device_auth_id` instead of standard `device_code` field name
- ChatGPT two-step: device flow returns `id_token` (JWT) → must exchange at `/oauth/token` with `grant_type=urn:ietf:params:oauth:grant-type:token-exchange` to get final `access_token`
- PKCE charset for code_verifier: `[A-Za-z0-9-._~]` (66 chars) — use `crypto.getRandomValues` with modulo, not `randomUUID`
- Web Crypto API: `crypto.subtle.digest("SHA-256", data)` returns ArrayBuffer → must convert to base64url manually via `btoa` + char replacement

## Task 2: SetupWizard.svelte update
- When updating imports that were removed from a dependency, `vite` might cache the old file content. Always clean `node_modules/.vite` if you encounter "is not exported by" errors for exports you know exist.
- `SetupWizard.svelte` is large (1000+ lines). It might benefit from being split into smaller components (e.g., `ProviderCard.svelte`, `OAuthFlow.svelte`) in a future refactor.
- Accessibility warnings (label has associated control) are present in the build output and should be addressed in a future cleanup task.

## Task 3: Settings.svelte update
- The `write` tool is blocked for overwriting existing files; `edit` must be used.
- `edit` tool can handle large replacements if the `oldString` is unique, but chunking (Script, HTML, CSS) is safer and easier to debug.
- LSP errors can be stale if they refer to file changes made in previous tasks/sessions that haven't triggered a full re-index in the current agent's context. Always trust the file content on disk (via `read`) and the actual build output.
- Device Flow and Code Paste Flow are effective patterns for Desktop apps where redirect handling is complex or impossible without deep linking setup.
- Polling in Svelte components works well with `async/await` in a `while` loop, provided there's a cancellation mechanism (like `cancelled` flag).
- `PROVIDER_OPTIONS` in `Settings.svelte` needed to be updated to remove `oauth: true` and rely on a new `canSignIn` or ID check, matching the changes in `SetupWizard.svelte`.
