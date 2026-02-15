/**
 * device-flow.js — OAuth Device Flow & PKCE Code-Paste Flow for O.G.R.E Extension
 *
 * Supports three provider authentication flows:
 *   1. GitHub Device Flow (RFC 8628)
 *   2. OpenAI/ChatGPT Device Flow (two-step: device_code → id_token → access_token)
 *   3. Anthropic/Claude PKCE Code-Paste Flow (authorization_code + PKCE S256)
 *
 * All network requests go through proxyFetch (from providers.js) which proxies
 * via the background service worker to avoid CORS restrictions in the sidepanel.
 *
 * IMPORTANT: URLSearchParams bodies are always converted to .toString() before
 * passing to proxyFetch, because URLSearchParams objects cannot be serialized
 * through chrome.runtime.sendMessage.
 */

import { proxyFetch } from './providers.js';

// ── Helpers ──────────────────────────────────────────────────────────────

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polling timeout: 5 minutes. */
const POLLING_TIMEOUT_MS = 5 * 60 * 1000;

/** Safety margin added to server-reported interval to avoid rate limits. */
const POLLING_SAFETY_MARGIN_MS = 3000;

// ── PKCE Helpers ─────────────────────────────────────────────────────────

/**
 * Generate a PKCE code_verifier: 128 random characters from the unreserved charset.
 * @returns {string} A 128-character code verifier.
 */
function generateCodeVerifier() {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = crypto.getRandomValues(new Uint8Array(128));
  return Array.from(randomValues, (v) => charset[v % charset.length]).join('');
}

/**
 * Generate a PKCE code_challenge: SHA-256 hash of verifier, base64url-encoded (no padding).
 * @param {string} verifier
 * @returns {Promise<string>}
 */
async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a random state parameter: 32 hex characters.
 * @returns {string}
 */
function generateState() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Token CRUD (chrome.storage.local) ────────────────────────────────────

const TOKEN_PREFIX = 'device_token:';

/**
 * Save a device-flow token to chrome.storage.local.
 * @param {string} provider - Provider key (e.g. 'github', 'openai', 'anthropic').
 * @param {{ access_token: string, token_type?: string, [key: string]: any }} tokenData
 * @returns {Promise<void>}
 */
export async function saveDeviceFlowToken(provider, tokenData) {
  await chrome.storage.local.set({ [`${TOKEN_PREFIX}${provider}`]: tokenData });
}

/**
 * Retrieve a device-flow token from chrome.storage.local.
 * @param {string} provider
 * @returns {Promise<object|null>}
 */
