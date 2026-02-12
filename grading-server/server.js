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
  buildGeminiRequest,
  parseOllamaResponse,
  parseOpenAIResponse,
  parseAnthropicResponse,
  parseGeminiResponse,
} from './providers.js';

const app = new Hono();
const PORT = 3456;

// CORS middleware for Chrome extension
app.use('/*', cors({
  origin: '*', // Allow all origins (extension-friendly)
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

/**
 * Health check endpoint
 */
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
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
        case 'gemini':
          effectiveApiUrl = 'https://generativelanguage.googleapis.com';
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
        case 'gemini':
          requestObj = buildGeminiRequest(providerConfig, messages);
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
        case 'gemini':
          aiText = parseGeminiResponse(responseData);
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
