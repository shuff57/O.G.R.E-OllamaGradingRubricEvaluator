# Session: Discover Tab Site Profile Integration — Full Implementation
**Date:** 2026-03-15
**Branch:** discover-site-profiles (15 commits)
**Session:** ses_30c62ebbeffeW06zJHlVeS9K6S

## What was done
- Planned and executed a 14-task feature branch unifying two siloed profile systems: CSS selector profiles (batch grading) and markdown knowledge profiles (Agent Mode)
- Built a markdown-to-JSON pipeline that reduces agent prompt token usage by 61% (15,345 chars raw markdown to 5,925 chars JSON)
- New modules: site-guide-types.ts, profile-json-converter.ts, profile-precedence.ts
- New UI: DiscoveryGuideStatus.svelte (status indicator), DiscoveryGuidePreview.svelte (generation flow)
- New server endpoint: POST /api/generate-knowledge-profile
- Fixed latent bug: syncSiteProfiles() moved to app startup (was only on Skills page mount — Agent Mode had zero site context if user never visited Skills)
- Updated agent prompt rule #11 for JSON format, removed obsolete rule #13 (SELECTOR TRANSLATION)
- Final test count: 1189 passing (up from 1178 baseline)

## Patterns noticed
- Subagents dispatched with the SINGLE TASK ONLY directive refuse multi-scenario verification prompts — Final Wave QA prompts must be structured as a single verification task, not numbered scenarios that look like multiple tasks
- Worktree node_modules doesn't always have tsc binary — use `npx vitest run` as the type-check proxy instead of `npx tsc --noEmit`
- Biome LSP reports false-positive "unused variable" warnings for Svelte 5 $state/$props variables used only in templates — these are safe to ignore during code review
- Evidence files should always be saved to the MAIN repo .sisyphus/evidence/, never the worktree — subagents sometimes get confused on this path distinction
- Wave-based parallel execution (5 tasks in Wave 1, 4 in Wave 2, etc.) worked well for throughput — most tasks completed in 1-3 minutes each
- The `deep` category produced the most reliable results for complex parsing/conversion tasks
- `visual-engineering` category was routed to an experimental model (gemini-3.1-pro-preview) which produced acceptable but less polished results

## Corrections received
- User clarified "markdown is for human, json is for agent" — dual-format strategy where markdown is source of truth for authoring/viewing and JSON is computed at injection time for agent consumption. NOT a replacement of markdown with JSON.
- User confirmed full integration scope: surface existing guides, create from discovery, enhance discovery with profiles, unify management — all in the Discover tab

## Skill improvement suggestions
- session-reflector: Add a /session-end alias that auto-triggers without needing to remember the exact phrase
- Subagent verification prompts: Remove the SINGLE TASK ONLY directive from Final Wave audit prompts to prevent refusals on multi-check scenarios
- The profile-json-converter parser is heuristic-based (regex extraction from markdown) — if profile formats drift, the parser may need updating. Consider adding a structured YAML block in profiles as a more reliable extraction source.
- The `isSiteGuideJSON` type guard is shallow (doesn't validate array element types) — acceptable for now but could be tightened if invalid data causes agent issues downstream
