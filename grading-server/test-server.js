console.log("Step 1: Starting test");

import { serve } from '@hono/node-server';
console.log("Step 2: Imported serve");

import { Hono } from 'hono';
console.log("Step 3: Imported Hono");

import { loadConfig } from './config.js';
console.log("Step 4: Imported config");

const config = loadConfig();
console.log("Step 5: Config loaded:", config.token.slice(0, 8));

const app = new Hono();
console.log("Step 6: Created Hono app");

app.get('/health', (c) => c.json({ status: 'ok' }));
console.log("Step 7: Added health route");

console.log("Step 8: Starting server on port 3456...");

const server = serve({
  fetch: app.fetch,
  port: 3456,
}, () => {
  console.log("Step 9: Server RUNNING on port 3456");
});

console.log("Step 10: After serve() call");
