# Decisions — optimize-discovery-prompt

## [2026-02-20] Initial Decisions

### Wave 1 Parallelization
Tasks 1, 2, 3 all edit `discover.ts` but in DIFFERENT sections:
- Task 1: lines 130–229 (DISCOVERY_SYSTEM_PROMPT)
- Task 2: lines 271–303 (parseDiscoveryResponse)
- Task 3: lines 239–260 (DISCOVERY_USER_PROMPT_TEMPLATE)

**Decision**: Run all 3 in parallel. Each agent edits a non-overlapping section.
**Risk**: Merge conflicts if agents accidentally touch adjacent lines.
**Mitigation**: Each agent prompt explicitly states the exact line range to modify.

### Retry Strategy
- Max 3 attempts (1 initial + 2 retries)
- Retry on: parse failure, isValidDiscoveryResult() returns false, empty response
- Do NOT retry on: HTTP errors (4xx/5xx), validateSelectors failures
- No backoff — AI calls are already slow
- Reuse DOM snapshot + screenshot from first capture

### Commit Strategy
- Wave 1 commit: `refactor(discover): restructure prompt for JSON reliability`
- Wave 2 commit: `feat(discover): add retry mechanism and update tests`
