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
