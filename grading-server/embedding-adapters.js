/**
 * Embedding Provider Adapters
 *
 * Build/parse functions for embedding API calls across providers.
 * Follows the same pattern as providers.js (buildXxxRequest / parseXxxResponse).
 */

const SUPPORTED_EMBED_PROVIDERS = ['ollama', 'openai', 'gemini', 'github', 'local'];

/**
 * Normalize base URL by removing trailing slash
 * @param {string} url - Base URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeBaseUrl(url) {
  return url.replace(/\/$/, '');
}

/**
 * Build an embedding request for the given provider.
 * @param {string} provider - Provider name (ollama, openai, gemini, github, anthropic)
 * @param {Object} params
 * @param {string} params.model - Model name
 * @param {string} [params.apiKey] - API key for authentication
 * @param {string} [params.apiUrl] - Base URL override
 * @param {string} params.text - Text to embed
 * @returns {{ url: string, headers: Object, body: Object }}
 */
export function buildEmbedRequest(provider, { model, apiKey, apiUrl, text }) {
  switch (provider) {
    case 'ollama': {
      const base = normalizeBaseUrl(apiUrl);
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      return {
        url: `${base}/api/embeddings`,
        headers,
        body: { model, prompt: text },
      };
    }

    case 'openai': {
      const base = apiUrl ? normalizeBaseUrl(apiUrl) : 'https://api.openai.com';
      return {
        url: `${base}/v1/embeddings`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: { model, input: text },
      };
    }

    case 'gemini': {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
        headers: { 'Content-Type': 'application/json' },
        body: { content: { parts: [{ text }] } },
      };
    }

    case 'github': {
      const base = apiUrl ? normalizeBaseUrl(apiUrl) : 'https://models.inference.ai.azure.com';
      return {
        url: `${base}/v1/embeddings`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: { model, input: text },
      };
    }

    case 'local': {
      // Local provider bypasses HTTP — returns sentinel for server.js to handle
      return { provider: 'local', text };
    }

    case 'anthropic':
      throw new Error(
        'Anthropic does not support text embeddings. Use a different provider (Ollama, OpenAI, or Gemini).'
      );

    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}

/**
 * Parse an embedding response from the given provider.
 * @param {string} provider - Provider name
 * @param {Object} responseJson - Raw JSON response from the provider API
 * @returns {{ embedding: number[], dimensions: number }}
 */
export function parseEmbedResponse(provider, responseJson) {
  let embedding;

  switch (provider) {
    case 'ollama':
      embedding = responseJson.embedding;
      break;

    case 'openai':
    case 'github':
      embedding = responseJson.data[0].embedding;
      break;

    case 'gemini':
      embedding = responseJson.embedding.values;
      break;

    case 'local':
      embedding = responseJson.embedding;
      break;

    case 'anthropic':
      throw new Error(
        'Anthropic does not support text embeddings. Use a different provider (Ollama, OpenAI, or Gemini).'
      );

    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }

  if (!Array.isArray(embedding)) {
    throw new Error(`Invalid ${provider} embedding response: missing embedding array`);
  }

  return { embedding, dimensions: embedding.length };
}

export { SUPPORTED_EMBED_PROVIDERS };
