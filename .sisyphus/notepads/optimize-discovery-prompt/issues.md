# Issues — optimize-discovery-prompt

## [2026-02-20] Known Issues at Start

### Issue: substring(0, 12000) cuts mid-JSON-object
- Location: `discover.ts:250`
- Impact: AI receives invalid JSON in prompt, causing confusion
- Fix: Task 3 — smart truncation that removes whole array elements

### Issue: No retry on parse failure
- Location: `runDiscovery()` lines 660–739
- Impact: Single bad AI response terminates entire workflow
- Fix: Task 4 — retry loop with max 3 attempts

### Issue: JSON constraint only at end of system prompt
- Location: `DISCOVERY_SYSTEM_PROMPT` line 199
- Impact: Models lose the constraint after processing 100+ lines
- Fix: Task 1 — add constraint at START and END

### Issue: Placeholder values in JSON template
- Location: `DISCOVERY_SYSTEM_PROMPT` lines 200–229
- Impact: Models sometimes copy placeholder text literally (e.g., "... or null for sequential")
- Fix: Task 1 — replace with concrete example using real CSS selectors
