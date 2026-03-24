const openUrl = (url: string) => window.open(url, '_blank')

/**
 * Make a fetch-like HTTP request via the Electron main process.
 * Bypasses renderer-side CORS so we can reach OAuth token endpoints
 * (e.g. console.anthropic.com) that don't allow localhost/file:// origins.
 */
async function mainFetch(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }> {
  const eAPI = (window as any).electronAPI
  if (!eAPI?.invoke) {
    // Fallback to normal fetch (browser dev / test contexts)
    const r = await fetch(url, options)
    return r
  }
  const result = await eAPI.invoke('oauth:fetch', {
    url,
    method: options.method ?? 'POST',
    headers: options.headers ?? {},
    body: options.body,
  }) as { ok: boolean; status: number; body: string }
  return {
    ok: result.ok,
    status: result.status,
    text: async () => result.body,
    json: async () => JSON.parse(result.body),
  }
}

import { saveOAuthToken, getOAuthToken, deleteOAuthToken } from "./db";
import { pushProvidersToServer } from "./provider-sync";
// ── Types ────────────────────────────────────────────────────────────────
export interface DeviceFlowResult {
  userCode: string;
  verificationUrl: string;
  poll: () => Promise<{ success: boolean; accessToken?: string; error?: string }>;
  cancel: () => void;
  /** Copy-paste flows expose this to submit the pasted code */
  submitCode?: (code: string) => void;
}


// ── Helpers ──────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const POLLING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLLING_SAFETY_MARGIN_MS = 3000;

/** Generate a PKCE code_verifier: 128 random characters from unreserved charset. */
function generateCodeVerifier(): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = crypto.getRandomValues(new Uint8Array(128));
  return Array.from(randomValues, (v) => charset[v % charset.length]).join("");
}

/** Generate a PKCE code_challenge: SHA-256 hash of verifier, base64url-encoded. */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  // base64url encode (no padding)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generate a random state parameter: 32 hex characters. */
function generateState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── GitHub Device Flow ───────────────────────────────────────────────────

// GitHub Copilot OAuth App (public client for device flow)
// This is the official VS Code Copilot app ID - enables Copilot API access
// See: https://github.com/Alorse/copilot-to-api
const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98";
const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";

export async function startGitHubDeviceFlow(): Promise<DeviceFlowResult> {
  const res = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: "read:user",
    }),
  });

  if (!res.ok) throw new Error(`GitHub device code request failed: ${res.status}`);
  const data = await res.json();


  const {
    device_code,
    user_code,
    verification_uri,
    interval: rawInterval,
  } = data;


  let interval = (rawInterval ?? 5) * 1000 + POLLING_SAFETY_MARGIN_MS;
  let cancelled = false;

  await openUrl(verification_uri);

  return {
    userCode: user_code,
    verificationUrl: verification_uri,
    cancel: () => { cancelled = true; },
    poll: async () => {
      const deadline = Date.now() + POLLING_TIMEOUT_MS;

      while (!cancelled && Date.now() < deadline) {
        await sleep(interval);
        if (cancelled) return { success: false, error: "Cancelled" };

        const tokenRes = await fetch(GITHUB_ACCESS_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            device_code,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          }),
        });

        const responseText = await tokenRes.text();
        const tokenData = JSON.parse(responseText);

        if (tokenData.error === "authorization_pending") continue;
        if (tokenData.error === "slow_down") {
          interval += 5000; // RFC 8628 §3.5
          continue;
        }
        if (tokenData.error) {
          return { success: false, error: tokenData.error_description || tokenData.error };
        }

        if (tokenData.access_token) {
          try {
            await saveOAuthToken({
              provider: "github",
              access_token: tokenData.access_token,
              token_type: tokenData.token_type ?? "Bearer",
            });
          } catch (err) {
            return { success: false, error: `Failed to save token: ${err}` };
          }
          return { success: true, accessToken: tokenData.access_token };
        }
      }

      return { success: false, error: cancelled ? "Cancelled" : "Timeout waiting for authorization" };
    },
  };
}

// ── ChatGPT / OpenAI Device Flow ─────────────────────────────────────────

const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_DEVICE_CODE_URL = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const OPENAI_DEVICE_TOKEN_URL = "https://auth.openai.com/api/accounts/deviceauth/token";
const OPENAI_TOKEN_EXCHANGE_URL = "https://auth.openai.com/oauth/token";
const OPENAI_AUDIENCE = "https://api.openai.com/v1";

