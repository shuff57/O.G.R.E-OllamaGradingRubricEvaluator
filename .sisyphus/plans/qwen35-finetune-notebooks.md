# Qwen3.5 Fine-Tuning Notebooks: 9B Fix + MoE Creation + Vision Export

## TL;DR

> **Quick Summary**: Fix the crashing 9B fine-tuning notebook (remove buggy rotary monkey-patch, enable 2-epoch training) and create a new MoE (35B-A3B) notebook — both with dual vision export (GGUF for Ollama text-only + mmproj for llama-server vision).
> 
> **Deliverables**:
> - Fixed `OGRE_Finetune_Qwen35_9B.ipynb` — 2-epoch training without crashes, dual export
> - New `OGRE_Finetune_Qwen35_MoE.ipynb` — MoE fine-tuning with same data + dual export
> - New `Modelfile-qwen3.5-35B-A3B-stat-grader` — Ollama Modelfile for MoE
> - Deprecated `colab_train_qwen35_grader.py` — header comment marking obsolete
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (9B fix) → Task 4 (MoE notebook, uses 9B as template) → Task 7 (final review)

---

## Context

### Original Request
User wants to: (1) fix the existing Qwen3.5-9B Colab notebook that crashes at epoch 2 due to a rotary embedding bug, (2) export the fine-tuned model with vision capabilities, (3) create a new notebook for the Qwen3.5-35B-A3B (MoE) model using the same training data, and (4) understand thinking vs non-thinking modes.

### Interview Summary
**Key Discussions**:
- **Rotary crash**: Root-caused to the monkey-patched `_safe_apply_rotary_pos_emb` — the patch itself IS the bug. Official transformers v5 code handles Qwen3.5 partial RoPE + MRoPE correctly.
- **Vision export**: Ollama cannot load Qwen3.5 vision GGUFs (no mmproj support). Solution: dual export — GGUF Q4_K_M for Ollama (text-only) + LoRA adapter with mmproj-F16.gguf for llama-server (vision).
- **MoE training**: bf16 LoRA only (QLoRA 4-bit not recommended for MoE). Needs A100 80GB. User confirmed Colab Pro with A100.
- **Thinking modes**: User wanted thinking-on and thinking-off variants. Analysis showed current training data is 100% direct-answer format — thinking-on training is impossible without new reasoning-format data (75%+ required). Deferred to future work.

**Research Findings**:
- Unsloth issue #4160: `packing=True` causes NaN gradients for Qwen3.5 → must set `packing=False` explicitly
- Unsloth issue #4164: MTP tensors lost on GGUF merge → known limitation, document it
- Official transformers `modeling_qwen3_5.py`: Uses `rotary_dim = cos.shape[-1]` (correct), not `min(cos.shape[-1], q.shape[-1])` (buggy patch)
- MoE GGUF at Q4_K_M ≈ 21GB → exceeds Google Drive 15GB free tier → need HuggingFace Hub backup
- `--no-jinja` flag needed for llama-server to prevent tool-calling instruction injection

### Metis Review
**Identified Gaps** (addressed):
- **Thinking-on impossibility**: Current data is 100% non-reasoning. Thinking-on variant deferred; notebook includes comment-only TODO section.
- **MoE GGUF size vs Drive quota**: 21GB exceeds 15GB free tier. Plan includes HuggingFace Hub upload as primary backup.
- **MTP tensor loss**: Known Unsloth bug #4164. Documented as limitation in notebook markdown.
- **packing=False requirement**: Explicitly set in both notebooks per issue #4160.
- **llama-server --no-jinja**: Included in post-download usage instructions.
- **Validation split usage**: Both notebooks use separate val JSONL files for eval_loss tracking.

---

## Work Objectives

### Core Objective
Produce two production-ready Colab notebooks that fine-tune Qwen3.5 models (9B dense + 35B-A3B MoE) on the O.G.R.E. grading training data and export artifacts that preserve vision capabilities.

### Concrete Deliverables
- `test-data/OGRE_Finetune_Qwen35_9B.ipynb` — Fixed: 2 epochs, no rotary crash, dual export cells
- `test-data/OGRE_Finetune_Qwen35_MoE.ipynb` — New: MoE fine-tuning + dual export
- `fine-tuned-model/Modelfile-qwen3.5-35B-A3B-stat-grader` — Ollama Modelfile for MoE text-only GGUF
- `test-data/colab_train_qwen35_grader.py` — Deprecated with header comment

### Definition of Done
- [ ] 9B notebook cells are syntactically valid Python (no monkey-patch, `num_train_epochs=2`, `packing=False`)
- [ ] 9B notebook has dual export cells: GGUF Q4_K_M + llama.cpp mmproj build + download
- [ ] MoE notebook loads `unsloth/Qwen3.5-35B-A3B` with bf16 LoRA (no 4-bit)
- [ ] MoE notebook asserts A100 80GB VRAM before training
- [ ] MoE notebook has same dual export pipeline as 9B
- [ ] MoE Modelfile references correct GGUF filename and system prompt
- [ ] `.py` script has deprecation header pointing to notebook
- [ ] All notebooks include post-download llama-server usage instructions with `--no-jinja`

### Must Have
- Rotary monkey-patch completely removed from 9B notebook
- `transformers` installed from git HEAD (not pip release)
- `packing=False` explicit in both notebooks
- `UNSLOTH_COMPILE_DISABLE=1` environment variable in both notebooks
- `enable_thinking=False` in all inference/export cells
- Dual export: GGUF (Ollama text-only) + mmproj (llama-server vision)
- A100 80GB VRAM assertion in MoE notebook
- HuggingFace Hub upload cell for MoE (21GB exceeds Drive)
- Validation dataset loaded for eval_loss tracking

