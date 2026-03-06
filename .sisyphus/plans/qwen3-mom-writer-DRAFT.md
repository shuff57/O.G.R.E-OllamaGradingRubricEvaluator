# DRAFT: Qwen3 MOM Question Writer Fine-Tuning Plan

> **Status**: BREADCRUMB ONLY — full planning deferred until grading fine-tune (Plan 1) is complete  
> **Created**: 2026-03-06  
> **Prerequisite**: `qwen3-fine-tuning.md` Tasks 1–12 complete and `qwen3-math-grader:latest` registered in Ollama

---

## Architecture Decision (Already Made)

This is a **separate model** from the math grader. Do NOT combine with grading fine-tuning.

```
qwen3.5:9b  →  [MOM question writing fine-tune]  →  qwen3-mom-writer:latest
qwen3.5:9b  →  [math grading fine-tune]           →  qwen3-math-grader:latest  ← (Plan 1)
```

**Why separate**: Grading produces structured JSON. MOM writing produces IMathAS PHP-style code. Forcing one model to do both degrades both tasks. Separate models are sharper and independently debuggable.

---

## What This Model Should Do

Given a topic description (e.g., "Write a hypothesis test question about a proportion with a recycling scenario"), output working IMathAS question code that:
- Pastes into MyOpenMath without syntax errors
- Uses randomization (`$a = rand(...)`) for multiple versions
- Follows the MOM style guide (answer types, feedback blocks, etc.)

---

## Key References (Read These When Starting Plan 2)

| Resource | Location | Why |
|----------|----------|-----|
| MOM style guide | `.claude/skills/mom-style-guide/CLAUDE.md` | Code patterns, answer types, formatting rules |
| MOM FRQ skill | `.claude/skills/mom-frq/CLAUDE.md` | Free-response question patterns (1,043 lines) |
| MOM lib map | `.claude/skills/mom-lib-map/` | Statistics, algebra, calc question libraries |
| Private question repo | `shuff57/mom` (GitHub) | 50+ existing questions = training data source |
| MOM patterns | `.claude/skills/mom-patterns/CLAUDE.md` | Common code idioms |

---

## Training Data Plan (Sketched)

- **Source**: `shuff57/mom` private repo — extract existing working questions
- **Format**: `prompt → code` pairs
  - `messages[0]` system: "You are an expert MyOpenMath question writer..."
  - `messages[1]` user: Topic description + question type + constraints
  - `messages[2]` assistant: Full working IMathAS question code
- **Target size**: 50+ pairs across multiple question types (FRQ, numeric, multiple choice)
- **Validation**: 5+ generated questions paste into IMathAS without syntax errors

## Success Criteria (Placeholder)

- [ ] 5+ generated questions paste into IMathAS without syntax errors
- [ ] Questions use randomization (not hardcoded values)
- [ ] Output follows MOM style guide formatting
- [ ] No grading regression: `qwen3-math-grader:latest` benchmark unchanged (separate model — N/A by design)

---

## Questions to Answer When Starting Plan 2

1. Which question types to prioritize? (FRQ / numeric / multi-select / essay)
2. How many examples from `shuff57/mom` repo are usable as-is vs. need cleanup?
3. Does the model need to handle `$answerType` randomization, or just static code?
4. One model for all MOM question types, or per-type specialists?
5. Validation workflow: manual paste-test, or automated IMathAS syntax checker?

---

## How to Start Plan 2

1. Run `/feature-dev` or manually create `.sisyphus/plans/qwen3-mom-writer.md`
2. Reference this file + `qwen3-fine-tuning.md` as context
3. Pull training data from `shuff57/mom` repo using GitHub CLI or Playwriter
4. Load skills: `mom-frq`, `mom-style-guide`, `mom-patterns`, `mom-lib-map/statistics`