export async function startChatGPTDeviceFlow(): Promise<DeviceFlowResult> {
  const res = await fetch(OPENAI_DEVICE_CODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: OPENAI_CLIENT_ID }),
  });

  if (!res.ok) throw new Error(`OpenAI device code request failed: ${res.status}`);
  const data = await res.json();

  const { device_auth_id, user_code, interval: rawInterval } = data;
  const interval = (rawInterval ?? 5) * 1000;
  let cancelled = false;

  const verificationUrl = `https://auth.openai.com/codex/device?user_code=${user_code}`;
  await openUrl(verificationUrl);

  return {
    userCode: user_code,
    verificationUrl,
    cancel: () => { cancelled = true; },
    poll: async () => {
      const deadline = Date.now() + POLLING_TIMEOUT_MS;

      while (!cancelled && Date.now() < deadline) {
        await sleep(interval);
        if (cancelled) return { success: false, error: "Cancelled" };

        const tokenRes = await fetch(OPENAI_DEVICE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_auth_id,
            grant_type: "device_code",
          }),
        });

        const tokenData = await tokenRes.json();

        if (tokenData.error === "authorization_pending") continue;
        if (tokenData.error === "slow_down") {
          await sleep(5000);
          continue;
        }
        if (tokenData.error) {
          return { success: false, error: tokenData.error_description || tokenData.error };
        }

        // Step 1 success: we have an id_token (JWT), now exchange for access_token
        const id_token = tokenData.id_token;
        if (!id_token) {
          return { success: false, error: "No id_token received from device auth" };
        }

        // Step 2: Token exchange — id_token → access_token
        const exchangeRes = await fetch(OPENAI_TOKEN_EXCHANGE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
            subject_token: id_token,
            subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
            audience: OPENAI_AUDIENCE,
            client_id: OPENAI_CLIENT_ID,
          }),
        });

        if (!exchangeRes.ok) {
          const errText = await exchangeRes.text();
          return { success: false, error: `Token exchange failed: ${errText}` };
        }

        const exchangeData = await exchangeRes.json();
        if (!exchangeData.access_token) {
          return { success: false, error: "No access_token in token exchange response" };
        }

        await saveOAuthToken({
          provider: "openai",
          access_token: exchangeData.access_token,
          token_type: "Bearer",
        });

        return { success: true, accessToken: exchangeData.access_token };
      }

      return { success: false, error: cancelled ? "Cancelled" : "Timeout waiting for authorization" };
    },
  };
}

// ── Claude / Anthropic OAuth (Copy-Paste Flow) ───────────────────────────
const ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const ANTHROPIC_AUTH_URL = "https://claude.ai/oauth/authorize";
const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const ANTHROPIC_SCOPE = "org:create_api_key user:profile user:inference";
const ANTHROPIC_REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const ANTHROPIC_KNOWN_MODELS: string[] = [
  'claude-opus-4-20250514',
  'claude-opus-4-20250220',
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-20250220',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
];

// ── models.dev live model fetch (with 1-hour in-memory cache) ────────────
let _modelsDevCache: { models: string[]; fetchedAt: number } | null = null;
const MODELS_DEV_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchAnthropicModelsFromModelsDev(): Promise<string[]> {
  if (_modelsDevCache && Date.now() - _modelsDevCache.fetchedAt < MODELS_DEV_TTL_MS) {
    return _modelsDevCache.models;
  }
  const res = await fetch('https://models.dev/api.json');
  if (!res.ok) throw new Error(`models.dev fetch failed: ${res.status}`);
  const data: Record<string, any> = await res.json();
  const anthropicModels: Record<string, any> = data['anthropic']?.models ?? {};
  const models = Object.entries(anthropicModels)
    .filter(([_, m]) => m.status !== 'alpha' && m.status !== 'deprecated')
    .map(([id]) => id);
  if (models.length === 0) throw new Error('models.dev returned empty anthropic model list');
  _modelsDevCache = { models, fetchedAt: Date.now() };
  return models;
}

