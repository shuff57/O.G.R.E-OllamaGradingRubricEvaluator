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

### May 2026 additions

| Student | Base | DSv4-Flash | DSv4-Pro‡ | Kimi-K2.6§ | Granite4.1 | Gemma4-26L | Laguna§ | Cascade2§ |
|---------|------|-----------|----------|-----------|-----------|-----------|---------|----------|
| Brandt, Laura | 1.50 | 2.50 | 2.50 | 2.50 | 3.50 | 2.00 | 2.75 | 2.75 |
| Calderon, Gabriella | 2.75 | 2.75 | 2.75 | 2.75 | 3.50 | 3.50 | 3.25 | 3.25 |
| Chagoya, Julie | 3.25 | 3.50 | 3.50 | 3.25 | 3.50 | 3.50 | 3.25 | 2.50 |
| Costner, Adam | 0.75 | 0.75 | 2.00 | 1.50 | 3.25 | 1.50 | 1.50 | 0.75 |
| Disney, Ben | 1.50 | 1.50 | 2.00 | 2.50 | 3.25 | 2.00 | 2.75 | 0.00 |
| Franco, Melody | 2.50 | 2.75 | 2.75 | 2.50 | 4.00 | 3.50 | 2.75 | 3.25 |
| Fuentes, Nayeli | 2.50 | 2.50 | 2.75 | 2.00 | 3.50 | 2.75 | 2.75 | 2.50 |
| Garcia, Hazel | 3.25 | 3.50 | 2.75 | 3.25 | 3.50 | 3.50 | 3.25 | 3.25 |
| Goodwin, Reed | 2.75 | 3.50 | 3.25 | 3.25 | 4.00 | 4.00 | 3.50 | 3.25 |
| Hastain, Emma | 2.75 | 3.25 | 3.25 | 2.75 | 3.50 | 3.50 | 3.25 | 3.25 |
| Humble, Layla | 2.50 | 3.25 | 2.75 | 3.25 | 4.00 | 3.25 | 4.00 | 2.75 |
| Lakhanpal, Neha | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 1.25 | 1.25 | 0.75 |
| Matthews, Sammy | 1.25 | 2.00 | 2.00 | 2.00 | 2.75 | 2.50 | 2.75 | 4.00 |
| Quiroz, Paulina | 0.75 | 1.50 | 0.75 | 1.25 | — | 1.50 | 2.00 | 0.75 |
| Rosales, Elizabeth | 1.25 | 1.50 | 1.50 | 1.50 | 2.75 | 2.00 | 2.50 | 2.50 |
| Sutton, Caidin | 3.50 | 3.25 | 3.50 | 3.25 | 3.50 | 4.00 | 3.25 | 2.75 |
| Tuman, Charlie | 2.75 | 2.75 | 3.25 | 2.75 | 4.00 | 3.50 | 3.25 | 3.25 |

‡DSv4-Pro: 4 attempts, finally got a clean 17/17. Earlier attempts hit ~25-30% transient FAILED rate with *different* students failing each run, confirming Ollama-cloud routing/timeout issues (not model behavior). The clean run shown here scored Quiroz, Lakhanpal, and Sutton all exactly at baseline.
§Models requiring `think:false` to grade reliably: **Kimi-K2.6** (0/17 with thinking on — exhausts num_predict mid-reasoning), **Laguna-xs.2** (default thinking timed out at 5 min/student), **Nemotron-Cascade-2** (default thinking timed out), **Gemma4 26B local** (default thinking timed out — but cloud variant Gemma4 31B did not need it). Disabling thinking moved all four from unusable to working.

### June 2026 additions

All six graded with `think:false` via `_pipeline-bench-nothink.mjs`, same 17-student dataset.

