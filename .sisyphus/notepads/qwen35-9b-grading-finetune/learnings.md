# Learnings — qwen35-9b-grading-finetune

## Inherited from qwen3-fine-tuning notepad

### Key Files
- Benchmark runner: `test-data/run-benchmark.js`
- Colab training script: `test-data/colab_train_qwen35_grader.py` (440 lines)
- Training data (text): `test-data/finetune-grading.jsonl` (283 examples)
- Training data (vision): `test-data/finetune-grading-vision.jsonl` (198 examples, base64 PNGs)
- Validation data: `test-data/finetune-grading-val.jsonl` (46 entries)
- Held-out test rubrics: `test-data/test-biology-rubric.json` (NEVER in training)
- Grading prompt source: `grading-server/grading.js` (CoR v2, lines 97-247)
- Existing Modelfile: `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` (has Windows path — needs relative path)

### Architecture Notes
- Grading server uses prompt-only JSON (no Ollama format:"json" param)
- Temperature 0.2 for all grading providers
- Production models: GLM-5 + Sonnet 4.6 at 96% agreement
- Target local model: qwen3.5-9B-stat-grader (fine-tuned from Qwen3.5-9B base)
- Previous fine-tuning run achieved 92% agreement with Sonnet (52 examples, text-only)
- This run: 481 examples (283 text + 198 vision), fresh from base model

### Colab Script Notes (`test-data/colab_train_qwen35_grader.py`)
- Cell 1: Install — `transformers>=4.51.0` (outdated — Qwen3.5 needs >=5.2.0)
- Cell 2: FastVisionModel, `load_in_16bit=True`, bf16 — CORRECT
- Cell 3: Text JSONL upload (colab_files.upload())
- Cell 3b: Vision JSONL upload (optional, skip with Ctrl+C) — needs to be mandatory
- Cell 4: Training — `num_train_epochs=3` MUST be changed to 2; missing eval_dataset; missing save_total_limit
- Cell 5: GGUF export to `/content/qwen3-math-grader-gguf` — needs rename to stat-grader; needs Drive copy
- Cell 6: Browser download — must add Drive-primary path with md5sum instructions

### Modelfile Issues
- `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` uses Windows absolute path: `FROM C:\Users\shuff\...`
- Must be updated to relative path: `FROM ./Qwen3.5-9B.Q4_K_M.gguf`

## Task 9 learnings

- For the mixed text+vision Colab run, the script should fail fast if `finetune-grading-vision.jsonl` is missing; silent text-only fallback would violate the 481-example training plan.
- Adding `eval_dataset=val_dataset` for a vision-capable SFT run is safer when the validation dataset also carries an `images` column set to `None`, so the trainer sees compatible schema across train/eval.
- The Colab runbook needs explicit persistence guidance: exporting GGUF to `/content/` is not enough unless the script also copies the file to Google Drive before download.
- Embedding MD5 generation directly in the Colab flow gives the user a reliable artifact integrity check after the 5-6 GB GGUF is downloaded locally.
- Ollama Modelfiles for local artifacts should always use relative `FROM ./...` paths so the same file works on Linux, macOS, and Windows.

## Guardrails (CRITICAL)
- NO thinking mode tokens during training or benchmarking (SYSTEM /no_think in Modelfile)
- NO modification to grading.js, providers.js, server.js
- NO biology data in training JSONL
- NO format:"json" in Ollama Modelfile
- NO QLoRA 4-bit for Qwen3.5 (use bf16 LoRA — load_in_16bit=True)
- NO more than 2 training epochs