export async function startClaudeOAuthFlow(): Promise<DeviceFlowResult> {
  const code_verifier = generateCodeVerifier();
  const code_challenge = await generateCodeChallenge(code_verifier);
  const state = generateState();
  // Use Anthropic's hosted callback with code=true — causes Anthropic to display
  // the auth code on-screen so the user can copy and paste it back into the app.
  const authUrl = new URL(ANTHROPIC_AUTH_URL);
  authUrl.searchParams.set("code", "true");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", ANTHROPIC_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", ANTHROPIC_REDIRECT_URI);
  authUrl.searchParams.set("code_challenge", code_challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("scope", ANTHROPIC_SCOPE);
  authUrl.searchParams.set("state", state);
  const authUrlStr = authUrl.toString();
  await openUrl(authUrlStr);
  // Copy-paste resolver: poll() awaits until submitCode() is called with the pasted value.
  let resolveCode: ((code: string) => void) | null = null;
  const codePromise = new Promise<string>(resolve => { resolveCode = resolve; });
  return {
    userCode: "", // Not shown — user pastes the code directly
    verificationUrl: authUrlStr,
    submitCode: (code: string) => { resolveCode?.(code); },
    cancel: () => { resolveCode?.(""); },
    poll: async () => {
      try {
        const pastedCode = await codePromise;
        if (!pastedCode) return { success: false, error: "Cancelled" };

        // Anthropic returns the pasted code as "{auth_code}#{state}"
        const parts = pastedCode.split("#");
        const code = parts[0].trim();
        const pastedState = parts[1]?.trim() || state;

        // Retry up to 3 times with backoff on 429 rate-limit responses
        let res: Awaited<ReturnType<typeof mainFetch>> | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await sleep(5000 * attempt); // 5s, 10s
          res = await mainFetch(ANTHROPIC_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              grant_type: "authorization_code",
              client_id: ANTHROPIC_CLIENT_ID,
              code,
              redirect_uri: ANTHROPIC_REDIRECT_URI,
              code_verifier,
              state: pastedState,
            }),
          });
          if (res.status !== 429) break;
        }
        if (!res!.ok) {
          const errText = await res!.text();
          if (res!.status === 429) {
            return { success: false, error: "Anthropic rate limited the login. Wait 60 seconds and try again." };
          }
          return { success: false, error: `Token exchange failed (${res!.status}): ${errText}` };
        }
        const data = await res!.json() as Record<string, any>;
        if (!data.access_token) {
          return { success: false, error: "No access_token in response" };
        }
        await saveOAuthToken({
          provider: "anthropic",
          access_token: data.access_token,
          refresh_token: data.refresh_token ?? null,
          token_type: data.token_type || "Bearer",
          expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
        });
        return { success: true, accessToken: data.access_token };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  };
}

// ── Anthropic Token Refresh ──────────────────────────────────────────────

async function refreshAnthropicToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const res = await mainFetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: ANTHROPIC_CLIENT_ID,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  return await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };
}

/**
 * Get a valid Anthropic access token, refreshing if needed.
 * Call this before any Anthropic Bearer-auth API call.
 */
export async function getValidAnthropicToken(): Promise<string | null> {
  const tokenData = await getOAuthToken("anthropic");
  if (!tokenData) return null;

  // Check if token expires within 5 minutes
  const FIVE_MINUTES = 5 * 60 * 1000;
  if (tokenData.expires_at && tokenData.expires_at < Date.now() + FIVE_MINUTES) {
    if (!tokenData.refresh_token) {
      // Token expired and no refresh token — user must re-authenticate
      return null;
    }

    try {
      const refreshed = await refreshAnthropicToken(tokenData.refresh_token);
      await saveOAuthToken({
        provider: "anthropic",
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? tokenData.refresh_token,
        token_type: "Bearer",
        expires_at: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null,
      });
      await pushProvidersToServer();
      return refreshed.access_token;
    } catch (err) {
      return null;
    }
  }

  return tokenData.access_token;
}

// ── Google Device Flow ───────────────────────────────────────────────────

// Placeholder — register at https://console.cloud.google.com/apis/credentials
// (select "TVs and Limited Input Devices" type) then replace this value.
const GOOGLE_CLIENT_ID = "UNREGISTERED_GOOGLE_OAUTH_CLIENT";
const GOOGLE_DEVICE_CODE_URL = "https://oauth2.googleapis.com/device/code";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/generative-language.retriever";

export async function startGoogleDeviceFlow(): Promise<DeviceFlowResult> {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_SCOPE,
  });

  const res = await fetch(GOOGLE_DEVICE_CODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) throw new Error(`Google device code request failed: ${res.status}`);
  const data = await res.json();

  const {
    device_code,
    user_code,
    verification_url,
    interval: rawInterval,
  } = data;

  let interval = (rawInterval ?? 5) * 1000 + POLLING_SAFETY_MARGIN_MS;
  let cancelled = false;

  await openUrl(verification_url);

  return {
    userCode: user_code,
    verificationUrl: verification_url,
    cancel: () => { cancelled = true; },
    poll: async () => {
      const deadline = Date.now() + POLLING_TIMEOUT_MS;

      while (!cancelled && Date.now() < deadline) {
        await sleep(interval);
        if (cancelled) return { success: false, error: "Cancelled" };

        const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            device_code,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          }),
        });

        const tokenData = await tokenRes.json();

        if (tokenData.error === "authorization_pending") continue;
        if (tokenData.error === "slow_down") {
          interval += 5000; // RFC 8628 §3.5
          continue;
        }
        if (tokenData.error) {
          return { success: false, error: tokenData.error_description || tokenData.error };
        }

        if (tokenData.access_token) {
          await saveOAuthToken({
            provider: "google",
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token ?? null,
            token_type: tokenData.token_type ?? "Bearer",
            expires_at: tokenData.expires_in
              ? Date.now() + tokenData.expires_in * 1000
              : null,
          });
          return { success: true, accessToken: tokenData.access_token };
        }
      }

      return { success: false, error: cancelled ? "Cancelled" : "Timeout waiting for authorization" };
    },
  };
}

