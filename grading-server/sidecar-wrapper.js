#!/usr/bin/env node
/**
 * Tauri Sidecar Wrapper for O.G.R.E Grading Server
 *
 * This minimal wrapper loads the bundled server which has Playwriter
 * marked as external. The bundled server will load Playwriter from
 * node_modules at runtime.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the bundled server
// The bundle expects node_modules to be in the same directory
await import('./bundle.js');
