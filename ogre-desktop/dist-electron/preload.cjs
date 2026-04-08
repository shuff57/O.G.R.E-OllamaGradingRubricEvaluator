"use strict";
const electron = require("electron");
function invoke(channel, args) {
  return electron.ipcRenderer.invoke(channel, args);
}
function listen(event, callback) {
  const handler = (_, payload) => callback(payload);
  electron.ipcRenderer.on(event, handler);
  return () => electron.ipcRenderer.removeListener(event, handler);
}
electron.contextBridge.exposeInMainWorld("electronAPI", {
  createEmbeddedBrowser: (tabId, url) => invoke("create_embedded_browser", { tabId, url }),
  navigateEmbedded: (tabId, url) => invoke("navigate_embedded", { tabId, url }),
  goBack: (tabId) => invoke("go_back", { tabId }),
  goForward: (tabId) => invoke("go_forward", { tabId }),
  reloadBrowser: (tabId) => invoke("reload_browser", { tabId }),
  setWebviewBounds: (tabId, x, y, width, height) => invoke("set_webview_bounds", { tabId, x, y, width, height }),
  hideWebview: (tabId) => invoke("hide_webview", { tabId }),
  hideAllWebviews: () => invoke("hide_all_webviews"),
  showWebview: (tabId) => invoke("show_webview", { tabId }),
  getEmbeddedUrl: (tabId) => invoke("get_embedded_url", { tabId }),
  destroyWebview: (tabId) => invoke("destroy_webview", { tabId }),
  injectAutofill: (tabId, script) => invoke("inject_autofill", { tabId, script }),
  evalWebviewScript: (tabId, script) => invoke("eval_webview_script", { tabId, script }),
  injectWebviewScript: (tabId, script) => invoke("inject_webview_script", { tabId, script }),
  scanLocalSkills: (dir) => invoke("scan_local_skills", { dir }),
  startOauthCallbackServer: (port) => invoke("start_oauth_callback_server", { port }),
  stopOauthCallbackServer: () => invoke("stop_oauth_callback_server"),
  getCdpPort: () => invoke("get_cdp_port"),
  discoverCdpTarget: (port) => invoke("discover_cdp_target", { port }),
  captureAccessibilityTree: (tabId) => invoke("capture_accessibility_tree", { tabId }),
  cdpAttach: (tabId) => invoke("cdp_attach", { tabId }),
  cdpSend: (tabId, method, params) => invoke("cdp_send", { tabId, method, params }),
  dbQuery: (sql, params) => invoke("db_query", { sql, params }),
  dbExecute: (sql, params) => invoke("db_execute", { sql, params }),
  updaterDownload: () => invoke("updater:download"),
  updaterInstall: () => invoke("updater:install"),
  invoke: (channel, args) => invoke(channel, args),
  on: listen
});
