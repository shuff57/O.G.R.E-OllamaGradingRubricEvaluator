/**
 * Provider Adapters for Grading Server
 * 
 * This module provides request builders and response parsers for different AI providers.
 * Each provider has its own API format and response structure.
 */

/**
 * Normalize base URL by removing trailing slash
 * @param {string} url - Base URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeBaseUrl(url) {
  return url.replace(/\/$/, '');
}

/**
 * Build Ollama API request
 * @param {Object} config - Provider configuration
 * @param {string} config.apiUrl - Base URL for Ollama API
 * @param {string} [config.apiKey] - Optional API key for authentication
 * @param {string} config.model - Model name
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Object} Request object with url, headers, and body
 */
export function buildOllamaRequest(config, messages) {
  const base = normalizeBaseUrl(config.apiUrl);
  const headers = { 'Content-Type': 'application/json' };
  
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // Ollama uses { content: string, images: string[] } — NOT OpenAI multimodal arrays.
  // Convert any messages whose content is an OpenAI-style array.
  const ollamaMessages = messages.map(msg => {
    if (!Array.isArray(msg.content)) return msg;

    // Extract text parts and image_url parts separately
    let text = '';
    const images = [];
    for (const part of msg.content) {
      if (part.type === 'text') {
        text += part.text;
      } else if (part.type === 'image_url' && part.image_url?.url) {
        // Ollama expects raw base64 (no data URL prefix)
        const url = part.image_url.url;
        const base64 = url.startsWith('data:') ? url.split(',')[1] : url;
        images.push(base64);
      }
    }

    return images.length > 0
      ? { role: msg.role, content: text, images }
      : { role: msg.role, content: text };
  });

  const body = {
    model: config.model,
    messages: ollamaMessages,
    stream: false,
    think: false,
    keep_alive: '60m',
    options: {
      temperature: config.temperature ?? 0.2,
      num_ctx: 8192,
    },
  };

  return {
    url: `${base}/api/chat`,
    headers,
    body,
  };
}

export function buildRunPodRequest(config, messages) {
  const endpointId = config.endpointId || config.credentials?.endpoint_id || extractRunPodEndpointId(config.apiUrl);
  const apiKey = config.apiKey || config.credentials?.api_key || config.credentials?.access_token;

  if (!endpointId) {
    throw new Error('RunPod endpoint ID is required');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  const runPodMessages = messages.map(msg => {
    if (!Array.isArray(msg.content)) return msg;

    let text = '';
    const images = [];
    for (const part of msg.content) {
      if (part.type === 'text') {
        text += part.text;
      } else if (part.type === 'image_url' && part.image_url?.url) {
        const url = part.image_url.url;
        const base64 = url.startsWith('data:') ? url.split(',')[1] : url;
        images.push(base64);
      }
    }

    return images.length > 0
      ? { role: msg.role, content: text, images }
      : { role: msg.role, content: text };
  });

  return {
    url: `https://api.runpod.ai/v2/${endpointId}/runsync`,
    headers,
    body: {
      input: {
        model: config.model,
        messages: runPodMessages,
        stream: false,
        think: false,
        keep_alive: '5m',
        options: {
          temperature: config.temperature ?? 0.2,
        },
      },
    },
  };
}

/**
 * Build OpenAI API request
 * @param {Object} config - Provider configuration
 * @param {string} config.apiKey - API key for authentication
 * @param {string} config.model - Model name
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Object} Request object with url, headers, and body
 */
export function buildOpenAIRequest(config, messages) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };

  const body = {
    model: config.model,
    max_tokens: 16000,
    messages: messages,
    stream: false,
    temperature: config.temperature ?? 0.2,
  };

  return {
    url: 'https://api.openai.com/v1/chat/completions',
    headers,
    body,
  };
}

/**
 * Build Anthropic API request
 * @param {Object} config - Provider configuration
 * @param {string} config.apiKey - API key for authentication
 * @param {string} config.model - Model name
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Object} Request object with url, headers, and body
 */
