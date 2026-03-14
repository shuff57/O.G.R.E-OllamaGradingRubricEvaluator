# Decisions — qwen3-fine-tuning

## Model Decision (Task 5)
- PENDING: Will be filled after zero-shot benchmark completes
- Candidates: qwen3.5:9b vs qwen3:14b
- Decision criteria: GLM-5 agreement > JSON parse rate > variance > prefer 9B if tied

## Training Strategy
- Phase 1: Grading only (50+ examples, 3+ rubrics, score range 0-10)
- Phase 2: MOM code (50+ examples) — ONLY if grading hits 90%
- Max epochs: 2, learning rate: 1e-5 to 2e-5
- MOM phase LR: half of grading phase (to prevent catastrophic forgetting)

