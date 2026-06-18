# OGRE Cloud

Inference turnstile in front of Ollama Cloud. Desktop app → this Worker (login +
quota) → Ollama Cloud. Stores only accounts + a usage counter — never student work.

```
Desktop ──Bearer session JWT──> Worker ──your Ollama key──> Ollama Cloud
                                  └─ D1: accounts + usage (no student data)
```

## API
| Method | Path | Does |
|--------|------|------|
| GET  | `/health` | liveness |
| POST | `/auth/google` | `{google_access_token}` → verify via Google tokeninfo (audience-checked) → upsert account → return `{session_jwt, email}` |
| GET  | `/me` | session JWT → `{email, used, limit, remaining}` |
| POST | `/grade` | session JWT → quota → stream-proxy to Ollama Cloud |

Login is Google **device flow** on the desktop (`ogre-desktop/src/lib/cloud-auth.ts`):
show a code → user authorizes in their browser → desktop gets a Google access
token → `/auth/google` exchanges it for an OGRE session JWT, stored via the app's
`saveOAuthToken` under provider `ogre-cloud`.

## Setup
```bash
cd cloud
npm install

wrangler d1 create ogre-cloud        # paste the database_id into wrangler.toml
npm run db:init                      # tables (remote); db:init:local for dev

# Google Cloud Console → Credentials → OAuth client ID,
# type "TVs and Limited Input Devices", scopes: openid email profile.
# Put the client id in wrangler.toml [vars] GOOGLE_CLIENT_ID
# and in ogre-desktop/src/lib/cloud-auth.ts GOOGLE_CLIENT_ID + OGRE_CLOUD_URL.

wrangler secret put OLLAMA_CLOUD_KEY
wrangler secret put SESSION_SIGNING_KEY   # any long random string
```

## Run / test locally
```bash
cp .dev.vars.example .dev.vars       # fill OLLAMA_CLOUD_KEY + SESSION_SIGNING_KEY
npm run db:init:local
npm run dev

curl localhost:8787/health

# /grade needs a session JWT. Mint a dev one (skips Google) and call /grade:
TOKEN=$(node mint.mjs)
curl -X POST localhost:8787/grade \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"qwen3.5:9b-cloud","messages":[{"role":"user","content":"hi"}],"stream":false}'
```

The `/grade` body is forwarded verbatim to `${OLLAMA_BASE_URL}/api/chat` — the same
shape the desktop already builds for a local Ollama. **Before wiring the app to a
model, confirm an Ollama Cloud model matches your local benchmark**
(`ogre-desktop/_pipeline-bench-*.mjs`).

Unit-check the auth/quota/JWT logic anytime: `npm test`.

## Next (Phase 3)
- `POST /auth/refresh` (rotate session JWT before 30-day expiry).
- Rate-limit `/grade` + `/auth/google` (KV/D1 counter).
- Desktop: "Sign in to OGRE Cloud" UI + an "OGRE Cloud" grading provider that
  POSTs to `${OGRE_CLOUD_URL}/grade` with `getOgreCloudToken()`; quota display via `/me`.
- Privacy disclosure on the cloud toggle; keep local as the default.