| Student | Base | Minimax-M3 | GLM-5.2 | Kimi-K2.7-code | Qwen3-coder-next | Gemma4-12B | LFM2.5 |
|---------|------|-----------|---------|----------------|------------------|------------|--------|
| Brandt, Laura | 1.50 | 2.00 | 2.50 | 2.75 | 2.75 | 3.25 | 0.00 |
| Calderon, Gabriella | 2.75 | 2.75 | 3.25 | 2.75 | 2.75 | 4.00 | 0.00 |
| Chagoya, Julie | 3.25 | 2.75 | 3.25 | 3.25 | 2.75 | 3.50 | — |
| Costner, Adam | 0.75 | 1.25 | 1.25 | 2.50 | 2.50 | 2.50 | 0.00 |
| Disney, Ben | 1.50 | 1.50 | 2.00 | 2.50 | 2.00 | 2.75 | 4.00 |
| Franco, Melody | 2.50 | 2.50 | 2.75 | 2.75 | 2.75 | 3.50 | 4.00 |
| Fuentes, Nayeli | 2.50 | 2.50 | 2.50 | 2.50 | 3.25 | 3.25 | 0.00 |
| Garcia, Hazel | 3.25 | 3.25 | 3.25 | 3.25 | 2.75 | 3.50 | 3.25 |
| Goodwin, Reed | 2.75 | 3.25 | 3.50 | 3.50 | 3.25 | 4.00 | 4.00 |
| Hastain, Emma | 2.75 | 3.25 | 2.75 | 2.75 | 2.75 | 4.00 | 1.50 |
| Humble, Layla | 2.50 | 3.50 | 3.50 | 3.50 | 3.25 | 3.50 | 4.00 |
| Lakhanpal, Neha | 0.75 | 0.50 | 0.75 | 0.75 | 0.75 | 1.50 | 0.00 |
| Matthews, Sammy | 1.25 | 1.50 | 2.00 | 2.00 | 2.75 | 2.75 | 4.00 |
| Quiroz, Paulina | 0.75 | 0.75 | 1.25 | 1.50 | 1.25 | 1.50 | 2.50 |
| Rosales, Elizabeth | 1.25 | 1.50 | 1.25 | 2.00 | 2.50 | 2.75 | 0.00 |
| Sutton, Caidin | 3.50 | 3.50 | 3.50 | 3.50 | 3.25 | 4.00 | 3.50 |
| Tuman, Charlie | 2.75 | 3.25 | 3.25 | 3.25 | 3.25 | 4.00 | 4.00 |

| Model | Type | Avg Error | Bias | N | Quiroz | Lakhan | Overall rank | Verdict |
|-------|------|-----------|------|---|--------|--------|--------------|---------|
| **Minimax-M3** | Ollama cloud | **0.28** | +0.19 | 17 | 0.75 | 0.50 | #2 overall | New best cloud model — beats DSv4-Flash (0.34), nearly ties Stat9B (0.26). Caught both litmus, lowest cloud bias |
| **GLM-5.2** | Ollama cloud | **0.37** | +0.37 | 17 | 1.25 | 0.75 | ~#4 overall | Major jump over GLM-5.1 (0.49) and GLM-5 (0.44). Caught Lakhanpal exactly |
| **Kimi-K2.7-code** | Ollama cloud | **0.51** | +0.51 | 17 | 1.50 | 0.75 | ~#9 | Decent, slight regression from Kimi-K2.6 (0.37). Fastest run (~6s/student). Code-tuned variant |
| **Qwen3-coder-next** | Ollama cloud | **0.63** | +0.49 | 17 | 1.25 | 0.75 | ~#10 | Mid-tier — caught Lakhanpal, but coder-tuned, inflates Matthews/Rosales |
| **Gemma4 12B** | Ollama local (7.6 GB) | **1.06** | +1.06 | 17 | 1.50 | 1.50 | inflation tier | Heavy inflation — far worse than Gemma4 31B cloud (0.35). Missed both litmus. Small local variant miscalibrates |
| **LFM2.5** | Ollama local (5.2 GB) | **1.45** | +0.11 | 16 | 2.50 | 0.00 | unusable | Erratic — emitted out-of-range scores (virtual 24/10), 1 parse failure, scattered 0.00/4.00. Not usable for grading |

## Model Rankings

