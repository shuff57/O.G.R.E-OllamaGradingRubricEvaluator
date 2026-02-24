/**
 * O.G.R.E Grading Server
 * Main HTTP server for batch grading with AI providers
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import {
  generateScoringAnchors,
  buildBatchPrompt,
  buildSingleGradePrompt,
  buildOutlierReviewPrompt,
  buildCompactSweepPrompt,
  buildPairwiseSweepPrompts,
  parseBatchResponse,
  parseSingleGradeResponse,
  detectOutliers,
  chunkStudents,
  mergeResults,
} from './grading.js';
import {
  buildOllamaRequest,
  buildOpenAIRequest,
  buildAnthropicRequest,
  buildGoogleGeminiRequest,
  buildGitHubModelsRequest,
  getCopilotSessionToken,
  parseOllamaResponse,
  parseOpenAIResponse,
  parseAnthropicResponse,
  parseGoogleGeminiResponse,
  parseGitHubModelsResponse,
} from './providers.js';
import {
  grantSession,
  validateSession,
  revokeSession,
} from './automation.js';
import { loadConfig, saveConfig, watchConfig } from './config.js';
import { loadRubrics, createRubric, updateRubric, deleteRubric } from './rubric-store.js';
import { withRetry } from './ai-retry.js';
import { handleAgentRequest } from './agent.js';

const app = new Hono();
const PORT = 3456;

// ── Provider config state (loaded from config file, hot-reloaded on changes) ──
const initialConfig = loadConfig();
let providerConfigs = initialConfig.providers;
let handshakeToken = initialConfig.token;
console.log(`[config] Loaded ${providerConfigs.length} provider(s), token=${handshakeToken.slice(0, 8)}...`);


/**
 * Call an AI provider directly from the server (bypasses extension proxy).
 * Used for providers that don't require browser auth context (Ollama, OpenAI, etc.)
 */
// Anthropic OAuth client ID (matches oauth.ts and opencode-anthropic-auth)
const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000; // 60-second buffer before expiry

/**
 * Ensure the Anthropic OAuth token is valid, refreshing it if expired.
 * Mirrors opencode-anthropic-auth/index.mjs: checks expiry, POSTs refresh grant.
 * Only applies to Bearer (OAuth) tokens — raw API keys are passed through unchanged.
 */
