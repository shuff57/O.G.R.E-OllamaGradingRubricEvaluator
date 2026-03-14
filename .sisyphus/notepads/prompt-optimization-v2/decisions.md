# Decisions — prompt-optimization-v2

## [2026-03-13] Architecture Decisions

### Worktree
- Working directly on feat/qwen3-fine-tuning branch (single worktree, no isolation needed)

### Wave 1 Parallelization
- T1 (benchmark) + T2 (extract prompt) run in parallel — both independent
- T3 (VAPO analysis) starts only after T2 completes
- T1 is the long pole (10-30 min benchmark run)

### Feedback Format Change (Task 5a)
- Completely independent of scoring changes — runs in parallel with T4/T5
- Modifies only feedback instruction text inside `<...>` placeholders
- JSON structure (field names/order) MUST NOT change
- FT regression risk is low (output format, not scoring logic)

### VAPO Strategy
- No GCP access assumed → use manual VAPO-style structural analysis
- Focus on: role clarity, specificity, delimiter clarity, redundancy, anchor effectiveness, JSON format
- Treat suggestions as inspiration; cherry-pick FT-safe ones

### Success Threshold
- 95% = 24+/25 students within ±1 point
- Must hold in ≥2 of 3 runs (not just a single run)
- Separate for GLM-5 vs Sonnet AND Qwen35-FT vs Sonnet
