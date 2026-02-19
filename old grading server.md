# Original Grading Server Architecture (Pre-Desktop GUI)

## Overview
Before the desktop GUI wrapper was added, the grading server was a standalone Bun/Hono HTTP server. The extension handled all authentication and API calls to GitHub Copilot directly.

## Authentication Flow (GitHub Models)

### OAuth Device Flow (RFC 8628)
1. User clicks "Sign In" button in extension sidepanel
2. Extension calls `device-flow.js` which POSTs to `https://github.com/login/device/code`
3. GitHub returns a `user_code` and `device_code`
4. Extension displays the user code and opens `https://github.com/login/device` for user to authorize
5. Extension polls `https://github.com/login/oauth/access_token` until user completes authorization
6. GitHub returns an OAuth access token (`gho_...` prefix)

### Token Details
- **Token Type:** OAuth Access Token (`gho_...`)
- **Client ID:** `178c6fc778ccc68e1d6a` (GitHub's public OAuth app, same as GitHub CLI)
- **Scopes:** `read:user`
- **Storage:** `chrome.storage.local` under key `device_token:github`

### Key Files
- `device-flow.js` (lines 99-179): OAuth Device Flow implementation
- `providers.js` (lines 222-309): GitHub Models provider config
- `providers.js` (lines 590-617): `callProviderAI()` browser fetch helper

## Batch Grading Flow (Proxy Mode)

### Critical Design: Extension Calls GitHub API, NOT the Server

The extension **never** sent the GitHub OAuth token to the grading server. Instead:

1. **Extension** extracts rubric + student data from the page
2. **Extension** POSTs student data to `POST /api/grade/start` on grading server
3. **Server** creates a session, chunks students, builds AI prompts, returns first prompt
4. **Extension** calls `api.githubcopilot.com/chat/completions` directly via browser `fetch()` using the stored OAuth token
5. **Extension** sends the AI's text response back to `POST /api/grade/next`
6. **Server** parses the response, builds next prompt (or returns final results)
7. Loop continues until all chunks are processed

### Why Proxy Mode?
- GitHub Copilot API enforces CORS restrictions blocking server-side requests
- Chrome extensions can bypass CORS for fetch requests (extension origin is allowed)
- Token stays secure in browser storage (never leaves the extension)
- Server only needs the AI's text output, not the authentication token

## Server Endpoints (Original)

### `POST /grade` (Legacy Direct Mode)
- Body: `{ provider, apiUrl, apiKey, model, rubric, students }`
- Used for Ollama, OpenAI, Anthropic, Gemini — server calls AI directly
- Extension passed `apiKey` in the body for these providers
- Server made the HTTP call to the AI provider and returned results

### `POST /api/grade/start` (Proxy/Iterative Mode)
- Body: `{ provider, model, rubric, students }`
- Returns: `{ sessionId, phase, messages, chunkIndex, totalChunks }`
- No API key needed — extension handles AI calls

### `POST /api/grade/next` (Proxy/Iterative Mode)
- Body: `{ sessionId, aiResponseText }`
- Returns: next prompt or final results

## Provider Request Format (GitHub Models)

```javascript
// From grading-server/providers.js - buildGitHubModelsRequest()
{
  url: 'https://api.githubcopilot.com/chat/completions',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <gho_token>',
    'Copilot-Integration-Id': 'vscode-chat',
  },
  body: {
    model: 'claude-haiku-4.5',
    messages: [{ role: 'user', content: '<prompt>' }],
    stream: false,
  }
}
```

## Key Insight: Current Architecture Matches Original

The current desktop GUI setup recreates the same proxy architecture:
- For **Ollama/OpenAI/etc**: Server calls AI directly (direct mode) — same as original `POST /grade`
- For **GitHub Copilot**: Extension relays AI calls (proxy mode) — same as original iterative protocol

The 403 error on GitHub Copilot's `/chat/completions` endpoint is a **token scope issue**, not an architecture issue. The `gho_` token with `read:user` scope (from GitHub CLI's client ID) can list models but cannot invoke chat completions. This may have worked previously if:
1. GitHub temporarily allowed broader access for that client ID
2. The token had additional permissions at the time
3. A different token was being used (e.g., a `ghp_` PAT with Copilot access)
