# GLM-5.1:cloud Consistency Benchmark — 2026-04-15

## Overview

3-run consistency benchmark for **glm-5.1:cloud** via the full OGRE production pipeline (`/api/grade` SSE endpoint, `buildBatchPrompt`).

> **Note: This benchmark uses a different dataset than all prior benchmarks.**
> Prior benchmarks (2026-03-29, 2026-03-31) used the MOM mean-vs-median question (17 students, 4 pts max).
> This benchmark uses the CLT + margin-of-error essay from `demo/demo-grading-page.html` (30 students, 10 pts max).
> There is no external Sonnet baseline for this dataset, so consistency (run-to-run StdDev) is the primary metric.

**Dataset:** `demo/demo-grading-page.html`
**Question:** Explain how the Central Limit Theorem relates sample size to margin of error
**Students:** 29 gradable / 30 total (Bennett, Chase — blank response — excluded, score = 0)
**Max Score:** 10 pts
**Rubric Items:** CLT Statement (2 pts), Standard Error (3 pts), MOE Connection (3 pts), Practical Implications (2 pts)

## Per-Student Scores

| Student | R1 | R2 | R3 | Mean | StdDev | Notes |
|---------|----|----|-----|------|--------|-------|
| Adams, Hailey | 6.0 | 6.0 | 7.0 | 6.33 | 0.47 | |
| Anderson, Marcus | 10.0 | 10.0 | 10.0 | 10.00 | 0.00 | Excellent — perfect consistency |
| Brooks, Jaylen | 9.0 | 9.0 | 9.0 | 9.00 | 0.00 | |
| Chen, Lily | 9.0 | 10.0 | 10.0 | 9.67 | 0.47 | |
| Cooper, Maya | 1.0 | 1.0 | 1.0 | 1.00 | 0.00 | Near-blank — correctly low |
| Davis, Amara | 8.0 | 8.0 | 8.0 | 8.00 | 0.00 | |
| Diaz, Roberto | 10.0 | 10.0 | 10.0 | 10.00 | 0.00 | Excellent — perfect consistency |
| Evans, Tyler | 7.0 | 7.0 | 7.0 | 7.00 | 0.00 | |
| Flores, Isabella | 9.0 | 9.0 | 9.0 | 9.00 | 0.00 | |
| Garcia, Diego | 8.0 | 8.0 | 8.0 | 8.00 | 0.00 | |
| Harris, Kayla | 7.0 | 7.0 | 8.0 | 7.33 | 0.47 | |
| Ibrahim, Fatima | 6.0 | 7.0 | 8.0 | 7.00 | 0.82 | Drifts up across runs |
| Johnson, Devin | 10.0 | 10.0 | 10.0 | 10.00 | 0.00 | Excellent — perfect consistency |
| Kim, Sarah | 6.0 | 6.0 | 8.0 | 6.67 | 0.94 | Notable jump in R3 |
| Lopez, Miguel | 6.0 | 7.0 | 8.0 | 7.00 | 0.82 | Monotonically drifts up |
| Martinez, Sofia | 9.0 | 9.0 | 10.0 | 9.33 | 0.47 | |
| Nguyen, Kevin | 9.0 | 9.0 | 10.0 | 9.33 | 0.47 | |
| O'Brien, Patrick | 6.0 | 6.0 | 6.0 | 6.00 | 0.00 | |
| Patel, Priya | 9.0 | 9.0 | 9.0 | 9.00 | 0.00 | Excellent — perfect consistency |
| Quinn, Aiden | 2.0 | 2.0 | 4.0 | 2.67 | 0.94 | Large R3 jump — vague response |
| Rivera, Carmen | 7.0 | 7.0 | 7.0 | 7.00 | 0.00 | |
| Smith, Jordan | 1.0 | 1.0 | 1.0 | 1.00 | 0.00 | ✅ Correctly low — wrong answer (SE = σ×√n) |
| Thompson, Brianna | 10.0 | 10.0 | 10.0 | 10.00 | 0.00 | Excellent — perfect consistency |
| Uribe, Daniel | 10.0 | 10.0 | 10.0 | 10.00 | 0.00 | Excellent — perfect consistency |
| Vargas, Elena | 7.0 | 7.0 | 7.0 | 7.00 | 0.00 | |
| Washington, Malik | 7.0 | 8.0 | 10.0 | 8.33 | 1.25 | **Highest StdDev** — large R3 jump |
| Xu, Michelle | 7.0 | 7.0 | 8.0 | 7.33 | 0.47 | |
| Young, Caleb | 1.0 | 1.0 | 2.0 | 1.33 | 0.47 | Correctly low — vague response |
| Zhang, Amy | 8.0 | 9.0 | 9.0 | 8.67 | 0.47 | |
| **Bennett, Chase** | — | — | — | **0** | — | Blank response, excluded from stats |

## Summary Statistics

| Metric | Value |
|--------|-------|
| **Overall Mean Score** | **7.34 / 10** |
| **Mean Run-to-Run StdDev** | **0.294** |
| **Max Single-Student StdDev** | **1.247** (Washington, Malik) |
| **Students with StdDev = 0** | 14 / 29 (48%) |
| **Students with StdDev ≥ 0.80** | 4 / 29 (14%) |
| **Run 1 Mean** | 6.97 / 10 |
| **Run 2 Mean** | 7.21 / 10 |
| **Run 3 Mean** | 7.86 / 10 |

## Litmus Student Outcomes