### Must NOT Have (Guardrails)
- No monkey-patching of transformers internals (the root cause of the epoch 2 crash)
- No QLoRA/4-bit quantization for MoE (per Unsloth docs: "not recommended")
- No `packing=True` (causes NaN gradients per issue #4160)
- No `--jinja` flag in llama-server instructions (corrupts grading output)
- No thinking-on training variant (impossible without reasoning-format data; comment-only TODO is acceptable)
- No changes to training data files or `build-training.cjs`
- No changes to the desktop app, extension, or grading server code
- No router-layer fine-tuning for MoE (stability risk)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> These are Colab notebooks — verification is structural (cell content validation), not runtime execution.

### Test Decision
- **Infrastructure exists**: NO (Colab notebooks, not a testable codebase)
- **Automated tests**: None — notebooks are verified by structural inspection
- **Framework**: N/A

### QA Policy
Every task includes agent-executed QA scenarios. Since we can't run Colab cells locally, QA focuses on:
- **Structural validation**: Cell content matches spec, correct Python syntax, no forbidden patterns
- **Pattern matching**: grep/ast_grep for forbidden constructs (monkey-patch, packing=True, 4-bit, etc.)
- **Cross-reference**: File paths, model names, hyperparameters match across notebook and Modelfile
- Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent fixes):
├── Task 1: Fix 9B notebook — remove monkey-patch, 2 epochs, packing=False [deep]
├── Task 2: Create MoE Modelfile [quick]
└── Task 3: Deprecate .py script [quick]

Wave 2 (After Task 1 — depends on fixed 9B as template):
├── Task 4: Add dual export cells to 9B notebook [deep]
├── Task 5: Create MoE notebook (uses 9B as template + Task 4 export cells) [deep]

