/**
 * Playwriter Automation Adapter for O.G.R.E Extension
 *
 * Provides session management and automation API helpers.
 *
 * IMPORTANT: User must have Playwriter extension installed and enabled on the grading tab.
 * Install from: https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe
 *
 * How it works:
 * 1. O.G.R.E extension grants session access to grading server
 * 2. Grading server (MCP client) sends commands to Playwriter MCP server
 * 3. Playwriter MCP server controls Playwriter extension in the browser
 * 4. Playwriter extension executes automation on the enabled tab
 */

/**
 * Generate a new session token
 * @returns {string} UUID v4 token
 */
export function generateSessionToken() {
  return crypto.randomUUID();
}

/**
 * Grant session access to the grading server
 * @param {string} serverUrl - Grading server base URL (e.g., 'http://localhost:3456')
 * @param {string} handshakeToken - Bearer token for authentication
 * @param {number} tabId - Chrome tab ID
 * @param {string} url - Page URL
 * @param {number} expiryHours - Session expiry in hours (default: 1)
 * @returns {Promise<{sessionToken: string, expiresAt: string}>}
 */
export async function grantSessionAccess(serverUrl, handshakeToken, tabId, url, expiryHours = 1) {
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + expiryHours * 3600000).toISOString();

  const response = await fetch(`${serverUrl}/api/automation/grant-access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${handshakeToken}`
    },
    body: JSON.stringify({
      sessionToken,
      tabId,
      url,
      expiresAt
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to grant session: ${error.error || response.statusText}`);
  }

  const result = await response.json();
  return {
    sessionToken: result.session.sessionToken,
    expiresAt: result.session.expiresAt
  };
}

/**
 * Revoke session access from the grading server
 * @param {string} serverUrl - Grading server base URL
 * @param {string} handshakeToken - Bearer token for authentication
 * @param {string} sessionToken - Session token to revoke
 * @returns {Promise<boolean>} True if revoked successfully
 */
export async function revokeSessionAccess(serverUrl, handshakeToken, sessionToken) {
  const response = await fetch(`${serverUrl}/api/automation/revoke-access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${handshakeToken}`
    },
    body: JSON.stringify({ sessionToken })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to revoke session: ${error.error || response.statusText}`);
  }

  const result = await response.json();
  return result.success;
}

/**
 * Start automated grading session
 * @param {string} serverUrl - Grading server base URL
 * @param {string} handshakeToken - Bearer token for authentication
 * @param {string} sessionToken - Session token from grant-access
 * @param {string} provider - AI provider ID (e.g., 'anthropic', 'openai')
 * @param {string} model - Model name (e.g., 'claude-sonnet-4-5')
 * @param {Object} options - Additional options
 * @param {string} [options.resumeAfter] - Resume grading after this student name
 * @param {Function} options.onProgress - Callback for progress events (phase, message, current, total)
 * @param {Function} options.onStudent - Callback for student results (index, name, score, feedback)
 * @param {Function} options.onSave - Callback for save events (savedCount, message)
 * @param {Function} options.onDone - Callback for completion (totalGraded, stats)
 * @param {Function} options.onError - Callback for errors (message)
 * @returns {EventSource} SSE connection (call .close() to cancel)
 */
export function startAutomatedGrading(serverUrl, handshakeToken, sessionToken, provider, model, options = {}) {
  const { resumeAfter, onProgress, onStudent, onSave, onDone, onError } = options;

  // Build query parameters
  const params = new URLSearchParams({
    provider,
    model,
    sessionToken
  });

  if (resumeAfter) {
    params.set('resumeAfter', resumeAfter);
  }

  // Create EventSource with Authorization header workaround
  // (EventSource doesn't support custom headers, so we include the token in query)
  const url = `${serverUrl}/api/automation/grade`;

  // EventSource doesn't support POST or headers, so we use a custom implementation
  const eventSource = new EventSource(url);

  // Note: Since EventSource doesn't support custom headers, the server should also
  // accept the Bearer token as a query parameter for automation endpoints
  // Alternative: Use fetch with readable stream instead of EventSource

  // For now, we'll use fetch with SSE parsing
  return createSSEConnection(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${handshakeToken}`
    },
    body: JSON.stringify({
      sessionToken,
      provider,
      model,
      resumeAfter: resumeAfter || null
    })
  }, {
    onProgress,
    onStudent,
    onSave,
    onDone,
    onError
  });
}

/**
 * Create SSE connection using fetch (since EventSource doesn't support POST/headers)
 * @param {string} url - Endpoint URL
 * @param {Object} fetchOptions - Fetch options
 * @param {Object} callbacks - Event callbacks
 * @returns {Object} Connection object with close() method
 */
function createSSEConnection(url, fetchOptions, callbacks) {
  let abortController = new AbortController();
  let closed = false;

  (async () => {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: abortController.signal
      });

      if (!response.ok) {
        const error = await response.json();
        callbacks.onError?.({ message: error.error || response.statusText });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            eventData = line.slice(5).trim();
          } else if (line === '' && eventType && eventData) {
            // Complete event received
            try {
              const data = JSON.parse(eventData);

              switch (eventType) {
                case 'progress':
                  callbacks.onProgress?.(data);
                  break;
                case 'student':
                  callbacks.onStudent?.(data);
                  break;
                case 'save':
                  callbacks.onSave?.(data);
                  break;
                case 'done':
                  callbacks.onDone?.(data);
                  closed = true;
                  break;
                case 'error':
                  callbacks.onError?.(data);
                  closed = true;
                  break;
              }
            } catch (err) {
              console.error('[Playwriter Adapter] Failed to parse SSE event:', err);
            }

            eventType = '';
            eventData = '';
          }
        }
      }
    } catch (error) {
      if (!closed) {
        callbacks.onError?.({ message: error.message });
      }
    }
  })();

  return {
    close: () => {
      closed = true;
      abortController.abort();
    }
  };
}

/**
 * Check if Playwriter extension is enabled on a tab
 * NOTE: This is an approximation - the actual check requires message passing to Playwriter
 * @param {number} tabId - Chrome tab ID
 * @returns {Promise<boolean>} True if likely enabled (best effort)
 */
export async function isPlaywriterEnabled(tabId) {
  // Since we can't directly query Playwriter extension status, this is a placeholder
  // In practice, the grading server will fail if Playwriter isn't enabled, and the
  // automation flow will show an error to the user
  console.warn('[Playwriter Adapter] Cannot directly check Playwriter status. Ensure extension is enabled (green icon) on the tab.');
  return true; // Optimistic assumption
}

/**
 * Instructions for the user
 */
export const PLAYWRITER_SETUP_INSTRUCTIONS = `
## Playwriter Extension Setup

For automated grading to work, you need to:

1. **Install Playwriter Extension**
   - Visit: https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe
   - Click "Add to Chrome"

2. **Enable Playwriter on Grading Tab**
   - Navigate to your grading page
   - Click the Playwriter extension icon in your toolbar
   - The icon should turn GREEN (indicating the tab is enabled)

3. **Start Automated Grading**
   - Click "Start Batch (Automation Mode)" in O.G.R.E extension
   - The server will control the Playwriter extension to:
     * Extract rubric and student responses
     * Grade each student with AI
     * Fill scores and feedback automatically
     * Save progress every 5 students

## Troubleshooting

- **"Playwriter not enabled"**: Click the Playwriter icon on your grading tab until it turns green
- **"No Playwright pages available"**: Make sure Playwriter MCP server is running (desktop app starts it automatically)
- **Automation stops mid-session**: Check that the grading tab remains open and Playwriter icon stays green
`;
