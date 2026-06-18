# OGRE Cloud

Inference turnstile in front of Ollama Cloud. Desktop app → this Worker (login +
quota) → Ollama Cloud. Stores only accounts + a usage counter — never student work.

## Phase 1 — proxy + quota (static token)

### Setup
```bash
cd cloud
npm install                       # wrangler

wrangler d1 create ogre-cloud     # paste the printed database_id into wrangler.toml
npm run db:init                   # create tables (remote); db:init:local for dev

wrangler secret put OLLAMA_CLOUD_KEY   # your Ollama Cloud key
wrangler secret put AUTH_TOKEN         # any static test token for now
```

### Run / test locally
```bash
cp .dev.vars.example .dev.vars    # fill in the two values
npm run db:init:local
npm run dev

curl localhost:8787/health
curl -X POST localhost:8787/grade \
  -H "Authorization: Bearer dev-test-token-change-me" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3.5:9b-cloud","messages":[{"role":"user","content":"hi"}],"stream":false}'
```

The `/grade` body is forwarded verbatim to `${OLLAMA_BASE_URL}/api/chat` — it's the
same shape the desktop already builds for a local Ollama. Confirm a Workers-AI-free
Ollama Cloud model matches your local benchmark (`ogre-desktop/_pipeline-bench-*.mjs`)
before wiring the app to it.

Unit-check the auth/quota logic anytime: `npm test`.

## API
| Method | Path | Phase | Does |
|--------|------|-------|------|
| GET | `/health` | 1 | liveness |
| POST | `/grade` | 1 | auth → quota → stream-proxy to Ollama Cloud |
| POST | `/auth/google` | 2 | exchange Google code → session JWT |
| GET | `/me` | 2 | email + remaining quota |

## Phase 2 — Google login (TODO)
- Google Cloud Console: OAuth 2.0 Client ID (Desktop app), scopes `openid email profile`.
- Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SIGNING_KEY`.
- Add `/auth/google` (code+PKCE exchange → verify ID token → upsert `accounts` → sign session JWT)
  and `/me`; swap `authenticate()` from static-token to JWT-verify.
- Desktop: reuse `ogre-desktop/electron-main/oauth-server.ts` loopback; store the
  session JWT via Electron `safeStorage`.
