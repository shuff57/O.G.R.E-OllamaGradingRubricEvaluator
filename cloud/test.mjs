// Runnable self-check for the pure auth/quota/JWT logic. `node test.mjs`.
import assert from 'node:assert'
import { webcrypto } from 'node:crypto'
globalThis.crypto ??= webcrypto // Node <20 lacks global crypto

import { currentPeriod, parseBearer, isOverQuota, signJwt, verifyJwt } from './src/index.js'

// period bucket is YYYY-MM
assert.equal(currentPeriod(new Date('2026-06-18T12:00:00Z')), '2026-06')
assert.equal(currentPeriod(new Date('2026-01-01T00:00:00Z')), '2026-01')

// bearer parsing
assert.equal(parseBearer('Bearer abc123'), 'abc123')
assert.equal(parseBearer('bearer  spaced '), 'spaced')
assert.equal(parseBearer('Basic xyz'), null)
assert.equal(parseBearer(null), null)
assert.equal(parseBearer(''), null)

// quota boundary: at-limit is over, under-limit is not
assert.equal(isOverQuota(0, 1000), false)
assert.equal(isOverQuota(999, 1000), false)
assert.equal(isOverQuota(1000, 1000), true)
assert.equal(isOverQuota(1001, 1000), true)

// JWT round-trip + tamper/expiry/wrong-key all reject
const key = 'test-signing-key'
const now = Math.floor(Date.now() / 1000)
const tok = await signJwt({ sub: 'u1', email: 'a@b.com', exp: now + 60 }, key)
const v = await verifyJwt(tok, key)
assert.equal(v.sub, 'u1')
assert.equal(v.email, 'a@b.com')
assert.equal(await verifyJwt(tok, 'wrong-key'), null) // bad signature
assert.equal(await verifyJwt(tok + 'x', key), null) // tampered sig
assert.equal(await verifyJwt('not.a.jwt', key), null) // malformed
assert.equal(await verifyJwt(await signJwt({ sub: 'u1', exp: now - 1 }, key), key), null) // expired

console.log('ok')
