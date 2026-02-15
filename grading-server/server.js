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
  buildOutlierReviewPrompt,
  parseBatchResponse,
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
async function callProviderDirect(provider, config, messages, timestamp) {
  let requestObj;
  switch (provider.toLowerCase()) {
    case 'ollama': requestObj = buildOllamaRequest(config, messages); break;
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
    throw new Error(`${provider} API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[${timestamp}] [direct] AI response received in ${elapsed}s`);

  // Extract text based on provider format
  switch (provider.toLowerCase()) {
    case 'ollama': return parseOllamaResponse(data);
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

  // Define anchor score ranges
  const excellentThreshold = anchors.excellent.score - 1;  // e.g., 8+ for 9/10 anchor
  const adequateRange = [anchors.minimal.score + 1, anchors.excellent.score - 1]; // middle band
  const minimalThreshold = anchors.minimal.score + 1; // e.g., 4 or below for 3/10 anchor

  // Bucket results by tier
  const excellent = chunkResults.filter(r => r.score >= excellentThreshold);
  const adequate = chunkResults.filter(r => r.score >= adequateRange[0] && r.score <= adequateRange[1]);
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
  allowMethods: ['GET', 'POST', 'OPTIONS'],
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

/**
 * Diagnostic: test GitHub Copilot API token
 * GET /api/test-github
 */
app.get('/api/test-github', async (c) => {
  const ghProvider = providerConfigs.find(p => p.id === 'github-models');
  if (!ghProvider) return c.json({ error: 'No github-models provider configured' }, 404);

  const token = ghProvider.credentials?.api_key || ghProvider.credentials?.access_token || '';
  const tokenPreview = token ? `${token.slice(0, 6)}...${token.slice(-4)}` : '(empty)';
  console.log(`[test-github] Token preview: ${tokenPreview}`);
  console.log(`[test-github] Full provider config keys:`, Object.keys(ghProvider.credentials || {}));

  try {
    // Test 1: list models
    const modelsRes = await fetch('https://api.githubcopilot.com/models', {
      headers: {
        'Authorization': `Bearer ${token}`,
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
        'Authorization': `Bearer ${token}`,
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
 * Resolve provider config from in-memory state for direct AI calls.
 * Returns { apiUrl, apiKey, model } or throws if provider not found.
 */
function resolveProviderConfig(providerId, model) {
  const p = providerConfigs.find(pc => pc.id === providerId);
  const apiUrl = p?.api_url || '';
  const apiKey = p?.credentials?.api_key || p?.credentials?.access_token || '';

  let effectiveApiUrl = apiUrl;
  if (!effectiveApiUrl) {
    switch (providerId.toLowerCase()) {
      case 'ollama': effectiveApiUrl = 'http://localhost:11434'; break;
      case 'openai': effectiveApiUrl = 'https://api.openai.com'; break;
      case 'anthropic': effectiveApiUrl = 'https://api.anthropic.com'; break;
      case 'google-gemini': effectiveApiUrl = 'https://generativelanguage.googleapis.com'; break;
      case 'github-models': effectiveApiUrl = 'https://api.githubcopilot.com'; break;
    }
  }

  return { apiUrl: effectiveApiUrl, apiKey, model };
}

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

  const { provider, model, rubric, students } = body;

  if (!provider) return c.json({ error: 'Missing required field: provider' }, 400);
  if (!model) return c.json({ error: 'Missing required field: model' }, 400);
  if (!rubric) return c.json({ error: 'Missing required field: rubric' }, 400);
  if (!students || !Array.isArray(students) || students.length === 0) {
    return c.json({ error: 'Missing or invalid field: students (must be non-empty array)' }, 400);
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

      // Step 2: Chunk students
      const chunks = chunkStudents(students, 20);
      console.log(`[${timestamp()}] [sse] Split into ${chunks.length} chunk(s)`);

      // Step 3: Grade each chunk, streaming results progressively
      const allResults = [];
      let bridgeResponses = null;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // Send progress event
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({
            phase: 'grading',
            chunkIndex: i,
            totalChunks: chunks.length,
            studentCount: chunk.students.length,
            totalStudents: students.length,
          }),
          id: String(sseId++),
        });

        console.log(`[${timestamp()}] [sse] Grading chunk ${i + 1}/${chunks.length} (${chunk.students.length} students)...`);

        // Build prompt with anchors and bridge responses from prior chunk
        const prompt = buildBatchPrompt(rubric, chunk.students, anchors, bridgeResponses);
        const messages = [{ role: 'user', content: prompt }];

        // Call AI provider directly
        const aiText = await callProviderDirect(provider, providerConfig, messages, timestamp());

        // Parse response
        const chunkResults = parseBatchResponse(aiText, chunk.students, maxScore);
        allResults.push(chunkResults);

        // Log scores
        for (const r of chunkResults) {
          const name = chunk.students.find(s => s.index === r.studentIndex)?.name || `Student ${r.studentIndex}`;
          console.log(`[${timestamp()}] [sse] ✓ ${name}: ${r.score}/${maxScore}`);
        }

        // Build bridge responses for next chunk
        if (i < chunks.length - 1) {
          bridgeResponses = buildBridgeResponses(chunkResults, chunk.students, anchors, maxScore);
          console.log(`[${timestamp()}] [sse] Bridge (${bridgeResponses.length}): ${bridgeResponses.map(b => `${b.name}=${b.score}[${b.tier}]`).join(', ')}`);
        }

        // Stream chunk results to client
        await stream.writeSSE({
          event: 'chunk',
          data: JSON.stringify({
            chunkIndex: i,
            results: chunkResults,
          }),
          id: String(sseId++),
        });
      }

      // Step 4: Merge and detect outliers
      const results = mergeResults(allResults);
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
            minimal: anchors.minimal.score,
          },
          metadata: {
            totalStudents: students.length,
            chunks: chunks.length,
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
