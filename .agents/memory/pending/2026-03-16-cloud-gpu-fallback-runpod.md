# Cloud GPU Fallback — RunPod Integration

## What was done
- Built cloud GPU fallback feature: RunPod Serverless adapter for `qwen3.5-9B-stat-grader` (9B Q4_K_M GGUF, ~5.6GB)
- 7 commits on `cloud-gpu-fallback` branch, merged to `desktop` via fast-forward
- RunPod adapter (`buildRunPodRequest`/`parseRunPodResponse`), auto-fallback on ECONNREFUSED, 120s cloud timeout, SSE progress event, settings UI, env var config, 12 new tests

## Patterns noticed
- **Provider naming**: `ollama-local` was already merged into single `ollama` provider. Comment on line 46 of ProviderSettings.svelte documents this. `ollama-cloud` is the separate cloud path. Users select "Ollama" for local and "Ollama (Cloud GPU)" for cloud.
- **RunPod API envelope**: Wraps Ollama payload in `{ input: {...} }`, responses in `{ id, status, output: {...} }`. Adapter is ~50 lines in providers.js.
- **Oracle false positives**: When auditing a feature branch, Oracle compared against full repo history instead of just `git diff base..HEAD`. Must explicitly instruct to use `git diff --stat <branch-point> HEAD` to scope actual changes.
- **GitHub auto-deploy moot for large models**: 5.6GB GGUF can't go in Docker images practically. RunPod Network Volume is the right approach. GitHub auto-deploy only helps for config changes, not model updates.
- **Community worker pattern**: `runpod-worker-ollama` (71 releases) handles Ollama installation and model loading inside RunPod container. No custom Dockerfile needed — just configure env vars and mount a Network Volume with the GGUF.

## Corrections received
- User initially wanted Modal → switched to RunPod for GitHub integration → GitHub integration turned out moot → stayed with RunPod for cost ($0.48/hr vs $0.80/hr) and cold starts (<200ms vs 2-4s)
- User clarified: no Docker unless absolutely necessary → community `runpod-worker-ollama` pre-built image eliminates need for custom Dockerfile
- `parseRunPodResponse` needed thinking fallback (mirrors `parseOllamaResponse` pattern) — caught by Oracle audit

## Skill improvement suggestions
- Plan compliance audit (F1) should always start with `git diff --stat base..HEAD` to scope file changes, not infer from repo history
- When provider decisions pivot mid-planning (Modal → RunPod), update the plan incrementally via Edit rather than rewriting — saves context
