/**
 * gen-notebook.cjs
 * Converts colab_train_qwen35_grader.py → OGRE_Finetune_Qwen35_9B.ipynb
 * Splits on # %% markers, extracts section headers, generates proper Colab notebook.
 */
const fs = require('fs');
const path = require('path');

const pyPath = path.join(__dirname, 'colab_train_qwen35_grader.py');
const nbPath = path.join(__dirname, 'OGRE_Finetune_Qwen35_9B.ipynb');

const py = fs.readFileSync(pyPath, 'utf8');

// Split into raw blocks at # %% markers
const blocks = py.split(/^# %%$/m);

// Block 0 is the preamble (pyright directive + docstring) — becomes intro markdown
// Blocks 1+ are code cells, each preceded by a # ==== section header comment block

/** Convert a source string into the notebook source array format (array of lines ending with \n) */
function toSourceArray(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => i < lines.length - 1 ? line + '\n' : line);
}

function makeMarkdownCell(source) {
  return {
    cell_type: 'markdown',
    metadata: {},
    source: toSourceArray(source),
  };
}

function makeCodeCell(source) {
  return {
    cell_type: 'code',
    execution_count: null,
    metadata: {},
    outputs: [],
    source: toSourceArray(source),
  };
}

// ── Build cells ──────────────────────────────────────────────────────────────

const cells = [];

// Cell 0: Intro markdown from the module docstring
cells.push(makeMarkdownCell(
`# O.G.R.E. Fine-Tuning: Qwen3.5 9B Statistics Grader

Fine-tunes Qwen3.5-9B with LoRA on **481 grading examples** (283 text + 198 vision/handwriting).

**Pipeline:** Install deps → Load model → Upload data (text + vision) → Train → Smoke test → Export GGUF → Download

**Requirements:** Google Colab with **A100 GPU** (Colab Pro). L4 works with 4-bit fallback. T4 is too small.

**Crash recovery:** Checkpoints auto-save to Google Drive. If disconnected, re-run cells 1-3b then Cell 4 auto-recovers.

---

## Steps

1. **Cell 1:** Install dependencies
2. **Cell 2:** Load Qwen3.5-9B with LoRA
3. **Cell 3:** Upload \`finetune-grading.jsonl\` (283 text examples)
4. **Cell 3b:** Upload \`finetune-grading-vision.jsonl\` (198 vision examples)
5. Upload \`finetune-grading-val.jsonl\` to Colab file browser before Cell 4
6. **Cell 4:** Train (auto-recovers from Drive checkpoint if runtime disconnected)
7. **Cell 4b:** Post-training smoke test (MUST pass before proceeding)
8. **Cell 5:** Export to GGUF Q4_K_M
9. **Cell 5b:** Copy GGUF to Google Drive + MD5 checksum
10. **Cell 6:** Download GGUF
11. **Cell 7:** Push to Hugging Face (optional)

After download, run locally:
\`\`\`bash
ollama create qwen3.5-9B-stat-grader -f fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader
\`\`\``));

// Now process each code block (blocks[1] through blocks[end])
const sectionMeta = [
  {
    title: '1. Install Dependencies',
    desc: 'Installs Unsloth, Transformers v5, TRL, and other training dependencies. Also checks GPU type and VRAM.\n\n**~3 minutes** on a fresh runtime.',
  },
  {
    title: '2. Load Qwen3.5-9B with LoRA',
    desc: 'Downloads the base model and attaches LoRA adapters.\n\n- `max_seq_length=8192`\n- LoRA rank 16, alpha 16\n- Vision encoder frozen, language layers trained\n- Auto-detects A100 (bf16) vs other GPUs (4-bit fallback)',
  },
  {
    title: '3. Upload Training Data (Text)',
    desc: 'Upload `finetune-grading.jsonl` when prompted (283 text grading examples).\n\nVerifies system/user/assistant message format and converts to HuggingFace Dataset with Qwen3.5 chat template (`enable_thinking=False`).',
  },
  {
    title: '3b. Upload Training Data (Vision)',
    desc: '**REQUIRED.** Upload `finetune-grading-vision.jsonl` (198 handwriting image examples).\n\nDecodes base64 PNG images, applies vision chat template, and merges with text dataset.\n\n**Combined: 481 total training examples** (283 text + 198 vision).',
  },
  {
    title: '4. Train',
    desc: '**~45-60 min on A100.** Mounts Google Drive for checkpoint persistence.\n\n- 2 epochs, lr=2e-5, cosine schedule, warmup 10%\n- Checkpoints saved every 50 steps + copied to Drive\n- **Crash recovery:** If a Drive checkpoint exists, training is skipped and the model is restored\n\n> **Before running:** Upload `finetune-grading-val.jsonl` to the Colab file browser (left sidebar). Do NOT use the upload dialog — drag the file directly.',
  },
  {
    title: '4b. Post-Training Smoke Test',
    desc: '**MANDATORY before GGUF export.** Runs test prompts through the trained model to verify it returns valid JSON with scores.\n\nAll tests must pass before proceeding.',
  },
  {
    title: '5. Export to GGUF Q4_K_M',
    desc: 'Exports the fine-tuned model to GGUF format (Q4_K_M quantization) for use with Ollama.\n\n**~10-15 minutes.** Output: ~5-6 GB file.',
  },
  {
    title: '5b. Save GGUF to Google Drive',
    desc: "Copies GGUF to Google Drive for persistent storage (Colab's `/content/` is ephemeral) and generates an MD5 checksum.\n\n**Record the MD5 checksum** — you'll verify the download later.",
  },
  {
    title: '6. Download GGUF',
    desc: 'Downloads the GGUF file to your local machine.\n\n**Recommended:** Download from [drive.google.com](https://drive.google.com) → My Drive → models/ (more reliable for large files).\n\n**Fallback:** Browser download from Colab (unreliable for 5+ GB files).',
  },
  {
    title: '7. Push to Hugging Face (Optional)',
    desc: 'Pushes LoRA adapters to Hugging Face Hub for reproducibility.\n\n**Prerequisites:**\n1. Create a free account at [huggingface.co](https://huggingface.co)\n2. Create a write-access token at [Settings → Tokens](https://huggingface.co/settings/tokens)',
  },
];

