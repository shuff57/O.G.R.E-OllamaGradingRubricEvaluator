---
type: session-reflection
session_id: oc-ses-2fe64633affedlfxvjf3zedtvk
date: 2026-03-18
slug: agent-profile-fix-and-skill-improvements
---

# Session: Agent Profile Fix & Skill Improvements

## What was done

- Fixed agent mode site profile detection bug — `AgentChat` wasn't receiving `pageLoadedUrl` prop from `GradingPanel.svelte`. TDD approach: 7 failing tests → implementation → all passing. Merged to `desktop` branch.
- Merged `linux-gdk-input-injection` branch into `desktop` (clean merge, 10 new tests).
- Implemented 3 skill/config improvements:
  1. **Session-reflector auto-trigger** — `coordination.js` `buildLearningsReminderBlock()` now fires MANDATORY directive when all tasks complete (task-based trigger), with turn-count fallback for sessions without task registry.
  2. **F4 git scope convention** — `writing-plans` skill and `executor.md` now mandate `HEAD~N..HEAD` instead of `origin/branch..HEAD` to avoid false positive forbidden-file rejections.
  3. **F1 evidence glob patterns** — Plans now use `task-N-*` glob matching instead of exact filenames for evidence file checks.

## Patterns noticed

- Subagents consistently modify main repo files even when told to work in worktrees. Must `git checkout -- <files>` on main before merging worktree branches.
- Subagent scope creep: "only add X" tasks get expanded into rewrites. Close monitoring required.
- Svelte 5 `$effect` reactivity trap: must read `$props` synchronously into a local const BEFORE any async call, or the effect won't track the dependency.
- Two separate profile detection systems (`SiteProfile` for CSS selectors vs `Skill` for agent context markdown) are intentional — do NOT merge them.

## Corrections received

- Turn-count threshold for session-reflector trigger was the wrong signal. Replaced with task-completion detection (all tasks done, none pending) as the primary trigger, keeping turn count as a soft fallback only.

## Skill improvement suggestions

- The `buildLearningsReminderBlock` task-completion trigger relies on the task registry being populated. Sessions that use ad-hoc work without `coord_claim_task` won't trigger the mandatory directive — the turn-count fallback covers this, but a future improvement could detect completed todowrite items as an additional signal.
- Consider adding a "subagent worktree discipline" checklist to `subagent-driven-development` skill to prevent the recurring main-repo contamination pattern.
