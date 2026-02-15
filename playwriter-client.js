/**
 * Playwriter MCP Client for O.G.R.E Extension
 *
 * Connects O.G.R.E extension to the embedded Playwriter MCP server running in grading-server.
 * Handles WebSocket communication and Chrome DevTools Protocol (CDP) command execution.
 *
 * Architecture:
 * - Grading server runs Playwriter MCP server (ws://localhost:19988)
 * - This module connects O.G.R.E extension to that server
 * - Server sends CDP commands → Extension executes via chrome.debugger → Returns results
 * - No separate Playwriter extension needed!
 */

const RELAY_PORT = 19988;
const RELAY_WS_URL = `ws://localhost:${RELAY_PORT}/extension`;

/** @type {WebSocket | null} */
let ws = null;

/** @type {Map<number, Function>} */
const pendingCommands = new Map();

/** @type {Map<number, chrome.debugger.Debuggee>} */
const activeDebuggers = new Map();

let messageId = 0;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;

/**
 * Connect to the Playwriter MCP server
 * @returns {Promise<void>}
 */
export async function connectToPlaywriterServer() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('[Playwriter] Already connected to MCP server');
    return;
  }

  return new Promise((resolve, reject) => {
    console.log(`[Playwriter] Connecting to MCP server at ${RELAY_WS_URL}...`);

    ws = new WebSocket(RELAY_WS_URL);

    ws.onopen = () => {
      console.log('[Playwriter] ✓ Connected to MCP server');
      reconnectAttempts = 0;
      resolve();
    };

    ws.onmessage = handleServerMessage;

    ws.onerror = (error) => {
      console.error('[Playwriter] WebSocket error:', error);
      reject(error);
    };

    ws.onclose = () => {
      console.log('[Playwriter] Disconnected from MCP server');
      attemptReconnect();
    };
  });
}

/**
 * Disconnect from Playwriter MCP server
 */
export function disconnectFromPlaywriterServer() {
  if (ws) {
    ws.close();
    ws = null;
  }

  // Detach all debuggers
  for (const [tabId, debuggee] of activeDebuggers.entries()) {
    chrome.debugger.detach(debuggee, () => {
      console.log(`[Playwriter] Detached debugger from tab ${tabId}`);
    });
  }
  activeDebuggers.clear();
  pendingCommands.clear();
}

/**
 * Attempt to reconnect to server
 */
function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[Playwriter] Max reconnect attempts reached');
    return;
  }

  reconnectAttempts++;
  console.log(`[Playwriter] Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

  setTimeout(() => {
    connectToPlaywriterServer().catch((err) => {
      console.error('[Playwriter] Reconnect failed:', err);
    });
  }, RECONNECT_DELAY);
}

/**
 * Handle incoming message from server
 * @param {MessageEvent} event
 */
async function handleServerMessage(event) {
  try {
    const message = JSON.parse(event.data);

    // Handle ping/pong keepalive
    if (message.method === 'ping') {
      sendToServer({ method: 'pong' });
      return;
    }

    // Handle CDP command from server
    if (message.method === 'forwardCDPCommand' && message.id) {
      await handleCDPCommand(message);
      return;
    }

    // Handle recording commands
    if (message.method === 'startRecording' || message.method === 'stopRecording') {
      sendToServer({
        id: message.id,
        error: 'Recording not yet implemented in O.G.R.E'
      });
      return;
    }

    console.warn('[Playwriter] Unknown message from server:', message);
  } catch (error) {
    console.error('[Playwriter] Error handling server message:', error);
  }
}

/**
 * Handle CDP command from server
 * @param {Object} message - Server command message
 * @param {number} message.id - Command ID
 * @param {string} message.method - Should be 'forwardCDPCommand'
 * @param {Object} message.params - CDP command parameters
 * @param {string} message.params.method - CDP method name (e.g., 'Runtime.evaluate')
 * @param {string} [message.params.sessionId] - Target session ID (tab ID as string)
 * @param {Object} [message.params.params] - CDP method parameters
 */
async function handleCDPCommand(message) {
  const { id, params } = message;
  const { method: cdpMethod, sessionId, params: cdpParams } = params;

  try {
    // Get tab ID from sessionId (Playwriter uses tabId as sessionId)
    const tabId = sessionId ? parseInt(sessionId, 10) : null;

    if (!tabId) {
      sendToServer({
        id,
        error: 'No sessionId (tabId) provided in CDP command'
      });
      return;
    }

    // Ensure debugger is attached to this tab
    const debuggee = await ensureDebuggerAttached(tabId);

    // Execute CDP command via chrome.debugger API
    const result = await new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(debuggee, cdpMethod, cdpParams || {}, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });

    // Send result back to server
    sendToServer({
      id,
      result
    });

  } catch (error) {
    console.error('[Playwriter] CDP command failed:', cdpMethod, error);
    sendToServer({
      id,
      error: error.message || String(error)
    });
  }
}

/**
 * Ensure chrome.debugger is attached to a tab
 * @param {number} tabId
 * @returns {Promise<chrome.debugger.Debuggee>}
 */
async function ensureDebuggerAttached(tabId) {
  // Check if already attached
  if (activeDebuggers.has(tabId)) {
    return activeDebuggers.get(tabId);
  }

  // Create debuggee
  const debuggee = { tabId };

  // Attach debugger
  await new Promise((resolve, reject) => {
    chrome.debugger.attach(debuggee, '1.3', () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        console.log(`[Playwriter] ✓ Debugger attached to tab ${tabId}`);
        resolve();
      }
    });
  });

  // Store debuggee
  activeDebuggers.set(tabId, debuggee);

  // Handle debugger detach (user closes tab or devtools)
  chrome.debugger.onDetach.addListener((source, reason) => {
    if (source.tabId === tabId) {
      console.log(`[Playwriter] Debugger detached from tab ${tabId}: ${reason}`);
      activeDebuggers.delete(tabId);
    }
  });

  return debuggee;
}

/**
 * Send message to server
 * @param {Object} message
 */
function sendToServer(message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('[Playwriter] Cannot send message: not connected to server');
    return;
  }

  ws.send(JSON.stringify(message));
}

/**
 * Send log message to server (for debugging)
 * @param {'log'|'debug'|'info'|'warn'|'error'} level
 * @param {...any} args
 */
export function logToServer(level, ...args) {
  sendToServer({
    method: 'log',
    params: {
      level,
      args: args.map(String)
    }
  });
}

/**
 * Check if connected to Playwriter MCP server
 * @returns {boolean}
 */
export function isConnectedToPlaywriter() {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

/**
 * Get connection status
 * @returns {{ connected: boolean, activeTabsCount: number }}
 */
export function getPlaywriterStatus() {
  return {
    connected: isConnectedToPlaywriter(),
    activeTabsCount: activeDebuggers.size
  };
}
