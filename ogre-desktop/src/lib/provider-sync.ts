/**
 * Provider Config Sync: Desktop → Grading Server
 *
 * Reads provider configs + OAuth tokens from SQLite and POSTs them
 * to the local grading server via the handshake → Bearer token flow.
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getProviderConfigs, getOAuthToken } from "./db";

const SERVER_BASE = "http://localhost:3456";

// ── Module-level handshake token (reused across pushes / server restarts) ──
let handshakeToken: string | null = null;

/**
 * Return the current handshake token (or null if never pushed).
 * Useful for other modules that need to talk to /api/* endpoints.
 */
export function getHandshakeToken(): string | null {
  return handshakeToken;
}

// ── Health Check ────────────────────────────────────────────────────────

/**
 * Wait for the grading server to become healthy.
 * Retries GET /health up to `maxRetries` times with `delayMs` between attempts.
 * Returns true when healthy, false if all retries exhausted.
 */
export async function waitForServerHealth(
  maxRetries = 10,
  delayMs = 1000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await tauriFetch(`${SERVER_BASE}/health`, {
        method: "GET",
      });
      if (res.ok) {
        return true;
      }
    } catch {
      // Server not reachable yet — expected during startup
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

// ── Push Providers ──────────────────────────────────────────────────────

/**
 * Read all provider configs + OAuth tokens from SQLite and POST them
 * to the grading server's internal endpoint.
 *
 * On first call, fetches the server's existing handshake token (loaded from
 * its config file) so the token stays stable across server restarts.
 * Falls back to generating a new UUID if the server can't be reached.
 *
 * The server persists the config to ogre-server.json on disk, so settings
 * survive server restarts without needing the desktop to push again.
 */
export async function pushProvidersToServer(): Promise<boolean> {
  try {
    // 1. Read providers from SQLite
    const providers = await getProviderConfigs();

    // 2. Build enriched payload with credentials
    const enriched = await Promise.all(
      providers.map(async (p) => {
        const oauth = await getOAuthToken(mapProviderToOAuthKey(p.id));
        return {
          id: p.id,
          api_url: p.api_url,
          model: p.model,
          is_active: !!p.is_active,
          credentials: {
            api_key: p.api_key ?? undefined,
            access_token: oauth?.access_token ?? undefined,
            refresh_token: oauth?.refresh_token ?? undefined,
            token_type: oauth?.token_type ?? undefined,
            expires_at: oauth?.expires_at ?? undefined,
          },
        };
      })
    );

    // 3. Reuse server's existing token (from config file) to keep it stable,
    //    or generate a new one if we haven't fetched it yet
    if (!handshakeToken) {
      try {
        const hsRes = await tauriFetch(`${SERVER_BASE}/api/handshake`);
        if (hsRes.ok) {
          const hsData = await hsRes.json();
          handshakeToken = hsData.token;
        }
      } catch {
        // Server not reachable — will generate new token
      }
      if (!handshakeToken) {
        handshakeToken = crypto.randomUUID();
      }
    }

    // 4. POST to grading server (server persists to config file automatically)
    const res = await tauriFetch(`${SERVER_BASE}/internal/providers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: handshakeToken,
        providers: enriched,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return false;
    }

    const data = await res.json();
    return true;
  } catch (err) {
    return false;
  }
}

// ── Startup Push (health check + push) ──────────────────────────────────

/**
 * Wait for the grading server to become healthy, then push provider configs.
 * Intended to be called once at app startup (e.g. after server-status → running).
 */
export async function pushOnStartup(): Promise<void> {
  const healthy = await waitForServerHealth();
  if (healthy) {
    await pushProvidersToServer();
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Map a provider_configs.id to the oauth_tokens.provider key.
 * The oauth table uses short keys (github, google, etc.) while
 * provider_configs uses full IDs (github-models, google-gemini, etc.).
 */
function mapProviderToOAuthKey(
  id: string
): string {
  switch (id) {
    case "github-models":
      return "github";
    case "google-gemini":
      return "google";
    default:
      return id; // openai, anthropic, ollama — same key
  }
}
