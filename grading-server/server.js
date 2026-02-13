/**
 * O.G.R.E Grading Server
 * Main HTTP server for batch grading with AI providers
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  generateScoringAnchors,
  buildBatchPrompt,
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

const app = new Hono();
const PORT = 3456;

// ── In-memory provider config bridge state ──────────────────────────
let providerConfigs = [];   // Array of {id, api_url, model, is_active, credentials}
let handshakeToken = null;  // Set by desktop POST /internal/providers

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

  if (!handshakeToken) {
    return c.json({ error: 'No provider configuration available' }, 503);
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  if (token !== handshakeToken) {
    return c.json({ error: 'Invalid token' }, 403);
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
 * Validates that the caller is a chrome-extension:// origin.
 * Returns 503 if no token has been set by desktop yet.
 */
app.get('/api/handshake', (c) => {
  const origin = c.req.header('Origin') || '';
  if (!origin.startsWith('chrome-extension://')) {
    return c.json({ error: 'Forbidden: extension origin required' }, 403);
  }

  if (!handshakeToken) {
    return c.json({ error: 'Desktop has not registered yet' }, 503);
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

    return c.json({ ok: true, count: providerConfigs.length });
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

    // Emit stdout JSON for desktop sidecar parsing (same pattern as session_complete)
    console.log(JSON.stringify({
      type: 'provider_changed',
      provider_id: body.provider_id,
      model: body.model,
    }));

    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
});

/**
 * Main grading endpoint
 * POST /grade
 * Body: { provider, apiUrl, apiKey, model, rubric, students, config }
 */
app.post('/grade', async (c) => {
  const startTime = Date.now();
  const timestamp = new Date().toLocaleTimeString();

  try {
    const body = await c.req.json();
    
    // Validate required fields
    const { provider, model, rubric, students, config } = body;
    
    if (!provider) {
      return c.json({ error: 'Missing required field: provider' }, 400);
    }
    if (!model) {
      return c.json({ error: 'Missing required field: model' }, 400);
    }
    if (!rubric) {
      return c.json({ error: 'Missing required field: rubric' }, 400);
    }
    if (!students || !Array.isArray(students) || students.length === 0) {
      return c.json({ error: 'Missing or invalid field: students (must be non-empty array)' }, 400);
    }

    const apiUrl = body.apiUrl || '';
    const apiKey = body.apiKey || '';
    const maxScore = parseFloat(rubric.maxScore) || 10;

    // Set default API URLs per provider
    let effectiveApiUrl = apiUrl;
    if (!effectiveApiUrl) {
      switch (provider.toLowerCase()) {
        case 'ollama':
          effectiveApiUrl = 'http://localhost:11434';
          break;
        case 'openai':
          effectiveApiUrl = 'https://api.openai.com';
          break;
        case 'anthropic':
          effectiveApiUrl = 'https://api.anthropic.com';
          break;
        case 'google-gemini':
          effectiveApiUrl = 'https://generativelanguage.googleapis.com';
          break;
        case 'github-models':
          effectiveApiUrl = 'https://api.githubcopilot.com';
          break;
      }
    }

    console.log(`[${timestamp}] Grading ${students.length} students for ${provider}...`);

    // Step 1: Generate scoring anchors
    const anchors = generateScoringAnchors(rubric);
    console.log(`[${timestamp}] Generated anchors: Excellent (${anchors.excellent.score}), Adequate (${anchors.adequate.score}), Minimal (${anchors.minimal.score})`);

    // Step 2: Chunk students (20 per batch)
    const chunks = chunkStudents(students, 20);
    console.log(`[${timestamp}] Split into ${chunks.length} chunk(s)`);

    // Step 3: Grade each chunk
    const allResults = [];
    let bridgeResponses = null;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[${new Date().toLocaleTimeString()}] Grading chunk ${i + 1}/${chunks.length} (${chunk.students.length} students)...`);

      // Build prompt for this chunk
      const prompt = buildBatchPrompt(rubric, chunk.students, anchors);

      // Build messages array for AI
      const messages = [{ role: 'user', content: prompt }];

      // Build provider-specific request
      let requestObj;
      
      const providerConfig = {
        apiUrl: effectiveApiUrl,
        apiKey,
        model,
      };

      switch (provider.toLowerCase()) {
        case 'ollama':
          requestObj = buildOllamaRequest(providerConfig, messages);
          break;
        case 'openai':
          requestObj = buildOpenAIRequest(providerConfig, messages);
          break;
        case 'anthropic':
          requestObj = buildAnthropicRequest(providerConfig, messages);
          break;
        case 'google-gemini':
          requestObj = buildGoogleGeminiRequest(providerConfig, messages);
          break;
        case 'github-models':
          requestObj = buildGitHubModelsRequest(providerConfig, messages);
          break;
        default:
          return c.json({ error: `Unsupported provider: ${provider}` }, 400);
      }

      // Call AI provider
      const response = await fetch(requestObj.url, {
        method: 'POST',
        headers: requestObj.headers,
        body: JSON.stringify(requestObj.body),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${new Date().toLocaleTimeString()}] Provider error:`, response.status, errorText);
        return c.json({
          error: `Provider API error: ${response.status}`,
          details: errorText,
        }, response.status);
      }

      const responseData = await response.json();

      // Parse provider-specific response
      let aiText;
      switch (provider.toLowerCase()) {
        case 'ollama':
          aiText = parseOllamaResponse(responseData);
          break;
        case 'openai':
          aiText = parseOpenAIResponse(responseData);
          break;
        case 'anthropic':
          aiText = parseAnthropicResponse(responseData);
          break;
        case 'google-gemini':
          aiText = parseGoogleGeminiResponse(responseData);
          break;
        case 'github-models':
          aiText = parseGitHubModelsResponse(responseData);
          break;
      }

      // Parse batch response into results
      const chunkResults = parseBatchResponse(aiText, chunk.students, maxScore);
      allResults.push(chunkResults);

      // Select bridge responses for next chunk (2-3 diverse scores)
      if (i < chunks.length - 1) {
        const sorted = [...chunkResults].sort((a, b) => a.score - b.score);
        bridgeResponses = [
          sorted[0], // Lowest
          sorted[Math.floor(sorted.length / 2)], // Middle
          sorted[sorted.length - 1], // Highest
        ];
      }
    }

    // Step 4: Merge results from all chunks
    const results = mergeResults(allResults);

    // Step 5: Calculate statistics and detect outliers
    const outlierAnalysis = detectOutliers(results);
    
    // Step 6: Second-pass review for outliers (if any detected)
    if (outlierAnalysis.outliers.length > 0) {
      console.log(`[${new Date().toLocaleTimeString()}] Detected ${outlierAnalysis.outliers.length} outlier(s) for second-pass review`);
      // TODO: Implement second-pass grading for outliers
      // For now, we'll just log them
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${new Date().toLocaleTimeString()}] ✓ Graded ${students.length} students in ${elapsed}s`);

    // Return results
    return c.json({
      results,
      anchors: {
        excellent: anchors.excellent.score,
        adequate: anchors.adequate.score,
        minimal: anchors.minimal.score,
      },
      stats: {
        mean: outlierAnalysis.mean,
        stdDev: outlierAnalysis.stdDev,
        outliers: outlierAnalysis.outliers.length,
      },
      metadata: {
        totalStudents: students.length,
        chunks: chunks.length,
        elapsedSeconds: parseFloat(elapsed),
      },
    });

  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Error:`, error.message);
    return c.json({
      error: 'Internal server error',
      details: error.message,
    }, 500);
  }
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