async function ensureValidAnthropicToken(config) {
  // Only applies to Bearer (OAuth) tokens, not raw API keys
  if (config.tokenType !== 'Bearer') return config;
  if (!config.refreshToken) {
    console.warn('[anthropic] Bearer token has no refresh_token — cannot refresh, proceeding as-is');
    return config;
  }

  // Token still valid with buffer — no refresh needed
  if (config.apiKey && config.expiresAt && config.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return config;
  }

  console.log('[anthropic] OAuth token expired or missing — refreshing...');
  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: config.refreshToken,
      client_id: ANTHROPIC_CLIENT_ID,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // Flag provider as needing re-auth if refresh token is invalid
    if (text.includes('invalid_grant')) {
      const p = providerConfigs.find(pc => pc.id === 'anthropic');
      if (p) {
        p.needsReauth = true;
        console.warn('[anthropic] Refresh token invalid — marking provider as needing re-auth');
      }
    }
    throw new Error(`Anthropic token refresh failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const json = await response.json();
  const newExpiresAt = Date.now() + json.expires_in * 1000;

  // Update in-memory provider config so the refreshed token persists across calls
  const p = providerConfigs.find(pc => pc.id === 'anthropic');
  if (p) {
    p.credentials.access_token = json.access_token;
    p.credentials.refresh_token = json.refresh_token;
    p.credentials.expires_at = newExpiresAt;
    saveConfig({ token: handshakeToken, providers: providerConfigs });
    console.log('[anthropic] Token refreshed and persisted to config');
  }

  return {
    ...config,
    apiKey: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: newExpiresAt,
  };
}

async function callProviderDirect(provider, config, messages, timestamp) {
  // Exchange GitHub OAuth token for Copilot session token
  if (provider.toLowerCase() === 'github-models') {
    config = { ...config, apiKey: await getCopilotSessionToken(config.apiKey) };
  }
  // Refresh Anthropic OAuth token if expired (mirrors opencode-anthropic-auth/index.mjs)
  if (provider.toLowerCase() === 'anthropic') {
    config = await ensureValidAnthropicToken(config);
  }

  let requestObj;
  switch (provider.toLowerCase()) {
    case 'ollama': case 'ollama-local': case 'ollama-cloud': requestObj = buildOllamaRequest(config, messages); break;
    case 'openai': requestObj = buildOpenAIRequest(config, messages); break;
    case 'anthropic': requestObj = buildAnthropicRequest(config, messages); break;
    case 'google-gemini': requestObj = buildGoogleGeminiRequest(config, messages); break;
    case 'github-models': requestObj = buildGitHubModelsRequest(config, messages); break;
    default: throw new Error(`Cannot call ${provider} directly`);
  }

  console.log(`[${timestamp}] [direct] Calling ${provider} AI (${config.model})...`);
  const start = Date.now();
  const response = await fetch(requestObj.url, {
    method: 'POST',
    headers: requestObj.headers,
    body: JSON.stringify(requestObj.body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const err = new Error(`${provider} API error ${response.status}: ${errorText.slice(0, 200)}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[${timestamp}] [direct] AI response received in ${elapsed}s`);

  // Extract text based on provider format
  switch (provider.toLowerCase()) {
    case 'ollama': case 'ollama-local': case 'ollama-cloud': return parseOllamaResponse(data);
    case 'openai': return parseOpenAIResponse(data);
    case 'anthropic': return parseAnthropicResponse(data);
    case 'google-gemini': return parseGoogleGeminiResponse(data);
    case 'github-models': return parseGitHubModelsResponse(data);
    default: throw new Error(`No parser for provider: ${provider}`);
  }
}

/**
 * Build intelligent bridge responses aligned to scoring anchors.
 * Selects 2-3 examples per anchor tier (excellent, adequate, minimal)
 * so the next chunk has strong calibration references.
 */
function buildBridgeResponses(chunkResults, chunkStudents, anchors, maxScore) {
  const getName = (r) => chunkStudents.find(s => s.index === r.studentIndex)?.name || `Student ${r.studentIndex}`;

  // Define anchor score ranges (4 tiers)
  const excellentThreshold = anchors.excellent.score - 1;  // e.g., 8+ for 9/10 anchor
  const adequateRange = [anchors.belowAverage.score + 1, anchors.excellent.score - 1]; // upper-middle band
  const belowAvgRange = [anchors.minimal.score + 1, anchors.belowAverage.score]; // lower-middle band
  const minimalThreshold = anchors.minimal.score + 1; // e.g., 4 or below for 3/10 anchor

  // Bucket results by tier
  const excellent = chunkResults.filter(r => r.score >= excellentThreshold);
  const adequate = chunkResults.filter(r => r.score >= adequateRange[0] && r.score <= adequateRange[1]);
  const belowAverage = chunkResults.filter(r => r.score >= belowAvgRange[0] && r.score <= belowAvgRange[1]);
  const minimal = chunkResults.filter(r => r.score < minimalThreshold);

  // Pick up to 2 from each tier, preferring variety in scores
  function pickFromTier(tier, label, count = 2) {
    if (tier.length === 0) return [];
    // Sort by score and pick spread (first and last if enough)
    const sorted = [...tier].sort((a, b) => a.score - b.score);
    const picks = [];
    if (sorted.length >= 2 && count >= 2) {
      picks.push(sorted[0], sorted[sorted.length - 1]);
    } else {
      picks.push(sorted[0]);
    }
    return picks.slice(0, count).map(r => ({
      ...r,
      name: getName(r),
      tier: label,
    }));
  }

  const bridges = [
    ...pickFromTier(excellent, 'excellent', 2),
    ...pickFromTier(adequate, 'adequate', 2),
    ...pickFromTier(belowAverage, 'belowAverage', 2),
    ...pickFromTier(minimal, 'minimal', 2),
  ];

  // If we got less than 3 total (sparse distribution), fall back to sorted spread
  if (bridges.length < 3) {
    const sorted = [...chunkResults].sort((a, b) => a.score - b.score);
    const fallback = [
      sorted[0],
      sorted[Math.floor(sorted.length / 2)],
      sorted[sorted.length - 1],
    ];
    return [...new Map(fallback.map(r => [r.studentIndex, { ...r, name: getName(r), tier: 'spread' }])).values()];
  }

  // Deduplicate by studentIndex
  return [...new Map(bridges.map(b => [b.studentIndex, b])).values()];
}

// CORS middleware for Chrome extension
app.use('/*', cors({
  origin: '*', // Allow all origins (extension-friendly)
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ── Bearer token auth middleware for /api/* (except /api/handshake) ──
app.use('/api/*', async (c, next) => {
  // Skip auth for handshake endpoint
  if (c.req.path === '/api/handshake') {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  if (token !== handshakeToken) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  return next();
});

/**
 * Health check endpoint
 */
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// ── Provider Config Bridge Endpoints ────────────────────────────────

/**
 * GET /api/handshake
 * Returns the handshake token for the Chrome extension.
 * Chrome extensions with host_permissions may not send an Origin header,
 * so we accept requests with a chrome-extension:// origin OR no origin
 * (localhost-only server; the handshake token is the real security gate).
 * Returns 503 if no token has been set by desktop yet.
 */
app.get('/api/handshake', (c) => {
  const origin = c.req.header('Origin') || '';
  // Block non-extension web origins (e.g. random websites) but allow
  // missing origin (Chrome extension host_permissions bypass) and extension origins
  if (origin && !origin.startsWith('chrome-extension://') && !origin.startsWith('http://localhost') && !origin.startsWith('http://127.0.0.1')) {
    return c.json({ error: 'Forbidden: extension origin required' }, 403);
  }

  return c.json({ token: handshakeToken });
});

/**
 * GET /api/providers
 * Returns current provider configs. Protected by Bearer token middleware.
 */
app.get('/api/providers', (c) => {
  return c.json({ providers: providerConfigs });
});

/**
 * POST /internal/providers
 * Desktop pushes token + provider configs. Rejects chrome-extension:// origin.
 * Body: { token: string, providers: Array<{id, api_url, model, is_active, credentials}> }
 */
app.post('/internal/providers', async (c) => {
  const origin = c.req.header('Origin') || '';
  if (origin.startsWith('chrome-extension://')) {
    return c.json({ error: 'Forbidden: extensions cannot push provider config' }, 403);
  }

  try {
    const body = await c.req.json();

    if (!body.token || typeof body.token !== 'string') {
      return c.json({ error: 'Missing or invalid field: token' }, 400);
    }
    if (!Array.isArray(body.providers)) {
      return c.json({ error: 'Missing or invalid field: providers (must be array)' }, 400);
    }

    handshakeToken = body.token;
    providerConfigs = body.providers;

    // Persist to config file so server survives restarts
    saveConfig({ token: handshakeToken, providers: providerConfigs });

    return c.json({ success: true, count: providerConfigs.length });
  } catch (error) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
});

/**
 * POST /api/providers/active
 * Extension sets the active provider. Protected by Bearer token middleware.
 * Body: { provider_id: string, model: string }
 * Emits stdout JSON for desktop sidecar: {"type":"provider_changed","provider_id":"...","model":"..."}
 */
app.post('/api/providers/active', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.provider_id || typeof body.provider_id !== 'string') {
      return c.json({ error: 'Missing or invalid field: provider_id' }, 400);
    }
    if (!body.model || typeof body.model !== 'string') {
      return c.json({ error: 'Missing or invalid field: model' }, 400);
    }

    // Check provider exists before mutating state
    const target = providerConfigs.find(p => p.id === body.provider_id);
    if (!target) {
      return c.json({ error: `Provider not found: ${body.provider_id}` }, 404);
    }

    // Update in-memory: set all providers inactive, then activate the selected one
    for (const p of providerConfigs) {
      p.is_active = (p.id === body.provider_id);
    }
    target.model = body.model;

    // Persist to config file
    saveConfig({ token: handshakeToken, providers: providerConfigs });

    // Emit stdout JSON for desktop sidecar parsing (same pattern as session_complete)
    console.log(JSON.stringify({
      type: 'provider_changed',
      provider_id: body.provider_id,
      model: body.model,
    }));

    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
});

// ── Rubric Library CRUD ──────────────────────────────────────────────────

app.get('/api/rubrics', (c) => {
  return c.json({ rubrics: loadRubrics() });
});

app.post('/api/rubrics', async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name || !Array.isArray(body.criteria)) {
      return c.json({ error: 'name (string) and criteria (array) are required' }, 400);
    }
    const rubric = createRubric(body);
    return c.json({ rubric }, 201);
  } catch (error) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
});

app.put('/api/rubrics/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const updated = updateRubric(id, body);
    if (!updated) return c.json({ error: 'Rubric not found' }, 404);
    return c.json({ rubric: updated });
  } catch (error) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
});

app.delete('/api/rubrics/:id', (c) => {
  const id = c.req.param('id');
  const deleted = deleteRubric(id);
  if (!deleted) return c.json({ error: 'Rubric not found' }, 404);
  return c.json({ success: true });
});

// ── Single Grading & Solver Chat ─────────────────────────────────────────

/**
 * POST /api/chat
 * Single grading and solver chat endpoint.
 *
 * Body: { message, rubric?, studentWork?, model?, provider? }
 *
 * Grader mode (rubric present): Returns JSON { score, feedback, provider, model }
 * Solver mode (no rubric): Returns SSE stream
 *   Events:
 *     status  — { status: 'thinking', provider, model }
 *     message — { content: string }
 *     done    — { provider, model }
 *     error   — { message: string }
 */
app.post('/api/chat', async (c) => {
  const timestamp = () => new Date().toLocaleTimeString();

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { message, rubric, studentWork, model, provider, systemPrompt, images } = body;

  if (!message || typeof message !== 'string') {
    return c.json({ error: 'Missing required field: message' }, 400);
  }

  // Resolve provider: use specified or fall back to active provider
  let providerId = provider;
  let effectiveModel = model;

  if (!providerId) {
    const activeProvider = providerConfigs.find(p => p.is_active);
    if (!activeProvider) {
      return c.json({ error: 'No active provider configured. Set a provider or pass provider in request.' }, 400);
    }
    providerId = activeProvider.id;
    if (!effectiveModel) effectiveModel = activeProvider.model;
  }

  if (!effectiveModel) {
    const p = providerConfigs.find(pc => pc.id === providerId);
    effectiveModel = p?.model;
    if (!effectiveModel) {
      return c.json({ error: 'No model specified and no default model for provider' }, 400);
    }
  }

  // Determine mode: grader (rubric present) vs solver (no rubric)
  const isGraderMode = !!rubric;

  if (isGraderMode) {
    // ── Grader mode: single student grading, JSON response ──
    try {
      const prompt = buildSingleGradePrompt(rubric, studentWork || '', message);
      const providerConfig = resolveProviderConfig(providerId, effectiveModel);

      console.log(`[${timestamp()}] [chat] Grader mode: provider=${providerId} model=${effectiveModel}`);
      const aiText = await withRetry(
        () => callProviderDirect(providerId, providerConfig, [{ role: 'user', content: prompt }], timestamp()),
        { maxRetries: 3 }
      );

      const maxScore = parseFloat(rubric.maxScore) || 10;
      const result = parseSingleGradeResponse(aiText, maxScore);

      return c.json({
        ...result,
        provider: providerId,
        model: effectiveModel,
      });
    } catch (error) {
      console.error(`[${timestamp()}] [chat] Grader error:`, error.message);
      return c.json({ error: error.message }, 500);
    }
  } else {
    // ── Solver mode: general AI chat, SSE response ──
    let sseId = 0;

    return streamSSE(c, async (stream) => {
      try {
        await stream.writeSSE({
          event: 'status',
          data: JSON.stringify({ status: 'thinking', provider: providerId, model: effectiveModel }),
          id: String(sseId++),
        });

        const providerConfig = resolveProviderConfig(providerId, effectiveModel);
        console.log(`[${timestamp()}] [chat] Solver mode: provider=${providerId} model=${effectiveModel}`);

        // Build messages array, honouring optional system prompt and images
        const solverMessages = [];
        if (systemPrompt) {
          solverMessages.push({ role: 'system', content: systemPrompt });
        }

        // If images provided, build multimodal user content (OpenAI-compatible format)
        let userContent;
        if (images && images.length > 0) {
          userContent = [
            { type: 'text', text: message },
            ...images.map(img => ({ type: 'image_url', image_url: { url: img } })),
          ];
        } else {
          userContent = message;
        }
        solverMessages.push({ role: 'user', content: userContent });

        const aiText = await callProviderDirect(providerId, providerConfig, solverMessages, timestamp());

        await stream.writeSSE({
          event: 'message',
          data: JSON.stringify({ content: aiText }),
          id: String(sseId++),
        });

        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ provider: providerId, model: effectiveModel }),
          id: String(sseId++),
        });
      } catch (error) {
        console.error(`[${timestamp()}] [chat] Solver error:`, error.message);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: error.message }),
          id: String(sseId++),
        });
      }
    });
  }
});


/**
 * POST /api/agent
 * Browser agent endpoint for natural language browser automation.
 * 
 * Body: { messages: [{role, content}], dom?: string, screenshot?: string }
 * Response: { response: string } (raw AI text, client parses JSON action from it)
 */
app.post('/api/agent', async (c) => {
  return handleAgentRequest(c, { callProviderDirect, resolveProviderConfig, providerConfigs });
});

/**
 * Diagnostic: test GitHub Copilot API token
 * GET /api/test-github
 */
app.get('/api/test-github', async (c) => {
  const ghProvider = providerConfigs.find(p => p.id === 'github-models');
  if (!ghProvider) return c.json({ error: 'No github-models provider configured' }, 404);

  const oauthToken = ghProvider.credentials?.api_key || ghProvider.credentials?.access_token || '';
  const tokenPreview = oauthToken ? `${oauthToken.slice(0, 6)}...${oauthToken.slice(-4)}` : '(empty)';
  console.log(`[test-github] OAuth token preview: ${tokenPreview}`);
  console.log(`[test-github] Full provider config keys:`, Object.keys(ghProvider.credentials || {}));

  try {
    // Step 1: Exchange OAuth token for Copilot session token
    console.log(`[test-github] Exchanging OAuth token for Copilot session token...`);
    const sessionToken = await getCopilotSessionToken(oauthToken);
    console.log(`[test-github] Session token obtained (${sessionToken.slice(0, 10)}...)`);

    // Test 1: list models
    const modelsRes = await fetch('https://api.githubcopilot.com/models', {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Copilot-Integration-Id': 'vscode-chat',
      },
    });
    const modelsStatus = modelsRes.status;
    const modelsText = await modelsRes.text();
    console.log(`[test-github] /models: ${modelsStatus}`);

    // Test 2: minimal chat completion
    const chatRes = await fetch('https://api.githubcopilot.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`,
        'Copilot-Integration-Id': 'vscode-chat',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4.5',
        messages: [{ role: 'user', content: 'Say hello in exactly 3 words.' }],
        stream: false,
      }),
    });
    const chatStatus = chatRes.status;
    const chatText = await chatRes.text();
    console.log(`[test-github] /chat/completions: ${chatStatus} ${chatText.slice(0, 300)}`);

    return c.json({
      tokenPreview,
      models: { status: modelsStatus },
      chat: { status: chatStatus, body: chatText.slice(0, 500) },
    });
  } catch (err) {
    return c.json({ error: err.message, tokenPreview });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Browser Automation Endpoints (Playwriter MCP Integration)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Grant session access for browser automation
 * POST /api/automation/grant-access
 * Body: { sessionToken, tabId, url, expiresAt }
 * Response: { success: true, session: {...} }
 */
app.post('/api/automation/grant-access', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.sessionToken || typeof body.sessionToken !== 'string') {
      return c.json({ error: 'Missing or invalid field: sessionToken' }, 400);
    }
    if (!body.tabId || typeof body.tabId !== 'number') {
      return c.json({ error: 'Missing or invalid field: tabId' }, 400);
    }
    if (!body.url || typeof body.url !== 'string') {
      return c.json({ error: 'Missing or invalid field: url' }, 400);
    }
    if (!body.expiresAt || typeof body.expiresAt !== 'string') {
      return c.json({ error: 'Missing or invalid field: expiresAt' }, 400);
    }

    const grantedBy = c.req.header('X-Extension-ID') || 'unknown';
    const session = grantSession(
      body.sessionToken,
      body.tabId,
      body.url,
      grantedBy,
      body.expiresAt
    );

    console.log(`[Automation] Session granted for tab ${body.tabId}: ${body.url}`);

    return c.json({
      success: true,
      session: {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt.toISOString()
      }
    });
  } catch (error) {
    console.error('[Automation] Grant access error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Revoke session access for browser automation
 * POST /api/automation/revoke-access
 * Body: { sessionToken }
 * Response: { success: true }
 */
app.post('/api/automation/revoke-access', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.sessionToken || typeof body.sessionToken !== 'string') {
      return c.json({ error: 'Missing or invalid field: sessionToken' }, 400);
    }

    const deleted = revokeSession(body.sessionToken);

    return c.json({ success: deleted });
  } catch (error) {
    console.error('[Automation] Revoke access error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Automated Grading with Browser Automation
 * POST /api/automation/grade
 * Body: { sessionToken, provider, model, resumeAfter }
 * Response: text/event-stream (SSE)
 *
 * Events:
 *   progress  — { phase, message, current, total }
 *   student   — { index, name, score, feedback }
 *   save      — { savedCount, message }
 *   done      — { totalGraded, stats }
 *   error     — { message }
 */
app.post('/api/automation/grade', async (c) => {
  // DEPRECATED: This endpoint used Playwriter for browser automation
  // Use /api/grade instead with extension-based extraction and filling
  return c.json({
    error: 'Endpoint deprecated',
    message: 'This automation endpoint has been removed. Use /api/grade instead.',
    migration: {
      new_endpoint: '/api/grade',
      approach: 'Extension handles extraction and filling via chrome.scripting'
    }
  }, 410);

  // Old implementation below (unreachable - kept for reference)
  const startTime = Date.now();

  // Parse body before entering SSE stream
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { sessionToken, provider, model, resumeAfter } = body;

  if (!sessionToken) return c.json({ error: 'Missing required field: sessionToken' }, 400);
  if (!provider) return c.json({ error: 'Missing required field: provider' }, 400);
  if (!model) return c.json({ error: 'Missing required field: model' }, 400);

  // Validate session
  let session;
  try {
    session = validateSession(sessionToken);
  } catch (error) {
    return c.json({ error: error.message }, 401);
  }

  // Start SSE stream
  return streamSSE(c, async (stream) => {
    let sseId = 0;

    const send = (event, data) => {
      stream.writeSSE({
        id: String(sseId++),
        event,
        data: JSON.stringify(data),
      });
    };

    try {
      send('progress', { phase: 'extracting', message: 'Extracting rubric and student responses...' });

      // Step 1: Extract data from page via Playwriter MCP
      const { rubric, students } = await extractGradingData(sessionToken);

      send('progress', {
        phase: 'extracted',
        message: `Found ${students.length} students`,
        studentCount: students.length
      });

      // Filter: skip students who already have feedback
      const toGrade = students.filter(s => !s.hasFeedback);

      if (resumeAfter) {
        const resumeIndex = toGrade.findIndex(s => s.name === resumeAfter);
        if (resumeIndex >= 0) {
          toGrade.splice(0, resumeIndex + 1);
          send('progress', {
            phase: 'resumed',
            message: `Resuming after ${resumeAfter} (${toGrade.length} students remaining)`
          });
        }
      }

      if (toGrade.length === 0) {
        send('done', { totalGraded: 0, message: 'All students already graded' });
        return;
      }

      send('progress', {
        phase: 'grading',
        message: `Grading ${toGrade.length} students...`,
        total: toGrade.length
      });

      // Step 2: Generate scoring anchors
      const maxScore = parseFloat(rubric.maxScore) || 10;
      const anchors = generateScoringAnchors({
        essayPrompt: rubric.essayPrompt,
        checklistItems: rubric.checklistItems,
        rubricItems: rubric.rubricItems,
        modelText: rubric.modelText,
        maxScore
      });

      // Step 3: Grade in chunks of 20 with progressive filling
      const chunks = chunkStudents(toGrade, 20);
      let allResults = [];
      let gradedCount = 0;

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];

        send('progress', {
          phase: 'grading',
          message: `Processing chunk ${chunkIndex + 1}/${chunks.length}`,
          current: gradedCount,
          total: toGrade.length
        });

        // Grade this chunk
        const prompt = buildBatchPrompt(rubric, chunk, anchors);
        const { apiUrl, apiKey, model: effectiveModel } = resolveProviderConfig(provider, model);

        const aiResponse = await callProviderDirect(
          provider,
          apiUrl,
          apiKey,
          effectiveModel || model,
          prompt
        );

        const chunkResults = parseBatchResponse(aiResponse, chunk);
        allResults.push(...chunkResults);

        // Send individual student results
        for (const result of chunkResults) {
          send('student', {
            index: result.studentIndex,
            name: students[result.studentIndex].name,
            score: result.score,
            feedback: result.feedback
          });
          gradedCount++;
        }

        // Step 4: Fill grades in batches of 5
        const fillBatches = [];
        for (let i = 0; i < chunkResults.length; i += 5) {
          fillBatches.push(chunkResults.slice(i, i + 5));
        }

        for (const batch of fillBatches) {
          await fillGrades(sessionToken, batch);
          send('save', {
            savedCount: batch.length,
            message: `Saved ${batch.length} grades`
          });

          // Brief pause between fills for visual feedback
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Step 5: Outlier detection and adjustment
      const outliers = detectOutliers(allResults, maxScore);

      if (outliers.length > 0) {
        send('progress', {
          phase: 'outliers',
          message: `Reviewing ${outliers.length} potential outliers...`
        });

        const reviewPrompt = buildOutlierReviewPrompt(rubric, outliers, anchors);
        const { apiUrl, apiKey, model: effectiveModel } = resolveProviderConfig(provider, model);

        const reviewResponse = await callProviderDirect(
          provider,
          apiUrl,
          apiKey,
          effectiveModel || model,
          reviewPrompt
        );

        const adjustments = parseBatchResponse(reviewResponse, outliers);
        const mergedResults = mergeResults(allResults, adjustments);

        // Fill adjusted outliers
        await fillGrades(sessionToken, adjustments);
        send('save', {
          savedCount: adjustments.length,
          message: `Adjusted ${adjustments.length} outliers`
        });
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      send('done', {
        totalGraded: gradedCount,
        duration,
        stats: {
          totalStudents: students.length,
          graded: gradedCount,
          skipped: students.length - toGrade.length,
          averageScore: (allResults.reduce((sum, r) => sum + r.score, 0) / allResults.length).toFixed(2)
        }
      });

      // Emit desktop sidecar event
      console.log(JSON.stringify({
        type: 'session_complete',
        provider,
        model,
        total_graded: gradedCount,
        duration_seconds: parseFloat(duration)
      }));

    } catch (error) {
      console.error('[Automation] Grading error:', error);
      send('error', { message: error.message });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Review Mode Endpoints
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/automation/grade-only
 * Extracts rubric and students, grades them via AI, returns results WITHOUT filling
 * Used for review mode - allows user to approve results before filling
 */
app.post('/api/automation/grade-only', async (c) => {
  // DEPRECATED: Use /api/grade with extension-based extraction
  return c.json({
    error: 'Endpoint deprecated',
    message: 'Use /api/grade instead',
    migration: { new_endpoint: '/api/grade' }
  }, 410);

  // Old implementation below (unreachable - kept for reference)
  const startTime = Date.now();

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { sessionToken, provider, model, resumeAfter, customInstructions } = body;

  if (!sessionToken) return c.json({ error: 'Missing required field: sessionToken' }, 400);
  if (!provider) return c.json({ error: 'Missing required field: provider' }, 400);
  if (!model) return c.json({ error: 'Missing required field: model' }, 400);

  // Validate session
  let session;
  try {
    session = validateSession(sessionToken);
  } catch (error) {
    return c.json({ error: error.message }, 401);
  }

  try {
    console.log('[Automation] Grade-only mode: extracting and grading without filling');

    // Step 1: Extract data from page
    const { rubric, students } = await extractGradingData(sessionToken);

    // Apply custom instructions if provided
    if (customInstructions) {
      rubric.essayPrompt = (rubric.essayPrompt || '') + '\n\nADDITIONAL GRADING INSTRUCTIONS:\n' + customInstructions;
    }

    // Filter: skip students who already have feedback
    let toGrade = students.filter(s => !s.hasFeedback);

    if (resumeAfter) {
      const resumeIndex = toGrade.findIndex(s => s.name === resumeAfter);
      if (resumeIndex >= 0) {
        toGrade = toGrade.slice(resumeIndex + 1);
      }
    }

    if (toGrade.length === 0) {
      return c.json({
        success: true,
        totalGraded: 0,
        message: 'All students already graded',
        results: []
      });
    }

    // Step 2: Generate scoring anchors
    const maxScore = parseFloat(rubric.maxScore) || 10;
    const anchors = generateScoringAnchors({
      essayPrompt: rubric.essayPrompt,
      checklistItems: rubric.checklistItems,
      rubricItems: rubric.rubricItems,
      modelText: rubric.modelText,
      maxScore
    });

    // Step 3: Grade in chunks of 20
    const chunks = chunkStudents(toGrade, 20);
    let allResults = [];

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];

      const prompt = buildBatchPrompt(rubric, chunk, anchors);
      const { apiUrl, apiKey, model: effectiveModel } = resolveProviderConfig(provider, model);

      const aiResponse = await callProviderDirect(
        provider,
        apiUrl,
        apiKey,
        effectiveModel || model,
        prompt
      );

      const chunkResults = parseBatchResponse(aiResponse, chunk);
      allResults.push(...chunkResults);
    }

    // Step 4: Outlier detection (optional enhancement)
    const outliers = detectOutliers(allResults, maxScore);
    if (outliers.length > 0) {
      console.log(`[Automation] Detected ${outliers.length} outliers for review`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Return results for review - DO NOT FILL
    return c.json({
      success: true,
      totalGraded: allResults.length,
      duration,
      results: allResults.map(r => ({
        studentIndex: r.studentIndex,
        name: students[r.studentIndex].name,
        response: students[r.studentIndex].response,
        score: r.score,
        feedback: r.feedback,
        maxScore: maxScore
      })),
      stats: {
        totalStudents: students.length,
        graded: allResults.length,
        skipped: students.length - toGrade.length,
        averageScore: (allResults.reduce((sum, r) => sum + r.score, 0) / allResults.length).toFixed(2),
        outliersDetected: outliers.length
      }
    });

  } catch (error) {
    console.error('[Automation] Grade-only error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /api/automation/fill
 * Fills specific grading results into the page via Playwriter MCP
 * Used after user approves results in review mode
 */
app.post('/api/automation/fill', async (c) => {
  // DEPRECATED: Extension now fills grades directly via chrome.scripting
  return c.json({
    error: 'Endpoint deprecated',
    message: 'Extension handles filling directly - server no longer fills grades',
    migration: { approach: 'Use BatchGrader.fillGrade() in extension' }
  }, 410);

  // Old implementation below (unreachable - kept for reference)
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { sessionToken, results } = body;

  if (!sessionToken) return c.json({ error: 'Missing required field: sessionToken' }, 400);
  if (!results || !Array.isArray(results)) return c.json({ error: 'Missing or invalid field: results (array expected)' }, 400);

  // Validate session
  try {
    validateSession(sessionToken);
  } catch (error) {
    return c.json({ error: error.message }, 401);
  }

  try {
    console.log(`[Automation] Filling ${results.length} approved results into page`);

    // Fill in batches of 5 for visual feedback
    const fillBatches = [];
    for (let i = 0; i < results.length; i += 5) {
      fillBatches.push(results.slice(i, i + 5));
    }

    let totalFilled = 0;
    for (const batch of fillBatches) {
      await fillGrades(sessionToken, batch);
      totalFilled += batch.length;

      // Brief pause between fills
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return c.json({
      success: true,
      filled: totalFilled,
      message: `Successfully filled ${totalFilled} results`
    });

  } catch (error) {
    console.error('[Automation] Fill error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// SSE Streaming Batch Grading — single POST, progressive chunk results
// ═══════════════════════════════════════════════════════════════════════

/**
 * Pick calibration students evenly spread across the list.
 * Returns { calibration, remaining } arrays.
 */
function pickCalibrationStudents(students, count = 5) {
  if (students.length <= count) return { calibration: students, remaining: [] };
  const step = Math.floor(students.length / count);
  const calibration = [];
  for (let i = 0; i < count; i++) {
    calibration.push(students[i * step]);
  }
  const calibrationIndices = new Set(calibration.map(s => s.index));
  const remaining = students.filter(s => !calibrationIndices.has(s.index));
  return { calibration, remaining };
}

/**
 * Resolve provider config from in-memory state for direct AI calls.
 * Returns { apiUrl, apiKey, model } or throws if provider not found.
 */
function resolveProviderConfig(providerId, model) {
  const p = providerConfigs.find(pc => pc.id === providerId);
  const apiUrl = p?.api_url || '';
  const apiKey = p?.credentials?.api_key || p?.credentials?.access_token || '';
  const tokenType = p?.credentials?.token_type || null;
  const refreshToken = p?.credentials?.refresh_token || null;
  const expiresAt = p?.credentials?.expires_at || null;
  let effectiveApiUrl = apiUrl;
  if (!effectiveApiUrl) {
    switch (providerId.toLowerCase()) {
      case 'ollama': case 'ollama-local': case 'ollama-cloud': effectiveApiUrl = 'http://localhost:11434'; break;
      case 'openai': effectiveApiUrl = 'https://api.openai.com'; break;
      case 'anthropic': effectiveApiUrl = 'https://api.anthropic.com'; break;
      case 'google-gemini': effectiveApiUrl = 'https://generativelanguage.googleapis.com'; break;
      case 'github-models': effectiveApiUrl = 'https://api.githubcopilot.com'; break;
    }
  }

  return { apiUrl: effectiveApiUrl, apiKey, model, tokenType, refreshToken, expiresAt };
}

// ── Anchor Generation Helpers ─────────────────────────────────────────

/**
 * Build a prompt asking the AI to write example student responses at 4 calibration levels.
 */
function buildAnchorGenerationPrompt(rubric, anchors) {
  const maxScore = parseFloat(rubric.maxScore) || 10;
  const parts = [];

  parts.push('You are a grading calibration assistant.');
  parts.push('For the assignment below, write FOUR brief example student responses at different quality levels.');
  parts.push('These examples will be shown to an AI grader so it understands what each score level looks like for THIS specific question.\n');

  if (rubric.essayPrompt) {
    parts.push(`ASSIGNMENT:\n${rubric.essayPrompt}\n`);
  }

  const rubricLines = [];
  if (rubric.checklistItems?.length > 0) {
    for (const item of rubric.checklistItems) {
      if (item.category) rubricLines.push(`[${item.category}]`);
      for (const sub of item.items) rubricLines.push(`  - ${sub}`);
    }
  }
  if (rubric.rubricItems?.length > 0) {
    for (const item of rubric.rubricItems) {
      if (item.category) rubricLines.push(`[${item.category}]`);
      for (const sub of item.items) rubricLines.push(`  - ${sub}`);
    }
  }
  if (rubricLines.length > 0) {
    parts.push(`RUBRIC:\n${rubricLines.join('\n')}\n`);
  }
  if (rubric.modelText) {
    parts.push(`MODEL ANSWER:\n${rubric.modelText}\n`);
  }
  parts.push(`MAX SCORE: ${maxScore}\n`);

  parts.push('Write one realistic example student response per level. Match the length and style a student would actually write for this assignment.\n');
  parts.push(`EXCELLENT (${anchors.excellent.score}/${maxScore}):\n[write example]\n`);
  parts.push(`ADEQUATE (${anchors.adequate.score}/${maxScore}):\n[write example]\n`);
  parts.push(`BELOW AVERAGE (${anchors.belowAverage.score}/${maxScore}):\n[write example]\n`);
  parts.push(`MINIMAL (${anchors.minimal.score}/${maxScore}):\n[write example]`);

  return parts.join('\n');
}

/**
 * Parse the AI’s 4-section response into an array of { label, score, maxScore, response }.
 */
function parseAnchorResponses(text, anchors, maxScore) {
  const tiers = [
    { label: 'Excellent',     score: anchors.excellent.score },
    { label: 'Adequate',      score: anchors.adequate.score },
    { label: 'Below Average', score: anchors.belowAverage.score },
    { label: 'Minimal',       score: anchors.minimal.score },
  ];

  const result = [];
  for (let i = 0; i < tiers.length; i++) {
    const { label, score } = tiers[i];
    const headerRe = new RegExp(`${label.replace(' ', '\\s+')}\\s*\\(${score}\\/${maxScore}\\)\\s*:?`, 'i');
    const headerMatch = text.match(headerRe);
    if (!headerMatch) {
      result.push({ label, score, maxScore, response: '' });
      continue;
    }
    const start = text.indexOf(headerMatch[0]) + headerMatch[0].length;
    let end = text.length;
    for (let j = i + 1; j < tiers.length; j++) {
      const nextRe = new RegExp(`${tiers[j].label.replace(' ', '\\s+')}\\s*\\(${tiers[j].score}\\/${maxScore}\\)`, 'i');
      const nextMatch = text.slice(start).match(nextRe);
      if (nextMatch) {
        end = start + text.slice(start).indexOf(nextMatch[0]);
        break;
      }
    }
    result.push({ label, score, maxScore, response: text.slice(start, end).trim() });
  }
  return result;
}

/**
 * POST /api/generate-anchors
 * Body: { provider, model, rubric }
 * Response: { anchors: [{ label, score, maxScore, response }] }
 */
app.post('/api/generate-anchors', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { provider, model, rubric } = body;
  if (!provider) return c.json({ error: 'Missing required field: provider' }, 400);
  if (!model)    return c.json({ error: 'Missing required field: model' }, 400);
  if (!rubric)   return c.json({ error: 'Missing required field: rubric' }, 400);

  const maxScore = parseFloat(rubric.maxScore) || 10;
  const timestamp = () => new Date().toLocaleTimeString();

  try {
    const providerConfig = resolveProviderConfig(provider, model);
    const anchors = generateScoringAnchors(rubric);
    console.log(`[${timestamp()}] [anchors] Generating | provider=${provider} model=${model}`);
    const prompt = buildAnchorGenerationPrompt(rubric, anchors);
    const aiText = await callProviderDirect(provider, providerConfig, [{ role: 'user', content: prompt }], timestamp());
    const anchorData = parseAnchorResponses(aiText, anchors, maxScore);
    console.log(`[${timestamp()}] [anchors] Done (${anchorData.length} tiers)`);
    return c.json({ anchors: anchorData });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${timestamp()}] [anchors] Error: ${message}`);
    return c.json({ error: message }, 500);
  }
});


/**
 * SSE Batch Grading Endpoint
 * POST /api/grade
 * Body: { provider, model, rubric, students }
 * Response: text/event-stream (SSE)
 *
 * Events:
 *   progress  — { phase, chunkIndex, totalChunks, studentCount }
 *   chunk     — { chunkIndex, results: [{studentIndex, score, feedback}] }
 *   outlier   — { adjustedResults: [{studentIndex, score, feedback}] }
 *   done      — { stats, anchors, metadata }
 *   error     — { message }
 */
app.post('/api/grade', async (c) => {
  const startTime = Date.now();
  const timestamp = () => new Date().toLocaleTimeString();

  // Parse body before entering SSE stream (so we can return 400 for bad input)
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { provider, model, rubric, students, strategy, chunkSize: rawChunkSize, sweep, customInstructions } = body;
  const useParallel = strategy === 'parallel'; // default: serial (more reliable)
  const chunkSize = Math.max(5, Math.min(50, parseInt(rawChunkSize) || 30));
  // sweep: 'none' (default for single chunk), 'compact', 'pairwise', 'auto' (compact if multi-chunk)
  const sweepMode = sweep || 'auto';

  if (!provider) return c.json({ error: 'Missing required field: provider' }, 400);
  if (!model) return c.json({ error: 'Missing required field: model' }, 400);
  if (!rubric) return c.json({ error: 'Missing required field: rubric' }, 400);
  if (!students || !Array.isArray(students) || students.length === 0) {
    return c.json({ error: 'Missing or invalid field: students (must be non-empty array)' }, 400);
  }

  // Inject custom instructions into rubric so buildBatchPrompt can use them
  if (customInstructions) {
    rubric.customInstructions = customInstructions;
  }

  const maxScore = parseFloat(rubric.maxScore) || 10;
  let sseId = 0;

  return streamSSE(c, async (stream) => {
    try {
      // Resolve provider config
      const providerConfig = resolveProviderConfig(provider, model);
      const keySource = providerConfig.apiKey ? 'configured' : 'none';
      console.log(`[${timestamp()}] [sse] Grading ${students.length} students | provider=${provider} model=${model} keySource=${keySource}`);

      // Step 1: Generate scoring anchors
      const anchors = generateScoringAnchors(rubric);
      console.log(`[${timestamp()}] [sse] Anchors: Excellent (${anchors.excellent.score}), Adequate (${anchors.adequate.score}), Minimal (${anchors.minimal.score})`);

      // Step 2: Grade students
      const allResults = [];
      const chunkMap = {}; // studentIndex → chunkIndex
      let totalChunksForClient;

      if (!useParallel || students.length <= chunkSize) {
        // ── Serial strategy (or small batch) ──
        const chunks = chunkStudents(students, chunkSize);
        totalChunksForClient = chunks.length;
        console.log(`[${timestamp()}] [sse] Strategy: serial | ${chunks.length} chunk(s)`);
        let bridgeResponses = null;

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          await stream.writeSSE({
            event: 'progress',
            data: JSON.stringify({ phase: 'grading', chunkIndex: i, totalChunks: chunks.length, studentCount: chunk.students.length, totalStudents: students.length }),
            id: String(sseId++),
          });

          console.log(`[${timestamp()}] [sse] Grading chunk ${i + 1}/${chunks.length} (${chunk.students.length} students)...`);
          const prompt = buildBatchPrompt(rubric, chunk.students, anchors, bridgeResponses);
          const aiText = await callProviderDirect(provider, providerConfig, [{ role: 'user', content: prompt }], timestamp());
          const chunkResults = parseBatchResponse(aiText, chunk.students, maxScore);
          allResults.push(chunkResults);

          for (const r of chunkResults) {
            chunkMap[r.studentIndex] = i;
            const name = chunk.students.find(s => s.index === r.studentIndex)?.name || `Student ${r.studentIndex}`;
            console.log(`[${timestamp()}] [sse] ✓ ${name}: ${r.score}/${maxScore}`);
          }

          if (i < chunks.length - 1) {
            bridgeResponses = buildBridgeResponses(chunkResults, chunk.students, anchors, maxScore);
            console.log(`[${timestamp()}] [sse] Bridge (${bridgeResponses.length}): ${bridgeResponses.map(b => `${b.name}=${b.score}[${b.tier}]`).join(', ')}`);
          }

          await stream.writeSSE({
            event: 'chunk',
            data: JSON.stringify({ chunkIndex: i, results: chunkResults }),
            id: String(sseId++),
          });
        }
      } else {
        // ── Parallel strategy: calibration pre-pass then parallel chunks ──
        const { calibration: calStudents, remaining } = pickCalibrationStudents(students, 5);
        const remainingChunks = chunkStudents(remaining, chunkSize);
        totalChunksForClient = 1 + remainingChunks.length;

        console.log(`[${timestamp()}] [sse] Strategy: parallel | calibration=${calStudents.length}, then ${remainingChunks.length} chunk(s) (${remaining.length} students)`);

        // Phase A: Calibration
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({ phase: 'calibration', chunkIndex: 0, totalChunks: totalChunksForClient, studentCount: calStudents.length, totalStudents: students.length }),
          id: String(sseId++),
        });

        console.log(`[${timestamp()}] [sse] Grading calibration batch (${calStudents.length} students)...`);
        const calPrompt = buildBatchPrompt(rubric, calStudents, anchors, null);
        const calText = await callProviderDirect(provider, providerConfig, [{ role: 'user', content: calPrompt }], timestamp());
        const calResults = parseBatchResponse(calText, calStudents, maxScore);
        allResults.push(calResults);

        for (const r of calResults) {
          chunkMap[r.studentIndex] = 0; // calibration = chunk 0
          const name = calStudents.find(s => s.index === r.studentIndex)?.name || `Student ${r.studentIndex}`;
          console.log(`[${timestamp()}] [sse] ✓ ${name}: ${r.score}/${maxScore}`);
        }

        await stream.writeSSE({
          event: 'chunk',
          data: JSON.stringify({ chunkIndex: 0, results: calResults }),
          id: String(sseId++),
        });

        // Extract bridge responses from calibration
        const bridgeResponses = buildBridgeResponses(calResults, calStudents, anchors, maxScore);
        console.log(`[${timestamp()}] [sse] Bridge (${bridgeResponses.length}): ${bridgeResponses.map(b => `${b.name}=${b.score}[${b.tier}]`).join(', ')}`);

        // Phase B: Parallel grading of remaining chunks
        if (remainingChunks.length > 0) {
          for (let i = 0; i < remainingChunks.length; i++) {
            await stream.writeSSE({
              event: 'progress',
              data: JSON.stringify({ phase: 'grading-parallel', chunkIndex: i + 1, totalChunks: totalChunksForClient, studentCount: remainingChunks[i].students.length, totalStudents: students.length }),
              id: String(sseId++),
            });
          }

          console.log(`[${timestamp()}] [sse] Firing ${remainingChunks.length} chunk(s) in parallel...`);
          const maxConcurrent = 3;
          for (let waveStart = 0; waveStart < remainingChunks.length; waveStart += maxConcurrent) {
            const wave = remainingChunks.slice(waveStart, waveStart + maxConcurrent);

            const waveTexts = await Promise.all(
              wave.map(chunk => {
                const prompt = buildBatchPrompt(rubric, chunk.students, anchors, bridgeResponses);
                return callProviderDirect(provider, providerConfig, [{ role: 'user', content: prompt }], timestamp());
              })
            );

            for (let j = 0; j < wave.length; j++) {
              const chunkIdx = waveStart + j;
              const chunkResults = parseBatchResponse(waveTexts[j], wave[j].students, maxScore);
              allResults.push(chunkResults);

              for (const r of chunkResults) {
                chunkMap[r.studentIndex] = chunkIdx + 1; // parallel chunks are 1-indexed
                const name = wave[j].students.find(s => s.index === r.studentIndex)?.name || `Student ${r.studentIndex}`;
                console.log(`[${timestamp()}] [sse] ✓ ${name}: ${r.score}/${maxScore}`);
              }

              await stream.writeSSE({
                event: 'chunk',
                data: JSON.stringify({ chunkIndex: chunkIdx + 1, results: chunkResults }),
                id: String(sseId++),
              });
            }
          }
        }
      }

      // Step 3.5: Consistency sweep (only for multi-chunk)
      const results = mergeResults(allResults);
      const numChunks = new Set(Object.values(chunkMap)).size;
      const shouldSweep = numChunks >= 2 && sweepMode !== 'none';
      let sweepAdjustments = [];

      if (shouldSweep) {
        const effectiveSweep = sweepMode === 'auto' ? 'pairwise' : sweepMode;
        console.log(`[${timestamp()}] [sse] Consistency sweep: mode=${effectiveSweep}, chunks=${numChunks}`);

        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({ phase: 'consistency-sweep', mode: effectiveSweep }),
          id: String(sseId++),
        });

        try {
          if (effectiveSweep === 'compact') {
            // Single API call with compact table
            const sweepPrompt = buildCompactSweepPrompt(results, students, anchors, chunkMap, maxScore);
            const sweepText = await callProviderDirect(provider, providerConfig, [{ role: 'user', content: sweepPrompt }], timestamp());

            // Parse the JSON array response
            const jsonMatch = sweepText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsed)) {
                sweepAdjustments = parsed.filter(a => a.studentIndex !== undefined && a.suggestedScore !== undefined && a.suggestedScore !== a.currentScore);
              }
            }
            console.log(`[${timestamp()}] [sse] Compact sweep: ${sweepAdjustments.length} adjustment(s) suggested`);

          } else if (effectiveSweep === 'pairwise') {
            // Multiple API calls, one per cross-chunk band
            const bandPrompts = buildPairwiseSweepPrompts(results, students, anchors, chunkMap, maxScore);
            console.log(`[${timestamp()}] [sse] Pairwise sweep: ${bandPrompts.length} band(s) to check`);

            for (const bp of bandPrompts) {
              console.log(`[${timestamp()}] [sse]   Checking ${bp.label} band (${bp.studentIndices.length} students)...`);
              const bandText = await callProviderDirect(provider, providerConfig, [{ role: 'user', content: bp.prompt }], timestamp());

              const jsonMatch = bandText.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed)) {
                  const bandAdj = parsed.filter(a => a.studentIndex !== undefined && a.suggestedScore !== undefined && a.suggestedScore !== a.currentScore);
                  sweepAdjustments.push(...bandAdj);
                }
              }
            }
            console.log(`[${timestamp()}] [sse] Pairwise sweep: ${sweepAdjustments.length} total adjustment(s)`);
          }

          // Apply sweep adjustments
          let sweepCount = 0;
          for (const adj of sweepAdjustments) {
            const r = results.find(r => r.studentIndex === adj.studentIndex);
            if (r && adj.suggestedScore !== r.score) {
              let newScore = parseFloat(adj.suggestedScore);
              if (isNaN(newScore) || newScore < 0) continue;
              if (newScore > maxScore) newScore = maxScore;
              newScore = Math.round(newScore * 2) / 2; // snap to 0.5
              const name = students.find(s => s.index === adj.studentIndex)?.name || `Student ${adj.studentIndex}`;
              console.log(`[${timestamp()}] [sse]   ✎ sweep: ${name}: ${r.score} → ${newScore}/${maxScore} (${adj.reason || 'consistency'})`);
              r.score = newScore;
              r.sweepAdjusted = true;
              sweepCount++;
            }
          }

          if (sweepCount > 0) {
            await stream.writeSSE({
              event: 'sweep',
              data: JSON.stringify({ adjustments: sweepAdjustments, count: sweepCount }),
              id: String(sseId++),
            });
          }
          console.log(`[${timestamp()}] [sse] Sweep complete: ${sweepCount} score(s) adjusted`);

        } catch (sweepErr) {
          console.warn(`[${timestamp()}] [sse] Consistency sweep failed: ${sweepErr.message}, continuing with original scores`);
        }
      }

      // Step 4: Detect outliers (on sweep-adjusted results)
      const outlierAnalysis = detectOutliers(results);

      // Step 5: Outlier review (if any)
      let adjustedCount = 0;
      if (outlierAnalysis.outliers.length > 0) {
        console.log(`[${timestamp()}] [sse] ${outlierAnalysis.outliers.length} outlier(s) detected`);
        for (const o of outlierAnalysis.outliers) {
          const name = students.find(s => s.index === o.studentIndex)?.name || `Student ${o.studentIndex}`;
          console.log(`[${timestamp()}] [sse]   ⚠ ${name}: ${o.score}/${maxScore} (${o.deviation.toFixed(1)}σ)`);
        }

        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({
            phase: 'outlier-review',
            outlierCount: outlierAnalysis.outliers.length,
          }),
          id: String(sseId++),
        });

        // Build outlier review data
        const outlierStudents = outlierAnalysis.outliers.map(o => {
          const student = students.find(s => s.index === o.studentIndex);
          const result = results.find(r => r.studentIndex === o.studentIndex);
          return {
            index: o.studentIndex,
            name: student?.name || `Student ${o.studentIndex}`,
            response: student?.response || '(No response submitted)',
            originalScore: result?.score ?? o.score,
            originalFeedback: result?.feedback || '',
          };
        });

        const outlierPrompt = buildOutlierReviewPrompt(rubric, outlierStudents, anchors, {
          mean: outlierAnalysis.mean,
          stdDev: outlierAnalysis.stdDev,
          totalStudents: students.length,
        }, maxScore);

        try {
          const outlierText = await callProviderDirect(provider, providerConfig, [{ role: 'user', content: outlierPrompt }], timestamp());
          const outlierResults = parseBatchResponse(outlierText, outlierStudents, maxScore);

          const adjustedResults = [];
          for (const or of outlierResults) {
            const mainResult = results.find(r => r.studentIndex === or.studentIndex);
            if (mainResult && or.score !== mainResult.score) {
              const name = students.find(s => s.index === or.studentIndex)?.name || `Student ${or.studentIndex}`;
              console.log(`[${timestamp()}] [sse]   ✎ ${name}: ${mainResult.score} → ${or.score}/${maxScore}`);
              mainResult.score = or.score;
              mainResult.feedback = or.feedback || mainResult.feedback;
              mainResult.adjusted = true;
              adjustedCount++;
              adjustedResults.push({ studentIndex: or.studentIndex, score: or.score, feedback: or.feedback });
            }
          }

          if (adjustedResults.length > 0) {
            await stream.writeSSE({
              event: 'outlier',
              data: JSON.stringify({ adjustedResults }),
              id: String(sseId++),
            });
          }

          console.log(`[${timestamp()}] [sse] Outlier review: ${adjustedCount} adjusted`);
        } catch (outlierError) {
          console.warn(`[${timestamp()}] [sse] Outlier review failed: ${outlierError.message}, keeping original scores`);
        }
      }

      // Step 6: Done
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[${timestamp()}] [sse] ✓ Done: ${students.length} students in ${elapsed}s`);

      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({
          stats: {
            mean: outlierAnalysis.mean,
            stdDev: outlierAnalysis.stdDev,
            outliers: outlierAnalysis.outliers.length,
            adjusted: adjustedCount,
          },
          anchors: {
            excellent: anchors.excellent.score,
            adequate: anchors.adequate.score,
            belowAverage: anchors.belowAverage.score,
            minimal: anchors.minimal.score,
          },
          metadata: {
            totalStudents: students.length,
            chunks: totalChunksForClient,
            sweepMode: shouldSweep ? (sweepMode === 'auto' ? 'pairwise' : sweepMode) : 'none',
            sweepAdjustments: sweepAdjustments.length,
            elapsedSeconds: parseFloat(elapsed),
          },
        }),
        id: String(sseId++),
      });

      // Emit session_complete for desktop sidecar
      console.log(JSON.stringify({
        type: 'session_complete',
        provider_id: provider,
        model,
        student_count: students.length,
        mean_score: outlierAnalysis.mean,
        elapsed_seconds: parseFloat(elapsed),
      }));

    } catch (error) {
      console.error(`[${timestamp()}] [sse] Error:`, error.message);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message: error.message }),
        id: String(sseId++),
      });
    }
  });
});

/**
 * Session logging endpoint (for desktop app history)
 * POST /session
 * Body: { provider, model, studentCount, meanScore, ... }
 */
app.post('/session', async (c) => {
  try {
    const body = await c.req.json();
    
    // Log specialized JSON for the desktop app sidecar handler to pick up
    // This allows the desktop app to persist grading history to SQLite
    console.log(JSON.stringify({
      type: 'session_complete',
      ...body
    }));
    
    return c.json({ ok: true });
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Session log error:`, error.message);
    return c.json({ error: 'Failed to log session' }, 500);
  }
});

/**
 * Log forwarding endpoint (for desktop app live logs)
 * POST /api/log
 * Body: { message: string } or { messages: string[] }
 * Writes to stdout so the Rust sidecar picks it up and forwards to the Logs page.
 */
app.post('/api/log', async (c) => {
  try {
    const body = await c.req.json();
    if (body.messages && Array.isArray(body.messages)) {
      for (const msg of body.messages) {
        console.log(`[ext] ${msg}`);
      }
    } else if (body.message) {
      console.log(`[ext] ${body.message}`);
    }
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 400);
  }
});

// Helper function: Wait for keypress before exiting (keeps window open on error)
function waitForKeypress() {
  console.log('\nPress any key to exit...');
  
  // Try to set raw mode (may not be available in all environments)
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
  }
  
  process.stdin.resume();
  process.stdin.once('data', () => {
    process.exit(1);
  });
  
  // Fallback for non-TTY environments: keep process alive indefinitely
  if (!process.stdin.isTTY) {
    setTimeout(() => {}, 2147483647);
  }
}

// Helper function: Show error in visible format
function showError(title, details) {
  console.error(`
╔══════════════════════════════════════════════════════════════╗
║  ERROR: ${title.padEnd(52)}║
╚══════════════════════════════════════════════════════════════╝

${details}
`);
  waitForKeypress();
}

// Global safety nets for uncaught errors
process.on('uncaughtException', (err) => {
  showError('Server crashed unexpectedly', err.message);
});

process.on('unhandledRejection', (err) => {
  showError('Server crashed unexpectedly', err?.message || String(err));
});

// Start server with event-based error handling
const server = serve({
  fetch: app.fetch,
  port: PORT,
}, () => {
  // SUCCESS callback - only runs if server binds successfully
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           O.G.R.E Grading Server v1.0.0                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Status:  RUNNING                                             ║
║  Address: http://localhost:${PORT}                               ║
╠═══════════════════════════════════════════════════════════════╣
║  HOW TO USE:                                                  ║
║  1. Keep this window open while grading                       ║
║  2. Open your grading page in Chrome                          ║
║  3. Use the O.G.R.E extension's "Batch" mode                  ║
║  4. The extension will automatically use this server          ║
╠═══════════════════════════════════════════════════════════════╣
║  TO STOP: Close this window or press Ctrl+C                   ║
╚═══════════════════════════════════════════════════════════════╝

Waiting for grading requests...
`);

  // Watch config file for external changes (e.g., desktop app saves settings)
  watchConfig((newConfig) => {
    const oldCount = providerConfigs.length;
    providerConfigs = newConfig.providers;
    handshakeToken = newConfig.token;
    console.log(`[config] Hot-reloaded: ${providerConfigs.length} provider(s) (was ${oldCount})`);
  });
});

// Handle server startup errors (e.g., port already in use)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`
╔══════════════════════════════════════════════════════════════╗
║  ERROR: Port ${PORT} is already in use!                        ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Another copy of this server may already be running.        ║
║  Close the other window first, then try again.              ║
║                                                              ║
║  If that doesn't help, another program is using port ${PORT}.  ║
║  Open Task Manager → find the program → close it.           ║
║                                                              ║
║  Still stuck? Restart your computer and try again.          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
  } else {
    console.error(`
╔══════════════════════════════════════════════════════════════╗
║  ERROR: Failed to start server                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  ${err.message.padEnd(60)}║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
  }

  waitForKeypress();
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
