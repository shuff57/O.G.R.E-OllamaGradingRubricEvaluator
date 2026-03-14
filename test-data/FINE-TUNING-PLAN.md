# Fine-Tuning Plan — O.G.R.E. Statistics Grader

## Goal

Fine-tune **Qwen3.5 (9B)** to serve as the primary statistics grader in O.G.R.E., targeting 90%+ agreement with the GLM-5 + Sonnet 4.6 consensus on grading student statistics responses.

## Current Status

| Metric | Score | Status |
|--------|-------|--------|
| GLM-5 vs Sonnet 4.6 | 92% | ✅ Reference pair |
| Sonnet 4.6 vs Qwen35-FT | 92% | ✅ Target model at goal |
| Qwen35-FT-Think | — | ⏸ Deprioritized |
| Gemini 3 Flash | — | ❌ Dropped (systematic +1.2pt outlier) |

**Active benchmark trio:** GLM-5, Sonnet 4.6, Qwen35-FT only.

## Training Data

**Output file:** `test-data/finetune-grading.jsonl` — rebuilt by `build-training.cjs`

### Current Composition (283 total entries)

| Source | Count | Description |
|--------|-------|-------------|
| Original entries (HTML stripped) | 55 | Real student responses, filtered to 1 per score per topic |
| Converted entries | 52 | `finetune-gptoss-qwen.jsonl` reformatted to standard format |
| Synthetic (essay rubric) | 63 | 20 topics × 3 quality levels, checklist rubric format |
| Score patches (1 & 10) | 8 | Score 1 × 4 (off-topic), Score 10 × 4 (perfect) |
| Narrative rubric | 12 | 3 topics × 3 levels + 3 score-10 entries — "WHAT TO LOOK FOR" format |
| Holistic rubric | 12 | 3 topics × 3 levels + 3 score-10 entries — "SCORING GUIDE" band format |
| Calculation rubric | 68 | 21 numeric topics × 3 levels + 5 score-10 entries — "EXPECTED SOLUTION STEPS" format |
| Score gap patches (0, 4, 5) | 13 | Score 0 × 3 (blank), Score 4 × 5, Score 5 × 5 |

**Score distribution:** 0–10 full range covered (score 0: 3, score 1: 4, score 10: 18 entries).

### Score Distribution Summary
```
Score range: 0 – 10
0: 3    1: 4    2: 31   2.5: 5   3: 36   3.5: 1   4: 14   4.5: 6
5: 16   5.5: 1  6: 49   6.5: 5   7: 14   7.5: 6   8: 15
8.5: 3  9: 56  10: 18
```

## Curriculum Coverage

Training data covers all major topics from both OpenIntro Statistics textbooks:
- **OpenIntro Statistics (OS):** 9 chapters
- **Advanced High School Statistics (AHSS):** 8 chapters

### Topic Coverage Map

| Topic | Book Section | Training Status |
|-------|-------------|-----------------|
| Experimental design | OS/AHSS 1.4-1.5 | ✅ Well covered |
| Basic probability rules | OS/AHSS 3.1 | ✅ Added |
| Conditional probability / Bayes | OS/AHSS 3.2 | ✅ Well covered |
| Random variables E[X], Var[X] | OS/AHSS 3.4 | ✅ Added |
| Binomial distribution | OS/AHSS 4.3 | ✅ Well covered |
| Geometric distribution | OS 4.2 / AHSS 3.5 | ✅ Added |
| Normal approximation to binomial | OS 4.3B / AHSS 3.6B | ✅ Added |
| Normal z-score / percentile | OS/AHSS 4-5 | ✅ Added |
| Sampling distributions / CLT | OS/AHSS 4-5 | ✅ Well covered |
| Confidence intervals (proportion) | OS/AHSS 5.2 | ✅ Well covered |
| One-proportion z-test | OS/AHSS 6.1 | ✅ Well covered |
| Two-proportion z-test | OS/AHSS 6.2 | ✅ Well covered |
| Chi-square GOF | OS/AHSS 6.3 | ✅ Well covered |
| Chi-square independence | OS/AHSS 6.4 | ✅ Well covered |
| One-sample t-test | OS/AHSS 7.1 | ✅ Well covered |
| Two-sample t-test | OS/AHSS 7.3 | ✅ Well covered |
| Paired t-test | OS/AHSS 7.2 | ✅ Well covered |
| Power of a test | OS 7.4 | ✅ Added |
| ANOVA | OS 7.5 | ✅ Added |
| Linear regression basics | OS/AHSS 8.1-8.2 | ✅ Well covered |
| Outliers in regression | OS/AHSS 8.3 | ✅ Added |
| Inference for regression slope | OS/AHSS 8.4 | ✅ Added |

