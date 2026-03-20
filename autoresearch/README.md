# autoresearch — Grading Prompt Optimizer

Autonomous loop that improves `GRADING_PHILOSOPHY` and `SCORING_SCALE_DESCRIPTORS`
in `grading-server/grading-constants.js` without human intervention.

**Goals (in priority order)**
1. Grade ~1 point more generously on well-defined responses
2. Handle edge cases reliably (blank → 0, exceptional → 9–10)
3. Minimize prompt length
4. Reduce run-to-run variance to the model precision floor

---

## Quick Start

```bash
# 1. Establish baseline (required once; ~3 min for 25 students)
bun run autoresearch/establish-baseline.js

# 2. Run the optimizer (overnight; defaults: 100 iterations, 8h, $50 budget)
bun run autoresearch/loop.js

# 3. Smoke-test without API calls
bun run autoresearch/loop.js --dry-run

# 4. Show all options
bun run autoresearch/loop.js --help
```

No `ANTHROPIC_API_KEY` needed — uses GitHub Copilot OAuth automatically
from `~/.local/share/opencode/auth.json`.

---

## How It Works

```
establish-baseline.js
  └─ grades 25 gold-standard students → baseline-metric.json

loop.js
  ├─ load baseline + current grading-constants
  ├─ for each iteration:
  │   ├─ mutation-engine: propose a change (remove/merge/rephrase/adjust)
  │   ├─ eval-harness: grade all 25 students N times with the mutated constants
  │   ├─ metrics: compute composite score
  │   ├─ loop-controller: keep if composite ≥ baseline, discard otherwise
  │   └─ results-tracker: append row to results.tsv + save snapshot if kept
  └─ stop at: maxIterations | maxTimeMinutes | maxCostDollars | convergence
```

Simplicity law: a shorter prompt with equal composite always beats a longer one.

---

## Reading Results

`autoresearch/results.tsv` — one row per accepted mutation:

| column | meaning |
|--------|---------|
| `composite` | weighted objective (higher = better) |
| `generosity` | avg score shift vs gold (target: +1) |
| `variance` | run-to-run spread (target: near 0) |
| `edge_cases` | blank/exceptional reliability (0–1) |
| `within1` | fraction of students within 1 pt of gold |
| `conciseness` | 1 − (prompt_len / baseline_len) |
| `status` | `keep` or `discard` |

`autoresearch/snapshots/<tag>/` — full `grading-constants.js` snapshot for every kept mutation.

---

## Applying Results

After the loop finishes, copy the best snapshot's constants into `grading-constants.js`:

```bash
# Find the best iteration from results.tsv
sort -t$'\t' -k2 -nr autoresearch/results.tsv | head -3

# Copy its snapshot constants into the source file manually
# (review the diff before committing)
```

Run the full grading-server test suite before committing any constant changes:

```bash
cd grading-server && bun test
```

---

## Files

| file | purpose |
|------|---------|
| `loop.js` | CLI entry point |
| `program.md` | strategy guide (mutation priorities, simplicity law) |
| `establish-baseline.js` | one-time baseline runner |
| `baseline-metric.json` | fixed reference point for the search |
| `results.tsv` | append-only result log |
| `eval-harness.js` | grades students with injected constants |
| `mutation-engine.js` | proposes prompt mutations via LLM |
| `loop-controller.js` | keep/discard logic + convergence detection |
| `metrics.js` | composite score formula |
| `mutations.js` | mutation type definitions + apply/revert |
| `results-tracker.js` | TSV writer + snapshot saver |
| `data-loader.js` | loads gold standard + rubric |
