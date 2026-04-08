/**
 * Extract students from the live OGRE app via grading server, then run
 * nemotron-3-super:cloud 5 times through the full production pipeline
 * to measure run-to-run consistency.
 *
 * Prerequisites: OGRE desktop app running with MOM grading page open + extracted.
 * The grading server must be running on localhost:3456.
 *
 * Usage: node _extract-and-bench.mjs
 */
import { buildBatchPrompt, generateScoringAnchors } from '../grading-server/grading.js';
import { writeFileSync } from 'fs';

const MODEL = 'nemotron-3-super:cloud';
const RUNS = 5;
const MAX_SCORE = 4;
const FACTOR = 10 / MAX_SCORE; // virtual-10 to real-4 conversion

// ── Step 1: Extract students from OGRE grading server via batch grade dry-run ──
// We'll build the prompt locally and call Ollama directly (same as _pipeline-bench.mjs)

// Since we can't extract from the browser directly, we need the student data.
// Let's try a different approach: use the OGRE server's /api/grade endpoint
// which does extraction internally... no, that needs students passed in.

// Best approach: call Ollama directly with the production prompt builder.
// But we need student data. Let's extract via CDP if available, otherwise
// prompt the user to save the extraction.

console.log('=== OGRE Consistency Benchmark: nemotron-3-super:cloud x5 ===\n');

// Try to extract from the embedded browser via CDP on port 9223
let students = [];
let rubric = null;

// Attempt CDP extraction
async function extractViaCDP() {
  try {
    const resp = await fetch('http://127.0.0.1:9223/json');
    if (!resp.ok) throw new Error('CDP not available');
    const targets = await resp.json();
    const target = targets.find(t =>
      t.type === 'page' &&
      t.url !== 'about:blank' &&
      !t.url.startsWith('devtools://') &&
      !t.url.startsWith('chrome-extension://') &&
      !t.url.startsWith('http://localhost:') &&
      !t.url.startsWith('file://')
    );
    if (!target?.webSocketDebuggerUrl) throw new Error('No embedded browser target found');

    console.log(`CDP target: ${target.url}`);

    // Connect via WebSocket
    const ws = await connectWS(target.webSocketDebuggerUrl);

    // Inject Turndown
    const turndownResp = await cdpEval(ws, `typeof window.__turndownService !== 'undefined'`);
    if (!turndownResp) {
      console.log('Turndown not loaded in browser — extraction may have partial markdown');
    }

    // Extract student count
    const count = await cdpEval(ws, `document.querySelectorAll('div[data-lastchange]').length`);
    console.log(`Found ${count} student sections`);

    if (!count) throw new Error('No student sections found');

    // Extract each student
    for (let i = 0; i < count; i++) {
      const student = await cdpEval(ws, `(function() {
        var s = document.querySelectorAll('div[data-lastchange]')[${i}];
        if (!s) return null;
        var region = s.querySelector('.questionpanel, .question');
        var part1Div = region ? region.querySelector(':scope > div') : null;
        var responseDiv = (part1Div && part1Div.querySelectorAll(':scope > div').length > 1)
          ? part1Div.querySelectorAll(':scope > div')[1] : null;
        var fbBox = s.querySelector('div.fbbox[role="textbox"][contenteditable]');
        var scoreInput = s.querySelector('input[aria-label="Score"]');

        var promptDiv = part1Div ? part1Div.children[0] : null;
        var studentPrompt = '';
        if (promptDiv) {
          var promptPs = promptDiv.querySelectorAll(':scope > p, :scope > div > p, :scope > ul, :scope > ol');
          studentPrompt = Array.from(promptPs)
            .map(function(p) { if (p.closest('details')) return ''; return p.textContent.trim(); })
            .filter(function(t) { return t.length > 0; })
            .join(' ').substring(0, 500);
        }

        var response = '';
        if (responseDiv) {
          try { response = window.__turndownService ? window.__turndownService.turndown(responseDiv.innerHTML) : responseDiv.textContent.trim(); }
          catch(e) { response = responseDiv.textContent.trim(); }
        }

        var nameEl = s.querySelector('b, .stuname, [class*="name"]');
        var name = nameEl ? nameEl.textContent.trim() : 'Student ' + (${i} + 1);
        // Try data-lastchange parent's first bold text
        if (!nameEl || name.length < 2) {
          var allBolds = s.querySelectorAll('b');
          for (var b of allBolds) { if (b.textContent.trim().length > 3) { name = b.textContent.trim(); break; } }
        }

        return {
          index: ${i},
          name: name,
          currentScore: scoreInput ? scoreInput.value : '',
          hasFeedback: (fbBox ? fbBox.textContent.trim().length : 0) > 0,
          response: response,
          prompt: studentPrompt || undefined
        };
      })()`);
      if (student && student.response && student.response.trim().length > 5) {
        students.push(student);
      }
    }

    // Extract rubric from first student
    const rubricData = await cdpEval(ws, `(function() {
      var first = document.querySelectorAll('div[data-lastchange]')[0];
      if (!first) return null;
      var region = first.querySelector('.questionpanel, .question');
      var checklistItems = [];
      var rubricItems = [];
      var essayPrompt = '';

      if (region) {
        var part1Div = region.querySelector(':scope > div');
        var promptDiv = part1Div ? part1Div.children[0] : null;
        var checkDetails = promptDiv ? promptDiv.querySelector('details') : null;
        var checkDiv = checkDetails ? checkDetails.querySelector('div') : null;
        if (checkDiv) {
          checklistItems = Array.from(checkDiv.querySelectorAll('tr')).map(function(tr) {
            var bEl = tr.querySelector('b');
            return {
              category: bEl ? bEl.textContent.trim() : '',
              items: Array.from(tr.querySelectorAll('label')).map(function(l) { return l.textContent.trim(); })
            };
          }).filter(function(x) { return x.category || x.items.length; });
        }
        var promptPs = promptDiv ? promptDiv.querySelectorAll(':scope > p, :scope > div > p') : [];
        essayPrompt = Array.from(promptPs)
          .map(function(p) { return p.textContent.trim(); })
          .join(' ').substring(0, 500);
      }

      var scoreInput = first.querySelector('input[aria-label="Score"]');
      var maxMatch = scoreInput && scoreInput.parentElement
        ? scoreInput.parentElement.textContent.match(/\\/(\\d+\\.?\\d*)/)
        : null;
      var maxScore = maxMatch ? maxMatch[1] : '4';

      return { essayPrompt, checklistItems, rubricItems, modelText: null, maxScore };
    })()`);

    if (rubricData) rubric = rubricData;

    ws.close();
    return true;
  } catch (e) {
    console.log(`CDP extraction failed: ${e.message}`);
    return false;
  }
}

