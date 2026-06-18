// OGRE Cloud — an inference turnstile in front of Ollama Cloud.
//
// Login (Google device flow on the desktop) → /auth/google verifies the Google
// token and issues an OGRE session JWT → /grade checks that JWT + quota and
// stream-proxies to Ollama Cloud. Stores only accounts + a usage counter;
// student work transits, never persisted.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

// ── Pure helpers (unit-tested in ../test.mjs) ──────────────────────────────

export function currentPeriod(now = new Date()) {
  return now.toISOString().slice(0, 7) // 'YYYY-MM' quota bucket
}

export function parseBearer(header) {
  if (!header) return null
  const m = /^Bearer\s+(.+)$/i.exec(header)
  return m ? m[1].trim() : null
}

export function isOverQuota(count, limit) {
  return count >= limit
}

// ── Minimal HS256 JWT (Web Crypto — runs on Workers and Node 20+) ───────────

function b64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  )
}

export async function signJwt(payload, secret) {
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)))
  const data = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}`
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(data))
  return `${data}.${b64url(sig)}`
}

export async function verifyJwt(token, secret, now = Math.floor(Date.now() / 1000)) {
  const parts = String(token).split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const ok = await crypto.subtle.verify(
    'HMAC', await hmacKey(secret), b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`),
  )
  if (!ok) return null
  let payload
  try { payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p))) } catch { return null }
  if (payload.exp && now >= payload.exp) return null
  return payload
}

// ── Auth ────────────────────────────────────────────────────────────────────

// Verify the OGRE session JWT the desktop sends on every grading request.
async function authenticate(req, env) {
  const token = parseBearer(req.headers.get('Authorization'))
  if (!token) return null
  const payload = await verifyJwt(token, env.SESSION_SIGNING_KEY)
  if (!payload?.sub) return null
  return { accountId: payload.sub, email: payload.email }
}

// Desktop did the Google device flow and hands us the resulting access token.
// We validate it with Google directly (tokeninfo) and check the audience so a
// token minted for another app can't be replayed here.
async function handleAuthGoogle(req, env) {
  const { google_access_token } = await req.json().catch(() => ({}))
  if (!google_access_token) return json({ error: 'missing_token' }, 400)

  const info = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(google_access_token)}`,
  )
  if (!info.ok) return json({ error: 'invalid_google_token' }, 401)
  const claims = await info.json()
  if (claims.aud !== env.GOOGLE_CLIENT_ID || !claims.sub) {
    return json({ error: 'wrong_audience' }, 401)
  }

  const accountId = await upsertAccount(env, claims.sub, claims.email ?? '')
  const nowSec = Math.floor(Date.now() / 1000)
  const session = await signJwt(
    { sub: accountId, email: claims.email ?? '', iat: nowSec, exp: nowSec + 30 * 24 * 3600 },
    env.SESSION_SIGNING_KEY,
  )
  return json({ session_jwt: session, email: claims.email ?? '' })
}

async function upsertAccount(env, googleSub, email) {
  const existing = await env.DB.prepare('SELECT id FROM accounts WHERE google_sub = ?')
    .bind(googleSub).first()
  if (existing) return existing.id
  const id = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO accounts (id, google_sub, email, plan, created_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(id, googleSub, email, 'free', Date.now()).run()
  return id
}

// ── Routes ────────────────────────────────────────────────────────────────

async function handleMe(req, env) {
  const account = await authenticate(req, env)
  if (!account) return json({ error: 'unauthorized' }, 401)
  const limit = Number(env.FREE_MONTHLY_LIMIT ?? 1000)
  const row = await env.DB.prepare('SELECT count FROM usage WHERE account_id = ? AND period = ?')
    .bind(account.accountId, currentPeriod()).first()
  const used = row?.count ?? 0
  return json({ email: account.email, used, limit, remaining: Math.max(0, limit - used) })
}

async function handleGrade(req, env, ctx) {
  const account = await authenticate(req, env)
  if (!account) return json({ error: 'unauthorized' }, 401)

  const period = currentPeriod()
  const limit = Number(env.FREE_MONTHLY_LIMIT ?? 1000)

  // Check before spending Ollama tokens.
  // ponytail: read-then-write soft cap. Concurrent requests may slip a few over
  // the limit — fine for a quota; tighten with a Durable Object only if it matters.
  const row = await env.DB.prepare(
    'SELECT count FROM usage WHERE account_id = ? AND period = ?',
  ).bind(account.accountId, period).first()
  if (isOverQuota(row?.count ?? 0, limit)) {
    return json({ error: 'quota_exceeded', limit, period }, 429)
  }

  // Forward the desktop's Ollama /api/chat body verbatim; just inject the key.
  const body = await req.text()
  const upstream = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OLLAMA_CLOUD_KEY}`,
    },
    body,
  })

  if (!upstream.ok) {
    const detail = await upstream.text()
    return json({ error: 'upstream_error', status: upstream.status, detail }, 502)
  }

  // Count only successful calls; don't block streaming on the DB write.
  ctx.waitUntil(bumpUsage(env, account.accountId, period))

  // Stream Ollama's response straight back to the desktop (SSE/NDJSON passthrough).
  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      ...CORS,
    },
  })
}

async function bumpUsage(env, accountId, period) {
  await env.DB.prepare(
    `INSERT INTO usage (account_id, period, count) VALUES (?, ?, 1)
     ON CONFLICT(account_id, period) DO UPDATE SET count = count + 1`,
  ).bind(accountId, period).run()
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
    const { pathname } = new URL(req.url)
    if (req.method === 'GET' && pathname === '/health') return json({ ok: true })
    if (req.method === 'POST' && pathname === '/auth/google') return handleAuthGoogle(req, env)
    if (req.method === 'GET' && pathname === '/me') return handleMe(req, env)
    if (req.method === 'POST' && pathname === '/grade') return handleGrade(req, env, ctx)
    return json({ error: 'not_found' }, 404)
  },
}