export function buildAnthropicRequest(config, messages) {
  const isBearer = config.tokenType === 'Bearer';
  const authHeader = isBearer
    ? { 'Authorization': `Bearer ${config.apiKey}` }
    : { 'x-api-key': config.apiKey };
  const headers = {
    'Content-Type': 'application/json',
    ...authHeader,
    'anthropic-version': '2023-06-01',
    ...(isBearer && { 'anthropic-beta': 'oauth-2025-04-20' }),
  };

  // Anthropic requires system message to be separate from messages array.
  // Also convert OpenAI-style image_url content blocks to Anthropic image+source format.
  let systemMessage;
  const userMessages = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessage = msg.content;
    } else if (Array.isArray(msg.content)) {
      const anthropicContent = msg.content.map(part => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        } else if (part.type === 'image_url') {
          const dataUrl = part.image_url?.url || '';
          const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
          }
          return { type: 'image', source: { type: 'url', url: dataUrl } };
        }
        return part;
      });
      userMessages.push({ role: msg.role, content: anthropicContent });
    } else {
      userMessages.push(msg);
    }
  }
  const body = {
    model: config.model,
    max_tokens: 16000,
    messages: userMessages,
    temperature: config.temperature ?? 0.2,
  };

  if (systemMessage) {
    body.system = systemMessage;
  }

  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers,
    body,
  };
}

/**
 * Build Google Gemini API request
 * @param {Object} config - Provider configuration
 * @param {string} config.apiKey - API key for authentication
 * @param {string} config.model - Model name
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Object} Request object with url, headers, and body
 */
export function buildGoogleGeminiRequest(config, messages) {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Gemini uses 'user' and 'model' roles, and separates system instruction
  let systemInstruction;
  const geminiMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = msg.content;
    } else {
      const role = msg.role === 'assistant' ? 'model' : 'user';

      // Build Gemini parts from content — supports string or OpenAI-style content array
      let parts;
      if (Array.isArray(msg.content)) {
        parts = msg.content.map(item => {
          if (item.type === 'text') {
            return { text: item.text };
          } else if (item.type === 'image_url') {
            // Convert data URL to Gemini inline_data format
            const dataUrl = item.image_url?.url || '';
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              return { inline_data: { mime_type: match[1], data: match[2] } };
            }
            // Non-data URLs: pass as text (Gemini can't fetch remote URLs)
            return { text: `[Image: ${dataUrl}]` };
          }
          return { text: String(item) };
        });
      } else {
        parts = [{ text: msg.content }];
      }

      geminiMessages.push({ role, parts });
    }
  }

  const body = {
    contents: geminiMessages,
    generationConfig: {
      temperature: config.temperature ?? 0.2,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const modelId = config.model || 'gemini-1.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${config.apiKey}`;

  return {
    url,
    headers,
    body,
  };
}

/**
 * Parse Ollama API response
 * @param {Object} data - Response data from Ollama API
 * @returns {string} Extracted content
 * @throws {Error} If response format is invalid
 */
export function parseOllamaResponse(data) {
  if (!data.message || typeof data.message.content !== 'string') {
    // Some reasoning models return content in a 'thinking' field instead
    const thinking = data.message?.thinking;
    if (thinking && typeof thinking === 'string') {
      return thinking;
    }
    throw new Error('Invalid Ollama response: missing message.content');
  }
  // Reasoning models (deepseek-r1, qwq) may return empty content; fall back to thinking field
  return data.message.content || data.message.thinking || '';
}

export function parseRunPodResponse(data) {
  if (data?.status === 'FAILED') {
    throw new Error(`RunPod request failed: ${data?.error || 'Unknown error'}`);
  }

  if (data?.status !== 'COMPLETED') {
    throw new Error(`Invalid RunPod response: unexpected status ${data?.status || 'undefined'}`);
  }

  const content = data.output.message?.content;
  const thinking = data.output.message?.thinking;

  if (typeof content !== 'string' && typeof thinking !== 'string') {
    throw new Error('Invalid RunPod response: missing output.message.content');
  }

  // Reasoning models may return empty content; fall back to thinking field (mirrors parseOllamaResponse)
  return content || thinking || '';
}

/**
 * Parse OpenAI API response
 * @param {Object} data - Response data from OpenAI API
 * @returns {string} Extracted content
 * @throws {Error} If response format is invalid
 */
export function parseOpenAIResponse(data) {
  if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
    throw new Error('Invalid OpenAI response: missing choices[0].message.content');
  }
  return data.choices[0].message.content;
}

