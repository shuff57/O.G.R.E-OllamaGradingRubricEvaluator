# Session: lfm2 Benchmark + Training Notebook
**Date:** 2026-03-17

## What was done
- Benchmarked `lfm2:latest` (LiquidAI/LFM2-24B-A2B, 24B MoE) against Sonnet 4.6 gold standard on 6 students (3 edge cases, 3 clear cases)
- Identified critical weakness: lfm2 inflates scores on minimal/short responses (Jimmerson scored 8 vs Sonnet's 2 — a 6-point delta)
- Clear cases matched Sonnet nearly perfectly (all within ±1)
- Created `test-data/OGRE_Finetune_LFM2_24B.ipynb` — full Colab training notebook for QLoRA fine-tuning on A100 40GB
- Created `fine-tuned-model/Modelfile-lfm2-24B-stat-grader` for Ollama import
- Added 12 edge-case training patches (score 1-5 short responses) to address the inflation weakness
- Created `test-data/lfm2-benchmark-students.json` — 6-student test subset for quick model evaluation

## Patterns noticed
- lfm2 model architecture is `lfm2moe` — hybrid 30 conv blocks + 10 GQA attention blocks, 64 experts (top-4 routing), 2.3B active params per token
- LoRA targets for lfm2 are non-standard: `q/k/v/out_proj` + `in_proj` (conv blocks) + `w1/w2/w3` (MoE expert MLPs). Attention-only LoRA leaves 75% of layers untouched.
- Unsloth MoE fast kernels do NOT currently cover lfm2moe arch (only gpt-oss, Qwen3, DeepSeek, GLM). Falls back to standard PEFT.
- Unsloth GGUF export may fail for lfm2moe — always include llama.cpp fallback cell in training notebooks for non-standard architectures
- lfm2 is an "early checkpoint" (17T tokens, still training) — base model not fully baked
- Ollama uses native `RENDERER lfm2` / `PARSER lfm2` — no manual chat template needed in Modelfile
- HuggingFace model ID: `LiquidAI/LFM2-24B-A2B`
- Requires `transformers>=4.55.0` for training, `transformers>=5.0.0` for inference
- QLoRA (~20-28GB) fits on A100 40GB; full bf16 LoRA needs A100 80GB+

## Model evaluation findings
- lfm2 grades strong/thorough student responses accurately (within ±1 of Sonnet gold standard)
- lfm2 catastrophically fails on very short/minimal responses — hallucinating rubric coverage that doesn't exist
- The failure mode: model fabricates that the student "correctly identified" criteria when the response is only 1-2 vague sentences
- This is the same pattern as score compression toward the middle, but worse — it's upward inflation on the weakest responses

## Corrections received
- User typed "lms2" then "lmf2" — the actual model name is `lfm2:latest` (Liquid Foundation Model 2)

## Skill improvement suggestions
- `run-benchmark.js` only supports models hardcoded in CONFIG.models — a `--model=provider:model:label` CLI flag would enable one-off model tests without editing the script
- The edge-case patch pattern (short responses with calibrated low scores) could be generalized into a reusable training data augmentation tool for any new model evaluation
- When benchmarking a new model, always include at least 2-3 "obviously bad" minimal-effort responses as canaries — if the model scores them above 5, it has a short-response inflation problem

## Files created/modified
- `test-data/OGRE_Finetune_LFM2_24B.ipynb` (new — 24-cell Colab notebook)
- `fine-tuned-model/Modelfile-lfm2-24B-stat-grader` (new — Ollama Modelfile)
- `test-data/lfm2-benchmark-students.json` (new — 6-student quick test subset)
