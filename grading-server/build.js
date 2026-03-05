#!/usr/bin/env node
/**
 * Build script for grading-server.
 *
 * Uses @yao-pkg/pkg to compile server.js + all dependencies into a single
 * self-contained executable.
 *
 * Why pkg:
 *   - onnxruntime-node requires NAPI v6; bun build --compile caps at NAPI v17 -> dead end
 *   - pkg embeds the Node.js runtime and extracts native .node addons to a temp dir at startup
 *   - No patches, no workarounds
 *
 * Native addon bundled as pkg asset (extracted to temp dir at runtime):
 *   - onnxruntime-node: bin/napi-v6/{platform}/{arch}/onnxruntime_binding.node + DLLs
 *
 * @huggingface/tokenizers is pure JS (zero native deps) - no special handling needed.
 * @huggingface/transformers is not used - eliminated sharp + IS_NODE_ENV fragility.
 *
 * Model files are NOT bundled. Downloaded from HuggingFace Hub on first run,
 * cached to ~/.cache/ogre/models/. Subsequent starts load from cache (~150ms).
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');

// pkg target triples: node{ver}-{os}-{arch}
const targets = [
  { flag: 'node22-win-x64',   out: 'grading-server-win.exe', id: 'windows', ort: 'win32/x64'   },
  { flag: 'node22-mac-x64',   out: 'grading-server-mac',     id: 'mac',     ort: 'darwin/x64'  },
  { flag: 'node22-mac-arm64', out: 'grading-server-mac-arm', id: 'mac-arm', ort: 'darwin/arm64' },
  { flag: 'node22-linux-x64', out: 'grading-server-linux',   id: 'linux',   ort: 'linux/x64'   },
];

const requested = process.argv[2]; // 'windows' | 'mac' | 'mac-arm' | 'linux'
const toBuild = requested
  ? targets.filter(t => t.id === requested)
  : targets;

if (toBuild.length === 0) {
  console.error(`Unknown target: ${requested}`);
  console.error(`Valid targets: ${targets.map(t => t.id).join(', ')}`);
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });

for (const { flag, out, ort } of toBuild) {
  const outPath = path.join(distDir, out);
  console.log(`\nBuilding ${out} (${flag})...`);

  // Temporarily set platform-specific ort asset path in package.json.
  // pkg reads pkg.assets from package.json at build time.
  const pkgJsonPath = path.join(__dirname, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const originalAssets = pkgJson.pkg.assets;
  pkgJson.pkg.assets = [`node_modules/onnxruntime-node/bin/napi-v6/${ort}/**`];
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf8');

  try {
    execSync(
      `npx pkg server.js --targets ${flag} --output ${outPath}`,
      { stdio: 'inherit', cwd: __dirname }
    );
  } finally {
    pkgJson.pkg.assets = originalAssets;
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf8');
  }

  const size = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`  Built: ${out} (${size}MB)`);
}

console.log('\nBuild complete. dist/ contents:');
for (const f of fs.readdirSync(distDir)) {
  const size = (fs.statSync(path.join(distDir, f)).size / 1024 / 1024).toFixed(1);
  console.log(`  ${f.padEnd(40)} ${size}MB`);
}
