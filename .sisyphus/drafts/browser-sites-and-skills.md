# Draft: Add Browser Sites + gb-pipeline Skills to OGRE

## Requirements (confirmed)
- Add 2 new sites to the Browser page presets
- Add gb-pipeline and related skills (gb-compare, gb-new-assignment, gb-sync) to the Skills system

## Research Findings

### Browser Page — Site Presets
- **File**: `ogre-desktop/src/lib/browser.ts` line 239–244
- **Current sites** (hardcoded array `GRADING_SITE_PRESETS`):
  1. MyOpenMath → `https://www.myopenmath.com/`
  2. Canvas → `https://canvas.instructure.com/`
  3. Blackboard → `https://blackboard.com/`
  4. Moodle → `https://moodle.org/`
- Consumed by `Browser.svelte` in the "Quick Launch" presets panel
- Adding new sites = append to this array

### Skills System
- **Storage**: SQLite database (via Tauri plugin)
- **Format**: Markdown with YAML frontmatter (`name`, `description`)
- **Import methods**: File upload (.md), skills.sh marketplace, SkillCreator
- **Injection**: Active skills are injected into AI grading prompts via `buildSkillInjection()`
- **Key files**: `skills-api.ts`, `skill-parser.ts`, `db.ts`

### gb-pipeline Skills (found at `C:\Users\shuff\.claude\skills\`)
- `gb-pipeline/SKILL.md` — Orchestrator for MOM→Aeries full sync (168 lines)
- `gb-compare/SKILL.md` — Compare MOM vs Aeries assignments, READ-ONLY (348 lines)
- `gb-new-assignment/SKILL.md` — Create missing assignments in Aeries (248 lines)
- `gb-sync/SKILL.md` — Sync student scores MOM→Aeries (1193+ lines)

**Note**: These are Claude Code / OpenCode browser automation skills (Playwriter-based), NOT grading prompt skills. They serve a fundamentally different purpose than the current OGRE skill injection system.

## Open Questions
1. Which 2 sites should be added to the Browser Quick Launch?
2. What does "automation tab" refer to? (No tab named "Automation" exists currently)
3. How should gb-pipeline skills be used? (Current skill system injects into AI grading prompts — gb-* skills are for browser automation)

## Technical Decisions
- (pending user input)

## Scope Boundaries
- INCLUDE: (pending)
- EXCLUDE: (pending)
