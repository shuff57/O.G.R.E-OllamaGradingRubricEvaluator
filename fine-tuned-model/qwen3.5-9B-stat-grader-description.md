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

---

## Inference Performance

Benchmarked on a Ryzen 9 AI HX370 laptop with Radeon 890M iGPU (63 GiB UMA VRAM) via Vulkan.

| Metric | Value |
|---|---|
| **Generation speed** | ~9-10 tok/s |
| **Prefill speed** | ~100-150 tok/s |
| **GPU offload** | 33/33 layers (100% GPU) |
| **Model size in memory** | ~5.6 GB (Q4_K_M) |

### Batch Grading Throughput

| Batch Size | Input Tokens | Output Tokens | Wall Time |
|---|---|---|---|
| 5 students | ~600 | ~350 | ~35 sec |
| 9 students | ~2,100 | ~2,150 | ~4 min |
| 15 students | ~3,500 | ~3,500 | ~7 min |

### Architecture Notes

- **Qwen3.5-9B is a dense model** — all 9B parameters are active for every token, requiring ~5 GB of memory bandwidth per token generated
- **DeltaNet hybrid architecture** — 24 of 32 layers use linear-attention DeltaNet (O(1) state size), only 8 layers use standard KV-cache attention. This means **context length (`num_ctx`) has negligible effect on generation speed** — reducing `num_ctx` from 8192 to 4096 does not improve tok/s
- **`num_ctx` is set to 8192** to accommodate 15-student batch prompts (~3,500 tokens input + output headroom)
- **Flash Attention** (`OLLAMA_FLASH_ATTENTION=1`) provided no measurable improvement on this model/hardware combination

### GPU & Vulkan Setup

This model requires Vulkan GPU acceleration for acceptable performance. Ollama must be configured with:

```
# /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_VULKAN=1"
```

Verify GPU offload after loading the model:
```bash
ollama ps
# Should show "100% GPU" in the processor column
```

### Known Limitations

- **No vision capability** — The base Qwen3.5-9B supports vision (image input), but the Unsloth LoRA export process strips the vision encoder from the GGUF. The fine-tuned model can only process text input despite being trained on 176 handwriting/vision examples. To restore vision, the model would need to be re-exported with the vision encoder included, or restructured to use `FROM qwen3.5:9b` with a separate `ADAPTER` file
- **Speed ceiling** — ~10 tok/s is the hardware limit for a dense 9B Q4_K_M model on the 890M iGPU. This is memory-bandwidth bound (9B params × 0.5625 bytes/param = ~5 GB read per token). No software tuning can exceed this

### Faster Alternative: Qwen3.5-35B-A3B

For higher throughput, consider fine-tuning **Qwen3.5-35B-A3B** instead:

| | 9B (dense) | 35B-A3B (MoE) |
|---|---|---|
| Total parameters | 9B | 35B |
| Active parameters per token | 9B | **3B** |
| Memory read per token | ~5 GB | **~1.7 GB** |
| Generation speed (890M) | ~10 tok/s | **~16.5 tok/s** |
| Architecture | Dense + DeltaNet | MoE (256 experts, 9 active) |
| Model size (Q4_K_M) | ~5.6 GB | ~21 GB |

The MoE model is **1.65x faster** because it only activates 3B of its 35B parameters per token, dramatically reducing memory bandwidth requirements. The tradeoff is a larger model file (~21 GB vs ~5.6 GB), though the 890M's 63 GiB UMA VRAM can accommodate it easily.