function connectWS(url) {
  return new Promise((resolve, reject) => {
    const ws = new (await import('ws')).WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WS timeout')), 5000);
  });
}

let _wsId = 1;
const _pending = new Map();

function cdpEval(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = _wsId++;
    const timer = setTimeout(() => { _pending.delete(id); reject(new Error('CDP eval timeout')); }, 30000);
    _pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true }
    }));
  });
}

// Set up WS message handler (called once globally)
function setupWSHandler(ws) {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.id !== undefined) {
        const entry = _pending.get(msg.id);
        if (entry) {
          _pending.delete(msg.id);
          clearTimeout(entry.timer);
          if (msg.error) entry.reject(new Error(msg.error.message));
          else entry.resolve(msg.result?.result?.value);
        }
      }
    } catch {}
  });
}

// ── Main ──
const cdpOk = false; // Skip CDP — port is zombie
// const cdpOk = await extractViaCDP();

if (!cdpOk || students.length === 0) {
  console.log('\nCDP unavailable. Please paste the path to extracted student JSON,');
  console.log('or click "Run" in the OGRE app and use the grading server endpoint.\n');
  console.log('Falling back to: calling /api/grade through the running server 5 times.\n');
  console.log('You need to click "Continue" in the app to start grading.');
  console.log('Instead, I will call the grading server directly with the data from the app.\n');

  // Alternative: read from the OGRE database or ask user to export
  // For now, let's use the server endpoint approach with the benchmark rubric
  // and have the user confirm extraction in the app
  process.exit(1);
}

// Save extracted data
writeFileSync('C:/tmp/mom-benchmark-data.json', JSON.stringify({ students, rubric }, null, 2));
console.log(`\nExtracted ${students.length} students. Saved to C:/tmp/mom-benchmark-data.json`);
