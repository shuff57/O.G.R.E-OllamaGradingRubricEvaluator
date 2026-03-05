import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock @tauri-apps/plugin-http ──────────────────────────────────────────
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mockFetch }));

// ── Mock @tauri-apps/plugin-shell ─────────────────────────────────────────
const { mockOpen } = vi.hoisted(() => ({ mockOpen: vi.fn() }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: mockOpen }));

// ── Mock ./db ─────────────────────────────────────────────────────────────
const {
  mockGetOAuthToken,
  mockSaveOAuthToken,
  mockDeleteOAuthToken,
  mockGetProviderConfig,
} = vi.hoisted(() => ({
  mockGetOAuthToken: vi.fn(),
  mockSaveOAuthToken: vi.fn(),
  mockDeleteOAuthToken: vi.fn(),
  mockGetProviderConfig: vi.fn(),
}));
vi.mock("./db", () => ({
  getOAuthToken: mockGetOAuthToken,
  saveOAuthToken: mockSaveOAuthToken,
  deleteOAuthToken: mockDeleteOAuthToken,
  getProviderConfig: mockGetProviderConfig,
}));

// ── Mock ./provider-sync ──────────────────────────────────────────────────
const { mockPushProvidersToServer } = vi.hoisted(() => ({
  mockPushProvidersToServer: vi.fn(),
}));
vi.mock("./provider-sync", () => ({
  pushProvidersToServer: mockPushProvidersToServer,
}));

// ── Import AFTER mocks ───────────────────────────────────────────────────
import {
  fetchAvailableModels,
  signOut,
  getValidAnthropicToken,
  startGitHubDeviceFlow,
  startChatGPTDeviceFlow,
  startGoogleDeviceFlow,
} from "./oauth";
import type { DeviceFlowResult } from "./oauth";

// ── Test Helpers ─────────────────────────────────────────────────────────

/** Build a Response-like object for tauriFetch mock */
function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function failRes(status = 500) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve("error"),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// fetchAvailableModels
// ═══════════════════════════════════════════════════════════════════════════