| Rank | Model | Type | Size | Avg Error | Bias | N | Quiroz | Lakhan | Verdict |
|------|-------|------|------|-----------|------|---|--------|--------|---------|
| 1 | **Stat-Grader 9B** | Ollama local | 6 GB | **0.26** | +0.24 | 17 | 2.00 | 0.75 | Best local model — near-Sonnet accuracy |
| 2 | **DeepSeek-V4 Flash** | Ollama cloud | Cloud | **0.34** | +0.31 | 17 | 1.50 | 0.75 | Best clean-run cloud — caught Costner & Lakhanpal exactly, low inflation, no flakiness |
| 3 | **Gemma4 31B** | Ollama cloud | Cloud | **0.35** | +0.35 | 17 | 1.25 | 0.75 | Excellent — caught both litmus, low inflation |
| 4 | **Kimi-K2.6** § | Ollama cloud | Cloud (1T MoE) | **0.37** | +0.28 | 17 | 1.25 | 0.75 | Strong — caught Lakhanpal exactly, fastest cloud (~16s/student). Requires `think:false` |
| 5 | **DeepSeek-V4 Pro** ‡ § | Ollama cloud | Cloud | **0.40** | +0.34 | 17 | 0.75 | 0.75 | Caught BOTH litmus AND Sutton exactly — but Costner outlier 2.00 (vs 0.75) drags avg up. Flaky cloud, took 4 attempts to get clean run |
| 6 | **Nemotron-3-super** | Ollama cloud | Cloud | **0.41** | +0.41 | 17 | 1.25 | 0.75 | Excellent — good discrimination |
| 7 | **GLM-5** | Ollama cloud | Cloud | **0.44** | +0.44 | 17 | 1.25 | 0.75 | Good |
| 8 | **GLM-5.1** | Ollama cloud | Cloud | **0.49** | +0.40 | 17 | 1.25 | 1.50 | Good — slight regression from GLM-5, missed Lakhanpal |
| 9 | **Minimax-M2.7** | Ollama cloud | Cloud | **0.62** | +0.53 | 17 | 1.50 | 0.75 | Decent — caught Lakhanpal but inflates Matthews to 4/4 |
| 10 | **Opus-Distilled 9B** | Ollama local | 5.6 GB | **0.63** | +0.51 | 17 | 0.75 | 0.75 | Good — caught both litmus students |
| 11 | **Nemotron-Cascade-2** § | Ollama local | 17 GB (30B/3B-MoE) | **0.66** | +0.31 | 17 | 0.75 | 0.75 | Discriminative — lowest local-model bias, caught all three litmus exactly, but Disney 0.00 (over-strict) and Matthews 4.00 (over-inflated). Requires `think:false` |
| 12 | **Gemma4 26B local** § | Ollama local | 17 GB | **0.68** | +0.68 | 17 | 1.50 | 1.25 | Mid-tier — moderate inflation, ~75s/student. Requires `think:false` |
| 13 | **Laguna-xs.2** § | Ollama local | 23 GB (33B/3B-MoE) | **0.72** | +0.69 | 17 | 2.00 | 1.25 | Mid-tier inflator — designed for agentic coding, not grading. Requires `think:false` |
| 14 | **Granite 4.1 8B** | Ollama local | 5.3 GB | **1.11** | +1.11 | 16 | — | 0.75 | Poor — heavy inflation, gave Franco/Goodwin/Humble/Tuman 4/4 |
| 15 | **Nem4B** | Ollama local | 2.8 GB | **1.21** | +1.21 | 17 | 0.75 | 0.75 | Poor — heavy inflation despite catching errors |
| 16 | **LFM 2.5-thinking** | Ollama local | 731 MB | **1.23** | +0.95 | 11 | N/A | N/A | Poor — batch failures, inflates with pipeline |
| 17 | **Nemotron-nano 30B** | Ollama cloud | Cloud | **1.40** | +1.40 | 17 | 4.00 | 2.00 | Poor — gave Quiroz 4/4 (wrong answer) |
| 18 | **LFM2** | Ollama local | 14 GB | **1.44** | +1.44 | 17 | 3.50 | 3.25 | Very poor — everything 3.50 |

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

