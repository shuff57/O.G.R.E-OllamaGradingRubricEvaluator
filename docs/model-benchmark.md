# OGRE Model Grading Benchmark

## Overview

Benchmark comparing AI models on rubric-based essay grading using the **full OGRE production pipeline** (`buildBatchPrompt`). All models graded the same 17 student responses against the same rubric with the same prompt: GRADING_PHILOSOPHY, scoring scale descriptors, scoring anchors, partial-credit rules, and the CRITICAL 8+ rule.

**Sonnet with the OGRE prompt** is the baseline — it was the model used during prompt optimization and represents the target scoring standard.

**Question type:** Mean vs Median — students explain whether mean or median better describes a "typical" value given an outlier in the dataset.

**Rubric (4 pts total, 0.25 increments):**
- Outlier Impact (1 pt): Explain how the extreme value affects the mean
- Recommendation (1.5 pts): State mean or median is better AND explain resistance to outliers
- Practical Interpretation (1.5 pts): Interpret what the recommended measure tells the audience in context

**3 jittered versions:** Sports analyst/contracts, Real estate/home prices, HR manager/salaries — each student received different randomized numeric values.

*9 students had no response and were excluded.*

## Score Matrix

**Base** = Sonnet + OGRE prompt (reference standard).

| Student | Base | Stat9B | NSuper | Gemma4 | GLM-5 | GLM-5.1 | Minimax | OpusDist | LFM2.5† | Nem4B | Nem30B | LFM2 |
|---------|------|--------|--------|--------|-------|---------|---------|----------|---------|-------|--------|------|
| Brandt, Laura | 1.50 | 1.50 | 1.50 | 2.00 | 2.00 | 2.00 | 2.50 | 2.00 | 3.50 | 4.00 | 4.00 | 3.50 |
| Calderon, Gabriella | 2.75 | 2.75 | 3.25 | 3.50 | 4.00 | 3.25 | 2.75 | 3.25 | 4.00 | 4.00 | 4.00 | 3.50 |
| Chagoya, Julie | 3.25 | 3.50 | 4.00 | 3.50 | 3.50 | 3.50 | 2.50 | 2.50 | 3.50 | 4.00 | 3.50 | 4.00 |
| Costner, Adam | 0.75 | 1.25 | 1.50 | 1.25 | 0.75 | 1.25 | 1.25 | 0.75 | 3.50 | 2.50 | 2.00 | 3.50 |
| Disney, Ben | 1.50 | 2.00 | 1.50 | 1.50 | 2.50 | 2.00 | 2.00 | 2.00 | — | 3.50 | 4.00 | 3.50 |
| Franco, Melody | 2.50 | 2.50 | 3.25 | 2.75 | 3.25 | 4.00 | 3.25 | 4.00 | — | 3.50 | 3.50 | 3.50 |
| Fuentes, Nayeli | 2.50 | 2.50 | 2.50 | 2.75 | 2.50 | 4.00 | 3.25 | 2.50 | 3.50 | 3.50 | 4.00 | 3.50 |
| Garcia, Hazel | 3.25 | 3.25 | 3.25 | 3.25 | 3.25 | 2.75 | 3.25 | 4.00 | 3.50 | 4.00 | 3.50 | 4.00 |
| Goodwin, Reed | 2.75 | 3.50 | 4.00 | 3.50 | 3.50 | 2.50 | 4.00 | 4.00 | 3.50 | 4.00 | 4.00 | 4.00 |
| Hastain, Emma | 2.75 | 2.75 | 3.25 | 3.25 | 3.25 | 2.75 | 3.25 | 4.00 | — | 3.50 | 3.50 | 3.50 |
| Humble, Layla | 2.50 | 2.50 | 3.25 | 3.25 | 2.75 | 2.75 | 3.25 | 4.00 | 1.00 | 4.00 | 4.00 | 3.50 |
| Lakhanpal, Neha | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 1.50 | 0.75 | 0.75 | — | 0.75 | 2.00 | 3.25 |
| Matthews, Sammy | 1.25 | 1.50 | 1.50 | 1.50 | 1.50 | 1.50 | 4.00 | 1.25 | 3.25 | 3.25 | 4.00 | 3.50 |
| Quiroz, Paulina | 0.75 | 2.00 | 1.25 | 1.25 | 1.25 | 1.25 | 1.50 | 0.75 | — | 0.75 | 4.00 | 3.50 |
| Rosales, Elizabeth | 1.25 | 2.00 | 1.25 | 1.50 | 2.00 | 1.25 | 1.50 | 2.00 | — | 3.50 | 2.50 | 3.50 |
| Sutton, Caidin | 3.50 | 3.25 | 4.00 | 3.50 | 3.50 | 4.00 | 3.50 | 3.25 | 4.00 | 4.00 | 3.50 | 3.50 |
| Tuman, Charlie | 2.75 | 2.75 | 3.25 | 3.25 | 3.50 | 2.75 | 2.75 | 4.00 | 4.00 | 4.00 | 4.00 | 3.50 |

