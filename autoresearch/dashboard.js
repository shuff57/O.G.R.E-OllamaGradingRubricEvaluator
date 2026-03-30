#!/usr/bin/env bun

import { readFile, watch } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TSV_PATH = resolve(__dirname, 'results.tsv');
const HTML_PATH = resolve(__dirname, 'dashboard.html');
const BASELINE_PATH = resolve(__dirname, 'baseline-metric.json');
const PORT = 3737;

async function readTSV() {
  try {
    const text = await readFile(TSV_PATH, 'utf-8');
    return text.trim();
  } catch {
    return 'iteration\tcomposite\tgenerosity\tvariance\tedge_cases\twithin1\tconciseness\tprompt_len\tstatus\tdescription';
  }
}

async function readBaseline() {
  try {
    const text = await readFile(BASELINE_PATH, 'utf-8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const clients = new Set();

async function broadcast() {
  const tsv = await readTSV();
  for (const controller of clients) {
    controller.enqueue(`data: ${JSON.stringify({ tsv })}\n\n`);
  }
}

// Watch results.tsv for changes
(async () => {
  try {
    const watcher = watch(TSV_PATH);
    for await (const event of watcher) {
      if (event.eventType === 'change') {
        await broadcast();
      }
    }
  } catch {
    // File may not exist yet; poll instead
    setInterval(broadcast, 3000);
  }
})();

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/' || url.pathname === '/dashboard') {
      const html = await readFile(HTML_PATH, 'utf-8');
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    if (url.pathname === '/api/data') {
      const [tsv, baseline] = await Promise.all([readTSV(), readBaseline()]);
      return Response.json({ tsv, baseline });
    }

    if (url.pathname === '/api/stream') {
      const stream = new ReadableStream({
        start(controller) {
          clients.add(controller);
          req.signal.addEventListener('abort', () => clients.delete(controller));
        },
        cancel(controller) {
          clients.delete(controller);
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log(`Dashboard running at http://localhost:${PORT}`);
