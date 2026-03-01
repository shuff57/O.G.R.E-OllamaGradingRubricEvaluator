# Draft: Site Profile System

## Requirements (confirmed)
- Build a site profile system that gives AI agents reference knowledge about websites
- Aeries needs a profile so the AI knows how to interact with it
- MyOpenMath needs a full site audit/profile: navigation, gradebook, assignments, question creation
- Profiles should be usable from the Browser GradingPanel "Agent Mode"
- When user asks AI a question in agent mode, it should have reference docs for the site

## Sites to Profile
- **Aeries**: Gradebook management (assignments, scores, student info)
- **MyOpenMath**: Full audit — navigation, gradebook, assignment creation, question authoring

## Research Findings

### Existing Systems Discovered

#### 1. SiteProfile system already exists (`site-profiles.ts`)
- Has `SiteProfile` interface with: `urlPatterns`, `selectors`, `navigation`, `feedback`, `save`
- Built-in profiles: MyOpenMath (batch mode) and Canvas SpeedGrader (sequential mode)
- URL matching via substring (`findProfilesByUrl()`)
- BUT: focused entirely on GRADING — CSS selectors for score inputs, feedback boxes, etc.
- Does NOT contain general site navigation knowledge or how-to-do-things instructions

#### 2. Skills system (`skills-api.ts`)
- Skills are markdown docs (frontmatter + body) stored in `skills` DB table
- Active skills injected into AI prompts via `buildSkillInjection()`
- Format: `--- SKILL: Name ---\n{content}\n--- END SKILL ---`
- Injected into: batch grading (customInstructions), solver chat (systemPrompt)
- BUT: skills are NOT injected into Agent Mode (`agent-loop.ts`)
- Skills are manually toggled, not auto-activated by URL

#### 3. Agent Mode (`agent-loop.ts`)
- 10 actions: click, type, scroll, readText, screenshot, waitFor, navigate, runJS, done, triple_click
- Each turn captures: interactive DOM snapshot (max 200 elements) + screenshot
- System prompt in `agent-prompt.ts` — generic, no site-specific knowledge
- NO skill injection currently — agent has no access to skills or site profiles
- History pruned to 16 messages, safety limits: 30 steps / 5 min

#### 4. Grade commands (`.claude/commands/grade.md`, `grade-selectors.md`)
- These are Claude Code skills (external), NOT OGRE agent mode skills
- `grade-selectors.md` is the closest thing to a "site profile" — CSS selectors + interaction patterns
- Pattern: page structure tree, selector table, extraction code, interaction flow

#### 5. Autofill/credentials system
- `matchCredentialsToUrl()` — substring or wildcard URL matching
- LMS_LOGIN_SELECTORS for 4 platforms (MyOpenMath, Canvas, Blackboard, Moodle)

#### 6. CDP integration
- Full DevTools Protocol access via WebSocket
- Actions: click, type, readText, waitFor, scroll, screenshot

## Key Insight: Two Different Profile Concepts

The existing SiteProfile is a **grading-specific mechanical profile** (selectors for score inputs).
What the user wants is a **knowledge profile** — a reference doc that teaches the AI:
- How to navigate the site (menu structure, page flows)
- How to accomplish tasks (create assignment, enter scores, write questions)
- Site-specific UI patterns (where to click, what to expect)
- Common gotchas and tips

These are DIFFERENT things. The grading SiteProfile answers "what CSS selectors exist?"
A knowledge profile answers "how do I create a new assignment in Aeries?"

## Technical Decisions (confirmed)
- **Extend skills system** with `url_pattern` field for auto-activation by URL
- **Agent Mode is the primary target** — inject matching profiles into agent-loop system prompt
- **Playwriter for authoring** — use active Playwriter tab to crawl, scrape, and document sites
- **Auto-injection by URL** — when agent mode detects matching URL, profile content is injected
- Solver Chat and Batch Grading: NOT in scope for now (Agent Mode only)

## Profile Authoring Workflow (confirmed)
- Use Playwriter (active Chrome tab) to crawl each site
- Document: page structure, navigation flows, task procedures, selectors, interaction patterns
- Output: markdown skill files with `urlPatterns` in frontmatter
- Store in skills DB with source='site-profile'

## MyOpenMath Audit Priorities (confirmed)
1. **Gradebook mapping** — how to navigate to gradebook, what the layout looks like, how scores work
2. **Home page navigation** — dashboard structure, menu items, how to get to different areas
3. **Assignment creation** — how to create assignments, organize them, set properties
4. **Question authoring** — inside an assignment: create new questions, test them, iterate until working

## Aeries Audit Priorities (confirmed)
- **Full teacher experience** — the AI should be able to navigate around the gradebook fully, just like a teacher
- Viewing classes, student lists, scores
- Adding/editing assignments, categories, weighting
- Entering/modifying scores
- Navigating between classes/terms
- Student info pages, attendance if relevant
- Reports and exports

## Architecture Findings (from exploration agents)

### Injection Point: agent-loop.ts lines 172-175
```typescript
// CURRENT:
const conversationHistory: AgentMessage[] = [
  { role: 'system', content: AGENT_SYSTEM_PROMPT },
  { role: 'user', content: config.initialMessage },
];
// PLAN: Insert site context between system prompt and user message
```
- Agent loop currently has NO URL awareness — need to add getEmbeddedUrl() call
- NO skill injection into agent mode currently — this is a new integration
- Token budget: 200K max, ~5K per screenshot, ~875 tokens for system prompt
- Prunes to 16 recent messages — site context stays as anchored system message
- PLENTY of room for site profiles (even 10K chars = ~2,500 tokens = 1.25% of budget)

### DB Migration: Simple ALTER TABLE
- Migration 9: `ALTER TABLE skills ADD COLUMN url_pattern TEXT;`
- Backward compatible — existing skills get NULL, no breakage
- Need new `findSkillsByUrl(url)` function (substring matching like existing site_profiles)
- skill-parser.ts: extract `urlPatterns` from frontmatter
- saveSkill(): include url_pattern in INSERT/UPDATE

### Injection Flow (new)
```
1. Agent chat starts → user types message
2. agent-loop.ts: getEmbeddedUrl() → current URL
3. findSkillsByUrl(url) → matching skills with url_pattern
4. Inject as system message: --- SITE GUIDE: {name} ---\n{content}\n--- END ---
5. Then system prompt, then user message
6. On navigate action: re-check URL, swap profile if domain changed
```

## Token Budget Analysis
- System prompt: ~875 tokens
- Screenshot: ~5,000 tokens
- DOM snapshot: ~2,000-5,000 tokens
- Per-turn overhead: ~8,000-11,000 tokens
- 200K budget with 16-message window ≈ plenty of room
- Site profiles can safely be 5,000-15,000 chars (~1,250-3,750 tokens)
- That's enough for comprehensive site documentation

## Open Questions (remaining)
- Should profiles be composable (base profile + task-specific add-ons)?

## Scope Boundaries
- INCLUDE: Knowledge profile system, agent-loop integration, Aeries profile, MyOpenMath profile
- INCLUDE: URL-based auto-activation, Playwriter-based site auditing
- INCLUDE: Profile content injected into Agent Mode system prompt
- EXCLUDE: Changes to existing SiteProfile grading selectors
- EXCLUDE: Solver Chat / Batch Grading injection (future)
- EXCLUDE: Automated scraping pipeline (manual Playwriter crawl for now)