Wave 3 (After ALL — verification):
├── Task 6: Cross-notebook consistency check [unspecified-high]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 4 → Task 5 → Task 6 → F1-F4
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4, 5 | 1 |
| 2 | — | 5, 6 | 1 |
| 3 | — | — | 1 |
| 4 | 1 | 5, 6 | 2 |
| 5 | 1, 2, 4 | 6 | 2 |
| 6 | 1-5 | F1-F4 | 3 |
| F1-F4 | 6 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3 agents** — T1 → `deep`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **2 agents** — T4 → `deep`, T5 → `deep`
- **Wave 3**: **1 agent** — T6 → `unspecified-high`
- **FINAL**: **4 agents** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix 9B Notebook — Remove Rotary Monkey-Patch + Enable 2-Epoch Training

  **What to do**:
  - **Cell 1 (Install deps)**: Change `pip install transformers>=5.2.0` to `pip install git+https://github.com/huggingface/transformers.git@main`. This gets the latest Qwen3.5 rotary fixes from HEAD. Keep all other installs the same.
  - **Cell 2 (Load model + monkey-patch)**: DELETE the entire `_safe_apply_rotary_pos_emb` function definition AND the `transformers.models.qwen3_5.modeling_qwen3_5.apply_rotary_pos_emb = _safe_apply_rotary_pos_emb` monkey-patch line. Keep the `os.environ["UNSLOTH_COMPILE_DISABLE"] = "1"` line. Keep all model loading code unchanged.
  - **Cell 4 (Training)**: Change `num_train_epochs=1` to `num_train_epochs=2`. Add `packing=False` explicitly to `SFTTrainer` kwargs (prevents NaN gradients per Unsloth issue #4160). Keep all other hyperparameters unchanged (lr=2e-5, cosine, warmup 10%, batch=1, grad_accum=4, adamw_8bit).
  - **Header markdown cell**: Update the "Steps" list to reflect new dual-export cells (will be added in Task 4). Update "1 epoch" references to "2 epochs" in any markdown.
  - **Crash recovery note**: Keep existing checkpoint/Drive recovery logic unchanged.

  **Must NOT do**:
  - Do NOT add any new monkey-patches or transformers overrides
  - Do NOT change LoRA config (rank 16, alpha 16, target modules)
  - Do NOT change training data loading cells (3, 3b)
  - Do NOT change the smoke test cell (4b)
  - Do NOT touch packing=True anywhere — only set packing=False

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful surgical edits to a large Jupyter notebook JSON file without breaking cell structure. Must understand the rotary embedding bug context.
  - **Skills**: []
    - No specialized skills needed — this is Python code editing within a .ipynb JSON structure
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser automation
    - `frontend-design`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `test-data/OGRE_Finetune_Qwen35_9B.ipynb` — The ENTIRE notebook. This is the file to edit. 911 lines of JSON.
  - `test-data/OGRE_Finetune_Qwen35_9B.ipynb` Cell 1 (first code cell after markdown) — Install dependencies. Find the `pip install` line with `transformers` and change version specifier to git+https URL.
  - `test-data/OGRE_Finetune_Qwen35_9B.ipynb` Cell 2 — Contains the `_safe_apply_rotary_pos_emb` function (~40 lines) and the monkey-patch assignment. Delete both. The function starts with `def _safe_apply_rotary_pos_emb(q, k, cos, sin` and the assignment is `transformers.models.qwen3_5.modeling_qwen3_5.apply_rotary_pos_emb = _safe_apply_rotary_pos_emb`.
  - `test-data/OGRE_Finetune_Qwen35_9B.ipynb` Cell 4 — Training cell with `SFTTrainer(...)`. Find `num_train_epochs=1` and change to `2`. Add `packing=False,` as a kwarg.

  **External References**:
  - Official `modeling_qwen3_5.py` (transformers main): `https://github.com/huggingface/transformers/blob/main/src/transformers/models/qwen3_5/modeling_qwen3_5.py` — Shows the CORRECT `apply_rotary_pos_emb` with `rotary_dim = cos.shape[-1]`
  - Unsloth issue #4160: `https://github.com/unslothai/unsloth/issues/4160` — Confirms packing=True causes NaN gradients for Qwen3.5

  **WHY Each Reference Matters**:
  - The notebook is a JSON file — edits must preserve valid JSON structure (escaped newlines, proper quoting)
  - The monkey-patch function is the ONLY thing to delete in Cell 2 — all model loading code stays
  - The official transformers source proves the monkey-patch is unnecessary
  - Issue #4160 justifies the packing=False addition

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Monkey-patch completely removed
    Tool: Bash (grep)
    Preconditions: Task 1 edits complete
    Steps:
      1. Run: grep -c "safe_apply_rotary" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      2. Assert output is exactly "0"
      3. Run: grep -c "monkey" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      4. Assert output is "0" (no monkey-patch references remain)
    Expected Result: Zero occurrences of the monkey-patch function or assignment
    Failure Indicators: Any non-zero count means patch remnants exist
    Evidence: .sisyphus/evidence/task-1-monkey-patch-removed.txt

  Scenario: 2-epoch training configured
    Tool: Bash (grep)
    Preconditions: Task 1 edits complete
    Steps:
      1. Run: grep "num_train_epochs" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      2. Assert the matched line contains "2" (not "1")
      3. Run: grep "packing" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      4. Assert a line contains "packing=False" or "packing.*False"
    Expected Result: num_train_epochs=2 and packing=False both present
    Failure Indicators: epochs still 1, or packing not explicitly set to False
    Evidence: .sisyphus/evidence/task-1-epoch-config.txt

  Scenario: Transformers installed from git HEAD
    Tool: Bash (grep)
    Preconditions: Task 1 edits complete
    Steps:
      1. Run: grep "transformers" test-data/OGRE_Finetune_Qwen35_9B.ipynb | head -5
      2. Assert at least one line contains "git+https://github.com/huggingface/transformers"
      3. Assert NO line contains "transformers>=5.2.0" or "transformers==5"
    Expected Result: transformers installed from git, not pip version
    Failure Indicators: pip version specifier still present
    Evidence: .sisyphus/evidence/task-1-transformers-source.txt

  Scenario: Notebook is valid JSON
    Tool: Bash (python3)
    Preconditions: Task 1 edits complete
    Steps:
      1. Run: python3 -c "import json; nb = json.load(open('test-data/OGRE_Finetune_Qwen35_9B.ipynb')); print(f'Cells: {len(nb[\"cells\"])}')"
      2. Assert command exits 0 and prints cell count
    Expected Result: Valid JSON, parseable as notebook
    Failure Indicators: JSONDecodeError or missing 'cells' key
    Evidence: .sisyphus/evidence/task-1-valid-json.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-monkey-patch-removed.txt
  - [ ] task-1-epoch-config.txt
  - [ ] task-1-transformers-source.txt
  - [ ] task-1-valid-json.txt

  **Commit**: YES (groups with Tasks 2, 3 in Commit 1)
  - Message: `fix(finetune): remove rotary monkey-patch, enable 2-epoch training`
  - Files: `test-data/OGRE_Finetune_Qwen35_9B.ipynb`
  - Pre-commit: `python3 -c "import json; json.load(open('test-data/OGRE_Finetune_Qwen35_9B.ipynb'))"`

- [x] 2. Create MoE Modelfile

  **What to do**:
  - Create `fine-tuned-model/Modelfile-qwen3.5-35B-A3B-stat-grader` modeled on the existing 9B Modelfile
  - `FROM ./qwen3.5-35B-A3B-stat-grader-Q4_K_M.gguf`
  - Same system prompt / parameters as 9B Modelfile but update the header comments:
    - "Fine-tuned from Qwen3.5-35B-A3B (MoE, 3B active per token)"
    - "35B total / 3B active — 256 experts, 9 active per token"
    - "Expected ~16+ tok/s on Ryzen 9 AI HX370 (3B active vs 9B dense)"
    - "GGUF size: ~21 GB (Q4_K_M)"
    - "NOTE: This GGUF is text-only. For vision, use llama-server with --mmproj flag."
  - Same parameters: temperature 0.2, top_p 0.95, top_k 20, presence_penalty 1.5, num_ctx 8192, num_gpu 99
  - Same stop tokens: `<|im_end|>`, `<|endoftext|>`, `<|im_start|>`
  - Same `SYSTEM /no_think` and renderer/parser directives

  **Must NOT do**:
  - Do NOT change the parameter values (copy exactly from 9B)
  - Do NOT add vision-related instructions to the Modelfile (Ollama can't handle mmproj)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation, simple template adaptation from existing Modelfile
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - All: Simple text file creation, no specialized domain

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` — TEMPLATE: Copy structure, adapt header comments and FROM path. This is 30 lines total.

  **WHY Each Reference Matters**:
  - The 9B Modelfile is the canonical template — same parameters, same stop tokens, same system prompt. Only the header comments and FROM path change.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Modelfile has correct FROM path
    Tool: Bash (grep)
    Preconditions: Task 2 complete
    Steps:
      1. Run: grep "^FROM" fine-tuned-model/Modelfile-qwen3.5-35B-A3B-stat-grader
      2. Assert output is exactly: FROM ./qwen3.5-35B-A3B-stat-grader-Q4_K_M.gguf
    Expected Result: FROM references correct MoE GGUF filename
    Failure Indicators: Wrong filename, missing FROM, or referencing 9B GGUF
    Evidence: .sisyphus/evidence/task-2-modelfile-from.txt

  Scenario: Parameters match 9B Modelfile
    Tool: Bash (diff)
    Preconditions: Task 2 complete
    Steps:
      1. Run: grep "^PARAMETER" fine-tuned-model/Modelfile-qwen3.5-35B-A3B-stat-grader | sort
      2. Run: grep "^PARAMETER" fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader | sort
      3. Compare outputs — they should be identical
    Expected Result: All PARAMETER lines are identical between 9B and MoE Modelfiles
    Failure Indicators: Any parameter mismatch
    Evidence: .sisyphus/evidence/task-2-params-match.txt

  Scenario: MoE-specific comments present
    Tool: Bash (grep)
    Preconditions: Task 2 complete
    Steps:
      1. Run: grep -i "moe\|3B active\|256 experts\|text-only\|21 GB" fine-tuned-model/Modelfile-qwen3.5-35B-A3B-stat-grader
      2. Assert at least 3 of these terms appear in comments
    Expected Result: Header comments describe MoE architecture specifics
    Failure Indicators: Generic 9B comments copied without adaptation
    Evidence: .sisyphus/evidence/task-2-moe-comments.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-modelfile-from.txt
  - [ ] task-2-params-match.txt
  - [ ] task-2-moe-comments.txt

  **Commit**: YES (groups with Tasks 1, 3 in Commit 1)
  - Message: `fix(finetune): remove rotary monkey-patch, enable 2-epoch training`
  - Files: `fine-tuned-model/Modelfile-qwen3.5-35B-A3B-stat-grader`
  - Pre-commit: `test -f fine-tuned-model/Modelfile-qwen3.5-35B-A3B-stat-grader`

- [x] 3. Deprecate Python Script

  **What to do**:
  - Open `test-data/colab_train_qwen35_grader.py` and add a deprecation header at the very top (before existing imports):
    ```python
    # ============================================================
    # DEPRECATED — Use OGRE_Finetune_Qwen35_9B.ipynb instead.
    #
    # This script contains a buggy rotary embedding monkey-patch
    # that crashes at epoch 2. The notebook version has the fix.
    # Kept for historical reference only.
    # ============================================================
    ```
  - Do NOT change any other code in the file

  **Must NOT do**:
  - Do NOT delete the file
  - Do NOT modify any code below the deprecation header
  - Do NOT fix the monkey-patch in this file (it's deprecated, not maintained)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single prepend operation on one file
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - All: Trivially simple file edit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `test-data/colab_train_qwen35_grader.py:1-10` — Current file header. Insert deprecation BEFORE line 1.

  **WHY Each Reference Matters**:
  - Need to know what's currently at the top of the file to insert before it without duplicating content.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Deprecation header present
    Tool: Bash (head)
    Preconditions: Task 3 complete
    Steps:
      1. Run: head -8 test-data/colab_train_qwen35_grader.py
      2. Assert output contains "DEPRECATED" and "OGRE_Finetune_Qwen35_9B.ipynb"
    Expected Result: First 8 lines contain deprecation notice pointing to notebook
    Failure Indicators: No deprecation header, or points to wrong file
    Evidence: .sisyphus/evidence/task-3-deprecation-header.txt

  Scenario: Rest of file unchanged
    Tool: Bash (wc)
    Preconditions: Task 3 complete, note original line count before edit
    Steps:
      1. Run: wc -l test-data/colab_train_qwen35_grader.py
      2. Assert line count is original (707) + deprecation header lines (~7-8) = ~714-715
    Expected Result: File grew by exactly the deprecation header size
    Failure Indicators: Line count differs significantly from expected
    Evidence: .sisyphus/evidence/task-3-file-unchanged.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-deprecation-header.txt
  - [ ] task-3-file-unchanged.txt

  **Commit**: YES (groups with Tasks 1, 2 in Commit 1)
  - Message: `fix(finetune): remove rotary monkey-patch, enable 2-epoch training`
  - Files: `test-data/colab_train_qwen35_grader.py`
  - Pre-commit: `head -3 test-data/colab_train_qwen35_grader.py | grep -q DEPRECATED`

- [x] 4. Add Dual Vision Export Cells to 9B Notebook

  **What to do**:
  - **Replace existing Cell 5** (GGUF-only export) with a new dual-export cell sequence:
  
  - **New Cell 5 — Export GGUF Q4_K_M (text-only for Ollama)**:
    Keep existing `model.save_pretrained_gguf(...)` call with `quantization_method="q4_k_m"`. This produces the text-only GGUF that works with Ollama. Add a markdown note: "This GGUF is text-only. Vision requires the mmproj file from Cell 5b."
  
  - **New Cell 5a — Save merged 16-bit model for mmproj extraction**:
    ```python
    # Save full merged model in 16-bit for llama.cpp vision extraction
    model.save_pretrained_merged("qwen35-9b-grader-merged-f16", tokenizer, save_method="merged_16bit")
    ```
  
  - **New Cell 5b — Build llama.cpp and extract mmproj**:
    ```python
    import subprocess
    # Clone and build llama.cpp
    subprocess.run(["git", "clone", "--depth=1", "https://github.com/ggerganov/llama.cpp"], check=True)
    subprocess.run(["cmake", "-B", "llama.cpp/build", "-S", "llama.cpp", "-DCMAKE_BUILD_TYPE=Release"], check=True)
    subprocess.run(["cmake", "--build", "llama.cpp/build", "--config", "Release", "-j"], check=True)
    # Convert merged model → GGUF with mmproj
    subprocess.run([
        "python3", "llama.cpp/convert_hf_to_gguf.py",
        "qwen35-9b-grader-merged-f16",
        "--outfile", "qwen3.5-9B-stat-grader-mmproj-F16.gguf",
        "--mmproj"
    ], check=True)
    print("✓ mmproj-F16.gguf created for vision inference with llama-server")
    ```
  
  - **Update Cell 5c (was 5b) — Drive backup**: Copy BOTH the Q4_K_M GGUF AND the mmproj GGUF to Google Drive. Update filenames.
  
  - **Update Cell 6 — Download**: Download BOTH files. Add markdown cell after with llama-server usage instructions:
    ```markdown
    ## Using with llama-server (Vision)
    
    ```bash
    # Text-only (Ollama):
    ollama create qwen3.5-9B-stat-grader -f Modelfile-qwen3.5-9B-stat-grader
    
    # Vision (llama-server):
    llama-server \
      --model qwen3.5-9B-stat-grader-Q4_K_M.gguf \
      --mmproj qwen3.5-9B-stat-grader-mmproj-F16.gguf \
      --no-jinja \
      --port 8080
    ```
    
    **IMPORTANT**: Use `--no-jinja` to prevent tool-calling instruction injection that corrupts grading output.
    ```
  
  - **Keep Cell 7 (HuggingFace push) unchanged** — it already works for single GGUF, optionally note that mmproj can be pushed too.

  **Must NOT do**:
  - Do NOT remove the existing GGUF export (Ollama still needs it)
  - Do NOT use `--jinja` in any llama-server instructions
  - Do NOT modify training cells (1-4b)
  - Do NOT modify the smoke test cell (4b)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex multi-cell insertion into Jupyter notebook JSON, requires understanding of llama.cpp build process and GGUF conversion pipeline. Must maintain JSON validity.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser work
    - `frontend-design`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: NO (must wait for Task 1 — edits same notebook)
  - **Parallel Group**: Wave 2 (with Task 5, but Task 5 depends on Task 4's export cells)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `test-data/OGRE_Finetune_Qwen35_9B.ipynb` Cell 5 — Current GGUF export cell. Keep this logic, add new cells after it.
  - `test-data/OGRE_Finetune_Qwen35_9B.ipynb` Cell 5b — Current Drive backup cell. Adapt to copy both GGUFs.
  - `test-data/OGRE_Finetune_Qwen35_9B.ipynb` Cell 6 — Current download cell. Adapt to download both files.
  - `test-data/OGRE_Finetune_Qwen35_9B.ipynb` Cell 7 — HF push cell. Optionally add mmproj upload.

  **API/Type References**:
  - Unsloth `save_pretrained_merged()` API: `save_method="merged_16bit"` saves full merged model (base + LoRA) in float16
  - llama.cpp `convert_hf_to_gguf.py` with `--mmproj` flag: extracts vision projector as separate GGUF file

  **External References**:
  - Unsloth export docs: `https://unsloth.ai/docs/models/qwen3.5` — Shows `save_pretrained_merged` + `save_pretrained_gguf` patterns
  - llama.cpp repo: `https://github.com/ggerganov/llama.cpp` — For convert_hf_to_gguf.py usage
  - Unsloth issue #4164: `https://github.com/unslothai/unsloth/issues/4164` — MTP tensor loss on GGUF merge (known limitation, document it)

  **WHY Each Reference Matters**:
  - Cell 5 is the anchor point — new cells insert after it
  - The save_pretrained_merged step is required because save_pretrained_gguf strips vision encoder
  - convert_hf_to_gguf.py with --mmproj is the ONLY way to get the vision projector as a separate GGUF
  - Issue #4164 means MTP tensors are lost — need to document this as known limitation

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dual export cells present
    Tool: Bash (grep)
    Preconditions: Task 4 edits complete
    Steps:
      1. Run: grep -c "save_pretrained_gguf" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      2. Assert count >= 1 (GGUF export for Ollama)
      3. Run: grep -c "save_pretrained_merged" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      4. Assert count >= 1 (merged 16-bit for mmproj extraction)
      5. Run: grep -c "mmproj" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      6. Assert count >= 3 (in convert command, filename, and usage instructions)
    Expected Result: Both GGUF and mmproj export paths exist in notebook
    Failure Indicators: Missing merged save or mmproj references
    Evidence: .sisyphus/evidence/task-4-dual-export.txt

  Scenario: llama.cpp build cell present
    Tool: Bash (grep)
    Preconditions: Task 4 edits complete
    Steps:
      1. Run: grep -c "llama.cpp" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      2. Assert count >= 3 (clone, build, convert commands)
      3. Run: grep -c "convert_hf_to_gguf" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      4. Assert count >= 1
    Expected Result: llama.cpp clone, build, and convert steps present
    Failure Indicators: Missing build steps or convert script reference
    Evidence: .sisyphus/evidence/task-4-llamacpp-build.txt

  Scenario: --no-jinja in llama-server instructions
    Tool: Bash (grep)
    Preconditions: Task 4 edits complete
    Steps:
      1. Run: grep "no-jinja\|no_jinja" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      2. Assert at least one match
      3. Run: grep -c "jinja" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      4. All "jinja" occurrences should be "no-jinja" (not standalone --jinja)
    Expected Result: --no-jinja flag present in usage instructions
    Failure Indicators: Missing --no-jinja, or bare --jinja present
    Evidence: .sisyphus/evidence/task-4-no-jinja.txt

  Scenario: Notebook still valid JSON after insertions
    Tool: Bash (python3)
    Preconditions: Task 4 edits complete
    Steps:
      1. Run: python3 -c "import json; nb = json.load(open('test-data/OGRE_Finetune_Qwen35_9B.ipynb')); print(f'Cells: {len(nb[\"cells\"])}')"
      2. Assert exits 0 and cell count is higher than before Task 4 (should be ~14-16 vs original ~12)
    Expected Result: Valid JSON with more cells than before
    Failure Indicators: JSONDecodeError or same/fewer cell count
    Evidence: .sisyphus/evidence/task-4-valid-json.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-dual-export.txt
  - [ ] task-4-llamacpp-build.txt
  - [ ] task-4-no-jinja.txt
  - [ ] task-4-valid-json.txt

  **Commit**: YES (Commit 2)
  - Message: `feat(finetune): add dual vision export + MoE notebook`
  - Files: `test-data/OGRE_Finetune_Qwen35_9B.ipynb`
  - Pre-commit: `python3 -c "import json; json.load(open('test-data/OGRE_Finetune_Qwen35_9B.ipynb'))"`

- [x] 5. Create MoE Notebook

  **What to do**:
  - Create `test-data/OGRE_Finetune_Qwen35_MoE.ipynb` by adapting the FIXED 9B notebook (after Tasks 1 + 4)
  - **Changes from 9B to MoE** (everything else stays the same):

  - **Header markdown**: Update title to "Qwen3.5-35B-A3B (MoE) Statistics Grader". Update description:
    - "35B total parameters, 3B active per token (256 experts, 9 active)"
    - "~1.65x faster than 9B dense on same hardware"
    - "**Requires:** A100 80GB GPU (Colab Pro). Will NOT fit on L4 or T4."
    - "GGUF size: ~21 GB (Q4_K_M) — too large for Google Drive free tier, use HuggingFace Hub"

  - **Cell 1 (Install)**: Same as 9B — transformers from git HEAD, unsloth, etc.

  - **Cell 2 (Load model)**:
    - Change model name: `"unsloth/Qwen3.5-35B-A3B"` (NOT `Qwen/Qwen3.5-35B-A3B`)
    - Add VRAM assertion at top of cell:
      ```python
      import torch
      vram_gb = torch.cuda.get_device_properties(0).total_mem / 1e9
      assert vram_gb >= 70, f"MoE needs A100 80GB, got {vram_gb:.0f}GB. Switch runtime to A100."
      ```
    - Use `FastModel.from_pretrained()` (NOT `FastVisionModel.from_pretrained()` — FastModel handles MoE loading, FastVisionModel handles LoRA targeting). Load in bf16 only — NO 4-bit quantization option:
      ```python
      model, tokenizer = FastModel.from_pretrained(
          model_name="unsloth/Qwen3.5-35B-A3B",
          max_seq_length=MAX_SEQ_LENGTH,
          load_in_4bit=False,  # QLoRA NOT recommended for MoE
          dtype=torch.bfloat16,
      )
      ```
    - Apply LoRA via `FastVisionModel.get_peft_model()`:
      ```python
      model = FastVisionModel.get_peft_model(
          model,
          r=LORA_RANK,
          lora_alpha=LORA_ALPHA,
          target_modules="all-linear",
          modules_to_save=["lm_head", "embed_tokens"],
      )
      ```
    - Remove the 4-bit L4 fallback logic entirely (not applicable for MoE)
    - Keep `UNSLOTH_COMPILE_DISABLE=1`

  - **Cells 3, 3b (Data upload)**: Identical to 9B — same JSONL files, same format
  
  - **Cell 4 (Training)**: Same hyperparameters as 9B (`num_train_epochs=2`, `packing=False`, lr=2e-5, etc.)
  
  - **Cell 4b (Smoke test)**: Same structure, updated model name in output messages

  - **Cells 5, 5a, 5b (Dual export)**: Same as 9B but update filenames:
    - GGUF: `qwen3.5-35B-A3B-stat-grader-Q4_K_M.gguf`
    - Merged: `qwen35-35b-a3b-grader-merged-f16`
    - mmproj: `qwen3.5-35B-A3B-stat-grader-mmproj-F16.gguf`

  - **Cell 5c (Drive backup)**: Add warning that 21GB may exceed Drive quota. Make this cell optional with a markdown note. Primary backup is HuggingFace Hub (Cell 7).

  - **Cell 6 (Download)**: Same as 9B but with MoE filenames. Update llama-server instructions with MoE filenames.

  - **Cell 7 (HuggingFace Hub)**: Same as 9B but EMPHASIZE this is the PRIMARY backup method for MoE due to 21GB size.

  - **Add Cell 8 (Thinking Mode TODO)**: A markdown cell at the end:
    ```markdown
    ## TODO: Thinking-On Variant (Future Work)
    
    Current training data is 100% direct-answer format (no `<think>` blocks).
    To train a thinking-enabled variant:
    1. Create reasoning-format training examples (75%+ must include `<think>` blocks)
    2. Set `enable_thinking=True` during training
    3. Adjust temperature: thinking=0.6, top_p=0.95, top_k=20, min_p=0
    4. Export separately — thinking and non-thinking models have different optimal parameters
    
    See Unsloth docs: https://unsloth.ai/docs/models/qwen3.5
    ```

  **Must NOT do**:
  - Do NOT use `load_in_4bit=True` or any 4-bit quantization
  - Do NOT include router-layer fine-tuning (stability risk for MoE)
  - Do NOT include a functional thinking-on training section (only the TODO comment)
  - Do NOT change the training data format or files
  - Do NOT use `FastVisionModel.from_pretrained()` for loading (use `FastModel`)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Creating a complete Jupyter notebook JSON file with many cells, adapting from 9B template. Requires understanding of MoE-specific API differences and correct file structure.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser work
    - `frontend-design`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 1 and 4 — needs the fixed 9B notebook with dual export as template)
  - **Parallel Group**: Wave 2 (after Task 4 completes)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 4

  **References**:

  **Pattern References**:
  - `test-data/OGRE_Finetune_Qwen35_9B.ipynb` — PRIMARY TEMPLATE: Copy entire notebook, then apply MoE-specific changes listed above. After Tasks 1 + 4, this notebook will have the correct structure.
  - `fine-tuned-model/Modelfile-qwen3.5-35B-A3B-stat-grader` — (Created in Task 2) Use GGUF filename from this Modelfile for consistency.
  - `fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader` — Reference for understanding parameter structure.

  **API/Type References**:
  - `FastModel.from_pretrained()` — MoE loading API (different from `FastVisionModel.from_pretrained()`)
  - `FastVisionModel.get_peft_model()` — LoRA application API with `target_modules="all-linear"` and `modules_to_save=["lm_head", "embed_tokens"]`

  **External References**:
  - Unsloth Qwen3.5 MoE fine-tune docs: `https://unsloth.ai/docs/models/qwen3.5/fine-tune` — Confirms bf16-only, FastModel loading, FastVisionModel for LoRA
  - Unsloth official MoE Colab: `https://colab.research.google.com/github/unslothai/notebooks/blob/main/nb/Qwen3_5_MoE.ipynb` — Reference implementation
  - Unsloth Qwen3.5 inference docs: `https://unsloth.ai/docs/models/qwen3.5` — Thinking mode parameters and export patterns

  **WHY Each Reference Matters**:
  - The fixed 9B notebook IS the template — copy it, then make targeted MoE changes
  - FastModel vs FastVisionModel distinction is CRITICAL — wrong loader = crash
  - The official MoE Colab shows the exact API pattern Unsloth expects
  - The Modelfile created in Task 2 must have matching filenames

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: MoE model name correct
    Tool: Bash (grep)
    Preconditions: Task 5 complete
    Steps:
      1. Run: grep "Qwen3.5-35B-A3B" test-data/OGRE_Finetune_Qwen35_MoE.ipynb
      2. Assert at least 3 matches (model loading, export, header)
      3. Run: grep "unsloth/Qwen3.5-35B-A3B" test-data/OGRE_Finetune_Qwen35_MoE.ipynb
      4. Assert at least 1 match (model loading line)
    Expected Result: Correct model name used throughout
    Failure Indicators: 9B model name present, or wrong MoE model name
    Evidence: .sisyphus/evidence/task-5-model-name.txt

  Scenario: No 4-bit quantization
    Tool: Bash (grep)
    Preconditions: Task 5 complete
    Steps:
      1. Run: grep -i "4bit\|4_bit\|load_in_4bit.*True\|bnb_4bit" test-data/OGRE_Finetune_Qwen35_MoE.ipynb
      2. Assert NO matches for load_in_4bit=True or bnb_4bit configurations
      3. Acceptable: `load_in_4bit=False` (explicitly disabled) or comments explaining why 4-bit is not used
    Expected Result: No 4-bit quantization enabled anywhere
    Failure Indicators: load_in_4bit=True or BitsAndBytes 4-bit config present
    Evidence: .sisyphus/evidence/task-5-no-4bit.txt

  Scenario: A100 VRAM assertion present
    Tool: Bash (grep)
    Preconditions: Task 5 complete
    Steps:
      1. Run: grep -i "assert.*vram\|assert.*mem\|A100" test-data/OGRE_Finetune_Qwen35_MoE.ipynb
      2. Assert at least 1 match for VRAM assertion and at least 1 for A100 mention
    Expected Result: Runtime VRAM check that prevents running on inadequate GPUs
    Failure Indicators: No VRAM assertion, or assertion threshold too low (<70GB)
    Evidence: .sisyphus/evidence/task-5-vram-assert.txt

  Scenario: FastModel used for loading (not FastVisionModel)
    Tool: Bash (grep)
    Preconditions: Task 5 complete
    Steps:
      1. Run: grep "FastModel.from_pretrained\|FastModel\.from" test-data/OGRE_Finetune_Qwen35_MoE.ipynb
      2. Assert at least 1 match (model loading uses FastModel)
      3. Run: grep "FastVisionModel.from_pretrained" test-data/OGRE_Finetune_Qwen35_MoE.ipynb
      4. Assert 0 matches (FastVisionModel should NOT be used for loading MoE)
      5. Run: grep "FastVisionModel.get_peft_model" test-data/OGRE_Finetune_Qwen35_MoE.ipynb
      6. Assert at least 1 match (FastVisionModel IS used for LoRA application)
    Expected Result: FastModel for loading, FastVisionModel for LoRA only
    Failure Indicators: FastVisionModel used for from_pretrained, or FastModel used for get_peft_model
    Evidence: .sisyphus/evidence/task-5-loader-api.txt

  Scenario: Dual export present with MoE filenames
    Tool: Bash (grep)
    Preconditions: Task 5 complete
    Steps:
      1. Run: grep "save_pretrained_gguf\|save_pretrained_merged" test-data/OGRE_Finetune_Qwen35_MoE.ipynb
      2. Assert both patterns present
      3. Run: grep "35B-A3B" test-data/OGRE_Finetune_Qwen35_MoE.ipynb | grep -i "gguf\|mmproj"
      4. Assert MoE-specific filenames used (not 9B filenames)
    Expected Result: Dual export with correct MoE GGUF filenames
    Failure Indicators: 9B filenames used, or missing mmproj export
    Evidence: .sisyphus/evidence/task-5-moe-export.txt

  Scenario: Thinking-on TODO present (comment only)
    Tool: Bash (grep)
    Preconditions: Task 5 complete
    Steps:
      1. Run: grep -i "thinking.*todo\|future work\|enable_thinking.*True" test-data/OGRE_Finetune_Qwen35_MoE.ipynb
      2. Assert at least 1 match for TODO/future work reference
      3. Run: grep "enable_thinking.*True" test-data/OGRE_Finetune_Qwen35_MoE.ipynb
      4. If present, assert it's within a comment/markdown cell (not executable code)
    Expected Result: Thinking-on documented as future work, not active training code
    Failure Indicators: Active thinking-on training code, or no TODO reference at all
    Evidence: .sisyphus/evidence/task-5-thinking-todo.txt

  Scenario: Notebook is valid JSON
    Tool: Bash (python3)
    Preconditions: Task 5 complete
    Steps:
      1. Run: python3 -c "import json; nb = json.load(open('test-data/OGRE_Finetune_Qwen35_MoE.ipynb')); print(f'Cells: {len(nb[\"cells\"])}, nbformat: {nb[\"nbformat\"]}')"
      2. Assert exits 0, cell count >= 12, nbformat == 4
    Expected Result: Valid Jupyter notebook JSON with expected cell count
    Failure Indicators: JSONDecodeError or too few cells
    Evidence: .sisyphus/evidence/task-5-valid-json.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-model-name.txt
  - [ ] task-5-no-4bit.txt
  - [ ] task-5-vram-assert.txt
  - [ ] task-5-loader-api.txt
  - [ ] task-5-moe-export.txt
  - [ ] task-5-thinking-todo.txt
  - [ ] task-5-valid-json.txt

  **Commit**: YES (Commit 2)
  - Message: `feat(finetune): add dual vision export + MoE notebook`
  - Files: `test-data/OGRE_Finetune_Qwen35_MoE.ipynb`
  - Pre-commit: `python3 -c "import json; json.load(open('test-data/OGRE_Finetune_Qwen35_MoE.ipynb'))"`

- [ ] 6. Cross-Notebook Consistency Check

  **What to do**:
  - Verify consistency between the two notebooks and the MoE Modelfile:
  
  - **Hyperparameters**: Both notebooks must use identical training hyperparameters:
    - `num_train_epochs=2`, `learning_rate=2e-5`, `lr_scheduler_type="cosine"`, `warmup_ratio=0.1`
    - `per_device_train_batch_size=1`, `gradient_accumulation_steps=4`
    - `packing=False`, `max_seq_length=8192`
    - `LORA_RANK=16`, `LORA_ALPHA=16`
  
  - **System prompt**: Both notebooks must use the SAME system prompt string:
    `"You are an expert grading assistant. If the student's work is provided as an image, transcribe it verbatim before grading. Then grade against the provided rubric. Output: JSON object only."`
  
  - **Training data**: Both notebooks must reference the same JSONL filenames:
    - `finetune-grading.jsonl`, `finetune-grading-vision.jsonl`
    - `finetune-grading-val.jsonl`, `finetune-grading-val-vision.jsonl`
  
  - **Export pipeline**: Both notebooks must have the same dual-export flow (GGUF + merged 16-bit + mmproj)
  
  - **GGUF filename consistency**: MoE Modelfile `FROM` path must match the GGUF filename in MoE notebook export cell
  
  - **llama-server instructions**: Both notebooks must include `--no-jinja` flag
  
  - **Fix any inconsistencies found** — update the divergent file to match the canonical version

  **Must NOT do**:
  - Do NOT change hyperparameters to "improve" them — consistency is the goal
  - Do NOT add features not specified in earlier tasks

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Cross-file comparison and validation requiring careful reading of two large notebook files and a Modelfile. Not creative work, but thorough inspection.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - All: Comparison/validation task, no specialized domain

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1-5 (all must be complete)

  **References**:

  **Pattern References**:
  - `test-data/OGRE_Finetune_Qwen35_9B.ipynb` — Source of truth for hyperparameters, system prompt, training data refs
  - `test-data/OGRE_Finetune_Qwen35_MoE.ipynb` — Must match 9B on all shared parameters
  - `fine-tuned-model/Modelfile-qwen3.5-35B-A3B-stat-grader` — GGUF filename must match MoE notebook export

  **WHY Each Reference Matters**:
  - The 9B notebook is the template — MoE must match it on all shared parameters
  - The Modelfile is a downstream consumer of the notebook's export — filenames must align

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Hyperparameters match between notebooks
    Tool: Bash (grep + diff)
    Preconditions: Tasks 1-5 complete
    Steps:
      1. Run: grep -oP "(num_train_epochs|learning_rate|lr_scheduler|warmup_ratio|batch_size|gradient_accumulation|packing|max_seq_length|LORA_RANK|LORA_ALPHA)\\s*=\\s*\\S+" test-data/OGRE_Finetune_Qwen35_9B.ipynb | sort
      2. Run same for MoE notebook
      3. Diff the two outputs
    Expected Result: All matched hyperparameters identical
    Failure Indicators: Any diff output showing mismatched values
    Evidence: .sisyphus/evidence/task-6-hyperparam-match.txt

  Scenario: System prompt identical
    Tool: Bash (grep)
    Preconditions: Tasks 1-5 complete
    Steps:
      1. Extract system prompt string from 9B notebook
      2. Extract system prompt string from MoE notebook
      3. Compare — must be byte-identical
    Expected Result: Same system prompt in both notebooks
    Failure Indicators: Any difference in prompt text
    Evidence: .sisyphus/evidence/task-6-system-prompt.txt

  Scenario: GGUF filename matches Modelfile
    Tool: Bash (grep)
    Preconditions: Tasks 1-5 complete
    Steps:
      1. Run: grep "FROM" fine-tuned-model/Modelfile-qwen3.5-35B-A3B-stat-grader | awk '{print $NF}'
      2. Run: grep "Q4_K_M" test-data/OGRE_Finetune_Qwen35_MoE.ipynb | head -1
      3. Verify the GGUF filename in Modelfile appears in the MoE notebook export cell
    Expected Result: Modelfile FROM filename matches notebook export filename
    Failure Indicators: Different filenames between Modelfile and notebook
    Evidence: .sisyphus/evidence/task-6-gguf-filename.txt

  Scenario: Both notebooks have --no-jinja
    Tool: Bash (grep)
    Preconditions: Tasks 1-5 complete
    Steps:
      1. Run: grep -c "no-jinja" test-data/OGRE_Finetune_Qwen35_9B.ipynb
      2. Run: grep -c "no-jinja" test-data/OGRE_Finetune_Qwen35_MoE.ipynb
      3. Both must be >= 1
    Expected Result: --no-jinja present in both notebooks
    Failure Indicators: Either notebook missing --no-jinja
    Evidence: .sisyphus/evidence/task-6-no-jinja-both.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-hyperparam-match.txt
  - [ ] task-6-system-prompt.txt
  - [ ] task-6-gguf-filename.txt
  - [ ] task-6-no-jinja-both.txt

  **Commit**: YES (Commit 3, if fixes needed)
  - Message: `fix(finetune): address cross-notebook consistency issues`
  - Files: whichever notebook needed fixing
  - Pre-commit: `python3 -c "import json; [json.load(open(f)) for f in ['test-data/OGRE_Finetune_Qwen35_9B.ipynb', 'test-data/OGRE_Finetune_Qwen35_MoE.ipynb']]"`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read notebook cells, check for patterns). For each "Must NOT Have": search all modified files for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  For each notebook: parse JSON, verify all cells have valid Python (compile check). Check for: hardcoded credentials, `as any` equivalents, empty exception handlers, leftover debug prints, commented-out code blocks (except intentional TODOs). Verify consistent hyperparameters between notebooks where applicable.
  Output: `Notebooks [N valid/N total] | Cells [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Read each notebook cell-by-cell. Trace the data flow: install → load model → load data → train → export GGUF → build llama.cpp → export mmproj → download. Verify logical flow makes sense. Check all file paths referenced exist or will be created by preceding cells. Verify markdown instructions are accurate (llama-server commands, `--no-jinja`, etc.).
  Output: `Flow [VALID/BROKEN at cell N] | Paths [N/N valid] | Instructions [N/N accurate] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual file changes. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Creep [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Commit 1** (after Wave 1): `fix(finetune): remove rotary monkey-patch, enable 2-epoch training` — `OGRE_Finetune_Qwen35_9B.ipynb`, `colab_train_qwen35_grader.py`, `Modelfile-qwen3.5-35B-A3B-stat-grader`
- **Commit 2** (after Wave 2): `feat(finetune): add dual vision export + MoE notebook` — `OGRE_Finetune_Qwen35_9B.ipynb`, `OGRE_Finetune_Qwen35_MoE.ipynb`
- **Commit 3** (after Wave 3, if fixes needed): `fix(finetune): address cross-notebook consistency issues`

---

## Success Criteria

### Verification Commands
```bash
# Structural checks (run by QA agents)
grep -c "safe_apply_rotary" test-data/OGRE_Finetune_Qwen35_9B.ipynb  # Expected: 0
grep -c "packing.*False" test-data/OGRE_Finetune_Qwen35_9B.ipynb      # Expected: ≥1
grep -c "num_train_epochs.*2" test-data/OGRE_Finetune_Qwen35_9B.ipynb  # Expected: ≥1
grep -c "mmproj" test-data/OGRE_Finetune_Qwen35_9B.ipynb              # Expected: ≥1
grep -c "4bit" test-data/OGRE_Finetune_Qwen35_MoE.ipynb               # Expected: 0 (no 4-bit)
grep -c "A100" test-data/OGRE_Finetune_Qwen35_MoE.ipynb               # Expected: ≥1
python3 -c "import json; json.load(open('test-data/OGRE_Finetune_Qwen35_9B.ipynb'))"  # Expected: valid JSON
python3 -c "import json; json.load(open('test-data/OGRE_Finetune_Qwen35_MoE.ipynb'))" # Expected: valid JSON
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] 9B notebook: rotary patch gone, 2 epochs, packing=False, dual export
- [ ] MoE notebook: bf16 LoRA, A100 assertion, dual export, HF Hub upload
- [ ] MoE Modelfile: correct GGUF reference, system prompt, nothink parameters
- [ ] .py script: deprecation header
- [ ] Both notebooks: llama-server instructions with --no-jinja
