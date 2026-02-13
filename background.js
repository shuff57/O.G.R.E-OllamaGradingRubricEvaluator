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
});
