// Runnable self-check for the pure auth/quota logic. `node test.mjs`.
import assert from 'node:assert'
import { currentPeriod, parseBearer, isOverQuota } from './src/index.js'

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

console.log('ok')
