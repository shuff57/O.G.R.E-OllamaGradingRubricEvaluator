/**
 * E2E test suite: Ollama LFM2 grading pipeline
 *
 * Tests the full O.G.R.E grading pipeline end-to-end using a real Ollama
 * instance with the LFM2 model against the demo CLT statistics assignment.
 *
 * Requirements:
 *  - Ollama running at http://localhost:11434
 *  - LFM2 model pulled (any tag matching "lfm2" or "lfm-2")
 *
 * If Ollama or LFM2 is unavailable, tests skip gracefully.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/demo-clt-data.json', import.meta.url), 'utf-8')
);
const { rubric, students } = fixture;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVER_URL = 'http://localhost:3456';
const OLLAMA_URL = 'http://localhost:11434';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse SSE text into an array of { type, data } events.
 * Handles both `event: X\ndata: Y` and bare `data: Y` blocks.
 */
function parseSSEStreamFromText(text) {
  const events = [];
  const blocks = text.split('\n\n').filter((b) => b.trim());
  for (const block of blocks) {
    const lines = block.split('\n');
    let type = 'message';
    let data = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        type = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        try {
          data = JSON.parse(line.slice(6));
        } catch {
          data = line.slice(6);
        }
      }
    }
    if (data !== null) events.push({ type, data });
  }
  return events;
}

/**
 * Parse an SSE response body into an array of { type, data } events.
 */
async function parseSSEStream(response) {
  const text = await response.text();
  return parseSSEStreamFromText(text);
}

/**
 * Poll a URL until it responds with HTTP 2xx or times out.
 */
async function waitForServer(url, timeoutMs = 15_000, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

/**
 * Find the first model whose name contains "lfm2" or "lfm-2" (case-insensitive).
 */
function findLfm2Model(models) {
  return models.find(
    (m) =>
      m.name.toLowerCase().includes('lfm2') || m.name.toLowerCase().includes('lfm-2')
  );
}

// ---------------------------------------------------------------------------
// Suite state (populated in beforeAll)
// ---------------------------------------------------------------------------

let ollamaAvailable = false;
let lfm2Tag = null;
let authToken = null;
let serverProcess = null; // only set if WE spawned the server

// ---------------------------------------------------------------------------
// beforeAll / afterAll
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // 1. Check Ollama availability
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return; // ollamaAvailable stays false
    const json = await res.json();
    const models = json.models ?? [];
    const lfm2 = findLfm2Model(models);
    if (!lfm2) return; // model not pulled — skip
    ollamaAvailable = true;
    lfm2Tag = lfm2.name;
  } catch {
    return; // Ollama not running — skip
  }

  // 2. Ensure grading server is running (reuse if already up)
  let serverAlreadyRunning = false;
  try {
    const r = await fetch(`${SERVER_URL}/health`);
    serverAlreadyRunning = r.ok;
  } catch {
    // not running
  }

  if (!serverAlreadyRunning) {
    serverProcess = spawn('bun', ['run', 'server.js'], {
      cwd: new URL('..', import.meta.url).pathname.replace(/\/$/, ''),
      stdio: 'ignore',
      detached: false,
    });
    await waitForServer(`${SERVER_URL}/health`, 20_000);
  }

  // 3. Push Ollama provider config and obtain auth token
  //    POST /internal/providers sets both the providers AND replaces the handshakeToken
  authToken = randomUUID();

  const providerRes = await fetch(`${SERVER_URL}/internal/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: authToken,
      providers: [
        {
          id: 'ollama',
          apiUrl: OLLAMA_URL,
          apiKey: '',
          model: lfm2Tag,
        },
      ],
    }),
  });

  if (!providerRes.ok) {
    const body = await providerRes.text();
    throw new Error(`/internal/providers failed (${providerRes.status}): ${body}`);
  }
}, 30_000);

afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: Ollama LFM2 grading pipeline', () => {
  it('GET /health returns ok', async () => {
    const res = await fetch(`${SERVER_URL}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
  });

  it(
    'POST /api/chat grades a single student in grader mode',
    async () => {
      if (!ollamaAvailable) {
        console.log('SKIP: Ollama/LFM2 not available');
        return;
      }

      const student = students[0];
      const res = await fetch(`${SERVER_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          message: student.response,
          rubric,
          provider: 'ollama',
          model: lfm2Tag,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(typeof json.score).toBe('number');
      expect(json.score).toBeGreaterThanOrEqual(0);
      expect(json.score).toBeLessThanOrEqual(Number(rubric.maxScore));
      expect(typeof json.feedback).toBe('string');
      expect(json.feedback.length).toBeGreaterThan(0);
    },
    120_000
  );

  it(
    'POST /api/grade grades all 30 demo students via SSE stream',
    async () => {
      if (!ollamaAvailable) {
        console.log('SKIP: Ollama/LFM2 not available');
        return;
      }

      const res = await fetch(`${SERVER_URL}/api/grade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          provider: 'ollama',
          model: lfm2Tag,
          rubric,
          students,
          strategy: 'serial',
          // chunkSize: 5 — local Ollama has a 30s per-call timeout; each chunk
          // of 5 students completes well within that window (~15-20s each),
          // while still exercising multi-chunk consistency sweep logic.
          chunkSize: 5,
          sweep: 'none',
          customInstructions: '',
        }),
      });

      expect(res.status).toBe(200);

      const rawText = await res.text();
      const events = parseSSEStreamFromText(rawText);

      // Must have at least one event
      expect(events.length).toBeGreaterThan(0);

      // Must receive a 'done' event
      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent, 'Expected a "done" SSE event').toBeTruthy();

      // done.metadata.totalStudents === 30
      expect(doneEvent.data.metadata?.totalStudents).toBe(30);

      // Collect all results from 'chunk' events
      const chunkEvents = events.filter((e) => e.type === 'chunk');
      expect(chunkEvents.length).toBeGreaterThan(0);

      const allResults = chunkEvents.flatMap((e) => e.data.results ?? []);

      // All 30 student indices must be present
      const seenIndices = new Set(allResults.map((r) => r.studentIndex));
      for (const student of students) {
        expect(seenIndices.has(student.index), `Missing studentIndex ${student.index}`).toBe(true);
      }

      // Every result must have a valid score and non-empty feedback
      const maxScore = Number(rubric.maxScore);
      for (const result of allResults) {
        expect(typeof result.score, `studentIndex ${result.studentIndex}: score must be a number`).toBe('number');
        expect(result.score, `studentIndex ${result.studentIndex}: score must be >= 0`).toBeGreaterThanOrEqual(0);
        expect(result.score, `studentIndex ${result.studentIndex}: score must be <= ${maxScore}`).toBeLessThanOrEqual(maxScore);
        expect(typeof result.feedback, `studentIndex ${result.studentIndex}: feedback must be a string`).toBe('string');
        expect(result.feedback.length, `studentIndex ${result.studentIndex}: feedback must not be empty`).toBeGreaterThan(0);
      }

      // No 'error' events should be present
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents, `Unexpected error events: ${JSON.stringify(errorEvents)}`).toHaveLength(0);
    },
    600_000
  );
});