export async function getDeviceFlowToken(provider) {
  const key = `${TOKEN_PREFIX}${provider}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

/**
 * Delete a device-flow token from chrome.storage.local.
 * @param {string} provider
 * @returns {Promise<void>}
 */
export async function deleteDeviceFlowToken(provider) {
  await chrome.storage.local.remove(`${TOKEN_PREFIX}${provider}`);
}

// ── GitHub Device Flow ───────────────────────────────────────────────────

const GITHUB_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/**
 * Start the GitHub OAuth device flow (RFC 8628).
 *
 * Returns a user code and verification URL for display, plus a poll() function
 * that resolves once the user authorises (or on timeout/cancel).
 *
 * @returns {Promise<{ userCode: string, verificationUrl: string, poll: () => Promise<{ success: boolean, accessToken?: string, error?: string }>, cancel: () => void }>}
 */
export async function startGitHubDeviceFlow() {
  const res = await proxyFetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: 'read:user',
    }),
  });

  if (!res.ok) throw new Error(`GitHub device code request failed: ${res.status}`);
  const data = await res.json();

  const { device_code, user_code, verification_uri, interval: rawInterval } = data;
  let interval = (rawInterval ?? 5) * 1000 + POLLING_SAFETY_MARGIN_MS;
  let cancelled = false;

  return {
    userCode: user_code,
    verificationUrl: verification_uri,
    cancel: () => { cancelled = true; },
    poll: async () => {
      const deadline = Date.now() + POLLING_TIMEOUT_MS;

      while (!cancelled && Date.now() < deadline) {
        await sleep(interval);
        if (cancelled) return { success: false, error: 'Cancelled' };

        const tokenRes = await proxyFetch(GITHUB_ACCESS_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });

        const responseText = await tokenRes.text();
        const tokenData = JSON.parse(responseText);

        if (tokenData.error === 'authorization_pending') continue;
        if (tokenData.error === 'slow_down') {
          interval += 5000; // RFC 8628 §3.5
          continue;
        }
        if (tokenData.error) {
          return { success: false, error: tokenData.error_description || tokenData.error };
        }

        if (tokenData.access_token) {
          await saveDeviceFlowToken('github', {
            access_token: tokenData.access_token,
            token_type: tokenData.token_type ?? 'Bearer',
          });
          return { success: true, accessToken: tokenData.access_token };
        }
      }

      return { success: false, error: cancelled ? 'Cancelled' : 'Timeout waiting for authorization' };
    },
  };
}

// ── ChatGPT / OpenAI Device Flow ─────────────────────────────────────────

const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_DEVICE_CODE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode';
const OPENAI_DEVICE_TOKEN_URL = 'https://auth.openai.com/api/accounts/deviceauth/token';
const OPENAI_TOKEN_EXCHANGE_URL = 'https://auth.openai.com/oauth/token';
const OPENAI_AUDIENCE = 'https://api.openai.com/v1';

/**
 * Start the ChatGPT/OpenAI device flow.
 *
 * This is a TWO-STEP process:
 *   1. Poll for a device auth id_token (JWT)
 *   2. Exchange the id_token for an access_token via token exchange grant
 *
 * @returns {Promise<{ userCode: string, verificationUrl: string, poll: () => Promise<{ success: boolean, accessToken?: string, error?: string }>, cancel: () => void }>}
 */
export async function startChatGPTDeviceFlow() {
  const res = await proxyFetch(OPENAI_DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: OPENAI_CLIENT_ID }),
  });

  if (!res.ok) throw new Error(`OpenAI device code request failed: ${res.status}`);
  const data = await res.json();

  const { device_auth_id, user_code, interval: rawInterval } = data;
  const interval = (rawInterval ?? 5) * 1000;
  let cancelled = false;

  const verificationUrl = `https://auth.openai.com/codex/device?user_code=${user_code}`;

  return {
    userCode: user_code,
    verificationUrl,
    cancel: () => { cancelled = true; },
    poll: async () => {
      const deadline = Date.now() + POLLING_TIMEOUT_MS;

      while (!cancelled && Date.now() < deadline) {
        await sleep(interval);
        if (cancelled) return { success: false, error: 'Cancelled' };

        const tokenRes = await proxyFetch(OPENAI_DEVICE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_auth_id,
            grant_type: 'device_code',
          }),
        });

        const tokenData = await tokenRes.json();

        if (tokenData.error === 'authorization_pending') continue;
        if (tokenData.error === 'slow_down') {
          await sleep(5000); // Extra back-off
          continue;
        }
        if (tokenData.error) {
          return { success: false, error: tokenData.error_description || tokenData.error };
        }

        // Step 1 success: we have an id_token (JWT)
        const id_token = tokenData.id_token;
        if (!id_token) {
          return { success: false, error: 'No id_token received from device auth' };
        }

        // Step 2: Token exchange — id_token → access_token
        // MUST use .toString() on URLSearchParams for chrome.runtime.sendMessage serialization
        const exchangeBody = new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token: id_token,
          subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
          audience: OPENAI_AUDIENCE,
          client_id: OPENAI_CLIENT_ID,
        }).toString();

        const exchangeRes = await proxyFetch(OPENAI_TOKEN_EXCHANGE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: exchangeBody,
        });

        if (!exchangeRes.ok) {
          const errText = await exchangeRes.text();
          return { success: false, error: `Token exchange failed: ${errText}` };
        }

        const exchangeData = await exchangeRes.json();
        if (!exchangeData.access_token) {
          return { success: false, error: 'No access_token in token exchange response' };
        }

        await saveDeviceFlowToken('openai', {
          access_token: exchangeData.access_token,
          token_type: 'Bearer',
        });

        return { success: true, accessToken: exchangeData.access_token };
      }

      return { success: false, error: cancelled ? 'Cancelled' : 'Timeout waiting for authorization' };
    },
  };
}

// ── Claude / Anthropic PKCE Code-Paste Flow ──────────────────────────────

const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const ANTHROPIC_AUTH_URL = 'https://claude.ai/oauth/authorize';
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const ANTHROPIC_REDIRECT_URI = 'http://localhost';
const ANTHROPIC_SCOPE = 'org:create_api_key';

/**
 * Start the Claude/Anthropic PKCE code-paste flow.
 *
 * Generates PKCE code_verifier + code_challenge, builds an auth URL, and
 * returns an exchangeCode() function the caller invokes once the user pastes
 * the authorization code.
 *
 * @returns {Promise<{ authUrl: string, exchangeCode: (code: string) => Promise<{ success: boolean, accessToken?: string, error?: string }>, cancel: () => void }>}
 */
export async function startClaudeCodePasteFlow() {
  const code_verifier = generateCodeVerifier();
  const code_challenge = await generateCodeChallenge(code_verifier);
  const state = generateState();

  const authUrl = new URL(ANTHROPIC_AUTH_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', ANTHROPIC_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', ANTHROPIC_REDIRECT_URI);
  authUrl.searchParams.set('code_challenge', code_challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('scope', ANTHROPIC_SCOPE);
  authUrl.searchParams.set('state', state);

  const authUrlStr = authUrl.toString();
  let cancelled = false;

  return {
    authUrl: authUrlStr,
    cancel: () => { cancelled = true; },
    exchangeCode: async (code) => {
      if (cancelled) return { success: false, error: 'Cancelled' };

      try {
        const res = await proxyFetch(ANTHROPIC_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: ANTHROPIC_CLIENT_ID,
            code,
            redirect_uri: ANTHROPIC_REDIRECT_URI,
            code_verifier,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return { success: false, error: `Token exchange failed (${res.status}): ${errText}` };
        }

        const data = await res.json();
        if (!data.access_token) {
          return { success: false, error: 'No access_token in response' };
        }

        await saveDeviceFlowToken('anthropic', {
          access_token: data.access_token,
          token_type: 'Bearer',
        });

        return { success: true, accessToken: data.access_token };
      } catch (err) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };
}
