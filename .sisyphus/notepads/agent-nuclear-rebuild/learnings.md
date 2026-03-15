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

## [2026-03-15] Task 4 Complete — project-root CLAUDE.md routing brain
- Created `/CLAUDE.md` at project root (Layer 1 routing brain) with five required sections: Project Identity, Skill Routing Guide, Conventions, Learning Protocol, Scope Boundaries.
- Anchored project identity to repository reality from `README.md`: dual product model (desktop app + autonomous `/grade`) and stack surfaces (Tauri/Rust, Node.js, Python assets, Playwriter automation).
- Routing guide intentionally stays high-level and name-based (no workflow internals), including grading, gradebook sync, MOM authoring/research, and meta utility capabilities.
- Enforced path convention in routing policy: `.agents/skills/` authoritative, `.claude/commands/` for commands, explicit prohibition on `.claude/skills/` routing.
- Embedded exact pattern-suggestion directive sentence for repeat workflow detection and skill-creation prompts.
- Added session memory loop: check `.agents/memory/pending/` at start, `.agents/memory/approved/` before significant work, record via `session-reflector` at end.
- Added hard scope boundary to prevent autonomous `.rs/.ts/.js/.py` edits without explicit user instruction.
- Validation checks passed: line count 107 (`<=200`), `##` headers 9 (`>=4`), `.agents/skills/` references 2 (`>0`), learning/pattern keywords 9 (`>0`).

## [2026-03-15] Task 6 Complete — LightRAG-powered agent memory scaffold
- Created `.agents/memory/` with required structure: `README.md`, `pending/.gitkeep`, `scripts/`, `.gitignore`, and empty `lightrag_workdir/`.
- Implemented `scripts/setup.sh` exactly with LightRAG install, Ollama connectivity check, and local workdir creation.
- Added `scripts/index_reflection.py` and `scripts/query_memory.py` with LightRAG + Ollama imports and graceful-degradation behavior when dependencies are unavailable.
- Marked `lightrag_workdir/` as untracked via `.agents/memory/.gitignore` to prevent generated graph state from being committed.
- Wrote verification evidence to `.sisyphus/evidence/task-6-memory-lightrag.txt` including structure checks and script usage outputs.

## [2026-03-15] Task 9 Complete — grade-show-work-selectors.md reference file
- Verified `.claude/commands/grade-show-work-selectors.md` already exists in correct format.
- File is a clean reference/cheat-sheet (NOT a skill) with no YAML frontmatter.
- Contains 36 selector entries organized in 6 tables by DOM context (general, questions, scores, feedback, work/files, navigation).
- Includes 6 JavaScript code examples and 4 pattern documentation sections.
- Archive comparison: content identical to `.sisyphus/archive/commands/grade-show-work-selectors.md` — no modifications needed.
- Evidence recorded in `.sisyphus/evidence/task-9-selectors.txt`.

## [2026-03-15] Task 8 Complete — grade-show-work gold standard rewrite
- Rebuilt `.agents/skills/grade-show-work/SKILL.md` in gold standard format with frontmatter, Overview, Guardrails-before-Workflow, Quick Start, workflow phases, Error Handling, Common Mistakes, State Management, and Selectors/References.
- Preserved critical Playwriter/MyOpenMath automation knowledge: `.bigquestionwrap`, `input[id^="scorebox"]`, `scorebox{qIndex}`, `scorebox{qIndex}-{partIndex}`, `.viewworkwrap`, `a.attach.prepped`, `.score-inputs`, and full-page `Save and Next Student` navigation.
- Kept non-negotiable policy intact: report-first, explicit teacher approval, bonus-only scoring, never decrease scores, and stop at 20 students with warning at 15.
- Preserved direct file-fetch rule: `files.myopenmath.com/ufiles/{uid}/{filename}` is extracted programmatically and fetched without UI preview clicks.
- Evidence recorded in `.sisyphus/evidence/task-8-grade-show-work.txt`.
- Follow-up QA note: preserve resume-safe writeback data (`uid`, `studentUrl`, `scoreboxId`) and explicit `uid`/`stu` navigation behavior when condensing archived browser-workflow skills.