†LFM2.5-thinking only graded 11/17 students (batch parsing failures, 6 lost).
— = student not graded.

**Cascade** and **Q397B** were excluded — both too slow for practical use (cascade >90s/student local, Q397B ~2min/student cloud with thinking tokens).

## Model Rankings

| Rank | Model | Type | Size | Avg Error | Bias | N | Quiroz | Lakhan | Verdict |
|------|-------|------|------|-----------|------|---|--------|--------|---------|
| 1 | **Stat-Grader 9B** | Ollama local | 6 GB | **0.26** | +0.24 | 17 | 2.00 | 0.75 | Best local model — near-Sonnet accuracy |
| 2 | **Gemma4 31B** | Ollama cloud | Cloud | **0.35** | +0.35 | 17 | 1.25 | 0.75 | Excellent — caught both litmus, low inflation |
| 3 | **Nemotron-3-super** | Ollama cloud | Cloud | **0.41** | +0.41 | 17 | 1.25 | 0.75 | Excellent — good discrimination |
| 4 | **GLM-5** | Ollama cloud | Cloud | **0.44** | +0.44 | 17 | 1.25 | 0.75 | Good |
| 5 | **GLM-5.1** | Ollama cloud | Cloud | **0.49** | +0.40 | 17 | 1.25 | 1.50 | Good — slight regression from GLM-5, missed Lakhanpal |
| 6 | **Minimax-M2.7** | Ollama cloud | Cloud | **0.62** | +0.53 | 17 | 1.50 | 0.75 | Decent — caught Lakhanpal but inflates Matthews to 4/4 |
| 7 | **Opus-Distilled 9B** | Ollama local | 5.6 GB | **0.63** | +0.51 | 17 | 0.75 | 0.75 | Good — caught both litmus students |
| 8 | **Nem4B** | Ollama local | 2.8 GB | **1.21** | +1.21 | 17 | 0.75 | 0.75 | Poor — heavy inflation despite catching errors |
| 9 | **LFM 2.5-thinking** | Ollama local | 731 MB | **1.23** | +0.95 | 11 | N/A | N/A | Poor — batch failures, inflates with pipeline |
| 10 | **Nemotron-nano 30B** | Ollama cloud | Cloud | **1.40** | +1.40 | 17 | 4.00 | 2.00 | Poor — gave Quiroz 4/4 (wrong answer) |
| 11 | **LFM2** | Ollama local | 14 GB | **1.44** | +1.44 | 17 | 3.50 | 3.25 | Very poor — everything 3.50 |

**Metrics:**
- **Avg Error** = mean |score - baseline| across graded students (lower = better)
- **Bias** = mean (score - baseline) — positive = inflates, negative = deflates
- **Quiroz/Lakhan** = litmus test scores (baseline: 0.75 each). Quiroz recommended the mean (wrong). Lakhanpal's response was nearly incoherent.

## Plain vs Pipeline Comparison

How did the OGRE pipeline change each model's accuracy vs plain rubric prompt?

| Model | Plain Error | Pipeline Error | Change | Plain Bias | Pipeline Bias |
|-------|------------|----------------|--------|------------|---------------|
| Stat-Grader 9B | 0.65 | **0.26** | **-0.39** | +0.62 | +0.24 |
| Nemotron-3-super | 0.47 | **0.41** | -0.06 | +0.38 | +0.41 |
| GLM-5 | 0.57 | **0.44** | -0.13 | +0.43 | +0.44 |
| Nemotron-3-nano 4B | 1.28 | 1.21 | -0.07 | +0.40 | +1.21 |
| LFM 2.5-thinking | 1.57 | 1.23 | -0.34 | -1.37 | +0.95 |
| Nemotron-nano 30B | 1.25 | 1.40 | **+0.15** | +1.25 | +1.40 |
| LFM2 | 1.54 | 1.44 | -0.10 | +1.54 | +1.44 |

## Key Findings

### 1. Stat-Grader 9B is the biggest pipeline winner
Error dropped from 0.65 → 0.26, making it the most accurate Ollama model — rivaling Sonnet itself. The OGRE prompt's partial-credit rules and scoring anchors are exactly what this fine-tuned model needed for calibration.

