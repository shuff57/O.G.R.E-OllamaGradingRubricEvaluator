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

## [2026-03-15] Task 14 Complete — mom-frq gold standard rewrite
- Created `.agents/skills/mom-frq/SKILL.md` in gold-standard format with required frontmatter, Guardrails before Workflow, score-method guidance, phased FRQ authoring workflow, Error Handling, and Common Mistakes.
- Split heavy syntax/reference content into `.agents/skills/mom-frq/references/php-patterns.md` to keep the main skill concise while preserving critical MOM PHP/IMathAS patterns.
- Preserved the non-negotiable essay syntax and scoring knowledge: `$anstypes`, `$displayformat[0] = "editornopaste"`, `loadlibrary()`, `takeanything`, `essayrubric`, `singlescore`, multipart file-upload patterns, and `getfeedbacktxtessay()`.
- Preserved randomized-context and qtext/rubric construction patterns, including `rand()`, `rrand()`, `diffrands()`, `where (...)`, `$questiontext`, `$rubricbutton`, `$rubricanswerbutton`, and the final IMathAS output ordering.
- Captured baseline verification nuance: repository `bun test` already fails in a fresh worktree due to missing packages / environment setup unrelated to this markdown-only task, so Task 14 verification must rely on changed-file checks plus evidence rather than claiming a clean global test suite.
