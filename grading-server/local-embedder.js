/**
 * Local Embedding Provider
 *
 * Uses onnxruntime-node (inference) + @huggingface/tokenizers (pure-JS tokenization)
 * directly, with no dependency on @huggingface/transformers.
 *
 * Why this approach:
 *   - @huggingface/transformers required three build-time string-match patches against
 *     its bundled dist file (sharp stub, image-throw no-op, IS_NODE_ENV fix). Any
 *     package update could silently break the patches.
 *   - onnxruntime-node and @huggingface/tokenizers have stable, versioned APIs.
 *     @huggingface/tokenizers is pure JS (zero native deps). No patches ever needed.
 *
 * Model: Xenova/all-MiniLM-L6-v2 (quantized, ~23MB)
 *   Files downloaded from HuggingFace Hub on first use, cached to:
 *     ~/.cache/ogre/models/Xenova/all-MiniLM-L6-v2/
 *   Subsequent startups load from cache (~150ms).
 *
 * Performance:
 *   - Cold start (cached): ~150ms
 *   - First run (download): ~10-30s depending on connection
 *   - Per-inference: 2-3ms
 *   - Dimensions: 384
 */

import * as ort from 'onnxruntime-node';
import { Tokenizer } from '@huggingface/tokenizers';
import fs from 'fs';
import path from 'path';
import os from 'os';

const MODEL_ID  = 'Xenova/all-MiniLM-L6-v2';
const DIMS      = 384;
const MAX_LEN   = 256;  // max tokens; model supports up to 512, 256 covers all practical text

const CACHE_DIR = path.join(os.homedir(), '.cache', 'ogre', 'models', 'Xenova', 'all-MiniLM-L6-v2');
const HF_BASE   = `https://huggingface.co/${MODEL_ID}/resolve/main`;

// Files needed — reuses tokenizer.json / tokenizer_config.json if already cached
// from a previous @huggingface/transformers download.
const FILES = {
  tokenizerJson:   { url: `${HF_BASE}/tokenizer.json`,              local: path.join(CACHE_DIR, 'tokenizer.json')              },
  tokenizerConfig: { url: `${HF_BASE}/tokenizer_config.json`,       local: path.join(CACHE_DIR, 'tokenizer_config.json')       },
  model:           { url: `${HF_BASE}/onnx/model_quantized.onnx`,   local: path.join(CACHE_DIR, 'onnx', 'model_quantized.onnx') },
};

/** @type {Tokenizer | null} */
let tokenizer = null;
/** @type {ort.InferenceSession | null} */
let session = null;
/** @type {Promise<void> | null} */
let initPromise = null;

// ─── Download helper ──────────────────────────────────────────────────────────

async function downloadFile(url, dest) {
  console.log(`[local-embedder] Downloading ${path.basename(dest)}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = await res.arrayBuffer();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(buf));
  console.log(`[local-embedder] Saved ${path.basename(dest)} (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB)`);
}

async function ensureFiles() {
  for (const { url, local } of Object.values(FILES)) {
    if (!fs.existsSync(local)) await downloadFile(url, local);
  }
}

// ─── Init (singleton) ─────────────────────────────────────────────────────────

/**
 * Lazily initialize the tokenizer and ONNX session.
 * Safe to call concurrently — only one init runs.
 */
export async function initLocalEmbedder() {
  if (session && tokenizer) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log(`[local-embedder] Loading model ${MODEL_ID}...`);
    const start = Date.now();

    await ensureFiles();

    const tokenizerJson   = JSON.parse(fs.readFileSync(FILES.tokenizerJson.local,   'utf8'));
    const tokenizerConfig = JSON.parse(fs.readFileSync(FILES.tokenizerConfig.local, 'utf8'));
    tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
    session   = await ort.InferenceSession.create(FILES.model.local);

    console.log(`[local-embedder] Model loaded in ${Date.now() - start}ms`);
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    tokenizer   = null;
    session     = null;
    throw new Error(`Failed to load local embedding model: ${err.message}`);
  }
}

// ─── Inference ────────────────────────────────────────────────────────────────

/**
 * Generate a 384-dimensional embedding for the given text.
 * Lazy-initializes the model on first call.
 * @param {string} text
 * @returns {Promise<{ embedding: number[], dimensions: number, model: string }>}
 */
export async function generateLocalEmbedding(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('generateLocalEmbedding requires a non-empty string');
  }

  await initLocalEmbedder();

  // Tokenize — truncate to MAX_LEN
  const encoded = tokenizer.encode(text);
  const ids  = encoded.ids.slice(0, MAX_LEN);
  const mask = encoded.attention_mask.slice(0, MAX_LEN);
  const seqLen = ids.length;

  // Build int64 tensors
  const toTensor = (arr) =>
    new ort.Tensor('int64', BigInt64Array.from(arr.map(BigInt)), [1, seqLen]);

  const result = await session.run({
    input_ids:      toTensor(ids),
    attention_mask: toTensor(mask),
    token_type_ids: toTensor(new Array(seqLen).fill(0)),
  });

  // Mean pool last_hidden_state [1, seqLen, 384] over non-padding tokens
  const hidden = result.last_hidden_state.data;  // Float32Array
  const pooled = new Float32Array(DIMS);
  let count = 0;
  for (let i = 0; i < seqLen; i++) {
    if (mask[i] === 0) continue;
    count++;
    for (let j = 0; j < DIMS; j++) pooled[j] += hidden[i * DIMS + j];
  }
  for (let j = 0; j < DIMS; j++) pooled[j] /= count;

  // L2 normalize
  const norm = Math.sqrt(pooled.reduce((s, v) => s + v * v, 0));
  const embedding = Array.from(pooled, v => v / norm);

  return { embedding, dimensions: embedding.length, model: MODEL_ID };
}

/**
 * Whether the model is currently loaded in memory.
 * @returns {boolean}
 */
export function isModelLoaded() {
  return session !== null && tokenizer !== null;
}