// ── Model Fetching ───────────────────────────────────────────────────────

export async function fetchAvailableModels(
  provider: "github" | "openai" | "anthropic" | "google" | "ollama",
  token?: string,
  apiUrl?: string
): Promise<string[]> {
  // Ollama special case: needs API URL from provider config
  if (provider === "ollama") {
    const { getProviderConfig } = await import("./db");
    const config = await getProviderConfig("ollama");
    if (!config?.api_url) throw new Error("Ollama API URL not configured");

    const baseUrl = config.api_url.replace(/\/$/, '');
    const url = `${baseUrl}/api/tags`;
    const headers: Record<string, string> = {};

    // Add Authorization header if API key is configured
    if (config.api_key) {
      headers['Authorization'] = `Bearer ${config.api_key}`;
    }

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}. Is Ollama running?`);
      const json = await res.json();

      // Ollama returns { models: [{ name: "llama2:latest", ... }, ...] }
      return json.models?.map((m: any) => m.name) || [];
    } catch (err) {
      // tauriFetch can throw non-Error objects (strings, Tauri IPC errors)
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('connection') || msg.includes('refused') || msg.includes('network')) {
        throw new Error(`Cannot connect to Ollama at ${baseUrl}. Is Ollama running?`);
      }
      throw new Error(msg || `Failed to fetch Ollama models from ${baseUrl}`);
    }
  }

  // Use provided token or look up stored one
  let accessToken = token;
  if (!accessToken) {
    // For GitHub, try API key from provider config first (OAuth doesn't work for models API)
    if (provider === "github") {
      const { getProviderConfig } = await import("./db");
      const config = await getProviderConfig("github-models");
      if (config?.api_key) {
        accessToken = config.api_key;
      }
    }
    
    // Fall back to OAuth token if no API key
    if (!accessToken) {
      const tokenData = await getOAuthToken(provider);
      if (!tokenData) throw new Error(`Not signed in to ${provider}`);
      accessToken = tokenData.access_token;
    }
  }

  switch (provider) {
    case "github": {
      const res = await fetch("https://api.githubcopilot.com/models", {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          "Copilot-Integration-Id": "vscode-chat",
        },
      });
      if (!res.ok) throw new Error(`Failed to fetch GitHub models: ${res.status}`);
      const json = await res.json();
      // Copilot API returns { data: [...] } with OpenAI-style format
      const models = Array.isArray(json) ? json : (json.data || json.value || []);
      return models
        .map((m: any) => ({ id: m.id || m.name, name: m.id || m.name }))
        .map((m: any) => m.id);
    }

    case "openai": {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch OpenAI models: ${res.status}`);
      const json = await res.json();
      return json.data?.map((m: any) => m.id) || [];
    }

    case "anthropic": {
      // OAuth tokens cannot access /v1/models - return hardcoded list
      const oauthData = await getOAuthToken('anthropic');
      if (oauthData?.token_type === 'Bearer') {
        try {
          return await fetchAnthropicModelsFromModelsDev();
        } catch {
          return ANTHROPIC_KNOWN_MODELS;
        }
      }

      // Use refreshed token if available (handles token expiry)
      const validToken = await getValidAnthropicToken();
      const effectiveToken = validToken || accessToken;

      const anthropicAuthHeader = oauthData?.token_type === 'Bearer'
        ? { 'Authorization': `Bearer ${effectiveToken}` }
        : { 'x-api-key': effectiveToken };
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          ...anthropicAuthHeader,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "oauth-2025-04-20,interleaved-thinking-2025-05-14",
          "user-agent": "claude-cli/2.1.2 (external, cli)",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      });
      if (!res.ok) throw new Error(`Failed to fetch Anthropic models: ${res.status}`);
      const json = await res.json();
      return json.data?.map((m: any) => m.id) || [];
    }

    case "google": {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch Google models: ${res.status}`);
      const json = await res.json();
      return json.models?.map((m: any) => m.name.replace("models/", "")) || [];
    }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Sign Out ─────────────────────────────────────────────────────────────

export async function signOut(provider: string): Promise<void> {
  // Best-effort token revocation for Google
  if (provider === "google") {
    const tokenData = await getOAuthToken(provider);
    if (tokenData?.access_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenData.access_token}`, {
          method: "POST",
        });
      } catch {
        // Revocation is best-effort
      }
    }
  }
  await deleteOAuthToken(provider);
}
