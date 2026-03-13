# Draft: Handwriting Vision Training Data — Gap Coverage

## Requirements (confirmed from previous session)

- **Goal**: Expand handwriting/vision training data to cover topics beyond the 4 currently in gen-handwriting-images.py
- **Previous session (ses_327b71662ffe)**: User said "make more visual examples to close the gap on the other topics"
- **Previous session planned**: 10 missing topics → 24 → ~90 entries. Session ended mid-edit.

## Current State

### Vision data (gen-handwriting-images.py): 4 topics, 8 responses
| Topic | Responses | Quality Levels |
|-------|-----------|---------------|
| t-test | 3 (weak=3, partial=6, strong=9) | good/medium/bad |
| z-score | 3 (wrong=2, partial=5, strong=9) | good/medium/bad |
| confidence interval | 1 (partial=5) | good/medium/bad |
| binomial | 1 (partial=6) | good/medium/bad |
| **Total** | **8 responses × 3 qualities = 24 images** | |

### Text training data (build-training.cjs): 22 topics, 283 entries
All topics listed in FINE-TUNING-PLAN.md — full coverage.

### Gap: 18 topics with ZERO vision data
Plus CI and binomial only have 1 response each (need weak + strong).

## Key Insight: build-training.cjs has all content

The build-training.cjs `syntheticTopics` array already contains:
- Rubric definitions (question + checklist/model answer)
- Student responses at 3 quality levels (weak ~3, partial ~6, strong ~9)

**The task is primarily PORTING these to Python format in gen-handwriting-images.py**, not creating content from scratch.

## Topics to Add (from build-training.cjs syntheticTopics)

1. Experimental design (syntheticTopics[0])
2. Conditional probability / Bayes (syntheticTopics[1])  
3. Sampling distributions / CLT (syntheticTopics[3])
4. Chi-square independence (syntheticTopics[5])
5. Linear regression (syntheticTopics[7])
6. Two-sample t-test (syntheticTopics[8])
7. Paired t-test (syntheticTopics[9])
8. Categorical data / contingency tables (syntheticTopics[10])
9. Chi-square GOF (syntheticTopics[11])
10. ANOVA (syntheticTopics[12])
11. Power of a test (syntheticTopics[13])
12. Inference for regression slope (syntheticTopics[14])
13. Random variables E[X], Var[X] (syntheticTopics[15])
14. Geometric distribution (syntheticTopics[16])
15. Normal approximation to binomial (syntheticTopics[17])
16. Basic probability rules (syntheticTopics[18])
17. Outliers in regression (syntheticTopics[19])
18. One-proportion z-test (likely in original entries — need to check)

Plus fill out:
- CI: add weak (~3) + strong (~9) responses
- Binomial: add weak (~3) + strong (~9) responses

## Technical Approach

1. For each missing topic: create R_* rubric dict + RESPONSES entries in gen-handwriting-images.py
2. Port rubric from build-training.cjs format (JS checklist) → Python dict format (matching R_T_TEST pattern)
3. Port student responses (weak/strong minimum, partial optional)
4. Keep Unicode math chars → to_render_text() handles conversion
5. Run script to regenerate all outputs

## Open Questions

- All 18 missing topics or a subset of the most important?
- Minimum responses per topic: 2 (weak+strong) or 3 (weak+partial+strong)?

## Test Strategy

- Run `python gen-handwriting-images.py` — verify all images render
- Check finetune-grading-vision.jsonl line count matches expected
- Spot-check a few images for readability
