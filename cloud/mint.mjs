// Mint a 1-day dev session JWT so you can curl /grade locally without Google.
// Reads SESSION_SIGNING_KEY from .dev.vars. Usage: `node mint.mjs`
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
globalThis.crypto ??= webcrypto
import { signJwt } from './src/index.js'

const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('=')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }),
)
const key = vars.SESSION_SIGNING_KEY
if (!key) throw new Error('SESSION_SIGNING_KEY missing from .dev.vars')

const now = Math.floor(Date.now() / 1000)
console.log(await signJwt({ sub: 'dev', email: 'dev@local', iat: now, exp: now + 86400 }, key))
