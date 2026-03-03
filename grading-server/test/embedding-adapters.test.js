import { describe, test, expect } from 'vitest';
import {
  buildEmbedRequest,
  parseEmbedResponse,
  SUPPORTED_EMBED_PROVIDERS,
} from '../embedding-adapters.js';

describe('SUPPORTED_EMBED_PROVIDERS', () => {
  test('includes ollama, openai, gemini, github', () => {
    expect(SUPPORTED_EMBED_PROVIDERS).toContain('ollama');
    expect(SUPPORTED_EMBED_PROVIDERS).toContain('openai');
    expect(SUPPORTED_EMBED_PROVIDERS).toContain('gemini');
    expect(SUPPORTED_EMBED_PROVIDERS).toContain('github');
  });

  test('does not include anthropic', () => {
    expect(SUPPORTED_EMBED_PROVIDERS).not.toContain('anthropic');
  });
});

describe('buildEmbedRequest', () => {
  describe('ollama', () => {
    test('creates correct URL with base URL', () => {
      const result = buildEmbedRequest('ollama', {
        model: 'nomic-embed-text',
        apiUrl: 'http://localhost:11434',
        text: 'Hello world',
      });

      expect(result.url).toBe('http://localhost:11434/api/embeddings');
    });

    test('normalizes trailing slash from base URL', () => {
      const result = buildEmbedRequest('ollama', {
        model: 'nomic-embed-text',
        apiUrl: 'http://localhost:11434/',
        text: 'Hello world',
      });

      expect(result.url).toBe('http://localhost:11434/api/embeddings');
    });

    test('includes Content-Type header', () => {
      const result = buildEmbedRequest('ollama', {
        model: 'nomic-embed-text',
        apiUrl: 'http://localhost:11434',
        text: 'Hello world',
      });

      expect(result.headers['Content-Type']).toBe('application/json');
    });

    test('includes Authorization header when apiKey provided', () => {
      const result = buildEmbedRequest('ollama', {
        model: 'nomic-embed-text',
        apiUrl: 'http://localhost:11434',
        apiKey: 'test-key',
        text: 'Hello world',
      });

      expect(result.headers['Authorization']).toBe('Bearer test-key');
    });

    test('omits Authorization header when no apiKey', () => {
      const result = buildEmbedRequest('ollama', {
        model: 'nomic-embed-text',
        apiUrl: 'http://localhost:11434',
        text: 'Hello world',
      });

      expect(result.headers['Authorization']).toBeUndefined();
    });

    test('creates body with model and prompt', () => {
      const result = buildEmbedRequest('ollama', {
        model: 'nomic-embed-text',
        apiUrl: 'http://localhost:11434',
        text: 'Hello world',
      });

      expect(result.body).toEqual({ model: 'nomic-embed-text', prompt: 'Hello world' });
    });
  });

  describe('openai', () => {
    test('creates correct URL with default base URL', () => {
      const result = buildEmbedRequest('openai', {
        model: 'text-embedding-3-small',
        apiKey: 'sk-test',
        text: 'Hello world',
      });

      expect(result.url).toBe('https://api.openai.com/v1/embeddings');
    });

    test('uses custom apiUrl when provided', () => {
      const result = buildEmbedRequest('openai', {
        model: 'text-embedding-3-small',
        apiKey: 'sk-test',
        apiUrl: 'https://custom.openai.com',
        text: 'Hello world',
      });

      expect(result.url).toBe('https://custom.openai.com/v1/embeddings');
    });

    test('includes Authorization header with Bearer token', () => {
      const result = buildEmbedRequest('openai', {
        model: 'text-embedding-3-small',
        apiKey: 'sk-test',
        text: 'Hello world',
      });

      expect(result.headers['Authorization']).toBe('Bearer sk-test');
    });

    test('includes Content-Type header', () => {
      const result = buildEmbedRequest('openai', {
        model: 'text-embedding-3-small',
        apiKey: 'sk-test',
        text: 'Hello world',
      });

      expect(result.headers['Content-Type']).toBe('application/json');
    });

    test('creates body with model and input', () => {
      const result = buildEmbedRequest('openai', {
        model: 'text-embedding-3-small',
        apiKey: 'sk-test',
        text: 'Hello world',
      });

      expect(result.body).toEqual({ model: 'text-embedding-3-small', input: 'Hello world' });
    });
  });

  describe('gemini', () => {
    test('creates correct URL with model and API key', () => {
      const result = buildEmbedRequest('gemini', {
        model: 'text-embedding-004',
        apiKey: 'AIza-test',
        text: 'Hello world',
      });

      expect(result.url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=AIza-test'
      );
    });

    test('includes Content-Type header', () => {
      const result = buildEmbedRequest('gemini', {
        model: 'text-embedding-004',
        apiKey: 'AIza-test',
        text: 'Hello world',
      });

      expect(result.headers['Content-Type']).toBe('application/json');
    });

    test('creates body with content.parts structure', () => {
      const result = buildEmbedRequest('gemini', {
        model: 'text-embedding-004',
        apiKey: 'AIza-test',
        text: 'Hello world',
      });

      expect(result.body).toEqual({
        content: { parts: [{ text: 'Hello world' }] },
      });
    });
  });

  describe('github', () => {
    test('creates correct URL with default base URL', () => {
      const result = buildEmbedRequest('github', {
        model: 'text-embedding-3-small',
        apiKey: 'gh-test',
        text: 'Hello world',
      });

      expect(result.url).toBe('https://models.inference.ai.azure.com/v1/embeddings');
    });

    test('uses custom apiUrl when provided', () => {
      const result = buildEmbedRequest('github', {
        model: 'text-embedding-3-small',
        apiKey: 'gh-test',
        apiUrl: 'https://custom.github.com',
        text: 'Hello world',
      });

      expect(result.url).toBe('https://custom.github.com/v1/embeddings');
    });

    test('includes Authorization header with Bearer token', () => {
      const result = buildEmbedRequest('github', {
        model: 'text-embedding-3-small',
        apiKey: 'gh-test',
        text: 'Hello world',
      });

      expect(result.headers['Authorization']).toBe('Bearer gh-test');
    });

    test('includes Content-Type header', () => {
      const result = buildEmbedRequest('github', {
        model: 'text-embedding-3-small',
        apiKey: 'gh-test',
        text: 'Hello world',
      });

      expect(result.headers['Content-Type']).toBe('application/json');
    });

    test('creates body with model and input (OpenAI-compatible)', () => {
      const result = buildEmbedRequest('github', {
        model: 'text-embedding-3-small',
        apiKey: 'gh-test',
        text: 'Hello world',
      });

      expect(result.body).toEqual({ model: 'text-embedding-3-small', input: 'Hello world' });
    });
  });

  describe('anthropic', () => {
    test('throws error with descriptive message', () => {
      expect(() =>
        buildEmbedRequest('anthropic', {
          model: 'claude-sonnet-4-20250514',
          apiKey: 'sk-ant-test',
          text: 'Hello world',
        })
      ).toThrow('Anthropic does not support text embeddings. Use a different provider (Ollama, OpenAI, or Gemini).');
    });
  });

  describe('unknown provider', () => {
    test('throws error for unknown provider', () => {
      expect(() =>
        buildEmbedRequest('fakeprovider', {
          model: 'some-model',
          text: 'Hello world',
        })
      ).toThrow('Unknown embedding provider: fakeprovider');
    });
  });
});