### 8. DeepSeek-V4 Flash is the new top cloud model (May 2026)
DeepSeek-V4 Flash (0.34 error, +0.31 bias) edged past Gemma4 31B (0.35) by catching Costner *exactly* (0.75 vs baseline 0.75) and Lakhanpal (0.75). 17/17 graded clean, ~37 min wall time. No `think:false` needed — it's a non-thinking variant. Currently the best cloud option for production grading.

### 9. DeepSeek-V4 Pro caught all three litmus students exactly — but Costner is its blind spot
After 4 attempts, DSv4-Pro completed a clean 17/17 with avg error 0.40, bias +0.34. It scored **Lakhanpal 0.75, Quiroz 0.75, AND Sutton 3.50 — all exact baseline matches**. The persistent weakness: Costner scored 2.00 (vs baseline 0.75) — it inflated this student in *every* run that included him, so this is model behavior, not noise. Without Costner the avg error would be ~0.32. Required `think:false`. The 4-attempt success rate exposes Ollama-cloud's per-student failure rate (~25-30%, different students each run, transient routing/timeout — not content-specific).

### 10. Kimi K2.6 is competitive once thinking is disabled
With default `think:true`, Kimi-K2.6 emits all reasoning into the `thinking` field and runs out of `num_predict` (4096) before producing JSON content — 0/17 on first attempt. With `think:false`, it grades 17/17 cleanly in ~16s/student (~4.6 min total — fastest cloud model). Avg error 0.37, caught Lakhanpal exactly, Quiroz at 1.25. The 1T-parameter MoE architecture is overkill for grading but works.

### 11. Granite 4.1 8B inflates heavily — not usable for grading
IBM Granite 4.1 8B (5.3 GB local, dense decoder-only) gave Franco/Goodwin/Humble/Tuman a 4/4 against baselines of 2.50–2.75. Avg error 1.11 places it in the inflation tier alongside Nem4B (1.21) and LFM2 (1.44). It did catch Lakhanpal at 0.75 exactly, suggesting the model can recognize incoherent responses but can't discriminate the middle of the rubric. The pipeline's CRITICAL 8+ rule appears to read as "default high" rather than "rare exception" for this size class.

### 12. Local thinking models all need `think:false` for grading
Four newly-tested local thinking-capable models (Gemma4 26B, Laguna-xs.2, Nemotron-Cascade-2) plus Kimi-K2.6 cloud all hit 5-min per-student timeouts or 0/17-grade failures with default thinking enabled. Disabling thinking moved them all from unusable to working. The pattern: with thinking on, the model spends its `num_predict` budget (4096) inside the reasoning trace and never emits parseable JSON content. **Recommendation: `think:false` should be the default for any grading benchmark; thinking is only useful for tasks where the chain-of-reasoning *is* the output.**

### 13. Nemotron-Cascade-2 is the lowest-bias local model
Cascade-2 (30B/3B-active MoE, 17 GB local) scored avg error 0.66 with bias only +0.31 — the lowest bias of any local model and tied with DSv4-Flash for lowest cloud-or-local bias overall. It caught all three litmus students at 0.75 exactly (Costner/Lakhanpal/Quiroz). The high error vs. low bias means it's grading bidirectionally — under-scoring Disney (0.00 vs baseline 1.50) and over-scoring Matthews (4.00 vs baseline 1.25). With consistency tuning this could be the best local alternative to Stat-Grader. Requires `think:false`.

### 14. Gemma4 26B local underperforms its cloud sibling
Gemma4 26B local (17 GB, ~75s/student) scored avg error 0.68 — about 2x worse than the Gemma4 31B cloud variant (0.35). Same model family, different size, different inference path; the local quantization or the missing 5B params clearly matter for this task. Mid-tier — usable but Cascade-2 and Stat-Grader 9B are both better local options.

### 15. Laguna-xs.2 is built for agentic coding, not grading
Laguna-xs.2 (33B/3B-active MoE, 23 GB) scored Quiroz 2.00 (vs baseline 0.75) and Lakhanpal 1.25 (vs baseline 0.75) — heavy inflation on the litmus students. Avg error 0.72, bias +0.69. The model is designed for "agentic coding and long-horizon work" — it's not tuned for the kind of structured rubric judgment grading requires. Skip for grading.

