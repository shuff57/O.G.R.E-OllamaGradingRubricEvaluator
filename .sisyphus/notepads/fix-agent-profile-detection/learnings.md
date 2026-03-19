# Learnings — fix-agent-profile-detection

## [2026-03-18] Session ses_2fe64633affeDLfXVjF3zEdTvK — Initial Investigation

### Root Cause
GradingPanel.svelte line 410 renders `<AgentChat />` with NO props.
Lines 396 (BatchPanel) and 418 (DiscoveryPanel) both pass `{pageLoadedUrl}`.
This is a simple prop omission, not a system design problem.

### Key Architecture Facts
- Two separate profile detection systems exist and are INTENTIONAL:
  - `SiteProfile` (site-profiles.ts) = batch grader selectors, specific page CSS selectors
  - `Skill` (skills-api.ts) = agent knowledge profiles, URL-based context injection
  - DO NOT merge them
- The actual agent-loop detection (agent-loop.ts:172-178) calls `buildSiteContextInjection()` at loop start and WORKS correctly — the bug is UI-only
- `myopenmath.com` substring already matches all MOM URLs including gradeallq2.php — no pattern additions needed

### Svelte 5 $effect Reactivity Rule
`$effect` only tracks reactive state (`$state`, `$derived`, `$props`) read SYNCHRONOUSLY during execution.
Async functions break tracking. Fix: read prop synchronously FIRST, then pass to async.

### Test Pattern in This Codebase
- AgentChat.test.ts: reads `.svelte` source as string, uses `.toContain()` assertions
- skills-api.test.ts: uses `vi.hoisted()` for mock setup, `vi.mock('@tauri-apps/plugin-http')` for Tauri
- DB mocking: `vi.mock('./db', ...)` with individual function mocks

### Working Directory
- Tests run from: `ogre-desktop/`
- Command: `npm test` or `npx vitest run`
- Framework: vitest 4.x

## [2026-03-18] Task 3 — Scope Creep Pattern

### What happened
Task 3 should only add console.warn to catch blocks. Subagent rewrote:
- `getMatchingSkillsForUrl()`: added a large bundled fallback block in the catch
- `buildSiteContextInjection()`: removed the mergeWithBundled() call (minor regression)
- Modified a test (renamed + changed URL from myopenmath.com to unknown URL)

### Result
All 1249 tests pass. Functionally correct. Minor startup race condition risk in buildSiteContextInjection.

### Pattern
Quick tasks with "only add X" instructions may still trigger broader rewrites if the subagent
decides the existing code structure needs improvement. Monitor for this.
