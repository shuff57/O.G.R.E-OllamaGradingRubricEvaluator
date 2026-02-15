// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Listen for messages from the sidepanel to take screenshots or proxy API calls
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "captureVisibleTab") {
    chrome.tabs.captureVisibleTab(
      null,
      { format: "png" },
      (dataUrl) => {
        sendResponse({ dataUrl: dataUrl });
      }
    );
    return true;
  }

  /**
   * Proxy fetch handler for making HTTP requests from the extension context.
   * 
   * Handles both JSON and string request bodies:
   * - JSON bodies: Pass as JSON.stringify(object) in request.options.body
   * - String bodies: Pass as plain string in request.options.body with explicit Content-Type header
   *   (e.g., "application/x-www-form-urlencoded" for URLSearchParams)
   * 
   * The handler:
   * 1. Spreads all fetch options (method, headers, body, etc.) from request.options
   * 2. Adds an AbortSignal for 120-second timeout handling
   * 3. Returns response as { ok, status, statusText, data } where data is response text
   * 4. Returns errors as { ok: false, error: "message" }
   * 
   * @param {Object} request - Message request object
   * @param {string} request.action - Must be "proxyFetch"
   * @param {string} request.url - Target URL for the fetch request
   * @param {Object} request.options - Fetch options (method, headers, body, etc.)
   * @param {string} [request.options.body] - Request body (string or JSON.stringify'd object)
   * @param {Object} [request.options.headers] - HTTP headers including Content-Type
   * @param {Function} sendResponse - Callback to send response back to caller
   */
  if (request.action === "proxyFetch") {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const fetchOptions = {
      ...request.options,
      signal: controller.signal
    };

    fetch(request.url, fetchOptions)
      .then(async (response) => {
        clearTimeout(timeoutId);
        const text = await response.text();
        sendResponse({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          data: text
        });
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        sendResponse({
          ok: false,
          error: error.name === 'AbortError' ? 'Request timed out after 120 seconds' : error.message
        });
      });
    return true;
  }

  // Playwriter MCP client message handlers
  if (request.action === "playwriter:connect") {
    import('./playwriter-client.js')
      .then(({ connectToPlaywriterServer }) => connectToPlaywriterServer())
      .then(() => {
        sendResponse({ success: true, message: 'Connected to Playwriter MCP server' });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "playwriter:disconnect") {
    import('./playwriter-client.js')
      .then(({ disconnectFromPlaywriterServer }) => {
        disconnectFromPlaywriterServer();
        sendResponse({ success: true, message: 'Disconnected from Playwriter MCP server' });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "playwriter:status") {
    import('./playwriter-client.js')
      .then(({ getPlaywriterStatus }) => {
        const status = getPlaywriterStatus();
        sendResponse({ success: true, status });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// ============================================================================
// Playwriter MCP Integration - Auto-connect on Extension Startup
// ============================================================================

/**
 * Auto-connect to Playwriter MCP server when extension loads
 * This allows O.G.R.E to handle browser automation without separate Playwriter extension
 */
async function initializePlaywriterConnection() {
  try {
    // Wait a bit for grading server to start (if desktop app is launching)
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('[O.G.R.E] Attempting to connect to Playwriter MCP server...');

    const { connectToPlaywriterServer } = await import('./playwriter-client.js');
    await connectToPlaywriterServer();

    console.log('[O.G.R.E] ✓ Successfully connected to Playwriter MCP server');
    console.log('[O.G.R.E] ✓ Browser automation ready - no separate Playwriter extension needed!');

  } catch (error) {
    console.warn('[O.G.R.E] Could not connect to Playwriter MCP server:', error.message);
    console.warn('[O.G.R.E] Automation features will be unavailable until grading server starts');
    console.warn('[O.G.R.E] Start the grading server or desktop app to enable automation');

    // Retry connection after delay
    setTimeout(initializePlaywriterConnection, 10000); // Retry in 10 seconds
  }
}

// Start connection attempt on extension installation/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('[O.G.R.E] Extension installed/updated');
  initializePlaywriterConnection();
});

// Start connection attempt on browser startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[O.G.R.E] Browser started');
  initializePlaywriterConnection();
});

// Immediate connection attempt (for service worker reactivation)
initializePlaywriterConnection();