### 16. Litmus test: pipeline improved error detection
5 of 8 pipeline models correctly penalized Quiroz (wrong answer) vs 5 of 10 in the plain-prompt benchmark. Lakhanpal was caught by 6 of 8 pipeline models.

### 17. Always use the OGRE pipeline
Stat-Grader went from 0.65 → 0.26 error with the pipeline. The prompt matters more than the model for mid-tier models.

### 18. Minimax-M3 is the new best cloud model (June 2026)
Minimax-M3 (0.28 error, +0.19 bias) is the most accurate cloud model tested to date — edging past DeepSeek-V4 Flash (0.34) and within 0.02 of Stat-Grader 9B (0.26), the best local model. It caught Quiroz exactly (0.75) and Lakhanpal close (0.50), and posted the lowest bias of any cloud model. This is a dramatic generational leap over Minimax-M2.7 (0.62 → 0.28). At ~38s/student it's slower than other cloud models but accuracy justifies it. Requires `think:false`.

### 19. GLM-5.2 is a major jump over the 5.x line
GLM-5.2 (0.37 error, +0.37 bias) substantially improves on GLM-5.1 (0.49) and GLM-5 (0.44), moving from "good alternative" into the top tier of cloud models. It caught Lakhanpal exactly (0.75) and scored Quiroz at 1.25. Unlike GLM-5.1's regression, 5.2 is a clear forward step — now the best GLM variant for grading.

### 20. Kimi-K2.7-code regresses slightly but is the fastest cloud model
Kimi-K2.7-code (0.51 error, +0.51 bias) is a small step back from Kimi-K2.6 (0.37) — expected, since this is a code-tuned variant, not a general checkpoint. It caught Lakhanpal exactly (0.75) but inflates more broadly. Its standout trait is speed: ~6s/student (101s for all 17), the fastest cloud run recorded. Usable when throughput matters more than the last 0.1 of accuracy. Requires `think:false`.

### 21. Qwen3-coder-next is mid-tier — coder tuning shows
Qwen3-coder-next (0.63 error, +0.49 bias) lands in the same band as Opus-Distilled and Minimax-M2.7. It caught Lakhanpal (0.75) but inflated Matthews (2.75 vs 1.25) and Rosales (2.50 vs 1.25). Like other coding-tuned models (Laguna), it's not calibrated for structured rubric judgment. Acceptable but not preferred.

### 22. Gemma4 12B local inflates heavily — the small-variant pattern again
Gemma4 12B local (1.06 error, +1.06 bias) is far worse than Gemma4 31B cloud (0.35) and even Gemma4 26B local (0.68). It missed both litmus students (Quiroz 1.50, Lakhanpal 1.50) and gave six students a 4/4. This confirms the recurring pattern: smaller local variants of a strong cloud model lose the calibration that makes the full-size version usable. Use the cloud variant; avoid the 12B for grading.

### 23. LFM2.5 is unusable for grading
LFM2.5 (1.45 error, 16/17 graded) emitted out-of-range scores (virtual 24/10, 13/10, 12/10 against a 10-point scale) and one parse failure, scattering students between 0.00 and 4.00 with no discrimination. Its near-zero bias (+0.11) is an artifact of averaging extreme highs and lows, not calibration. Same family as the earlier LFM2/LFM2.5-thinking failures — the LFM line cannot handle the structured grading task. Avoid.

## Recommendations