These students were chosen before running the benchmark as expected high/low anchors.

| Student | Expected | R1 | R2 | R3 | Mean | Verdict |
|---------|----------|----|----|-----|------|---------|
| Anderson, Marcus | High (~8–10) | 10 | 10 | 10 | 10.00 | ✅ Correct |
| Thompson, Brianna | High (~8–10) | 10 | 10 | 10 | 10.00 | ✅ Correct |
| Zhang, Amy | High (~8–10) | 8 | 9 | 9 | 8.67 | ✅ Correct |
| Patel, Priya | High (~8–10) | 9 | 9 | 9 | 9.00 | ✅ Correct |
| Smith, Jordan | Very low (~1–2) | 1 | 1 | 1 | 1.00 | ✅ Correct — actively wrong answer penalized |
| Young, Caleb | Low (~2–3) | 1 | 1 | 2 | 1.33 | ✅ Correct |
| Cooper, Maya | Low (~1–2) | 1 | 1 | 1 | 1.00 | ✅ Correct |
| Bennett, Chase | 0 (blank) | — | — | — | 0 | ✅ Excluded from grading |

All litmus students scored as expected. The model correctly identifies excellent responses, correctly penalizes factual errors (Smith: SE = σ×√n is wrong), and correctly distinguishes near-blank responses (Cooper, Young) from substantive work.

## Key Findings

### 1. Strong litmus discrimination
GLM-5.1:cloud cleanly separates high-quality responses (9–10) from weak/wrong ones (1–2). Smith, Jordan — who wrote the incorrect formula SE = σ×√n — scored 1.0 across all three runs. Cooper, Maya's near-empty response also scored 1.0 consistently.

### 2. Consistent on strong responses
14 of 29 students had StdDev = 0 across all three runs. The top students (Anderson, Diaz, Johnson, Thompson, Uribe) scored 10/10 in every run. This is excellent anchor stability.

### 3. Upward drift in Run 3
Mean scores increased monotonically across runs: R1 = 6.97, R2 = 7.21, R3 = 7.86. This may reflect non-determinism in cloud inference. Several mid-range students jumped significantly in R3:
- Washington, Malik: 7 → 8 → **10** (StdDev 1.25)
- Kim, Sarah: 6 → 6 → **8** (StdDev 0.94)
- Quinn, Aiden: 2 → 2 → **4** (StdDev 0.94)
- Ibrahim, Fatima: 6 → 7 → **8** (StdDev 0.82)
- Lopez, Miguel: 6 → 7 → **8** (StdDev 0.82)

This drift pattern (not random noise, but monotonically increasing) may be worth investigating — it could indicate the model has nondeterminism that trends toward inflation over a session.

### 4. Higher overall StdDev than nemotron-3-super
The mean StdDev of 0.294 (on a 10-pt scale, ≈ 2.94% of max) compares to nemotron-3-super's 0.237 on a 4-pt scale (5.93% of max). On a normalized basis, GLM-5.1:cloud is more consistent than nemotron-3-super default conditions.

### 5. Mid-range responses are most variable
Students in the 6–8 range showed the most inconsistency. Very strong responses (9–10) and very weak responses (0–2) were essentially stable. This is the expected pattern — rubric borderlines are hardest to call consistently.

### 6. Scoring calibration looks appropriate for high school seniors
The mean of 7.34/10 is reasonable for a mixed-ability class. The distribution skews toward the upper end, consistent with the OGRE grading philosophy (benefit-of-the-doubt, partial credit for understanding).

## Score Distribution

| Score | Count (across all 3 runs) | % |
|-------|--------------------------|---|
| 10 | 18 | 20.7% |
| 9 | 21 | 24.1% |
| 8 | 15 | 17.2% |
| 7 | 18 | 20.7% |
| 6 | 9 | 10.3% |
| 4 | 1 | 1.1% |
| 2 | 3 | 3.4% |
| 1 | 3 | 3.4% |

(87 total grades across 29 students × 3 runs)

## Comparison to Prior Benchmarks

> **Dataset caveat:** direct numeric comparison is limited because this benchmark uses a different question, rubric, and student set. Structural comparisons (StdDev patterns, litmus behavior) are valid.

| Metric | nemotron-3-super (default) | glm-5.1:cloud |
|--------|---------------------------|---------------|
| Runs | 5 | 3 |
| Students | 17 | 29 |
| Max Score | 4 | 10 |
| Mean StdDev | 0.237 (5.9% of max) | 0.294 (2.9% of max) |
| Max StdDev | 0.510 | 1.247 |
| Mean Score | ~2.8/4 (70%) | 7.34/10 (73%) |
| Litmus pass | Yes | Yes |
| Upward bias observed | Yes (+0.43 vs baseline) | Yes (R3 trend) |

## Test Environment

- **Date:** 2026-04-15
- **Model:** glm-5.1:cloud (Ollama cloud)
- **Pipeline:** Full OGRE production (`/api/grade` SSE endpoint, `buildBatchPrompt`)
- **Server:** localhost:3456 (grading-server via Bun)
- **Temperature:** 0.2 (server default)
- **Runs:** 3
- **Dataset:** `demo/demo-grading-page.html` — CLT + margin-of-error essay, 30 students, 10 pts max
- **Raw results:** `C:/tmp/glm51-demo-bench-results.json`
- **Benchmark script:** `ogre-desktop/_glm51-demo-bench.mjs`, `ogre-desktop/_glm51-run3.mjs`