describe("fetchAvailableModels", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Ollama ──────────────────────────────────────────────────────────

  describe("ollama", () => {
    it("fetches models from configured Ollama URL", async () => {
      mockGetProviderConfig.mockResolvedValue({ api_url: "http://localhost:11434" });
      mockFetch.mockResolvedValue(
        okJson({ models: [{ name: "llama2:latest" }, { name: "codellama:7b" }] }),
      );

      const models = await fetchAvailableModels("ollama");

      expect(models).toEqual(["llama2:latest", "codellama:7b"]);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/tags",
        expect.objectContaining({ headers: {} }),
      );
    });

    it("throws when Ollama API URL not configured", async () => {
      mockGetProviderConfig.mockResolvedValue(null);

      await expect(fetchAvailableModels("ollama")).rejects.toThrow(
        "Ollama API URL not configured",
      );
    });

    it("includes Authorization header when API key is configured", async () => {
      mockGetProviderConfig.mockResolvedValue({
        api_url: "http://localhost:11434",
        api_key: "sk-test",
      });
      mockFetch.mockResolvedValue(okJson({ models: [] }));

      await fetchAvailableModels("ollama");

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers.Authorization).toBe("Bearer sk-test");
    });

    it("wraps connection errors with helpful message", async () => {
      mockGetProviderConfig.mockResolvedValue({ api_url: "http://localhost:11434" });
      mockFetch.mockRejectedValue(new Error("connection refused"));

      await expect(fetchAvailableModels("ollama")).rejects.toThrow(
        "Cannot connect to Ollama",
      );
    });

    it("strips trailing slash from API URL", async () => {
      mockGetProviderConfig.mockResolvedValue({ api_url: "http://localhost:11434/" });
      mockFetch.mockResolvedValue(okJson({ models: [] }));

      await fetchAvailableModels("ollama");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/tags",
        expect.anything(),
      );
    });

    it("returns empty array when Ollama has no models", async () => {
      mockGetProviderConfig.mockResolvedValue({ api_url: "http://localhost:11434" });
      mockFetch.mockResolvedValue(okJson({ models: [] }));

      const models = await fetchAvailableModels("ollama");

      expect(models).toEqual([]);
    });
  });

  // ── GitHub ──────────────────────────────────────────────────────────

  describe("github", () => {
    it("fetches models using API key from provider config", async () => {
      mockGetProviderConfig.mockResolvedValue({ api_key: "ghp_test123" });
      mockFetch.mockResolvedValue(
        okJson({ data: [{ id: "gpt-4o" }, { id: "o1-mini" }] }),
      );

      const models = await fetchAvailableModels("github");

      expect(models).toEqual(["gpt-4o", "o1-mini"]);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.githubcopilot.com/models");
      expect(opts.headers.Authorization).toBe("Bearer ghp_test123");
    });

    it("falls back to OAuth token when no API key", async () => {
      mockGetProviderConfig.mockResolvedValue(null);
      mockGetOAuthToken.mockResolvedValue({ access_token: "gho_oauth_token" });
      mockFetch.mockResolvedValue(okJson({ data: [{ id: "gpt-4o" }] }));

      const models = await fetchAvailableModels("github");

      expect(models).toEqual(["gpt-4o"]);
      expect(mockGetProviderConfig).toHaveBeenCalledWith("github-models");
      expect(mockGetOAuthToken).toHaveBeenCalledWith("github");
    });

    it("throws when not signed in and no API key", async () => {
      mockGetProviderConfig.mockResolvedValue(null);
      mockGetOAuthToken.mockResolvedValue(null);

      await expect(fetchAvailableModels("github")).rejects.toThrow(
        "Not signed in to github",
      );
    });
  });

  // ── OpenAI ──────────────────────────────────────────────────────────

  describe("openai", () => {
    it("fetches models using stored OAuth token", async () => {
      mockGetOAuthToken.mockResolvedValue({ access_token: "sk-openai-token" });
      mockFetch.mockResolvedValue(
        okJson({ data: [{ id: "gpt-4o" }, { id: "gpt-3.5-turbo" }] }),
      );

      const models = await fetchAvailableModels("openai");

      expect(models).toEqual(["gpt-4o", "gpt-3.5-turbo"]);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/models",
        expect.objectContaining({
          headers: { Authorization: "Bearer sk-openai-token" },
        }),
      );
    });

    it("uses provided token parameter over stored token", async () => {
      mockFetch.mockResolvedValue(okJson({ data: [{ id: "gpt-4o" }] }));

      await fetchAvailableModels("openai", "explicit-token");

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers.Authorization).toBe("Bearer explicit-token");
      expect(mockGetOAuthToken).not.toHaveBeenCalled();
    });

    it("throws when not signed in", async () => {
      mockGetOAuthToken.mockResolvedValue(null);

      await expect(fetchAvailableModels("openai")).rejects.toThrow(
        "Not signed in to openai",
      );
    });
  });

  // ── Anthropic ─────────────────────────────────────────────────────

  describe("anthropic", () => {
    it("returns known models when Bearer token and models.dev fails", async () => {
      mockGetOAuthToken.mockResolvedValue({
        access_token: "ant-token",
        token_type: "Bearer",
      });
      mockFetch.mockRejectedValue(new Error("models.dev unreachable"));

      const models = await fetchAvailableModels("anthropic");

      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain("claude-opus-4-20250514");
      expect(models).toContain("claude-sonnet-4-20250514");
    });

    it("fetches models from models.dev when Bearer token", async () => {
      mockGetOAuthToken.mockResolvedValue({
        access_token: "ant-token",
        token_type: "Bearer",
      });
      mockFetch.mockResolvedValue(
        okJson({
          anthropic: {
            models: {
              "claude-3-opus": { status: "available" },
              "claude-3-sonnet": { status: "available" },
              "claude-alpha-test": { status: "alpha" },
            },
          },
        }),
      );

      const models = await fetchAvailableModels("anthropic");

      expect(models).toContain("claude-3-opus");
      expect(models).toContain("claude-3-sonnet");
      expect(models).not.toContain("claude-alpha-test");
    });

    it("fetches from API with x-api-key for non-Bearer tokens", async () => {
      mockGetOAuthToken.mockResolvedValue({
        access_token: "sk-ant-key",
        token_type: "api-key",
      });
      mockFetch.mockResolvedValue(
        okJson({ data: [{ id: "claude-3-opus" }, { id: "claude-3-sonnet" }] }),
      );

      const models = await fetchAvailableModels("anthropic");

      expect(models).toEqual(["claude-3-opus", "claude-3-sonnet"]);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.anthropic.com/v1/models");
      expect(opts.headers["x-api-key"]).toBe("sk-ant-key");
    });
  });

  // ── Google ──────────────────────────────────────────────────────────

  describe("google", () => {
    it("fetches models and strips 'models/' prefix", async () => {
      mockGetOAuthToken.mockResolvedValue({ access_token: "google-token" });
      mockFetch.mockResolvedValue(
        okJson({
          models: [
            { name: "models/gemini-pro" },
            { name: "models/gemini-ultra" },
          ],
        }),
      );

      const models = await fetchAvailableModels("google");

      expect(models).toEqual(["gemini-pro", "gemini-ultra"]);
    });
  });

  // ── Unknown Provider ────────────────────────────────────────────────

  it("throws for unknown provider", async () => {
    await expect(
      fetchAvailableModels("unknown" as any, "token"),
    ).rejects.toThrow("Unknown provider");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// signOut
// ═══════════════════════════════════════════════════════════════════════════

describe("signOut", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes OAuth token for non-google provider", async () => {
    await signOut("github");

    expect(mockDeleteOAuthToken).toHaveBeenCalledWith("github");
    expect(mockGetOAuthToken).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("revokes Google token before deleting", async () => {
    mockGetOAuthToken.mockResolvedValue({ access_token: "google-token-123" });
    mockFetch.mockResolvedValue(okJson({}));

    await signOut("google");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/revoke?token=google-token-123",
      { method: "POST" },
    );
    expect(mockDeleteOAuthToken).toHaveBeenCalledWith("google");
  });

  it("swallows Google revocation errors and still deletes token", async () => {
    mockGetOAuthToken.mockResolvedValue({ access_token: "google-token-123" });
    mockFetch.mockRejectedValue(new Error("revocation failed"));

    await signOut("google");

    expect(mockDeleteOAuthToken).toHaveBeenCalledWith("google");
  });

  it("skips revocation when no Google token stored", async () => {
    mockGetOAuthToken.mockResolvedValue(null);

    await signOut("google");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockDeleteOAuthToken).toHaveBeenCalledWith("google");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getValidAnthropicToken
// ═══════════════════════════════════════════════════════════════════════════

describe("getValidAnthropicToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when no token stored", async () => {
    mockGetOAuthToken.mockResolvedValue(null);

    expect(await getValidAnthropicToken()).toBeNull();
  });

  it("returns access_token when no expires_at set", async () => {
    mockGetOAuthToken.mockResolvedValue({
      access_token: "valid-token",
      token_type: "Bearer",
    });

    expect(await getValidAnthropicToken()).toBe("valid-token");
  });

  it("returns access_token when token not yet expired", async () => {
    mockGetOAuthToken.mockResolvedValue({
      access_token: "valid-token",
      token_type: "Bearer",
      expires_at: Date.now() + 30 * 60 * 1000, // 30 min from now
    });

    expect(await getValidAnthropicToken()).toBe("valid-token");
  });

  it("refreshes expired token and returns new access_token", async () => {
    mockGetOAuthToken.mockResolvedValue({
      access_token: "old-token",
      refresh_token: "refresh-abc",
      token_type: "Bearer",
      expires_at: Date.now() - 60_000, // expired 1 min ago
    });
    mockFetch.mockResolvedValue(
      okJson({
        access_token: "fresh-token",
        refresh_token: "new-refresh",
        expires_in: 7200,
      }),
    );

    const token = await getValidAnthropicToken();

    expect(token).toBe("fresh-token");
    expect(mockSaveOAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        access_token: "fresh-token",
        refresh_token: "new-refresh",
      }),
    );
    expect(mockPushProvidersToServer).toHaveBeenCalled();
  });

  it("keeps old refresh_token when refresh response omits it", async () => {
    mockGetOAuthToken.mockResolvedValue({
      access_token: "old-token",
      refresh_token: "original-refresh",
      token_type: "Bearer",
      expires_at: Date.now() - 60_000,
    });
    mockFetch.mockResolvedValue(
      okJson({ access_token: "fresh-token", expires_in: 3600 }),
    );

    await getValidAnthropicToken();

    expect(mockSaveOAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh_token: "original-refresh",
      }),
    );
  });

  it("returns null when expired with no refresh token", async () => {
    mockGetOAuthToken.mockResolvedValue({
      access_token: "old-token",
      token_type: "Bearer",
      expires_at: Date.now() - 60_000,
      refresh_token: null,
    });

    expect(await getValidAnthropicToken()).toBeNull();
  });

  it("returns null when token refresh fails", async () => {
    mockGetOAuthToken.mockResolvedValue({
      access_token: "old-token",
      refresh_token: "refresh-abc",
      token_type: "Bearer",
      expires_at: Date.now() - 60_000,
    });
    mockFetch.mockRejectedValue(new Error("refresh failed"));

    expect(await getValidAnthropicToken()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// startGitHubDeviceFlow
// ═══════════════════════════════════════════════════════════════════════════

describe("startGitHubDeviceFlow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns DeviceFlowResult with correct shape", async () => {
    mockFetch.mockResolvedValue(
      okJson({
        device_code: "dc_123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        interval: 5,
      }),
    );

    const result: DeviceFlowResult = await startGitHubDeviceFlow();

    expect(result.userCode).toBe("ABCD-1234");
    expect(result.verificationUrl).toBe("https://github.com/login/device");
    expect(typeof result.poll).toBe("function");
    expect(typeof result.cancel).toBe("function");
  });

  it("opens browser with verification URI", async () => {
    mockFetch.mockResolvedValue(
      okJson({
        device_code: "dc_123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        interval: 5,
      }),
    );

    await startGitHubDeviceFlow();

    expect(mockOpen).toHaveBeenCalledWith("https://github.com/login/device");
  });

  it("sends correct POST body to device code endpoint", async () => {
    mockFetch.mockResolvedValue(
      okJson({
        device_code: "dc_123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        interval: 5,
      }),
    );

    await startGitHubDeviceFlow();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://github.com/login/device/code");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body).client_id).toBe("Iv1.b507a08c87ecfe98");
  });

  it("throws when device code request fails", async () => {
    mockFetch.mockResolvedValue(failRes(500));

    await expect(startGitHubDeviceFlow()).rejects.toThrow(
      "GitHub device code request failed",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// startChatGPTDeviceFlow
// ═══════════════════════════════════════════════════════════════════════════

describe("startChatGPTDeviceFlow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns DeviceFlowResult with correct shape and opens browser", async () => {
    mockFetch.mockResolvedValue(
      okJson({
        device_auth_id: "da_456",
        user_code: "XYZ-789",
        interval: 5,
      }),
    );

    const result: DeviceFlowResult = await startChatGPTDeviceFlow();

    expect(result.userCode).toBe("XYZ-789");
    expect(result.verificationUrl).toContain("user_code=XYZ-789");
    expect(typeof result.poll).toBe("function");
    expect(typeof result.cancel).toBe("function");
    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining("user_code=XYZ-789"),
    );
  });

  it("throws when device code request fails", async () => {
    mockFetch.mockResolvedValue(failRes(500));

    await expect(startChatGPTDeviceFlow()).rejects.toThrow(
      "OpenAI device code request failed",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// startGoogleDeviceFlow
// ═══════════════════════════════════════════════════════════════════════════

describe("startGoogleDeviceFlow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns DeviceFlowResult and opens verification URL", async () => {
    mockFetch.mockResolvedValue(
      okJson({
        device_code: "gdc_789",
        user_code: "GOOG-456",
        verification_url: "https://www.google.com/device",
        interval: 5,
      }),
    );

    const result: DeviceFlowResult = await startGoogleDeviceFlow();

    expect(result.userCode).toBe("GOOG-456");
    expect(result.verificationUrl).toBe("https://www.google.com/device");
    expect(typeof result.poll).toBe("function");
    expect(typeof result.cancel).toBe("function");
    expect(mockOpen).toHaveBeenCalledWith("https://www.google.com/device");
  });

  it("throws when device code request fails", async () => {
    mockFetch.mockResolvedValue(failRes(500));

    await expect(startGoogleDeviceFlow()).rejects.toThrow(
      "Google device code request failed",
    );
  });
});
