# Draft: Qwen3 Fine-Tuning (Grading + MOM Code)

## Requirements (confirmed)
- **Base model**: TBD — Benchmark Qwen3.5-9B vs Qwen3-14B, then fine-tune winner
- **Task 1 — Grading**: Rubric-based essay grading with structured JSON output (score + feedback)
- **Task 2 — Coding**: Writing MyOpenMath (IMathAS) question code (PHP-like math markup, randomization, conditional logic)
- **Strategy**: Single fine-tuned model for both tasks
- **Hardware**: RTX 4070 12GB VRAM (4-bit QLoRA)
- **Target agreement**: 90%+ with GLM-5 + Sonnet 4.6 consensus on grading task

## Phase 0: Model Selection (benchmark before fine-tuning)
- Run both Qwen3.5-9B and Qwen3-14B zero-shot against existing grading benchmark
- Compare pairwise agreement with GLM-5 + Sonnet 4.6 consensus
- Winner becomes the fine-tuning base
- Existing benchmark runner: `test-data/run-benchmark.js`
- Existing benchmark data: `test-data/benchmark-cor-v2.json`

### Qwen3.5-9B (newer)
- Architecture: 2026, multimodal, 262K context, vision+tools+thinking
- VRAM: ~6-7GB Q4 (lots of headroom)
- Fine-tuning: Faster, less VRAM needed
- Ollama: `qwen3.5:9b` (544K downloads, 2 days old)

### Qwen3-14B (bigger)
- Architecture: Apr 2025, text-only, 41K context, tools+thinking
- VRAM: ~10-11GB Q4 (tight fit)
- Fine-tuning: Slower, tighter VRAM
- Ollama: `qwen3:14b` (22.4M downloads, well-tested)

## Technical Decisions
- Qwen3 family chosen over Phi-4 (16K context limit), Gemma 3 (weaker coding), Llama 4-8B (too small for nuanced grading)
- Single model preferred over two specialists for infrastructure simplicity
- LoRA/QLoRA training approach (4-bit) confirmed feasible on 12GB VRAM
- Benchmark both candidates zero-shot before committing to fine-tuning base

## Research Findings
- Distillabs: Fine-tuned Qwen3-4B matched GPT-OSS-120B on 7/8 benchmarks — Qwen3 family fine-tunes exceptionally well
- Smaller Qwen models benefit MORE from fine-tuning (distillabs)
- Qwen3.5: "Towards Native Multimodal Agents" — designed for tool use + structured output
- Existing grading training data: 25 examples in `test-data/finetune-gptoss-qwen.jsonl` (need 50-80+ minimum)
- MOM training data: TBD — unknown quantity

## Open Questions
- How much MOM question code training data exists? (examples of prompt → code pairs)
- What MOM question types need to be covered? (essay-FRQ, multiple choice, numerical, graph-based?)
- What's the target quality for MOM code generation? (functional code? correct math? proper randomization?)
- Will fine-tuning happen on the RTX 4070 machine or elsewhere?
- Are there existing MOM question examples in the project that could become training data?
- Where are the additional graded student examples from other topics? (need 50-80+ for grading fine-tune)

## Scope Boundaries
- INCLUDE: Zero-shot benchmark of both model candidates
- INCLUDE: Grading task + MOM code generation in one fine-tuned model
- INCLUDE: Training data preparation pipeline
- INCLUDE: Benchmark evaluation against GLM-5/Sonnet consensus
- EXCLUDE: TBD
