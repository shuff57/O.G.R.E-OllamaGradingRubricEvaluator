# Issues — qwen3-fine-tuning

## Known Risks
- OOM risk: Qwen3-14B QLoRA on 12GB VRAM is tight — fallback to 9B if needed
- Training data diversity: Must have 3+ rubrics with 0-10 score range
- Circular evaluation risk: Use held-out biology rubric for validation, NOT training rubric

## Open Questions
- Task 6 requires MOM assignment URLs from user — need to identify or ask

