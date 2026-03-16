import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from '../config.js';
import {
  buildOllamaRequest,
  buildRunPodRequest,
  buildOpenAIRequest,
  buildAnthropicRequest,
  buildGoogleGeminiRequest,
  buildGitHubModelsRequest,
  parseOllamaResponse,
  parseRunPodResponse,
  parseOpenAIResponse,
  parseAnthropicResponse,
  parseGoogleGeminiResponse,
  parseGitHubModelsResponse,
} from '../providers.js';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

function extractSection(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);

  if (start === -1 || end === -1) {
    throw new Error(`Could not extract section starting with ${startToken}`);
  }

  return source.slice(start, end).trim();
}

const resolveProviderConfigSource = extractSection(
  serverSource,
  'function resolveProviderConfig(providerId, model) {',
  '\n\n// ── Anchor Generation Helpers',
);

const callProviderDirectSource = extractSection(
  serverSource,
  'async function callProviderDirect(provider, config, messages, timestamp, options = {}) {',
  '\n\n/**\n * Build intelligent bridge responses aligned to scoring anchors.',
);

function createServerHarness(providerConfigs) {
  const factory = new Function(
    'deps',
    `const {
      providerConfigs,
      buildOllamaRequest,
      buildRunPodRequest,
      buildOpenAIRequest,
      buildAnthropicRequest,
      buildGoogleGeminiRequest,
      buildGitHubModelsRequest,
      getCopilotSessionToken,
      ensureValidAnthropicToken,
      parseOllamaResponse,
      parseRunPodResponse,
      parseOpenAIResponse,
      parseAnthropicResponse,
      parseGoogleGeminiResponse,
      parseGitHubModelsResponse,
      fetch,
      AbortController,
      setTimeout,
      clearTimeout,
      console,
    } = deps;
    ${resolveProviderConfigSource}
    ${callProviderDirectSource}
    return { callProviderDirect, resolveProviderConfig };`,
  );

  return factory({
    providerConfigs,
    buildOllamaRequest,
    buildRunPodRequest,
    buildOpenAIRequest,
    buildAnthropicRequest,
    buildGoogleGeminiRequest,
    buildGitHubModelsRequest,
    getCopilotSessionToken: async (apiKey) => apiKey,
    ensureValidAnthropicToken: async (config) => config,
    parseOllamaResponse,
    parseRunPodResponse,
    parseOpenAIResponse,
    parseAnthropicResponse,
    parseGoogleGeminiResponse,
    parseGitHubModelsResponse,
    fetch: globalThis.fetch,
    AbortController: globalThis.AbortController,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
}

function createSuccessfulRunPodResponse(content = 'cloud response') {
  return {
    ok: true,
    json: async () => ({
      status: 'COMPLETED',
      output: {
        message: {
          content,
        },
      },
    }),
  };
}

function createErrorResponse(status, text) {
  return {
    ok: false,
    status,
    text: async () => text,
  };
}

function createCloudProvider(apiUrl = 'https://api.runpod.ai/v2/ep-123') {
  return {
    id: 'ollama-cloud',
    api_url: apiUrl,
    model: 'qwen3.5-9B-stat-grader',
    credentials: {
      api_key: 'cloud-key',
      endpoint_id: 'ep-123',
    },
  };
}

function createConnRefusedError(message = 'connect ECONNREFUSED 127.0.0.1:11434') {
  const error = new Error(message);
  error.code = 'ECONNREFUSED';
  return error;
}

function createTempConfigDir() {
  return mkdtempSync(join(tmpdir(), 'ogre-cloud-fallback-'));
}

describe('cloud fallback behavior', () => {
  const messages = [{ role: 'user', content: 'Grade this.' }];
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('falls back to cloud on ECONNREFUSED from local Ollama', async () => {
    const fetchMock = globalThis.fetch;
    const onFallback = vi.fn();
    const { callProviderDirect } = createServerHarness([createCloudProvider()]);

    fetchMock
      .mockRejectedValueOnce(createConnRefusedError())
      .mockResolvedValueOnce(createSuccessfulRunPodResponse('cloud fallback worked'));

    const result = await callProviderDirect(
      'ollama',
      { apiUrl: 'http://localhost:11434', model: 'qwen3.5-9B-stat-grader' },
      messages,
      '2026-03-16T00:00:00.000Z',
      { onFallback },
    );

    expect(result).toBe('cloud fallback worked');
    expect(onFallback).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.runpod.ai/v2/ep-123/runsync');
  });

  test('falls back to cloud on fetch failed error', async () => {
    const fetchMock = globalThis.fetch;
    const onFallback = vi.fn();
    const { callProviderDirect } = createServerHarness([createCloudProvider()]);

    fetchMock
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(createSuccessfulRunPodResponse('cloud handled fetch failure'));

    const result = await callProviderDirect(
      'ollama-local',
      { apiUrl: 'http://localhost:11434', model: 'qwen3.5-9B-stat-grader' },
      messages,
      '2026-03-16T00:00:00.000Z',
      { onFallback },
    );

    expect(result).toBe('cloud handled fetch failure');
    expect(onFallback).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.runpod.ai/v2/ep-123/runsync');
  });

  test('does NOT fall back on HTTP 500 from local Ollama', async () => {
    const fetchMock = globalThis.fetch;
    const onFallback = vi.fn();
    const { callProviderDirect } = createServerHarness([createCloudProvider()]);

    fetchMock.mockResolvedValueOnce(createErrorResponse(500, 'server exploded'));

    await expect(
      callProviderDirect(
        'ollama',
        { apiUrl: 'http://localhost:11434', model: 'qwen3.5-9B-stat-grader' },
        messages,
        '2026-03-16T00:00:00.000Z',
        { onFallback },
      ),
    ).rejects.toThrow('ollama API error 500: server exploded');

    expect(onFallback).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('does NOT fall back on HTTP 404 from local Ollama', async () => {
    const fetchMock = globalThis.fetch;
    const onFallback = vi.fn();
    const { callProviderDirect } = createServerHarness([createCloudProvider()]);

    fetchMock.mockResolvedValueOnce(createErrorResponse(404, 'model not found'));

    await expect(
      callProviderDirect(
        'ollama-local',
        { apiUrl: 'http://localhost:11434', model: 'qwen3.5-9B-stat-grader' },
        messages,
        '2026-03-16T00:00:00.000Z',
        { onFallback },
      ),
    ).rejects.toThrow('ollama-local API error 404: model not found');

    expect(onFallback).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('does NOT fall back when no cloud provider configured', async () => {
    const fetchMock = globalThis.fetch;
    const onFallback = vi.fn();
    const { callProviderDirect } = createServerHarness([]);
    const localError = createConnRefusedError();

    fetchMock.mockRejectedValueOnce(localError);

    let thrown;
    try {
      await callProviderDirect(
        'ollama',
        { apiUrl: 'http://localhost:11434', model: 'qwen3.5-9B-stat-grader' },
        messages,
        '2026-03-16T00:00:00.000Z',
        { onFallback },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(localError);
    expect(onFallback).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('throws cloud error when both local and cloud fail', async () => {
    const fetchMock = globalThis.fetch;
    const onFallback = vi.fn();
    const { callProviderDirect } = createServerHarness([createCloudProvider()]);
    const cloudError = new Error('cloud request failed');

    fetchMock
      .mockRejectedValueOnce(createConnRefusedError())
      .mockRejectedValueOnce(cloudError);

    let thrown;
    try {
      await callProviderDirect(
        'ollama',
        { apiUrl: 'http://localhost:11434', model: 'qwen3.5-9B-stat-grader' },
        messages,
        '2026-03-16T00:00:00.000Z',
        { onFallback },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(cloudError);
    expect(onFallback).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('cloud config behavior', () => {
  test('cloud env vars auto-register ollama-cloud provider', () => {
    const tempDir = createTempConfigDir();
    const previousConfigDir = process.env.OGRE_CONFIG_DIR;
    const previousEndpointId = process.env.OGRE_RUNPOD_ENDPOINT_ID;
    const previousApiKey = process.env.OGRE_RUNPOD_API_KEY;

    process.env.OGRE_CONFIG_DIR = tempDir;
    process.env.OGRE_RUNPOD_ENDPOINT_ID = 'ep-456';
    process.env.OGRE_RUNPOD_API_KEY = 'key-456';

    try {
      const config = loadConfig();
      const cloudProvider = config.providers.find((provider) => provider.id === 'ollama-cloud');

      expect(cloudProvider).toBeTruthy();
      expect(cloudProvider.api_url).toBe('https://api.runpod.ai/v2/ep-456');
      expect(cloudProvider.credentials).toEqual({
        api_key: 'key-456',
        endpoint_id: 'ep-456',
      });
    } finally {
      if (previousConfigDir === undefined) delete process.env.OGRE_CONFIG_DIR;
      else process.env.OGRE_CONFIG_DIR = previousConfigDir;

      if (previousEndpointId === undefined) delete process.env.OGRE_RUNPOD_ENDPOINT_ID;
      else process.env.OGRE_RUNPOD_ENDPOINT_ID = previousEndpointId;

      if (previousApiKey === undefined) delete process.env.OGRE_RUNPOD_API_KEY;
      else process.env.OGRE_RUNPOD_API_KEY = previousApiKey;

      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('resolveProviderConfig throws on empty cloud URL', () => {
    const tempDir = createTempConfigDir();
    const previousConfigDir = process.env.OGRE_CONFIG_DIR;
    process.env.OGRE_CONFIG_DIR = tempDir;

    try {
      loadConfig();
      const { resolveProviderConfig } = createServerHarness([
        {
          id: 'ollama-cloud',
          api_url: '',
          credentials: {},
        },
      ]);

      expect(() => resolveProviderConfig('ollama-cloud', 'qwen3.5-9B-stat-grader')).toThrow(/RunPod endpoint/);
    } finally {
      if (previousConfigDir === undefined) delete process.env.OGRE_CONFIG_DIR;
      else process.env.OGRE_CONFIG_DIR = previousConfigDir;

      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('RunPod adapter behavior', () => {
  const messages = [{ role: 'user', content: 'Grade this.' }];

  test('buildRunPodRequest produces correct URL with endpoint ID', () => {
    const request = buildRunPodRequest(
      {
        endpointId: 'endpoint-789',
        apiKey: 'runpod-key',
        model: 'qwen3.5-9B-stat-grader',
      },
      messages,
    );

    expect(request.url).toBe('https://api.runpod.ai/v2/endpoint-789/runsync');
  });

  test('buildRunPodRequest uses 5m keep_alive', () => {
    const request = buildRunPodRequest(
      {
        endpointId: 'endpoint-789',
        apiKey: 'runpod-key',
        model: 'qwen3.5-9B-stat-grader',
      },
      messages,
    );

    expect(request.body.input.keep_alive).toBe('5m');
  });

  test('parseRunPodResponse extracts content from COMPLETED response', () => {
    expect(
      parseRunPodResponse({
        id: 'run-123',
        status: 'COMPLETED',
        output: {
          message: {
            content: 'graded result',
          },
        },
      }),
    ).toBe('graded result');
  });

  test('parseRunPodResponse throws on FAILED status', () => {
    expect(() => parseRunPodResponse({ id: 'run-123', status: 'FAILED', error: 'OOM' })).toThrow(
      'RunPod request failed: OOM',
    );
  });
});
