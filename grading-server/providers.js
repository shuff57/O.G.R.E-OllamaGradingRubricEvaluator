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

  const body = {
    model: config.model,
    messages: messages,
    stream: false,
  };

  return {
    url: `${base}/api/chat`,
    headers,
    body,
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
    messages: messages,
    stream: false,
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
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01',
  };

  // Anthropic requires system message to be separate from messages array
  let systemMessage;
  const userMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessage = msg.content;
    } else {
      userMessages.push(msg);
    }
  }

  const body = {
    model: config.model,
    max_tokens: 4096,
    messages: userMessages,
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
 * Build Gemini API request
 * @param {Object} config - Provider configuration
 * @param {string} config.apiKey - API key for authentication
 * @param {string} config.model - Model name
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Object} Request object with url, headers, and body
 */
export function buildGeminiRequest(config, messages) {
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
      geminiMessages.push({
        role,
        parts: [{ text: msg.content }],
      });
    }
  }

  const body = {
    contents: geminiMessages,
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
  if (!data.message || !data.message.content) {
    throw new Error('Invalid Ollama response: missing message.content');
  }
  return data.message.content;
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
 * Parse Gemini API response
 * @param {Object} data - Response data from Gemini API
 * @returns {string} Extracted content
 * @throws {Error} If response format is invalid
 */
export function parseGeminiResponse(data) {
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || 
      !data.candidates[0].content.parts || !data.candidates[0].content.parts[0] || 
      !data.candidates[0].content.parts[0].text) {
    throw new Error('Invalid Gemini response: missing candidates[0].content.parts[0].text');
  }
  return data.candidates[0].content.parts[0].text;
}
