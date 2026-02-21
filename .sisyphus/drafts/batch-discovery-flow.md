# Draft: Batch Mode Discovery Flow

## Requirements (confirmed)
- When Batch mode has no matching profile, guide user to Discover mode
- During discovery, stop and confirm each selector with the user
- Build profile iteratively so it's accurate
- Once profile is complete, return to batch mode ready to grade

## Technical Decisions
- **Discovery trigger**: CTA card in BatchPanel replacing "Start Batch" when no profile matches. Clicking it auto-switches to Discovery tab.
- **Confirmation approach**: AI discovers ALL selectors at once, then present each selector one-by-one for user to Accept/Refine/Skip.
- **Post-discovery**: Auto-switch back to Batch tab with new profile pre-selected.
- **Confirmation UI**: Highlight matching elements on page (orange dashed outline), show match count + sample text, 2-button flow: Accept / Refine (opens element picker).
- **Confirmation scope**: Required selectors only (studentSection, studentName, scoreInput, feedbackBox). Skip optional ones unless they have issues.
- **Mode communication**: Callback props (onSwitchMode from GradingPanel → BatchPanel, onComplete from DiscoveryPanel → GradingPanel).

## Research Findings
- BatchPanel.svelte: Already shows profileWarning when no match found (line 128-133)
- DiscoveryPanel.svelte: Runs all-at-once, has refine capability per selector
- discovery-picker-integration.ts: Has `identifyAmbiguousSelectors()` + `refineSelector()` + `batchRefineSelectors()` — iterates all ambiguous selectors
- GradingPanel.svelte: 4 mode tabs, `setMode()` function on line 65, activeMode state on line 23
- discover.ts: `runDiscovery()` does full workflow, progress callbacks exist

## Test Strategy Decision
- **Infrastructure exists**: YES (vitest, 11 test files)
- **Automated tests**: YES (TDD - Red-Green-Refactor)
- **Framework**: vitest
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

## Open Questions
- (none remaining - all resolved)

## Scope Boundaries
- INCLUDE: No-profile detection in batch, guided flow to discovery, step-by-step confirmation, profile save, return to batch
- EXCLUDE: (pending) Changes to AI discovery prompt itself, changes to batch grading engine logic
