# OAuth + Vercel Deployment — Verification Report

**Date**: 2026-02-08  
**Task**: Task 1 — Verify Critical Assumptions Before Coding  
**Status**: COMPLETE

---

## 1. Google OAuth Scope for Gemini `generateContent` API

### Question
What is the correct OAuth scope for calling `generateContent` on the Gemini API?

### Current Code
`oauth-client.js:84` uses:
```
https://www.googleapis.com/auth/generative-language.retriever
```

### Findings

**The current scope `generative-language.retriever` is SUFFICIENT for `generateContent`.** Here's why:

1. **Official Google OAuth quickstart** (https://ai.google.dev/gemini-api/docs/oauth) explicitly uses:
   ```
   --scopes='https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/generative-language.retriever'
   ```
   This is Google's own recommended scope set for Gemini API OAuth access.

2. **The Generative Language API has these known OAuth scopes** (from Google's OAuth2 scopes documentation and community reports):
   - `https://www.googleapis.com/auth/generative-language.retriever` — Grants access to the Generative Language API including `generateContent`, `listModels`, and retriever/corpus operations
   - `https://www.googleapis.com/auth/generative-language.tuning` — Grants access for model tuning operations
   - `https://www.googleapis.com/auth/cloud-platform` — Broad Google Cloud access (includes Generative Language API)

3. **Stack Overflow evidence**: A user reported using `generative-language.retriever` scope with OAuth tokens to successfully call the `generateContent` endpoint (`generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`). The scope works for content generation, not just retrieval.

4. **The scope name is misleading** — despite containing "retriever", `generative-language.retriever` is the general-purpose Generative Language API scope that covers `generateContent`, `listModels`, embeddings, and corpus/retrieval operations. It's NOT limited to just the Semantic Retrieval feature.

### Recommendation
- **Keep `generative-language.retriever` as the primary scope** — it is the correct, Google-recommended scope
- **Also request `cloud-platform` scope** as a secondary scope (matches Google's official quickstart)
- The recommended scope string for the auth URL:
  ```
  https://www.googleapis.com/auth/generative-language.retriever
  ```
- If broader access is needed later, add `cloud-platform` but note this is a **sensitive scope** requiring Google review for production apps

### Impact on Implementation
- **oauth-client.js:84** — Current scope is CORRECT. No change needed for `generateContent` access.
- Consider adding `cloud-platform` as a second scope only if needed for additional API features.

---

## 2. `chrome.identity.launchWebAuthFlow` from Sidepanel Context

### Question
Does `chrome.identity.launchWebAuthFlow` work when called from the sidepanel HTML context?

### Findings

**YES — it works from sidepanel context.** Here's the evidence:

1. **Chrome sidePanel API documentation** (https://developer.chrome.com/docs/extensions/reference/api/sidePanel) explicitly states:
   > "As an extension page, side panels have access to all Chrome APIs."
   
   This means `chrome.identity` is fully available from sidepanel.js/sidepanel.html.

2. **chrome.identity API** (https://developer.chrome.com/docs/extensions/reference/api/identity):
   - `launchWebAuthFlow()` — Available since Chrome 106+ with Promise support
   - `getRedirectURL(path?)` — Synchronous, returns `https://<app-id>.chromiumapp.org/<path>`
   - Both are standard extension APIs, not restricted to background context

3. **The sidepanel runs as an extension page** — it has the same privileges as popup.html or options.html. The `chrome.identity` API is available in any extension context that has the `"identity"` permission in manifest.json.

4. **No message passing needed** — Unlike content scripts (which have limited API access), the sidepanel can call `chrome.identity.launchWebAuthFlow()` directly. No need to route through background.js for the auth flow itself.

### Important Notes
- `chrome.identity.getRedirectURL('google')` will return: `https://<extension-id>.chromiumapp.org/google`
- `chrome.identity.getRedirectURL('github')` will return: `https://<extension-id>.chromiumapp.org/github`
- The extension MUST have `"identity"` in the `permissions` array (currently missing from manifest.json)

### Testing Approach
To verify at runtime, open the extension sidepanel and run in the console:
```javascript
chrome.identity.getRedirectURL('google')
// Expected: "https://<ext-id>.chromiumapp.org/google"
```

### Impact on Implementation
- **Direct calls from sidepanel work** — no background.js relay needed for the OAuth flow
- **However**, the POST to backend for token exchange should still use `proxyFetch` via background.js (to avoid CORS issues, as planned)
- Add `"identity"` to manifest.json permissions

---

## 3. Extension ID Stabilization with `key` Field

### Question
Can the extension ID be stabilized using the `key` field in manifest.json, and how?

### Findings

**YES — the `key` field in manifest.json pins the extension ID.** Here's how:

1. **Chrome documentation** (https://developer.chrome.com/docs/extensions/reference/manifest/key):
   - The `"key"` field maintains a unique, consistent extension ID during development
   - The key is the Base64-encoded public key from a CRX keypair
   - Extension ID = first 32 characters of SHA256 hash of the public key, with a-p alphabet substitution

2. **How to generate a stable key** (two methods):

   **Method A: Chrome Developer Dashboard (recommended)**
   1. Package extension directory as .zip
   2. Upload to Chrome Developer Dashboard (don't publish)
   3. Go to Package tab → "View public key"
   4. Copy the key between `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----`
   5. Remove newlines to make single line
   6. Add to manifest.json as `"key": "<base64-public-key>"`

   **Method B: Generate locally with OpenSSL**
   ```bash
   # Generate a private key
   openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem
   
   # Extract public key in DER format, then base64 encode
   openssl rsa -in key.pem -pubout -outform DER | openssl base64 -A
   ```
   Copy the output as the `"key"` value in manifest.json.

   **Method C: Use Plasmo Itero's online tool**
   - Go to https://itero.plasmo.com/tools/generate-keypairs
   - Click "Generate KeyPairs"
   - Copy the public key into manifest.json `"key"` field
   - Load extension to see its stable CRX ID

3. **Once the key is set**, the extension ID becomes deterministic and will not change across:
   - Different machines
   - Different load paths
   - Extension reloads
   - Chrome restarts

4. **The resulting extension ID** format: 32 lowercase characters (a-p), e.g., `abcdefghijklmnopabcdefghijklmnop`

5. **Redirect URL pattern**: `https://<stable-extension-id>.chromiumapp.org/<path>`

### Impact on Implementation
- **manifest.json** needs `"key"` field added (one-time generation)
- **OAuth redirect URIs** in Google Cloud Console and GitHub OAuth settings must use the stable extension ID
- The key should be committed to the repository so all developers get the same extension ID
- **Method B (OpenSSL)** is recommended since it doesn't require Chrome Web Store upload

---

## 4. GitHub OAuth — PKCE Requirement

### Question
Does GitHub OAuth code exchange require PKCE (Proof Key for Code Exchange)?

### Findings

**PKCE is NOT required by GitHub OAuth, but is STRONGLY RECOMMENDED.**

From the official GitHub documentation (https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps):

1. **Authorization request parameters**:
   - `code_challenge` — Listed as **"Strongly recommended"** (not required)
   - `code_challenge_method` — Must be `S256` if `code_challenge` is included. The `plain` method is NOT supported.

2. **Token exchange parameters**:
   - `code_verifier` — Listed as **"Strongly recommended"**
   - Required only if `code_challenge` was sent during authorization

3. **Key details**:
   - GitHub supports standard OAuth 2.0 authorization code grant
   - The token exchange endpoint is `POST https://github.com/login/oauth/access_token`
   - Requires `client_id`, `client_secret`, `code` (and optionally `redirect_uri`, `code_verifier`)
   - The `client_secret` is REQUIRED for the token exchange (sent server-side)
   - The implicit grant type is NOT supported

4. **For our architecture** (Chrome extension + backend):
   - The extension initiates the OAuth flow and captures the `code`
   - The backend (Vercel) exchanges the `code` for a token using `client_secret`
   - Since the `client_secret` is already server-side, PKCE provides defense-in-depth but is not strictly necessary
   - PKCE is most critical for public clients (mobile apps, SPAs) that can't protect a client_secret

### Recommendation
- **Skip PKCE for initial implementation** — the server-side client_secret already protects the token exchange
- **Consider adding PKCE later** as a security enhancement (defense-in-depth)
- If adding PKCE:
  - Generate `code_verifier` (random 43-character string) in the extension
  - Compute `code_challenge` = Base64URL(SHA256(`code_verifier`))
  - Send `code_challenge` + `code_challenge_method=S256` in auth URL
  - Send `code_verifier` to backend alongside the `code`
  - Backend includes `code_verifier` in token exchange request

### Impact on Implementation
- **No PKCE needed in initial implementation** — simplifies the code
- `oauth-client.js` can send just `client_id`, `scope`, `redirect_uri`, `state` in the auth URL
- Backend sends `client_id`, `client_secret`, `code` to GitHub token endpoint

---

## 5. Additional Findings

### 5a. Redirect URI Architecture (Confirms Plan's Bug Analysis)
The plan correctly identified the redirect URI bug:
- **Current (WRONG)**: `oauth-client.js:20` sets `redirect_uri` to `${OAUTH_BACKEND_URL}/auth/github/callback`
- **Correct**: Should be `chrome.identity.getRedirectURL('github')` → `https://<ext-id>.chromiumapp.org/github`
- The `google-oauth.js:24` template already uses the correct pattern: `chrome.identity.getRedirectURL('google')`

### 5b. GitHub OAuth Scopes for Models API
- **Current (WRONG)**: `oauth-client.js:19` requests `scope: 'repo user'`
- These scopes grant repository and user profile access — NOT what's needed for GitHub Models API
- **GitHub Models** (inference API at `https://models.inference.ai.azure.com/`) uses a different auth mechanism — it primarily uses GitHub Personal Access Tokens (PATs), not OAuth app tokens
- **Investigation needed**: Whether GitHub OAuth app tokens can access the Models inference API at all. The Models API may only accept PATs, making GitHub OAuth for Models API access potentially unviable.
- **Recommendation**: Verify this during Task 4/5 implementation. If OAuth tokens don't work for GitHub Models, the GitHub OAuth button should be removed from the UI.

### 5c. Missing `identity` Permission
- `manifest.json` currently has: `["sidePanel", "activeTab", "scripting", "storage"]`
- Must add `"identity"` for `chrome.identity.launchWebAuthFlow` to work
- This is a non-breaking addition

### 5d. `access_type: 'offline'` for Google OAuth
- The current `oauth-client.js` does NOT include `access_type=offline` in the Google auth URL
- Without this, Google will NOT issue a `refresh_token`
- **Must add** `authUrl.searchParams.set('access_type', 'offline')` to get refresh tokens
- Also add `prompt=consent` to force consent screen (ensures refresh token on subsequent auths)

---

## Summary Table

| Assumption | Status | Finding |
|---|---|---|
| Google OAuth scope `generative-language.retriever` works for `generateContent` | **CONFIRMED** | Correct scope per Google's official OAuth quickstart |
| `chrome.identity.launchWebAuthFlow` works from sidepanel | **CONFIRMED** | Sidepanel has full Chrome API access |
| Extension ID can be stabilized with `key` field | **CONFIRMED** | Use OpenSSL to generate keypair, add public key to manifest.json |
| GitHub OAuth requires PKCE | **NOT REQUIRED** | Strongly recommended but not mandatory; skip for initial implementation |
| GitHub OAuth scope `repo user` is correct for Models API | **NEEDS INVESTIGATION** | GitHub Models API may only accept PATs, not OAuth tokens |
| Google refresh tokens work without `access_type=offline` | **INCORRECT** | Must add `access_type=offline` and `prompt=consent` to auth URL |

---

## Blocking Issues for Tasks 4 & 5

1. **Task 4** can proceed — redirect URI fix is confirmed correct
2. **Task 4** must add `access_type=offline` and `prompt=consent` to Google auth URL
3. **Task 5** should investigate GitHub Models API OAuth compatibility before building the GitHub OAuth flow into the UI
4. **manifest.json** changes confirmed: add `"identity"` permission + `"key"` field
