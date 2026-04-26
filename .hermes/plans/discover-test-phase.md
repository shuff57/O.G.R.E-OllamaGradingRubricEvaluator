# Discover Mode: Real Selector Verification

Log of test-phase options for OGRE's Discover Mode chat flow. Current state and fallback plan.

## Background

The original `TRAINING_SYSTEM_PROMPT` mentioned a "test phase" but it was never wired up — `proposedTestAction` on `TrainingSession` was declared and initialized but **never read or written** anywhere in the codebase. The AI would talk about testing in prose, the user would reply "yes", nothing would actually verify selectors.

Meanwhile, `profile-tester.ts:testSelectorDepth` DOES run selectors against the live DOM via CDP and returns match counts, sample text, and errors. It was only wired to the form-based discovery flow (`discoveryResultToSiteProfile → testProfile`), not the chat-based training flow.

## Chosen approach (2026-04-21): Option 1 — auto-verify after perception

When the AI produces a perception report with the `**Proposed selectors:** - field: selector` template, automatically:

1. Parse the selectors from the markdown
2. Run `testSelectorDepth` against the live page
3. Inject the match-count report as a user message into the training conversation
4. Let the AI see the feedback and refine its selectors in its follow-up response

No new AI action, no schema changes to `TrainingSession`. The verification happens deterministically after every perception message.

Implementation: `DiscoveryPanel.svelte:handleTrainMessage`.

## If Option 1 proves insufficient → fallback to Option 2: per-selector AI action

If the auto-verify flow doesn't give the AI enough leverage (e.g., it can't iterate on one selector at a time, or it gets confused by the one-shot report), switch to:

1. Add `test_selector` to `HARNESS_CAPABILITIES.discover.allowedActions` with params `{selector: string, field: string}`
2. Handle the action in `DiscoveryPanel` via `evalScriptJSON`
3. AI proposes selectors one-by-one as actions, gets feedback per call, iterates
4. More AI-driven, chattier, but tighter feedback loop

Signs Option 1 isn't working well:
- AI produces the same non-matching selector on every follow-up
- AI ignores the verification report entirely
- AI claims success despite 0-match selectors
- Users have to dialogue-correct every selector manually (defeating the point of auto-verify)

## Not chosen: Option 3 — leave it

No verification, user eyeballs selectors. This is what the pre-harness code did. Rejected as the baseline but kept as a reference for what we're improving on.