## [2026-03-15] Task 7 Complete — grade command + selectors gold-standard rewrite
- Rewrote `.claude/commands/grade.md` into gold-standard command structure without changing grading behavior.
- Preserved required operational rules: one-pass extraction, batch-of-5 fill, Quick Save after each batch, URL-keyed `grade-state.json`, fuzzy resume matching, three-tier rubric confirmation, and 30-student context limit.
- Kept grading philosophy explicitly generous for high school seniors with substantial partial credit for meaningful effort.
- Rewrote `.claude/commands/grade-selectors.md` as a frontmatter-free reference with consistent tables while preserving all original DOM selectors and TinyMCE writeback guidance.
- Captured verification evidence in `.sisyphus/evidence/task-7-grade-command.txt`; markdown LSP diagnostics were not available in this environment because no `.md` server is configured.

## [2026-03-15] Task 10 Complete — gb-compare gold-standard rewrite
- Created `.agents/skills/gb-compare/SKILL.md` in the gold-standard structure with frontmatter, Overview, Guardrails-before-Workflow, Quick Start, workflow phases, Error Handling, Common Mistakes, Selectors / References, and Cleanup.
- Preserved the mature archived workflow details that downstream stages depend on: MOM category expansion via `span.cattothdr` and `[Expand]`, MOM assignment extraction via `th[data-pts]` + `childNodes[0].textContent`, Aeries listing via `th[data-an]`, and MOM date parsing from `sdate` / `edate` in `moasettings.php`.
- Kept the exact temp artifact contract and naming expectations visible: `gb_compare_{gradebookNum}.json` with top-level keys `metadata`, `catMap`, `momAssignments`, `aeriesAssignments`, `matched`, and `missing`; `missing` must contain full assignment objects for `gb-new-assignment`.
- Re-emphasized that `gb-compare` is always Stage 1, read-only, and idempotent: it may produce local report/temp artifacts but must never mutate MOM or Aeries.

## [2026-03-15] Task 12 Complete — gb-sync gold-standard rewrite
- Rebuilt `.agents/skills/gb-sync/SKILL.md` in gold-standard format and kept the main file concise at 206 lines by moving operational detail into `.agents/skills/gb-sync/references/phase-details.md`.
- Preserved the full seven-phase structure: Setup, Student Discovery, MOM Score Collection, Dry-Run Report, Live Score Entry, Halt Detection, and Verification.
- Kept the safety-critical dry-run -> explicit approval -> live mode sequence non-negotiable.
- Preserved resumability with per-student temp files named `gb-sync-student-{name}.json` / `gb-sync-student-{safe-name}.json` plus a main session state file.
- Preserved both Aeries write strategies (`ScoresByAssignment` default, `ScoresByStudent` fallback), single-assignment mode, version-pair notes, and fresh Phase 7 Aeries re-scrape verification.
- Updated the workflow to align with current repository safety rules by protecting existing non-zero Aeries scores unless the user explicitly authorizes an overwrite.
- Captured verification evidence in `.sisyphus/evidence/task-12-gb-sync.txt`; markdown LSP diagnostics remain unavailable in this environment because no `.md` server is configured.

## [2026-03-15] Task 11 Complete — gb-new-assignment gold standard rewrite
- Created `.agents/skills/gb-new-assignment/SKILL.md` in gold-standard format with required frontmatter, Guardrails-before-Workflow ordering, Quick Start, phased workflow, Error Handling, Common Mistakes, State Management, and Selectors / References.
- Preserved legacy temp-file paths exactly: `C:\Users\shuff\grade-cloning\temp\gb_compare_{gradebookNum}.json` input and `C:\Users\shuff\grade-cloning\temp\gb_new_assignment_{gradebookNum}.json` output.
- Preserved critical Aeries workflow mechanics: `#subHeaderAddAssignment`, Kendo category/date widgets, span-based save controls, and modal-state verification after each save.
- Upgraded the archived skill's implicit confirmation note into an explicit preflight approval gate with create/skip preview.
- Added real idempotency guidance: scrape existing Aeries assignments first, skip normalized name matches, and record `skippedExisting` separately from `created` and `failed`.
- Clarified field mapping so MOM `pts` is written to `#Assignment_MaxScore` exactly while `#Assignment_MaxNumberCorrect` stays `100` for Stage 3 percentage sync.
- Evidence recorded in `.sisyphus/evidence/task-11-gb-new-assignment.txt`.

