#!/usr/bin/env node
/**
 * Node.js wrapper for the grading server
 * This allows us to compile with pkg which has better compatibility
 */

(async () => {
  // Import the bundled server
  await import('./bundle.js');
})().catch(err => {
  console.error('Fatal error starting grading server:', err);
  process.exit(1);
});
