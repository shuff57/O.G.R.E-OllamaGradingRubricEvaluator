// Spike v2: disable-gpu + offscreen rendering for Linux headless
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// MUST be before app.whenReady()
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');

const RESULTS_PATH = path.join(__dirname, 'test-results.json');
const EVIDENCE_DIR = path.join(__dirname, '..', '..', '.sisyphus', 'evidence');

const results = {
  timestamp: new Date().toISOString(),
  checks: {}
};

function saveResults() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, 'task-1-spike-results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('Results saved to', RESULTS_PATH);
}

async function runSpike() {
  // ── CHECK 4: better-sqlite3 ──────────────────────────────────────────────
  try {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    db.prepare('INSERT INTO test (value) VALUES (?)').run('hello-electron');
    const row = db.prepare('SELECT value FROM test WHERE id = 1').get();
    if (row && row.value === 'hello-electron') {
      results.checks.sqlite = { pass: true, detail: 'better-sqlite3 works with Electron ABI' };
      console.log('[OK] better-sqlite3 works');
    } else {
      results.checks.sqlite = { pass: false, detail: 'Row read failed: ' + JSON.stringify(row) };
      console.log('[FAIL] better-sqlite3 row read failed');
    }
  } catch (e) {
    results.checks.sqlite = { pass: false, detail: 'Error: ' + e.message };
    console.log('[FAIL] better-sqlite3:', e.message);
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
    }
  });

  // ── CHECK 1: webContents.debugger ────────────────────────────────────────
  try {
    win.webContents.debugger.attach('1.3');
    results.checks.debugger_attach = { pass: true, detail: 'webContents.debugger.attach(1.3) succeeded' };
    console.log('[OK] debugger attached');
  } catch (e) {
    results.checks.debugger_attach = { pass: false, detail: 'attach failed: ' + e.message };
    console.log('[FAIL] debugger attach:', e.message);
    saveResults();
    app.quit();
    return;
  }

  // ── Navigate to a simple test page ──────────────────────────────────────
  await new Promise((resolve) => {
    win.webContents.once('did-finish-load', resolve);
    win.loadURL('data:text/html,<html><head><title>SpikeTest</title></head><body><h1>Spike Test Page</h1><button>Click me</button><input type="text" placeholder="Enter text"/></body></html>');
  });

  await sleep(2000);

  // ── CHECK 3: Runtime.evaluate ────────────────────────────────────────────
  try {
    const evalResult = await win.webContents.debugger.sendCommand('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true
    });
    const title = evalResult.result && evalResult.result.value;
    if (title === 'SpikeTest') {
      results.checks.runtime_evaluate = { pass: true, detail: 'Runtime.evaluate returned: ' + title };
      console.log('[OK] Runtime.evaluate works, title:', title);
    } else {
      results.checks.runtime_evaluate = { pass: false, detail: 'Unexpected title: ' + JSON.stringify(title) };
      console.log('[FAIL] Runtime.evaluate wrong title:', title);
    }
  } catch (e) {
    results.checks.runtime_evaluate = { pass: false, detail: e.message };
    console.log('[FAIL] Runtime.evaluate:', e.message);
  }

  await sleep(500);

  try {
    await win.webContents.debugger.sendCommand('Page.enable');
    await sleep(300);
    const screenshotResult = await win.webContents.debugger.sendCommand('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 80
    });
    if (screenshotResult && screenshotResult.data && screenshotResult.data.length > 100) {
      results.checks.screenshot = { pass: true, detail: 'Screenshot data length: ' + screenshotResult.data.length };
      console.log('[OK] Page.captureScreenshot works, data length:', screenshotResult.data.length);
      // Save screenshot to evidence
      const jpegBuf = Buffer.from(screenshotResult.data, 'base64');
      fs.writeFileSync(path.join(EVIDENCE_DIR, 'task-1-screenshot.jpg'), jpegBuf);
    } else {
      results.checks.screenshot = { pass: false, detail: 'Empty or missing data' };
      console.log('[FAIL] Page.captureScreenshot: empty data');
    }
  } catch (e) {
    results.checks.screenshot = { pass: false, detail: e.message };
    console.log('[FAIL] Page.captureScreenshot:', e.message);
  }

  await sleep(500);

  try {
    await win.webContents.debugger.sendCommand('Accessibility.enable');
    await sleep(300);
    const axResult = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    const nodeCount = axResult && axResult.nodes ? axResult.nodes.length : 0;
    if (nodeCount > 0) {
      results.checks.accessibility_tree = {
        pass: true,
        detail: 'AX tree has ' + nodeCount + ' nodes',
        sample_roles: (axResult.nodes || []).slice(0, 10).map(n => n.role && n.role.value)
      };
      console.log('[OK] Accessibility.getFullAXTree works, nodes:', nodeCount);
      // Save accessibility tree sample to evidence
      fs.writeFileSync(
        path.join(EVIDENCE_DIR, 'task-1-accessibility-tree.json'),
        JSON.stringify({ nodeCount, firstTenNodes: (axResult.nodes || []).slice(0, 10) }, null, 2)
      );
    } else {
      results.checks.accessibility_tree = { pass: false, detail: 'Empty tree (0 nodes)' };
      console.log('[FAIL] Accessibility.getFullAXTree: 0 nodes');
    }
  } catch (e) {
    results.checks.accessibility_tree = { pass: false, detail: e.message };
    console.log('[FAIL] Accessibility.getFullAXTree:', e.message);
  }

  // ── CHECK 5: CORS for localhost:3456 ─────────────────────────────────────
  // We test this by evaluating a fetch in the page context
  try {
    const corsResult = await win.webContents.debugger.sendCommand('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            const r = await fetch('http://localhost:3456/health', { mode: 'cors' });
            return { ok: r.ok, status: r.status, text: await r.text() };
          } catch(e) {
            return { ok: false, error: e.message, type: e.constructor.name };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    const val = corsResult && corsResult.result && corsResult.result.value;
    if (val && val.ok) {
      results.checks.cors_localhost = { pass: true, detail: 'CORS fetch succeeded: HTTP ' + val.status + ' ' + val.text };
      console.log('[OK] CORS localhost:3456 works:', val.status);
    } else {
      // CORS may fail if server not running — document the exact error for workaround planning
      results.checks.cors_localhost = {
        pass: false,
        detail: 'CORS fetch failed (expected if server not running): ' + JSON.stringify(val),
        note: 'Check if this is a CORS header issue or just server not running'
      };
      console.log('[INFO] CORS localhost result:', JSON.stringify(val));
    }
  } catch (e) {
    results.checks.cors_localhost = { pass: false, detail: e.message };
    console.log('[INFO] CORS localhost exception:', e.message);
  }

  // ── FINAL: Save results and verdict ────────────────────────────────────────
  saveResults();

  const critical = ['debugger_attach', 'accessibility_tree', 'runtime_evaluate', 'screenshot', 'sqlite'];
  const allPass = critical.every(k => results.checks[k] && results.checks[k].pass);
  const verdict = allPass ? 'GO' : 'NO-GO: ' + critical.filter(k => !results.checks[k] || !results.checks[k].pass).map(k => k + '(' + (results.checks[k] ? results.checks[k].detail : 'not run') + ')').join(', ');

  results.verdict = verdict;
  saveResults();

  const verdictPath = path.join(EVIDENCE_DIR, 'task-1-verdict.txt');
  fs.writeFileSync(verdictPath, verdict + '\n');
  console.log('\n=====================================');
  console.log('SPIKE VERDICT:', verdict);
  console.log('=====================================\n');

  app.quit();
}

app.whenReady().then(() => {
  runSpike().catch(e => {
    console.error('Spike crashed:', e);
    results.checks.crash = { pass: false, detail: e.message + '\n' + e.stack };
    saveResults();
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'task-1-verdict.txt'),
      'NO-GO: crash - ' + e.message + '\n'
    );
    app.quit();
  });
});

app.on('window-all-closed', () => {});