/**
 * Parse Anthropic API response
 * @param {Object} data - Response data from Anthropic API
 * @returns {string} Extracted content
 * @throws {Error} If response format is invalid
 */
export function parseAnthropicResponse(data) {
  if (!data.content || !data.content[0] || !data.content[0].text) {
    throw new Error('Invalid Anthropic response: missing content[0].text');
  }
  return data.content[0].text;
}

/**
 * Parse Google Gemini API response
 * @param {Object} data - Response data from Google Gemini API
 * @returns {string} Extracted content
 * @throws {Error} If response format is invalid
 */
export function parseGoogleGeminiResponse(data) {
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || 
      !data.candidates[0].content.parts || !data.candidates[0].content.parts[0] || 
      !data.candidates[0].content.parts[0].text) {
    throw new Error('Invalid Google Gemini response: missing candidates[0].content.parts[0].text');
  }
  return data.candidates[0].content.parts[0].text;
}

// ── GitHub Copilot Session Token Exchange ───────────────────────────────

/** @type {{ token: string, expiresAt: number } | null} */
let copilotTokenCache = null;

/**
 * Exchange a GitHub OAuth token for a Copilot session token.
 * Caches the session token and refreshes automatically when expired.
 * @param {string} githubOAuthToken - GitHub OAuth access token
 * @returns {Promise<string>} Copilot session token (Bearer-ready)
 */
export async function getCopilotSessionToken(githubOAuthToken) {
  // Return cached token if still valid (with 60s safety buffer)
  if (copilotTokenCache && Date.now() / 1000 < copilotTokenCache.expiresAt - 60) {
    return copilotTokenCache.token;
  }

  const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      'Authorization': `token ${githubOAuthToken}`,
      'User-Agent': 'GithubCopilot/1.155.0',
      'Accept': 'application/json',
      'Editor-Version': 'vscode/1.95.0',
      'Editor-Plugin-Version': 'copilot-chat/0.22.0',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new Error('GitHub token is invalid or expired. Re-authenticate in the desktop app.');
    }
    if (res.status === 403) {
      throw new Error('No GitHub Copilot subscription found for this account.');
    }
    throw new Error(`Copilot token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  copilotTokenCache = { token: data.token, expiresAt: data.expires_at };
  console.log(`[copilot] Session token obtained, expires at ${new Date(data.expires_at * 1000).toISOString()}`);
  return data.token;
}

/**
 * Build GitHub Models (Copilot) API request
 * @param {Object} config - Provider configuration
 * @param {string} config.apiKey - Copilot session token (already exchanged)
 * @param {string} config.model - Model name
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Object} Request object with url, headers, and body
 */
export function buildGitHubModelsRequest(config, messages) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    'Copilot-Integration-Id': 'vscode-chat',
  };

  const body = {
    model: config.model,
    messages: messages,
    stream: false,
    temperature: config.temperature ?? 0.2,
  };

  return {
    url: 'https://api.githubcopilot.com/chat/completions',
    headers,
    body,
  };
}

/**
 * Parse GitHub Models (Copilot) API response — uses OpenAI format
 * @param {Object} data - Response data from GitHub Models API
 * @returns {string} Extracted content
 * @throws {Error} If response format is invalid
 */
export function parseGitHubModelsResponse(data) {
  if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
    throw new Error('Invalid GitHub Models response: missing choices[0].message.content');
  }
  return data.choices[0].message.content;
}

function extractRunPodEndpointId(apiUrl) {
  if (!apiUrl || typeof apiUrl !== 'string') return null;

  const match = apiUrl.match(/\/v2\/([^/]+)/);
  return match?.[1] || null;
}
