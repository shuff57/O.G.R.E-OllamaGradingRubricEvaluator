# Decisions — batch-discovery-flow

## [2026-02-21] Session Start

### Architecture Decisions (from plan)

1. **No Svelte stores** — All state flows via props/callbacks through GradingPanel as parent mediator
2. **GradingPanel holds cross-tab state** — `returnToBatch` and `preselectedProfileId` survive tab switches because panels mount/unmount but GradingPanel persists
3. **Required selectors are mode-dependent** — batch needs `studentSection`, sequential doesn't
4. **feedbackBox is optional** — null value shows "Not detected" and auto-skips in confirmation
5. **Cancel mid-confirmation** → returns to review phase (not idle), preserves discoveryResult
6. **Auto-return to Batch** only fires when `returnToBatch` context exists (not on direct discovery)
7. **Profile ID passed explicitly** — don't rely solely on `findProfilesByUrl()` auto-detect

### Task Numbering Note
Plan has Tasks 1-6 + F1-F4. The plan labels them:
- Task 1: Confirmation Flow State Machine
- Task 2: GradingPanel Callback Plumbing (labeled "2" in plan but is the 2nd item)
- Task 3: BatchPanel CTA Card (labeled "3" in plan)
- Task 4: DiscoveryPanel Confirmation Phase (labeled "4" in plan)
- Task 5: Round-Trip Integration (labeled "5" in plan)
- Task 6: Edge Cases + Polish (labeled "6" in plan)
