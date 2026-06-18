// OGRE Cloud login — Google device flow, then exchange for an OGRE session JWT.
//
// This logs the user into OUR hosted inference only; it is independent of the
// Gemini "google" provider auth in oauth.ts (different OAuth client + scope).
// Returns the same DeviceFlowResult shape the other providers use, so it drops
// straight into ProviderSettings' device-flow UI. The session JWT is stored
// under provider key "ogre-cloud" and pushed to the grading server as the
// provider's credential; OGRE Cloud is otherwise an Ollama-wire provider.

import { saveOAuthToken, getOAuthToken, deleteOAuthToken } from './db'
import type { DeviceFlowResult } from './oauth'

// TODO(deploy): point at your deployed Worker, and register the Google client.
export const OGRE_CLOUD_URL = 'https://ogre-cloud.example.workers.dev'
const GOOGLE_CLIENT_ID = 'REPLACE_WITH_GOOGLE_CLIENT_ID' // TVs & Limited Input Devices
const GOOGLE_DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'openid email profile'
const POLL_TIMEOUT_MS = 5 * 60 * 1000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function startOgreCloudLogin(): Promise<DeviceFlowResult> {
  const res = await fetch(GOOGLE_DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, scope: SCOPE }),
  })
  if (!res.ok) throw new Error(`Google device code failed: ${res.status}`)
  const data = (await res.json()) as {
    device_code: string; user_code: string; verification_url: string; interval?: number
  }
  let cancelled = false
  const interval = ((data.interval ?? 5) * 1000) + 3000 // RFC 8628 safety margin

  return {
    userCode: data.user_code,
    verificationUrl: data.verification_url,
    cancel: () => { cancelled = true },
    poll: async () => {
      const deadline = Date.now() + POLL_TIMEOUT_MS
      while (!cancelled && Date.now() < deadline) {
        await sleep(interval)
        if (cancelled) return { success: false, error: 'Cancelled' }

        const t = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            device_code: data.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        })
        const td = (await t.json()) as {
          error?: string; error_description?: string; access_token?: string
        }
        if (td.error === 'authorization_pending') continue
        if (td.error === 'slow_down') { await sleep(5000); continue }
        if (td.error) return { success: false, error: td.error_description || td.error }
        if (!td.access_token) continue

        // Hand the Google access token to the Worker; it verifies + issues our JWT.
        const ex = await fetch(`${OGRE_CLOUD_URL}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ google_access_token: td.access_token }),
        })
        if (!ex.ok) return { success: false, error: `OGRE Cloud login failed: ${ex.status}` }
        const { session_jwt } = (await ex.json()) as { session_jwt: string; email: string }
        await saveOAuthToken({ provider: 'ogre-cloud', access_token: session_jwt, token_type: 'Bearer' })
        return { success: true, accessToken: session_jwt }
      }
      return { success: false, error: cancelled ? 'Cancelled' : 'Timed out waiting for authorization' }
    },
  }
}

/** The session JWT to send as `Authorization: Bearer` on cloud grading requests. */
export async function getOgreCloudToken(): Promise<string | null> {
  const t = await getOAuthToken('ogre-cloud')
  return t?.access_token ?? null
}

export async function isOgreCloudSignedIn(): Promise<boolean> {
  return (await getOgreCloudToken()) !== null
}

export async function signOutOgreCloud(): Promise<void> {
  await deleteOAuthToken('ogre-cloud')
}
