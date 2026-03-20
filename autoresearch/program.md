# Autoresearch Program

## Goal
Optimize `GRADING_PHILOSOPHY` and `SCORING_SCALE_DESCRIPTORS` in `grading-constants.js` for four things at once:
- grade about 1 point more generously on well-defined responses
- handle edge cases reliably: blank = 0, exceptional = 9-10
- minimize prompt length
- drive run-to-run variance down to the model precision limit

This is prompt compression plus calibration. We want a shorter, sharper policy that grades a little kinder, stays stable, and does not break the extremes.

## Setup
Run `bun run autoresearch/establish-baseline.js` first.

That creates `baseline-metric.json`, the fixed reference point for the whole search.

No `ANTHROPIC_API_KEY` is required. Evaluation auto-uses GitHub Copilot OAuth from `~/.local/share/opencode/auth.json` when available.

## Mutation strategy
Mutations are proposed by `mutation-engine.js`.

Priority order:
1. `REMOVE_BULLET`
2. `MERGE_BULLETS`
3. `REPHRASE_BULLET`
4. `ADJUST_DESCRIPTOR`
5. `ADD_BULLET` (last resort only)

Why this order:
- First delete redundancy.
- Then merge overlap.
- Then rewrite unclear language.
- Then tune score anchors.
- Only add text when the missing behavior is real and cannot be expressed by simplification.

Default attitude: the current prompt is probably too wordy, not too short.

## Simplicity criterion
Use this law:

> A prompt with fewer words and equal composite score is always preferred. A 0.001 gain that adds 50 words? Not worth it. A 0.001 gain from deleting words? Always keep.

This means simplicity is not cosmetic. It is part of the objective.

## Experiment loop
Core loop:
1. modify
2. eval (`N` runs)
3. keep or discard

Advance when:
- composite improves enough, or
- score is effectively tied and the prompt gets shorter

Discard when:
- composite regresses
- any protected edge-case behavior breaks
- per-student regression guard trips

Never argue with the eval. The loop is the judge.

## Search heuristics
- Prefer deleting duplicate instructions before inventing new policy.
- Prefer concrete score anchors over abstract tone words.
- Protect the floor and ceiling explicitly: blanks should collapse to 0; truly exceptional work must still reach 9-10.
- Remove ambiguity that lets the model waffle between adjacent scores.
- Favor wording that rewards demonstrated understanding over polish.

## NEVER STOP
Run until a hard budget cap is hit:
- max iterations
- max time
- max cost

Never pause mid-loop for human input. The human sets the budget, then the search runs to completion.

## Outputs
The loop writes:
- `results.tsv` — one row per iteration
- `snapshots/` — saved only on keep
- `baseline-metric.json` — fixed reference baseline

Read `results.tsv` like a training curve. Read `snapshots/` like checkpoints. Keep only what measurably helps or simplifies.
