# Draft: Fundamental Agent Learning & Organization Overhaul

## Requirements (confirmed)
- User wants a "fundamental shift" in project organization and how agents learn
- Referenced two TikTok creators (jakevanclief, maven_hq) for inspiration
- Wants agents to be "smarter" across sessions
- Wants auto-creation of skills when agents detect repetitive tasks
- User wants learning suggestions to be agent-initiated ("Just suggest, I'll decide")
- User wants full audit and restructure of all 12 existing skills

## Video Content (discovered via web search)

### jakevanclief — "How I Structure Folders to Replace AI Agents"
- **Three-layer routing system** — structured folder architecture determines agent behavior
- **CLAUDE.md as the brain** — central routing/configuration file
- **Skills plug into the system** — modular knowledge loaded on demand
- **Naming conventions replace databases** — folder/file naming carries semantic meaning
- **Folder structure IS the agent** — architecture determines behavior, not separate agent definitions
- **Token-aware design** — understanding context window cost drives architecture decisions

### maven_hq — "Give your agents memory"
- Caption: "Give your agents memory. This is one of the simplest and most effective things you can do to make your AI agents improve over time."
- References Anthropic's official skill authoring guidance
- Part of a broader series on Claude Code mastery via Maven lectures

## Current State (researched)

### Project: O.G.R.E - Ollama Grading Rubric Evaluator
- Desktop App (Windows, Tauri-based) 
- Autonomous Grading: `/grade` command, `grade-show-work` skill
- Gradebook Pipeline: MOM → Aeries (compare, new-assignment, sync)
- MOM Question Authoring: mom-frq, mom-patterns, mom-fact-finder, mom-lib-map, etc.
- Skills Discovery: find-skills

### Current Organization
- `.claude/CLAUDE.md` — **NEARLY EMPTY** (just claude-mem auto-context, no project memory)
- `.claude/commands/` — 4 commands
- `.claude/skills/` — 12 skill directories (well-structured, detailed SKILL.md files)
- `.agents/skills/` — Only find-skills
- `.sisyphus/` — Planning infrastructure 
- `.planning/` — Another planning directory
- No AGENTS.md anywhere

### Identified Gaps
1. **CLAUDE.md is a blank slate** — No project context, conventions, or accumulated knowledge
2. **No AGENTS.md** — No agent-specific instructions or behavioral rules
3. **Skills are static** — Written manually, never self-updated
4. **No learning loop** — Agents don't capture lessons from sessions
5. **No meta-skill** — No skill that creates other skills automatically
6. **No post-session reflection** — No mechanism to record what worked/failed
7. **mom-patterns is the ONLY self-updating skill** — mom-fact-finder populates it, but this pattern isn't generalized
8. **No hooks** — No pre/post-commit or session hooks for automated learning

## Research Findings

### From Web Research (ecosystem best practices)
- **Layered Memory Architecture** (Tebogo Tseka, DEV.to): 6-layer system — permissions → plans → skills → knowledge → conventions → base memory
- **Meta-Skill Pattern** (Liam T Bilich, Medium): A skill that scaffolds other skills — agent asks for domain, generates SKILL.md boilerplate
- **Self-Improving Agents** (Nayeem Islam, Medium): REFLEX system — reinforcement learning from user feedback, skill library that accumulates knowledge
- **Progressive Disclosure** (Anthropic docs): Skills only load when needed, preventing context bloat
- **claude-user-memory** (VAMFI, GitHub): Research→Plan→Implement workflows with persistent memory across sessions

### From maven_hq (TikTok discovery page)
- "Anthropic revealed exactly how you should be writing your skills"
- References Anthropic's official skill authoring guidance
- Focus on proper skill structure, descriptions, and trigger conditions

### From broader TikTok/creator ecosystem
- Skills as "teaching Claude once, it remembers forever"
- Brand voice, workflows, formatting, research processes encoded as skills
- Focus on skills working across Claude, Claude Code, API

## Technical Decisions
- **Learning aggressiveness**: "Just suggest, I'll decide" — agent-initiated, user-approved
- **Existing skills**: Full audit and restructure of all 12 skills
- **Folder architecture**: Clean + maintainable — consolidate the fragmentation. My recommendation: 3-layer routing
- **Memory architecture**: Both layered — skill-specific memory files + central cross-cutting knowledge base
- **Skill creation triggers**: Both in-session pattern detection AND cross-session history checks
- **Skill creation flow**: Agent drafts skill → presents to user → user approves → skill saved

## Architecture Recommendation (3-Layer Routing)

### Layer 1: CLAUDE.md (The Brain)
- Project context, conventions, tech stack
- Routes to skills via descriptions
- Accumulated session insights (auto-appended)
- Cross-cutting rules (error handling, naming, style)

### Layer 2: Skills (Domain Knowledge)
- Each skill = folder with SKILL.md + optional knowledge.md
- SKILL.md = instructions (static, manually maintained)
- knowledge.md = accumulated patterns/data (auto-populated by agents)
- Follows mom-patterns model but generalized

### Layer 3: Memory (Persistent Learning)
- Central knowledge base: .claude/memory/ 
- Session reflections: what worked, what failed, user corrections
- Cross-skill insights: common patterns, user preferences
- Skill creation suggestions: pattern detection log

## Final Decisions
- **Skills canonical location**: `.agents/skills/` (tool-agnostic, portable)
- **Migration**: Move all 12 skills from `.claude/skills/` → `.agents/skills/`
- **Reflection timing**: Hook-based automatic (pre-exit hook triggers reflection)
- **Scope**: Only markdown infrastructure + hook config

## Scope Boundaries
- INCLUDE: CLAUDE.md overhaul, folder restructure, all 12 skills audit + migration to .agents/skills/, meta-skill creation, memory infrastructure, session reflection hook, skill auto-detection mechanism, AGENTS.md creation
- EXCLUDE: Source code (grading-server/, ogre-desktop/, mom/), desktop app, test-data, node_modules, any .py/.ts/.js/.rs files
