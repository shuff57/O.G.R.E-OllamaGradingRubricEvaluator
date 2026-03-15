# ctx-tuning Learnings

## [2026-03-13] Session ses_3187dd044ffeFDP42UHTzUdFHX — Init

### Environment
- Model: `shuff57/qwen3.5-9B-stat-grader:latest` (also tagged `qwen3.5-9B-stat-grader:latest`) — 5.6 GB
- Ollama: active systemd service
- Hardware: Ryzen 9 AI HX370 / Radeon 890M (gfx1150)
- Branch: `feat/qwen3-fine-tuning`
- Worktree: `/home/shuff57/Documents/GitHub/O.G.R.E-OllamaGradingRubricEvaluator`

### CRITICAL FINDING from Task 1 (2026-03-13)
**ctx reduction does NOT improve generation speed on this model/hardware.**
- ctx=8192: 9.8-10.1 tok/s
- ctx=4096: 10.1 tok/s (IDENTICAL)
- This is because Qwen3.5-9B uses hybrid DeltaNet architecture — most layers have O(1) state, not growing KV cache
- Flash Attention also gave no meaningful improvement (~0.3 tok/s within noise)
- **Hardware ceiling: ~10 tok/s for 9B Q4_K_M on 890M Vulkan**
- **20-30 tok/s target is NOT achievable via ctx tuning on this hardware**

### GPU State (confirmed working)
- OLLAMA_VULKAN=1 already set in /etc/systemd/system/ollama.service.d/override.conf
- 33/33 layers on Vulkan GPU (AMD Radeon 890M RADV GFX1150)
- 63 GiB VRAM available (UMA — full system RAM)
- ollama ps: 100% GPU
- Prefill: 137-152 tok/s (fast — confirms GPU working)

### Token Counts from Real Test
- 5-student grading batch at ctx=8192: prompt_eval_count=614 input tokens, 341 output tokens
- This is useful for calibrating what 9/15-student batches will need

### Implications for Remaining Tasks
- Task 2 (benchmark script): Should still be built to get systematic data
- Task 3 (sweep): Will confirm uniform speed across ctx values
- Task 4 (Modelfile): 
  - num_ctx should stay at 8192 (needed for 15 students — ~7300 tokens)
  - Add PARAMETER num_gpu 99 for robustness
  - Update comment to document actual ~10 tok/s speed on 890M Vulkan
  - The "optimization" here is ensuring GPU is definitely used, not speed gains

### Pre-existing LSP Errors (NOT in scope)
- `grading-server/grading.js` lines 318, 333 — assignment in expression (pre-existing)
- `grading-server/server.js` — multiple unreachable code warnings (pre-existing)
- Do NOT touch these files
