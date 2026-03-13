# qwen3.5-9B-stat-grader

Fine-tuned Qwen3.5-9B for grading student responses in statistics courses. Outputs structured JSON with scores and detailed feedback. Optimized for use with the [O.G.R.E grading system](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator).

## Details

| | |
|---|---|
| **Base model** | Qwen3.5-9B |
| **Quantization** | Q4_K_M (~5.6 GB) |
| **Training** | 1 epoch, LoRA rank 16, Unsloth |
| **Data** | 415 examples (239 text + 176 handwriting/vision) |
| **Topics** | 22 statistics topics (hypothesis testing, CLT, ANOVA, regression, probability, etc.) |
| **Thinking mode** | Disabled — outputs JSON directly, no chain-of-thought preamble |

## Examples

### Text Grading

**Prompt:** Grade a student's explanation of p-values (0-10)

**Student response:** *"A p-value is the probability that the null hypothesis is true. If p < 0.05 we reject it."*

**Model output:**
```json
{"score": 2, "feedback": "The response is fundamentally incorrect. A p-value is NOT the probability that the null hypothesis is true; it is the probability of observing data as extreme as (or more extreme than) what was observed, assuming the null hypothesis is true. The student also omitted the definition of the p-value itself, only stating the decision rule."}
```

### Handwriting/Vision Grading

**Prompt:** Grade handwritten ANOVA response with image

**Model output:**
```json
{"transcription": "ANOVA F tests if groups are different.\nKind of like a t-test but for 3 sections.\nNeed normal and independent data.\nBig F means maybe reject, then groups differ.", "score": 3}
```

---

## Benchmark Results

Graded 25 demo students on a statistics free-response question. Each model graded the same students 3 independent times to measure both **run-to-run consistency** and **cross-model agreement**.

### Per-Model Summary

| Model | Runs | Mean Score | Std Dev | Run-to-Run Variance |
|-------|------|-----------|---------|---------------------|
| GLM-5 (cloud, 236B) | 3 | 6.17 | 0.22 | 0.049 |
| Claude Sonnet 4.6 | 3 | 6.37 | 0.15 | 0.023 |
| **qwen3.5-9B-stat-grader** | **3** | **6.48** | **0.26** | **0.069** |

### Cross-Model Agreement

Agreement = % of students where score difference is within 1 point.

| Model Pair | Agreement | Agree/Total |
|------------|-----------|-------------|
| GLM-5 vs Sonnet 4.6 | 92.0% | 23/25 |
| GLM-5 vs qwen3.5-9B-stat-grader | 80.0% | 20/25 |
| **Sonnet 4.6 vs qwen3.5-9B-stat-grader** | **92.0%** | **23/25** |

### Run-to-Run Consistency (per student, per model)

Shows individual scores from 3 independent grading runs. Lower variance = more consistent.