### 2. The pipeline doesn't fix bad models
LFM2, Nem30B, and Nem4B all remained inflated. LFM2 still gives nearly everyone 3.50. Nem30B got *worse* (+0.15 error) — the CRITICAL 8+ rule seems to be misinterpreted by models that already inflate.

### 3. LFM2.5-thinking flipped from deflation to inflation
With the plain prompt, LFM2.5 scored everything 0.50 (bias -1.37). With the pipeline prompt, it inflated to 3.50 (bias +0.95). Neither extreme is usable.

### 4. Opus-Distilled 9B is a strong local contender
Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled (5.6 GB, Q4_K_M) scored 0.63 avg error on its first run — comparable to GLM-5 cloud. It caught both litmus students (Quiroz 0.75, Lakhanpal 0.75) and produced personalized student-addressed feedback. Runs locally in ~6 min for 17 students.

### 5. Gemma4 31B is the best cloud model
Gemma4 (0.35 error) outperforms both Nemotron-3-super (0.41) and GLM-5 (0.44). It caught both litmus students (Quiroz 1.25, Lakhanpal 0.75) and showed the most balanced scoring among cloud models — no extreme inflation outliers.

### 6. GLM-5.1 is a marginal regression from GLM-5
GLM-5.1 (0.49 error) is slightly worse than GLM-5 (0.44) on this benchmark. It inflated Franco and Fuentes to 4.00 (baseline 2.50) and missed Lakhanpal (1.50 vs baseline 0.75). Caught Quiroz (1.25).

### 7. Minimax-M2.7 is mid-tier with an inflation problem
Minimax (0.62 error) sits near Opus-Distilled. It caught Lakhanpal (0.75) but inflated Matthews to 4.00 (baseline 1.25) — the biggest single-student error among viable models. Quiroz scored 1.50 (should be 0.75).

### 7. Litmus test: pipeline improved error detection
5 of 8 pipeline models correctly penalized Quiroz (wrong answer) vs 5 of 10 in the plain-prompt benchmark. Lakhanpal was caught by 6 of 8 pipeline models.

### 8. Always use the OGRE pipeline
Stat-Grader went from 0.65 → 0.26 error with the pipeline. The prompt matters more than the model for mid-tier models.

## Recommendations

1. **Default grading model:** Sonnet (with OGRE prompt) — the optimization target and most consistent
2. **Best local model:** Stat-Grader 9B + OGRE pipeline (0.26 error) — near-Sonnet accuracy at 6 GB
3. **Best Ollama cloud:** Gemma4 31B (0.35 error) — best cloud accuracy, caught both litmus tests
4. **Strong cloud alternatives:** Nemotron-3-super (0.41) or GLM-5 (0.44) — reliable, slight inflation
5. **Good cloud alternatives:** GLM-5.1 (0.49) — slight regression from GLM-5
6. **Mid-tier cloud:** Minimax-M2.7 (0.62) — usable but watch for outlier inflation
6. **Good local alternative:** Opus-Distilled 9B (0.63 error, 5.6 GB) — catches errors, personalized feedback
7. **Avoid:** LFM2, LFM 2.5-thinking, Nemotron-nano 30B, Nemotron-3-nano 4B — pipeline doesn't fix inflation
8. **Run-to-run mitigation:** For models with variance (GLM-5), use the consistency sweep with fixed 2σ threshold and 1-pt drop cap

## Test Environment

- **March run:** 2026-03-29 (plain prompt), 2026-03-30 (full pipeline)
- **April run:** 2026-04-16 (Gemma4, GLM-5.1, Minimax-M2.7 — full pipeline, same dataset)
- **Platform:** Windows 11, Ollama, Claude Code subagents
- **Question:** MyOpenMath gradeallq2.php — mean vs median with outlier
- **Students:** 17 with responses, 3 jittered versions
- **Baseline:** Sonnet with full OGRE production prompt (grading philosophy, virtual 0-10 scale, partial credit rules)
- **Pipeline:** Full OGRE production prompt via `buildBatchPrompt` (grading philosophy, scoring anchors, partial-credit rules, 0-10 virtual scale)
- **Opus-Distilled:** Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled (Q4_K_M GGUF, 5.6 GB) from HuggingFace/Jackrong — installed as `opus-distilled:latest` in Ollama
- **Benchmark script:** `_pipeline-bench-robust.mjs` — 1 student per AI call, direct Ollama, `buildBatchPrompt` with scoring anchors
