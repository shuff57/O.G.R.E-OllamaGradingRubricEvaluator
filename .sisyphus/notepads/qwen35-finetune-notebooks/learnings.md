# Learnings: qwen35-finetune-notebooks

## 2026-03-13 Session Start

### Notebook JSON Structure
- `OGRE_Finetune_Qwen35_9B.ipynb` is 911 lines of standard nbformat 4 JSON
- Cell array key is `cells`, each has `cell_type` ("code" or "markdown"), `metadata`, `source` (array of strings with \n)
- Code cells also have `execution_count` and `outputs`
- Strings within `source` arrays must have escaped JSON: `\\n` for newlines, `\"` for quotes
- DO NOT break the JSON structure — always validate with `python3 -c "import json; json.load(open(...))"` after editing

### Key Cell Locations in 9B Notebook (pre-Task-1)
- Cell 0: Markdown header (pipeline description, Steps 1-11, ollama run commands)
- Cell 1: Install deps (pip install unsloth, transformers>=5.2.0, etc.)
- Cell 2: Load model — contains `_safe_apply_rotary_pos_emb` monkey-patch + `FastVisionModel.from_pretrained`
- Cell 3: Upload text JSONL (finetune-grading.jsonl)
- Cell 3b (index 4): Upload vision JSONL (finetune-grading-vision.jsonl)  
- Cell 4 (index 5): Training with SFTTrainer — `num_train_epochs=1`
- Cell 4b (index 6): Smoke test
- Cell 5 (index 7): GGUF export — `model.save_pretrained_gguf`
- Cell 5b (index 8): Drive backup
- Cell 6 (index 9): Download
- Cell 7 (index 10): HuggingFace push

### Critical Bug Context — CORRECTION (2026-03-13)
- The NOTEBOOK does NOT have a monkey-patch — it workarounds the epoch 2 crash by limiting to 1 epoch
  - Line 443: `num_train_epochs=1,  # 1 epoch — Qwen3.5 rotary bug crashes at epoch 2 boundary`
- The MONKEY-PATCH is only in `colab_train_qwen35_grader.py` (the deprecated .py script)
- The .py script ALREADY installs transformers from git HEAD (correct)
- Fix for the NOTEBOOK = trust the official transformers (via git HEAD install) + set 2 epochs + add packing=False
- Keep: `os.environ["UNSLOTH_COMPILE_DISABLE"] = "1"` — still needed for Triton kernel crash prevention

### Training Config (keep all unchanged except epochs + packing)
- lr=2e-5, lr_scheduler_type="cosine", warmup_ratio=0.1
- per_device_train_batch_size=1, gradient_accumulation_steps=4
- LORA_RANK=16, LORA_ALPHA=16
- adamw_8bit optimizer
- max_seq_length=8192
- packing=False (explicit — prevents NaN gradients per Unsloth #4160)
- num_train_epochs=2 (changed from 1)

### Vision Export Strategy
- `model.save_pretrained_gguf(...)` → strips vision encoder → text-only GGUF for Ollama
- `model.save_pretrained_merged(..., save_method="merged_16bit")` → full model with vision
- Then llama.cpp `convert_hf_to_gguf.py --mmproj` → generates `mmproj-F16.gguf` for llama-server
- Ollama CANNOT load Qwen3.5 vision GGUFs — only llama-server supports separate mmproj
- Use `--no-jinja` with llama-server (prevents tool-calling injection that corrupts grading output)

### MoE API Differences (CRITICAL)
- Loading: Use `FastModel.from_pretrained()` (NOT `FastVisionModel.from_pretrained()`)
- LoRA: Use `FastVisionModel.get_peft_model()` with `target_modules="all-linear"`, `modules_to_save=["lm_head", "embed_tokens"]`
- No 4-bit/QLoRA — bf16 only (per Unsloth docs)
- Needs A100 80GB — assert VRAM ≥ 70GB at cell start
- model_name: `"unsloth/Qwen3.5-35B-A3B"` (unsloth namespace, not Qwen/)

### Known Limitations to Document
- MTP tensors lost on GGUF merge (Unsloth issue #4164) — known bug
- 21GB MoE GGUF exceeds Google Drive 15GB free tier — use HuggingFace Hub as primary backup
- Thinking-on training impossible without 75%+ reasoning-format training data — deferred to future work

### File Paths
- Worktree: `/home/shuff57/Documents/GitHub/O.G.R.E-OllamaGradingRubricEvaluator`
- 9B notebook: `test-data/OGRE_Finetune_Qwen35_9B.ipynb`
- MoE notebook (to create): `test-data/OGRE_Finetune_Qwen35_MoE.ipynb`
- MoE Modelfile (to create): `fine-tuned-model/Modelfile-qwen3.5-35B-A3B-stat-grader`
- .py script to deprecate: `test-data/colab_train_qwen35_grader.py`
- Evidence: `.sisyphus/evidence/`
- Notepad: `.sisyphus/notepads/qwen35-finetune-notebooks/`

## 2026-03-13T17:11:10Z Task 1 Surgical Notebook Fix

- Updated install cell to use `git+https://github.com/huggingface/transformers.git` instead of `transformers>=5.2.0` to pick up Qwen3.5 rotary fix from git HEAD.
- Updated training cell `SFTConfig` to `num_train_epochs=2` with rationale comment tied to rotary fix.
- Added explicit `packing=False` inside `SFTConfig` after `remove_unused_columns=False` to prevent known Qwen3.5 NaN gradient issue (Unsloth #4160).
- Verified notebook JSON validity after each edit and final state (`Cells: 22`).