for (let i = 1; i < blocks.length; i++) {
  const code = blocks[i];
  const meta = sectionMeta[i - 1];

  // Add markdown header cell
  if (meta) {
    cells.push(makeMarkdownCell(`## ${meta.title}\n\n${meta.desc}`));
  }

  const lines = code.split('\n');

  // ── Strip trailing section header for the NEXT cell ──
  // Pattern: blank lines + # ====... + # CELL N — ... + # ====... + optional doc comments
  let endIdx = lines.length;
  // Walk backwards from end, skipping blank lines and comment lines
  while (endIdx > 0) {
    const line = lines[endIdx - 1].trim();
    if (line === '' || line.startsWith('#')) {
      endIdx--;
    } else {
      break;
    }
  }
  // Now find where the trailing comment block starts (first # ==== line after last code)
  // We want to keep inline comments that are part of the code, so only strip
  // the block that starts with # ====
  let trailStart = endIdx;
  for (let j = endIdx; j < lines.length; j++) {
    if (lines[j].trim().startsWith('# =====')) {
      trailStart = j;
      break;
    }
  }
  // Keep lines up to just before the trailing # ==== block, but also strip
  // any blank lines between the last code line and the # ==== block
  while (trailStart > 0 && lines[trailStart - 1].trim() === '') trailStart--;

  const cleanCode = lines.slice(0, trailStart || endIdx).join('\n').trim();

  if (cleanCode) {
    cells.push(makeCodeCell(cleanCode));
  }
}

// Add final markdown cell with next steps
cells.push(makeMarkdownCell(
`---

## Next Steps (Local Machine)

After downloading the GGUF file:

\`\`\`bash
# 1. Move GGUF to the project
mv ~/Downloads/qwen3.5-9B-stat-grader-Q4_K_M.gguf fine-tuned-model/

# 2. Verify integrity (compare MD5 with Cell 5b output)
md5sum fine-tuned-model/qwen3.5-9B-stat-grader-Q4_K_M.gguf

# 3. Create Ollama model
cd fine-tuned-model
ollama create qwen3.5-9B-stat-grader -f Modelfile-qwen3.5-9B-stat-grader

# 4. Test
ollama run qwen3.5-9B-stat-grader "test"

# 5. Run benchmark (from project root)
bun run test-data/run-benchmark.js --only=qwen3.5-9B-stat-grader
\`\`\`

The Modelfile is already in \`fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader\`.`));

// ── Assemble notebook ───────────────────────────────────────────────────────

const notebook = {
  nbformat: 4,
  nbformat_minor: 0,
  metadata: {
    colab: {
      provenance: [],
      gpuType: 'A100',
    },
    kernelspec: {
      name: 'python3',
      display_name: 'Python 3',
    },
    language_info: {
      name: 'python',
    },
    accelerator: 'GPU',
  },
  cells,
};

fs.writeFileSync(nbPath, JSON.stringify(notebook, null, 2) + '\n');
console.log(`Generated: ${nbPath}`);
console.log(`  ${cells.length} cells (${cells.filter(c => c.cell_type === 'markdown').length} markdown, ${cells.filter(c => c.cell_type === 'code').length} code)`);
