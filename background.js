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
    return true; // Keep the message channel open for async response
  }

  if (request.action === "proxyFetch") {
    fetch(request.url, request.options)
      .then(async (response) => {
        const text = await response.text();
        sendResponse({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          data: text
        });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message
        });
      });
    return true; // Keep the message channel open for async response
  }
});