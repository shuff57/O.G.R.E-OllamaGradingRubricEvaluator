# Session Reflection: Fix Agent Mode Site Profile Detection

**Date:** 2026-03-18
**Session:** ses_2fe64633affeDLfXVjF3zEdTvK
**Branch:** desktop (fix/agent-profile-detection merged)

## What Was Done

- Investigated and fixed agent mode site profile detection bug: switching to Agent Mode showed "No site profile found" despite normal grading mode correctly detecting the MOM profile
- Root cause: `GradingPanel.svelte` passed `pageLoadedUrl` to BatchPanel (line 396) and DiscoveryPanel (line 418) but NOT to AgentChat (line 410) — simple prop omission
- Secondary issue: AgentChat's `$effect` called async Tauri IPC functions with no reactive Svelte 5 dependencies, so it only ran once on mount and never re-checked
- TDD approach: wrote 7 failing tests → implemented prop fix + reactive `$effect` → added `console.warn` to 6 silent catch blocks
- Fixed regression where `checkActiveProfile()` used raw DB query (`getSkillsWithUrlPattern`) instead of `getMatchingSkillsForUrl()` (which includes bundled profile fallback via `mergeWithBundled()`)
- Merged `linux-gdk-input-injection` branch into `desktop` (clean automatic merge, no conflicts, 1259/0 tests)

## Patterns Noticed

### Subagent Worktree Discipline
Subagents consistently modify files in the MAIN repo working directory even when explicitly told to work in a worktree. Must verify with `git diff --stat` on the main repo after each delegation and restore files with `git checkout -- <files>` before merging the worktree branch.

### Scope Creep on "Only Add X" Tasks
Task 3 was "only add console.warn to existing catch blocks." The subagent rewrote `getMatchingSkillsForUrl()` function structure, added a bundled fallback block, and modified an existing test. Result was functionally correct but exceeded spec. Pattern: subagents treat simple additions as improvement opportunities.

### Final Wave Git Scope False Positives
F4 (Scope Fidelity) used `git diff origin/desktop..HEAD` instead of `HEAD~N..HEAD`, which included pre-existing branch history and produced false positive "forbidden file modification" rejections. Fix: always specify `HEAD~N..HEAD` in F4 instructions where N = number of plan commits.

### Evidence File Naming Mismatches
F1 (Plan Compliance) rejected because plan specified `task-1-agentchat-tests-fail.txt` but subagent created `task-1-tests-failing.txt`. Fix: either standardize evidence naming in subagent prompts or make F1 check for `task-N-*` glob patterns instead of exact filenames.

### Two Separate Profile Systems Are Intentional
- `SiteProfile` (site-profiles.ts) = CSS selectors for batch grading extraction
- `Skill` (skills-api.ts) = markdown knowledge profiles for agent context injection
- Both have MOM URL patterns but serve different purposes — do NOT merge them

### Svelte 5 $effect Reactivity Rule
`$effect` only tracks reactive state (`$state`, `$derived`, `$props`) read SYNCHRONOUSLY during execution. Async function calls (like Tauri IPC `invoke()`) break tracking. Fix: read the prop into a local const FIRST (`const url = pageLoadedUrl`), then pass it to the async function.

## Corrections Received
None — user confirmed approach at each gate.

## Skill Improvement Suggestions
- **session-reflector**: Should auto-trigger at session end instead of requiring manual invocation or user reminder
- **Final Wave F4 instructions**: Should explicitly specify `HEAD~N..HEAD` scope, not `origin/branch..HEAD`
- **Evidence naming**: Subagent prompts should include exact expected filenames, or F1 should use glob matching