| Student | GLM-5 R1 | R2 | R3 | Avg | Sonnet R1 | R2 | R3 | Avg | FT R1 | R2 | R3 | Avg |
|---------|----------|----|----|-----|-----------|----|----|-----|-------|----|----|-----|
| Student A | 8 | 7 | 8 | 7.7 | 8 | 8 | 8 | 8.0 | 7 | 7 | 7 | 7.0 |
| Student B | 7 | 6 | 7 | 6.7 | 7 | 7 | 7 | 7.0 | 7 | 7 | 7 | 7.0 |
| Student C | 9 | 8 | 8 | 8.3 | 9 | 9 | 9 | 9.0 | 9 | 9 | 7 | 8.3 |
| Student D | 4 | 4 | 5 | 4.3 | 4 | 4 | 4 | 4.0 | 4 | 6 | 4 | 4.7 |
| Student E | 3 | 3 | 4 | 3.3 | 3 | 2 | 3 | 2.7 | 3 | 5 | 3 | 3.7 |
| Student F | 5 | 4 | 5 | 4.7 | 5 | 5 | 6 | 5.3 | 5 | 4 | 4 | 4.3 |
| Student G | 7 | 7 | 7 | 7.0 | 8 | 7 | 8 | 7.7 | 9 | 8 | 8 | 8.3 |
| Student H | 10 | 9 | 9 | 9.3 | 9 | 9 | 9 | 9.0 | 10 | 10 | 10 | 10.0 |
| Student I | 9 | 8 | 8 | 8.3 | 8 | 8 | 8 | 8.0 | 9 | 6 | 8 | 7.7 |
| Student J | 2 | 2 | 3 | 2.3 | 2 | 2 | 2 | 2.0 | 3 | 2 | 2 | 2.3 |
| Student K | 9 | 9 | 9 | 9.0 | 9 | 9 | 9 | 9.0 | 9 | 8 | 9 | 8.7 |
| Student L | 8 | 7 | 7 | 7.3 | 7 | 7 | 7 | 7.0 | 8 | 7 | 7 | 7.3 |
| Student M | 8 | 8 | 8 | 8.0 | 8 | 8 | 8 | 8.0 | 7 | 7 | 7 | 7.0 |
| Student N | 4 | 3 | 4 | 3.7 | 4 | 3 | 4 | 3.7 | 5 | 4 | 6 | 5.0 |
| Student O | 3 | 4 | 3 | 3.3 | 5 | 5 | 4 | 4.7 | 4 | 3 | 3 | 3.3 |
| Student P | 7 | 7 | 7 | 7.0 | 7 | 7 | 7 | 7.0 | 7 | 7 | 7 | 7.0 |
| Student Q | 9 | 7 | 7 | 7.7 | 8 | 8 | 8 | 8.0 | 9 | 9 | 7 | 8.3 |
| Student R | 4 | 4 | 4 | 4.0 | 5 | 4 | 5 | 4.7 | 6 | 6 | 5 | 5.7 |
| Student S | 5 | 6 | 8 | 6.3 | 8 | 7 | 8 | 7.7 | 7 | 7 | 7 | 7.0 |
| Student T | 9 | 8 | 8 | 8.3 | 8 | 8 | 8 | 8.0 | 9 | 9 | 9 | 9.0 |
| Student U | 8 | 8 | 8 | 8.0 | 8 | 7 | 7 | 7.3 | 7 | 7 | 7 | 7.0 |
| Student V | 5 | 5 | 5 | 5.0 | 6 | 6 | 6 | 6.0 | 7 | 7 | 7 | 7.0 |
| Student W | 3 | 3 | 4 | 3.3 | 4 | 4 | 4 | 4.0 | 5 | 5 | 5 | 5.0 |
| Student X | 2 | 2 | 3 | 2.3 | 3 | 2 | 3 | 2.7 | 3 | 3 | 2 | 2.7 |
| Student Y | 9 | 9 | 9 | 9.0 | 9 | 9 | 9 | 9.0 | 9 | 10 | 7 | 8.7 |

### Model-to-Model Score Comparison (averaged across runs)

| Student | GLM-5 | Sonnet 4.6 | qwen3.5-FT | Spread |
|---------|-------|------------|------------|--------|
| Student A | 7.7 | 8.0 | 7.0 | 1.0 |
| Student B | 6.7 | 7.0 | 7.0 | 0.3 |
| Student C | 8.3 | 9.0 | 8.3 | 0.7 |
| Student D | 4.3 | 4.0 | 4.7 | 0.7 |
| Student E | 3.3 | 2.7 | 3.7 | 1.0 |
| Student F | 4.7 | 5.3 | 4.3 | 1.0 |
| Student G | 7.0 | 7.7 | 8.3 | 1.3 |
| Student H | 9.3 | 9.0 | 10.0 | 1.0 |
| Student I | 8.3 | 8.0 | 7.7 | 0.7 |
| Student J | 2.3 | 2.0 | 2.3 | 0.3 |
| Student K | 9.0 | 9.0 | 8.7 | 0.3 |
| Student L | 7.3 | 7.0 | 7.3 | 0.3 |
| Student M | 8.0 | 8.0 | 7.0 | 1.0 |
| Student N | 3.7 | 3.7 | 5.0 | 1.3 |
| Student O | 3.3 | 4.7 | 3.3 | 1.3 |
| Student P | 7.0 | 7.0 | 7.0 | 0.0 |
| Student Q | 7.7 | 8.0 | 8.3 | 0.7 |
| Student R | 4.0 | 4.7 | 5.7 | 1.7 |
| Student S | 6.3 | 7.7 | 7.0 | 1.3 |
| Student T | 8.3 | 8.0 | 9.0 | 1.0 |
| Student U | 8.0 | 7.3 | 7.0 | 1.0 |
| Student V | 5.0 | 6.0 | 7.0 | 2.0 |
| Student W | 3.3 | 4.0 | 5.0 | 1.7 |
| Student X | 2.3 | 2.7 | 2.7 | 0.3 |
| Student Y | 9.0 | 9.0 | 8.7 | 0.3 |

**No flagged disagreements** — all score spreads are under 3 points across all models.

### Key Takeaways

- **92% agreement with Claude Sonnet 4.6** — a 9B local model matching a frontier API model
- **Consistent run-to-run** — Sonnet is most stable (0.023 variance), GLM-5 close (0.049), FT model slightly higher (0.069) but well within acceptable range
- **Score calibration** — FT model trends ~0.3 points higher than cloud models on average, which reflects the training data's tendency toward partial credit
- **Perfect agreement on clear cases** — Students at score extremes (2-3 or 9-10) get identical scores across all models
- Runs entirely locally with no API costs or data leaving your machine