describe('parseEmbedResponse', () => {
  describe('ollama', () => {
    test('extracts embedding from response', () => {
      const responseJson = { embedding: [0.1, 0.2, 0.3, 0.4, 0.5] };
      const result = parseEmbedResponse('ollama', responseJson);

      expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    test('computes dimensions from embedding length', () => {
      const responseJson = { embedding: [0.1, 0.2, 0.3] };
      const result = parseEmbedResponse('ollama', responseJson);

      expect(result.dimensions).toBe(3);
    });

    test('throws error when embedding is missing', () => {
      expect(() => parseEmbedResponse('ollama', {})).toThrow(
        'Invalid ollama embedding response: missing embedding array'
      );
    });
  });

  describe('openai', () => {
    test('extracts embedding from response', () => {
      const responseJson = {
        data: [{ embedding: [0.1, 0.2, 0.3, 0.4], index: 0 }],
      };
      const result = parseEmbedResponse('openai', responseJson);

      expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    test('computes dimensions from embedding length', () => {
      const responseJson = {
        data: [{ embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], index: 0 }],
      };
      const result = parseEmbedResponse('openai', responseJson);

      expect(result.dimensions).toBe(6);
    });

    test('throws error when data is missing', () => {
      expect(() => parseEmbedResponse('openai', {})).toThrow();
    });
  });

  describe('gemini', () => {
    test('extracts embedding values from response', () => {
      const responseJson = {
        embedding: { values: [0.5, 0.6, 0.7] },
      };
      const result = parseEmbedResponse('gemini', responseJson);

      expect(result.embedding).toEqual([0.5, 0.6, 0.7]);
    });

    test('computes dimensions from embedding length', () => {
      const responseJson = {
        embedding: { values: [0.1, 0.2] },
      };
      const result = parseEmbedResponse('gemini', responseJson);

      expect(result.dimensions).toBe(2);
    });

    test('throws error when embedding is missing', () => {
      expect(() => parseEmbedResponse('gemini', {})).toThrow();
    });
  });

  describe('github', () => {
    test('extracts embedding from response (same as openai)', () => {
      const responseJson = {
        data: [{ embedding: [0.9, 0.8, 0.7, 0.6], index: 0 }],
      };
      const result = parseEmbedResponse('github', responseJson);

      expect(result.embedding).toEqual([0.9, 0.8, 0.7, 0.6]);
    });

    test('computes dimensions from embedding length', () => {
      const responseJson = {
        data: [{ embedding: [0.1, 0.2, 0.3, 0.4, 0.5], index: 0 }],
      };
      const result = parseEmbedResponse('github', responseJson);

      expect(result.dimensions).toBe(5);
    });
  });

  describe('anthropic', () => {
    test('throws error with descriptive message', () => {
      expect(() => parseEmbedResponse('anthropic', {})).toThrow(
        'Anthropic does not support text embeddings. Use a different provider (Ollama, OpenAI, or Gemini).'
      );
    });
  });

  describe('unknown provider', () => {
    test('throws error for unknown provider', () => {
      expect(() => parseEmbedResponse('fakeprovider', {})).toThrow(
        'Unknown embedding provider: fakeprovider'
      );
    });
  });

  describe('dimensions calculation', () => {
    test('returns correct dimensions for large embedding', () => {
      const largeEmbedding = new Array(1536).fill(0).map((_, i) => i * 0.001);
      const responseJson = {
        data: [{ embedding: largeEmbedding, index: 0 }],
      };
      const result = parseEmbedResponse('openai', responseJson);

      expect(result.dimensions).toBe(1536);
      expect(result.embedding.length).toBe(1536);
    });
  });
});