1. **Default grading model:** Sonnet (with OGRE prompt) — the optimization target and most consistent
2. **Best local model:** Stat-Grader 9B + OGRE pipeline (0.26 error) — near-Sonnet accuracy at 6 GB
3. **Best Ollama cloud:** Minimax-M3 (0.28 error, +0.19 bias) — new leader as of June 2026, beats DeepSeek-V4 Flash (0.34), caught both litmus, lowest cloud bias. Runner-up: DeepSeek-V4 Flash (0.34, no `think:false` needed)
4. **Strong cloud alternatives:** GLM-5.2 (0.37, requires `think:false`), Gemma4 31B (0.35), Kimi-K2.6 (0.37, requires `think:false`), DeepSeek-V4 Pro (0.40, requires `think:false` and is flaky), Nemotron-3-super (0.41)
5. **Good cloud alternatives:** GLM-5 (0.44), GLM-5.1 (0.49) — both now superseded by GLM-5.2 (0.37). Kimi-K2.7-code (0.51, fastest at ~6s/student) if throughput matters
6. **Mid-tier cloud:** Minimax-M2.7 (0.62), Qwen3-coder-next (0.63, coder-tuned) — usable but watch for outlier inflation
7. **Best local alternative to Stat-Grader:** Opus-Distilled 9B (0.63 error, 5.6 GB) — catches errors, personalized feedback. Cascade-2 (0.66, 17 GB local MoE, requires `think:false`) is also a strong contender with the lowest local-model bias.
8. **Avoid for grading:** LFM2, LFM 2.5-thinking, **LFM2.5** (out-of-range scores, unusable), Nemotron-nano 30B, Nemotron-3-nano 4B, **Granite 4.1 8B**, **Laguna-xs.2** (agentic-coding-tuned), **Gemma4 26B local** and **Gemma4 12B local** (use cloud variant instead) — all inflate or miscalibrate
9. **Always pass `think:false` for thinking-capable models** when grading — thinking budget exhausts inside reasoning trace and prevents JSON emission. Confirmed for: Kimi-K2.6, Kimi-K2.7-code, Minimax-M3, GLM-5.2, Qwen3-coder-next, Gemma4 26B/12B local, Laguna-xs.2, Nemotron-Cascade-2, DeepSeek-V4 Pro.
10. **VRAM hygiene for sequential local benchmarks:** Use `ollama stop <model>` between models when total combined VRAM exceeds GPU. Without explicit unloads, Ollama's auto-unload may not happen before the next model load, causing "model failed to load" errors (observed with cascade-2 after gemma4:26b/laguna).
11. **Run-to-run mitigation:** For models with variance (GLM-5), use the consistency sweep with fixed 2σ threshold and 1-pt drop cap

## Test Environment

- **March run:** 2026-03-29 (plain prompt), 2026-03-30 (full pipeline)
- **April run:** 2026-04-16 (Gemma4, GLM-5.1, Minimax-M2.7 — full pipeline, same dataset)
- **May run:** 2026-05-01 (DeepSeek-V4 Flash, DeepSeek-V4 Pro, Kimi-K2.6, Granite 4.1 8B, Gemma4 26B local, Laguna-xs.2 q4_K_M, Nemotron-Cascade-2 30B — full pipeline, same dataset; all four thinking-capable local models required `think:false`)
- **June run:** 2026-06-18 (Minimax-M3, GLM-5.2, Kimi-K2.7-code, Qwen3-coder-next, Gemma4 12B local, LFM2.5 local — full pipeline, same dataset; all graded with `think:false` via `_pipeline-bench-nothink.mjs`)
- **Platform:** Windows 11, Ollama, Claude Code subagents
- **Question:** MyOpenMath gradeallq2.php — mean vs median with outlier
- **Students:** 17 with responses, 3 jittered versions
- **Baseline:** Sonnet with full OGRE production prompt (grading philosophy, virtual 0-10 scale, partial credit rules)
- **Pipeline:** Full OGRE production prompt via `buildBatchPrompt` (grading philosophy, scoring anchors, partial-credit rules, 0-10 virtual scale)
- **Opus-Distilled:** Qwen3.5-9B-Claude-4.6-Opus-Reasoning-Distilled (Q4_K_M GGUF, 5.6 GB) from HuggingFace/Jackrong — installed as `opus-distilled:latest` in Ollama
- **Benchmark scripts:** `_pipeline-bench-robust.mjs` (default — thinking on/auto), `_pipeline-bench-nothink.mjs` (passes `think:false` for thinking-capable models). 1 student per AI call, direct Ollama, `buildBatchPrompt` with scoring anchors
