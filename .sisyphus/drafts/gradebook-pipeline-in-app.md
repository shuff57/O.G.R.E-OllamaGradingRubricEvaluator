# Draft: Bake Gradebook Pipeline Into Desktop App

## Requirements (confirmed)
- Gradebook pipeline should be **platform-agnostic** — not hardcoded to MOM↔Aeries
- Site profiles should be the main guidance for how the agent interacts with any gradebook page
- The user references two tabs open in the browser view — pipeline works across tab pairs
- Agent chat is the teaching interface: user tells the bot the workflow steps (clicks, navigation, form filling)
- User should be able to **save their taught workflow as a reusable skill** for future use
- This transforms OGRE from "grader only" to "grader + gradebook sync" in the app itself

## User's Vision (as stated)
> "bake the gradebook pipeline into the app but it references the two tabs that are open in the browser view"
> "the gb-pipeline should be gradebook agnostic, using the site profile as the main guidance for interaction"
> "use the chat space to tell the bot exactly the flow and steps for clicks to create assignments and sure up gbs across platforms"
> "the user should be able to save their steps as a specific skill for the bot to use in the future"

## User Decisions (from interview)
- **Source/Target designation**: UI designator — small label/tag on each tab ("Source" / "Target")
- **Teaching method**: ALL THREE — natural language chat, demonstrate-by-doing, AND hybrid chat+corrections
- **V1 scope**: Full pipeline first (compare + create + sync), THEN build the teach→save→replay framework
- **Multi-tab**: Tab bar + option for split view (side-by-side)
- **Matching logic**: TypeScript utilities as primary, AI fallback for edge cases
- **Skill granularity**: Both — one orchestrator skill per platform pair that references modular sub-skills

## Research Findings

### RESOLVED: Multi-Tab Already Exists
- `Browser.svelte` already has a **full tab bar UI** (lines 408-426): tab bar, active tab highlighting, close buttons, "+" new tab button
- `Tab` interface (line 58-64): `{ id, url, title, isLoading, browserCreated }`
- `openNewTab(url?)`, `switchTab(id)`, `closeTab(id)` — all fully implemented
- `browser.ts` has `tabId` parameter on ALL WebView functions (create, navigate, bounds, hide, show, destroy)
- Tab switching hides inactive webview + shows active webview (lines 106-124)
- Tab bar height already factored into webview bounds calculation (lines 170-171)
- Event listeners already route by `tabId` (URL change, page loaded events)
- **What's missing**: Source/Target designation labels, split-view layout, and agent multi-tab awareness
- Agent loop currently calls `getEmbeddedUrl()` without tabId context — needs to know which tab to operate on

### Existing Agent Capabilities (Ready)
- 14 action types: click, type, scroll, readText, screenshot, navigate, runJS, sleep, pressKey, etc.
- Site knowledge profiles (aeries.md, myopenmath.md) already injected into agent context
- Agent already "knows" Aeries gradebook selectors, navigation, assignment management
- Review mode (human approve each step) AND auto mode (300ms delay) exist
- Skills with url_pattern already auto-inject as SITE GUIDE blocks

### Two Separate Profile Schemas (Important)
- **Schema A** (SiteProfile in batch-grader.ts): CSS selectors for grading — studentSection, scoreInput, feedbackBox, etc. Grading-specific.
- **Schema B** (Skills with source='site-profile'): Markdown knowledge docs — full navigation guides. General-purpose. Already describes gradebook operations.
- Schema B is the right vehicle for gradebook workflows — it's already general-purpose and injected into the agent

### Pipeline Reusability Analysis
**Fully reusable (zero platform deps):**
- Number-anchored assignment matching algorithm
- Student name fuzzy matching (middle-initial stripping, confidence scoring)
- Diff classification (new/correct/rounding/increased/decreased)
- Per-student temp file lifecycle (pending → filled → verified)
- Orchestration: stage sequencing, user gates, dry-run, halt detection, resume
- Score conversion formula: `raw / maxPts * targetMax` (generic normalization)

**Hardcoded to MOM** (extraction): #availshow, [Expand], span.cattothdr, th[data-pts], data-ptv, etc.
**Hardcoded to Aeries** (creation/entry): Kendo UI, th[data-an], /teacher/gradebook/{GN}/S/, #assignmentQuickAssignSave, etc.
**Machine-specific**: `C:\Users\shuff\grade-cloning\` hardcoded in all 4 skills

### Skill System Readiness
- Skills CAN be created in-app (AI chatbot interview → markdown → save to DB)
- Skill creation prompt is grading-only — needs a parallel WORKFLOW_RECORDING_PROMPT
- No "record agent session as skill" capability yet
- No workflow parameterization (can't say "do X for assignment Y")
- No replay/execution of saved skills (skills are context injection, not scripts)
- `saveSkill()` with url_pattern and source field already works — just needs new source type

## Open Questions (resolved in interview)
1. Score conversion → agent-handled per platform, not hard-coded formula
2. Skill granularity → BOTH: orchestrator + modular sub-skills (user decision)
3. V1 scope → full pipeline first, teach→save→replay second (user decision)
4. Matching algorithms → TypeScript utilities primary, AI fallback (user decision)
5. Multi-tab → ALREADY EXISTS in codebase (discovered post-interview)

## Scope Boundaries
- INCLUDE: Source/Target tab designation UI, assignment comparison engine (TS), pipeline orchestrator, agent multi-tab awareness, score sync flow, teach→save→replay framework, workflow skill creation prompt
- EXCLUDE: Split-view layout (future), new AI provider integrations, grading system changes, mobile support

## Test Strategy Decision
- **Infrastructure exists**: YES (vitest configured)
- **Automated tests**: YES (TDD)
- **Framework**: vitest
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

## Key Architecture Decisions
- `AgentMode` extended with `'pipeline'` mode for multi-tab orchestrated flows
- `AgentEvent` stream is the recording surface for teach→save→replay
- Pipeline extraction/creation logic lives in TS modules, NOT in skill markdown
- Skills with `url_pattern` auto-inject — saved workflows plug into existing injection
- `WORKFLOW_RECORDING_PROMPT` parallel to existing `SKILL_CREATION_PROMPT`
- Site profiles (Schema B — markdown knowledge docs) guide agent interaction per platform
