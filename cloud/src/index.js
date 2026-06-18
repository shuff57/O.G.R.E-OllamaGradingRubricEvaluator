// OGRE Cloud — an inference turnstile in front of Ollama Cloud.
//
// Phase 1 (this file): static-token auth + monthly quota + streaming /grade proxy.
// Phase 2 swaps the static token for a Google-issued session JWT verified here;
// the rest of the pipe (quota + proxy) is unchanged.
//
// Stores nothing but a usage counter. Student work only transits — never persisted.

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

// ── Worker ─────────────────────────────────────────────────────────────────

// ponytail: in Phase 1 the static token IS the account. Phase 2 verifies a JWT
// here and returns the real account id from its `sub` claim — nothing else changes.
function authenticate(req, env) {
  const token = parseBearer(req.headers.get('Authorization'))
  if (!token || token !== env.AUTH_TOKEN) return null
  return { accountId: 'test' }
}

async function handleGrade(req, env, ctx) {
  const account = authenticate(req, env)
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
    if (req.method === 'POST' && pathname === '/grade') return handleGrade(req, env, ctx)
    return json({ error: 'not_found' }, 404)
  },
}