### Rubric Format Coverage

| Format | Header Used | Count |
|--------|-------------|-------|
| Checklist rubric | `GRADING CHECKLIST:` | ~178 |
| Calculation / step-based | `EXPECTED SOLUTION STEPS:` | 68 |
| Narrative prose | `WHAT TO LOOK FOR:` | 12 |
| Holistic anchor | `SCORING GUIDE:` | 12 |

## Build Instructions

Rebuild the JSONL from source scripts:
```bash
cd test-data
node build-training.cjs
```

Output: `test-data/finetune-grading.jsonl` (~283 entries)

Validation output confirms:
- 0 parse errors
- Score range: 0–10 (full range)
- Score 0 entries: 3 (blank responses)
- Score 1 entries: 4 (off-topic responses)
- Score 10 entries: 18 (perfect responses across all 4 rubric formats)

## Source Files

| File | Description |
|------|-------------|
| `build-training.cjs` | Master build script — all additions go here |
| `training-sources/finetune-grading-original.jsonl` | 166 original entries (source of truth) |
| `training-sources/finetune-gptoss-qwen.jsonl` | 52 converted entries |
| `training-sources/finetune-grading-val.jsonl` | 46 validation entries (HTML-cleaned) |
| `finetune-grading.jsonl` | ✅ Rebuilt output — submit this for fine-tuning |
| `OGRE_Finetune_Qwen35_9B.ipynb` | Colab notebook — full fine-tuning pipeline |
| `Modelfile` | Ollama import config for the GGUF output |
| `benchmark-report.md` | Latest benchmark results (GLM-5, Sonnet 4.6, Qwen35-FT) |
| `fine-tuning-decision.md` | Historical decision analysis |

## Fine-Tuning Approach

**Target model:** Qwen3.5 (9B) — runs locally via Ollama after fine-tuning.

**Method:** QLoRA (4-bit) via Unsloth on Google Colab.

**Platform:** Google Colab (T4 16GB free tier or A100 40GB Pro)

**Notebook:** `test-data/OGRE_Finetune_Qwen35_9B.ipynb`

**Hyperparameters:**
- Epochs: 2
- LoRA rank: 16 (alpha=16)
- Learning rate: 2e-5 (cosine schedule, 10% warmup)
- Effective batch size: 8 (per_device=2 × gradient_accumulation=4)
- Max sequence length: 4096
- Gradient checkpointing: Unsloth optimized (60% VRAM savings)

**Base model:** `unsloth/Qwen3-8B-unsloth-bnb-4bit` (pre-quantized for fast Colab loading)

**Export:** Direct GGUF export via `save_pretrained_gguf()` → Q4_K_M quantization (~5.5GB)

**Local import:** `test-data/Modelfile` — `ollama create qwen3.5-9B-stat-grader -f Modelfile`

## Success Criteria

- Qwen35-FT agreement with GLM-5: ≥ 90%
- Qwen35-FT agreement with Sonnet 4.6: ≥ 90%
- No systematic score bias (mean deviation < ±0.5 pts vs. consensus)
- Full rubric format generalization (checklist, narrative, holistic, calculation)

## Pipeline Steps

1. Open `OGRE_Finetune_Qwen35_9B.ipynb` in Google Colab (GPU runtime)
2. Upload `finetune-grading.jsonl` + `finetune-grading-val.jsonl`
3. Run all cells (install → load → train → export GGUF)
4. Download GGUF from Colab (Google Drive or direct download)
5. Place GGUF alongside `test-data/Modelfile` locally
6. Run: `ollama create qwen3.5-9B-stat-grader -f Modelfile`
7. Re-run benchmark (GLM-5, Sonnet 4.6, Qwen35-FT) — target 90%+ agreement
8. Evaluate by rubric format — check calc-style and narrative entries specifically
9. If score 0/1/10 extremes improve, training data patches worked