## [2026-03-15] Task 13 Complete — gb-pipeline gold standard rewrite
- Created `.agents/skills/gb-pipeline/SKILL.md` in the gold-standard format with Guardrails before Workflow, explicit stage IO, Error Handling table, Common Mistakes table, and State Management.
- Preserved the orchestrator role and all three stages in order: `gb-compare` → `gb-new-assignment` → `gb-sync`.
- Kept the temp-file chain explicit and gradebook-number keyed: `gb_compare_{gradebookNum}.json` → `gb_new_assignment_{gradebookNum}.json` → `gb_sync_{gradebookNum}.json` plus `temp/students/{gradebookNum}/*.json`.
- Preserved the non-negotiable inter-stage confirmation gates and halt behavior, including `pipelineHalted`, `haltReason`, `haltStudents`, and `haltAssignments` reporting.
- Preserved the single-assignment Stage 3 variant and its `partial-verified` reporting rule so it is never reported as full pipeline success.
- Kept downstream skill invocation name-based only with `load_skills=["gb-compare"]`, `load_skills=["gb-new-assignment"]`, and `load_skills=["gb-sync"]`.
- Captured verification evidence in `.sisyphus/evidence/task-13-gb-pipeline.txt`; markdown LSP diagnostics were not available in this environment because no `.md` server is configured.

## [2026-03-15] Task 16 Complete — mom-lib-map router + passive references
- Replaced the archived multi-file `mom-lib-map` skill layout with a single discoverable router at `.agents/skills/mom-lib-map/SKILL.md` plus 16 plain-markdown subject references under `.agents/skills/mom-lib-map/references/`.
- Stripping YAML frontmatter from the subject files is enough to keep them out of the skill catalog while preserving the actual topic-map content verbatim.
- Router skills for large reference packs should keep subject routing, cross-subject notes, and relative `references/{subject}.md` links in the main SKILL file while leaving detailed lookup tables in passive reference docs.
- Verification for markdown-only skill tasks should explicitly record both the positive checks (reference count, frontmatter absence, path references) and any environment limitation such as missing Markdown LSP support.

## [2026-03-15] Task 19 In Progress — mom-style-guide gold-standard rewrite
- Reference/philosophy skills cannot be converted cleanly by forcing them into a pure workflow template; preserve their role boundaries with companion-skill tables and lightweight review/apply/verify workflow instead.
- For MOM style guidance, the high-risk losses during rewrite are usually defaults and constraints, not prose details: auto-graded-by-default, neutral student rubric wording, meaningful randomization, visual layout rules, and pseudo-PHP safety rules all need explicit sections.

## [2026-03-15] Task 17 Complete — mom-page-map gold standard rewrite
- For large archived navigation skills, keep `SKILL.md` as a concise router and move exact URL/selector/AJAX details into `references/navigation-patterns.md`.
- Preserve MOM route variants exactly, especially `addassessment2.php?id={aid}&cid={cid}&from=gb` and the URL-only `gradeallq2.php?cid={cid}&aid={aid}` path.
- Preserve the dual block-id model explicitly: DOM `blockh{bid}` vs URL `path` like `0-1` extracted from `toggleblock(...)`.
- Preserve native-widget caveats verbatim enough to keep behavior safe: Add An Item `<option>` clicks cause CDP `-32000`; use direct URLs or `selectOption()` with a pre-captured navigation wait.
- Preserve instructor-vs-student distinctions explicitly: `testquestion2.php` is an instructor validation page, while `assess2/?cid={cid}&aid={aid}` is the student view.

## [2026-03-15] Task 15 Complete — mom-fact-finder gold standard rewrite
- Created `.agents/skills/mom-fact-finder/SKILL.md` in gold-standard format with Guardrails before Workflow, Inputs, Quick Start, phased workflow, Error Handling table, Common Mistakes table, State Management, and Selectors / References.
- Preserved the full research flow from the archived 509-line skill: pattern-library cache check, live MOM browser search, QID ranking by Times Used, safe `viewonly=1` code extraction, cross-example pattern synthesis, JSON artifact writing, and downstream knowledge-base update behavior.
- Replaced legacy path instructions with name-based cross-skill loading only: `load_skills=["mom-patterns"]` for cache/writeback and `load_skills=["mom-page-map"]` for navigation/search-scope guidance.
- Preserved the critical safety rules: never edit, never click save/preview/delete, stay in the active course `cid`, require `View:` heading verification, and rate-limit to 8 question pages with 1000 ms pauses.
- Evidence recorded in `.sisyphus/evidence/task-15-mom-fact-finder.txt`.
