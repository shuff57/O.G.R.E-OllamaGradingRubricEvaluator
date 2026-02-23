#!/usr/bin/env node
/**
 * Build script: Bundles turndown and turndown-plugin-gfm into a single IIFE string.
 * Generates: src/lib/turndown-bundle.ts
 *
 * This script:
 * 1. Reads the turndown IIFE dist file from node_modules
 * 2. Reads the turndown-plugin-gfm dist file from node_modules
 * 3. Concatenates them into a single string
 * 4. Escapes backticks and backslashes for safe embedding in a TypeScript template literal
 * 5. Writes the result to src/lib/turndown-bundle.ts
 *
 * Usage: node scripts/build-turndown-bundle.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TURNDOWN_DIST = path.join(__dirname, '../node_modules/turndown/dist/turndown.js');
const GFM_PLUGIN_DIST = path.join(__dirname, '../node_modules/turndown-plugin-gfm/dist/turndown-plugin-gfm.js');
const OUTPUT_FILE = path.join(__dirname, '../src/lib/turndown-bundle.ts');

function escapeForTemplateLiteral(str) {
  // Escape backslashes first (must be done before backticks)
  let escaped = str.replace(/\\/g, '\\\\');
  // Escape backticks
  escaped = escaped.replace(/`/g, '\\`');
  return escaped;
}

try {
  console.log('Reading turndown IIFE...');
  const turndownCode = fs.readFileSync(TURNDOWN_DIST, 'utf-8');
  console.log(`  ✓ turndown.js: ${turndownCode.length} bytes`);

  console.log('Reading turndown-plugin-gfm IIFE...');
  const gfmPluginCode = fs.readFileSync(GFM_PLUGIN_DIST, 'utf-8');
  console.log(`  ✓ turndown-plugin-gfm.js: ${gfmPluginCode.length} bytes`);

  // Concatenate the two bundles
  const bundledCode = turndownCode + '\n' + gfmPluginCode;
  console.log(`Combined bundle: ${bundledCode.length} bytes`);

  // Escape for safe embedding in template literal
  console.log('Escaping for TypeScript template literal...');
  const escapedCode = escapeForTemplateLiteral(bundledCode);

  // Generate TypeScript file
  const tsContent = `// AUTO-GENERATED — do not edit manually. Run: npm run build:turndown
export const TURNDOWN_IIFE: string = \`${escapedCode}\`;
`;

  console.log('Writing to src/lib/turndown-bundle.ts...');
  fs.writeFileSync(OUTPUT_FILE, tsContent, 'utf-8');
  console.log(`  ✓ Generated: ${OUTPUT_FILE}`);
  console.log(`  ✓ File size: ${tsContent.length} bytes`);

  console.log('\n✅ Bundle generation complete!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Bundle generation failed:');
  console.error(error.message);
  process.exit(1);
}
