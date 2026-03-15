# Learnings — agent-nuclear-rebuild

## [2026-03-15] Session ses_30dd96d92ffeIO8u6cSHZYX25b — Initial state
- `.claude/skills/` has 12 skills: find-skills, gb-compare, gb-new-assignment, gb-pipeline, gb-sync, grade-show-work, mom-fact-finder, mom-frq, mom-lib-map, mom-page-map, mom-patterns, mom-style-guide
- `.agents/skills/` has only `find-skills` (the duplicate mentioned in plan)
- `.sisyphus/archive/` does NOT yet exist — must be created in Task 1
- Gold standard format defined in plan lines 186-239
- Skills must go to `.agents/skills/{name}/SKILL.md`
- YAML frontmatter: `description` must start with "Use when..."
- Guardrails section BEFORE workflow (fail-fast visibility)
- References/ files must NOT have YAML frontmatter

## [2026-03-15] Task 1 Complete — Archive All Skills
- Successfully archived 13 skill directories to `.sisyphus/archive/skills/`
  - 12 from `.claude/skills/` (including find-skills symlink)
  - 1 from `.agents/skills/find-skills/` (copied as find-skills-agents to preserve both)
- Successfully archived 3 command files to `.sisyphus/archive/commands/`
  - grade.md, grade-selectors.md, grade-show-work-selectors.md
- mom-lib-map verified: 17 files (CLAUDE.md + 16 subject files)
- All originals preserved — no modifications to source directories
- Commit: c862174 "chore(archive): archive all existing skills to .sisyphus/archive/ before nuclear rebuild"
- Evidence file created: `.sisyphus/evidence/task-1-archive-complete.txt`
- Ready for Task 2 (validation) and Task 3 (demolition)

## [2026-03-15] Task 2 Complete — skill-creator meta-skill
- Created `.agents/skills/skill-creator/SKILL.md` as the gold-standard meta-skill for future Wave 2-5 rewrites.
- Enforced required frontmatter pattern: `name: skill-creator` and `description` beginning with "Use when...".
- Included mandatory sections: Interview, 8 Format Rules, Template (full scaffold), Guardrails-before-Workflow, and placement path rules.
- Explicitly standardized placement to `.agents/skills/{name}/SKILL.md` (no `.claude/skills/` paths).
- Added `knowledge.md` guidance and `references/` guidance for scalable skill packages.
- Kept file concise: 155 lines (`<=200` task constraint).
- Validation evidence recorded in `.sisyphus/evidence/task-2-skill-creator.txt`.
