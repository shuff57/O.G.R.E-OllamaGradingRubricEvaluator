# Swarm-Tools Trial Installation & Evaluation

## TL;DR

> **Quick Summary**: Install swarm-tools (opencode-swarm-plugin) globally for OpenCode, pause the existing coordination system, initialize Hive in the O.G.R.E. project, and smoke-test all core features (Hive, Hivemind, Swarm Mail, /swarm). Evaluate whether swarm-tools should replace our custom JSON/bash coordination layer.
> 
> **Deliverables**:
> - Swarm-tools installed globally and passing `swarm doctor`
> - Existing coordination paused (not deleted) with full backup
> - Hive initialized in O.G.R.E. project (gitignored during trial)
> - Smoke test results for all 4 core features
> - Documented rollback procedure verified to work
> 
> **Estimated Effort**: Short (1-2 hours)
> **Parallel Execution**: LIMITED — mostly sequential (each step depends on previous)
> **Critical Path**: Pre-flight → Install → Pause coordination → Setup → Init → Smoke tests → Verify rollback

---

## Context

### Original Request
User wanted to understand how our current memory/coordination system compares to swarm-tools. After comparison, decided to trial swarm-tools at the OpenCode environment level (not baked into any project). Swarm would replace `~/.config/Claude/coordination/` (JSON task registry, bash helpers, filesystem messaging) with event-sourced coordination, semantic memory (Hivemind), and git-backed task tracking (Hive).

### Interview Summary
**Key Discussions**:
- Our system is file-based (JSON/bash), swarm is database-backed (libSQL event sourcing)
- User has 34+ live OpenCode sessions — scale where swarm's coordination benefits are real
- Swarm is OpenCode-first — best compatibility path
- Memory improvements (smart upsert, dedup, linking, temporal awareness) are the most compelling upgrade
- Sisyphus/Prometheus planning pipeline stays completely untouched
- Test in real O.G.R.E. project, pause existing coordination during trial

**Research Findings**:
- swarm-tools: 122 releases, v0.63.3 latest, 581 GitHub stars, actively maintained
- Requires: Bun (have it), Ollama (have it), mxbai-embed-large embedding model (need to pull)
- ioredis is a dependency — need to validate if Redis is actually required or optional
- Plugin placement follows `~/.config/opencode/plugins/` pattern — same as our coordination.js
- coordination.js is 782 lines, hooks into system.transform + tool.execute.before + process.exit
- All 36 current sessions are in planning mode with zero active file claims — clean window for swap

### Metis Review
**Identified Gaps** (addressed):
- Redis requirement unknown: Added pre-flight validation step to check before proceeding
- Auto-reflection on exit will stop when coordination.js is paused: Documented as known gap, agent must manually use session-reflector during trial
- 36 existing sessions lose coordination awareness: Plan includes closing all sessions before swap
- mxbai-embed-large not installed: Added explicit model pull step
- .hive/ could bloat git with libSQL databases: Gitignored during trial
- AGENTS.md still references coord_* functions: Left intact — confusing but not harmful for trial
- LightRAG memory context injection disappears from system prompt: Known gap, swarm's Hivemind should replace this

---

## Work Objectives

### Core Objective
Install swarm-tools at the OpenCode environment level, safely pause the existing coordination system, and run smoke tests to evaluate whether swarm should permanently replace our custom coordination/memory layer.

### Concrete Deliverables
- `opencode-swarm-plugin` installed globally and `swarm doctor` passes
- `~/.config/opencode/coordination-backup-<timestamp>/` backup exists
- `coordination.js` renamed to `coordination.js.paused` in plugins directory
- `.hive/` initialized in O.G.R.E. project, added to `.gitignore`
- Smoke test evidence files in `.sisyphus/evidence/`
- Rollback procedure tested and documented

### Definition of Done
- [ ] `swarm doctor` reports all checks passing
- [ ] `swarm hive status` shows initialized state
- [ ] Memory roundtrip works (store → recall)
- [ ] Coordination.js is paused but intact for rollback
- [ ] LightRAG memory system still works independently
- [ ] New OpenCode session starts cleanly with swarm active

### Must Have
- Full backup of existing coordination state before any changes
- Ability to rollback to previous system in under 2 minutes
- All existing project files (AGENTS.md, skills, .sisyphus/) untouched
- Ollama embedding model for swarm (mxbai-embed-large) installed and working

### Must NOT Have (Guardrails)
- DO NOT modify AGENTS.md, routing.md, or any existing skills to reference swarm
- DO NOT migrate LightRAG data into Hivemind — separate decision after trial
- DO NOT update existing skills to use swarm patterns
- DO NOT initialize .hive/ in any project other than O.G.R.E.
- DO NOT commit .hive/ to git during the trial
- DO NOT modify superpowers.js or oh-my-opencode.json
- DO NOT run coordination.js and swarm plugin simultaneously
- DO NOT delete coordination.js — only rename to .paused
- DO NOT change the Ollama embedding model used by LightRAG (bge-m3 stays)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (this is infrastructure setup, not code)
- **Automated tests**: None — verification-first ordering (define expectations → execute → verify)
- **Framework**: N/A — bash command verification

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI/Installation**: Use Bash — run commands, assert exit codes + output patterns
- **Configuration**: Use Bash — verify file existence, permissions, content
- **Feature tests**: Use Bash — swarm CLI commands with expected output verification

---

## Execution Strategy

### Parallel Execution Waves

> This is primarily sequential infrastructure work. Limited parallelism possible
> only in pre-flight checks and smoke tests.

```
Wave 1 (Pre-Flight — verify all prerequisites, MAX PARALLEL):
├── Task 1: Validate Bun + Ollama availability [quick]
├── Task 2: Pull mxbai-embed-large embedding model [quick]
├── Task 3: Validate Redis requirement [quick]
└── Task 4: Backup existing coordination system [quick]

Wave 2 (Installation — sequential):
├── Task 5: Install opencode-swarm-plugin globally (depends: 1, 2, 3) [quick]
└── Task 6: Pause coordination.js (depends: 4, 5) [quick]

Wave 3 (Configuration — sequential):
├── Task 7: Run swarm setup for OpenCode (depends: 6) [quick]
└── Task 8: Initialize Hive in O.G.R.E. + gitignore (depends: 7) [quick]

Wave 4 (Smoke Tests — partially parallel):
├── Task 9: Smoke test Hive task tracking (depends: 8) [quick]
├── Task 10: Smoke test Hivemind memory (depends: 8) [quick]
├── Task 11: Smoke test /swarm command (depends: 8) [quick]
└── Task 12: Verify new OpenCode session starts cleanly (depends: 8) [quick]

Wave 5 (Rollback Verification):
└── Task 13: Test rollback procedure (depends: 9-12) [quick]

Wave FINAL (After ALL tasks — independent review):
├── Task F1: Plan compliance audit (oracle)
└── Task F2: Trial readiness check (unspecified-high)

Critical Path: Task 1-3 → Task 5 → Task 6 → Task 7 → Task 8 → Tasks 9-12 → Task 13 → F1-F2
Parallel Speedup: ~20% (limited by sequential nature)
Max Concurrent: 4 (Waves 1 & 4)
```

### Dependency Matrix

- **1-4**: None — all start immediately (Wave 1 parallel)
- **5**: 1, 2, 3 — needs validated prerequisites
- **6**: 4, 5 — needs backup + swarm installed before pausing coordination
- **7**: 6 — needs coordination paused first
- **8**: 7 — needs swarm configured
- **9-12**: 8 — all need hive initialized (Wave 4 parallel)
- **13**: 9, 10, 11, 12 — needs smoke tests done before testing rollback
- **F1-F2**: 13 — final verification after everything

### Agent Dispatch Summary

- **Wave 1**: **4** — T1-T4 → `quick`
- **Wave 2**: **2** — T5-T6 → `quick`
- **Wave 3**: **2** — T7-T8 → `quick`
- **Wave 4**: **4** — T9-T12 → `quick`
- **Wave 5**: **1** — T13 → `quick`
- **FINAL**: **2** — F1 → `oracle`, F2 → `unspecified-high`

---

## TODOs

> EVERY task MUST have: Recommended Agent Profile + QA Scenarios.
> All tasks are CLI/configuration — use Bash for verification.

- [ ] 1. Validate Bun + Ollama Availability

  **What to do**:
  - Verify Bun is installed and version >= 1.0
  - Verify Ollama is running and responsive (`ollama list`)
  - Verify npm is available for global installs
  - Record versions of all tools for evidence

  **Must NOT do**:
  - Install Bun or Ollama if missing — report the gap and stop

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple CLI version checks, no code changes
  - **Skills**: []
    - No skills needed for version checks

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5 (installation requires validated prerequisites)
  - **Blocked By**: None (can start immediately)

  **References**:
  **Pattern References**: N/A — CLI commands only
  **External References**:
  - swarm-tools README: `https://github.com/joelhooks/swarm-tools#dependencies` — lists Bun as required

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All prerequisites report valid versions
    Tool: Bash
    Preconditions: System has development tools installed
    Steps:
      1. Run `bun --version` — capture output
      2. Run `ollama list 2>/dev/null` — verify non-error response
      3. Run `npm --version` — capture output
    Expected Result: All three commands exit 0 with version strings
    Failure Indicators: Any command exits non-zero, or version below minimum
    Evidence: .sisyphus/evidence/task-1-prereq-versions.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-prereq-versions.txt — all tool versions

  **Commit**: NO

- [ ] 2. Pull mxbai-embed-large Embedding Model

  **What to do**:
  - Run `ollama pull mxbai-embed-large` to download the swarm default embedding model
  - Verify the model appears in `ollama list`
  - Do NOT modify LightRAG's bge-m3 model — they coexist

  **Must NOT do**:
  - Remove or replace bge-m3 (used by LightRAG)
  - Change any Ollama configuration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single CLI command to pull a model
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5 (swarm doctor needs this model)
  - **Blocked By**: None (can start immediately)

  **References**:
  **External References**:
  - Ollama model: `https://ollama.com/library/mxbai-embed-large` — model details
  - swarm-tools embedding config: `https://github.com/joelhooks/swarm-tools#embedding-model-configuration`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Embedding model pulled and available
    Tool: Bash
    Preconditions: Ollama is running
    Steps:
      1. Run `ollama pull mxbai-embed-large` — wait for completion
      2. Run `ollama list | grep mxbai-embed-large`
      3. Verify bge-m3 still present: `ollama list | grep bge-m3`
    Expected Result: mxbai-embed-large appears in list. bge-m3 still present (not removed)
    Failure Indicators: Pull fails, model not in list, bge-m3 missing
    Evidence: .sisyphus/evidence/task-2-model-pull.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-model-pull.txt — ollama list output showing both models

  **Commit**: NO

- [ ] 3. Validate Redis Requirement

  **What to do**:
  - Check if swarm-tools actually requires a Redis server, or if ioredis is an optional/unused dependency
  - Method 1: Check swarm-tools docs/README for Redis mentions
  - Method 2: After installation (Task 5), run `swarm doctor` — if it checks for Redis and fails, Redis is required
  - Method 3: Search the installed package for ioredis usage: `grep -r "ioredis\|redis" $(npm root -g)/opencode-swarm-plugin/dist/ | head -20`
  - If Redis IS required: report to user as a blocker. Do NOT install Redis without approval
  - If Redis is NOT required (optional/unused): document finding and proceed

  **Must NOT do**:
  - Install Redis without user approval
  - Skip this check — it could block the entire trial

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Research/validation task, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5 (must know if Redis is required before proceeding)
  - **Blocked By**: None (can start immediately)

  **References**:
  **External References**:
  - swarm-tools package.json: `https://github.com/joelhooks/swarm-tools/blob/main/packages/opencode-swarm-plugin/package.json` — check ioredis usage

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Redis requirement determined
    Tool: Bash
    Preconditions: Internet access to check docs
    Steps:
      1. Check swarm-tools README for Redis mentions
      2. Search installed package for ioredis imports (after install)
      3. Document finding: "Redis REQUIRED" or "Redis NOT REQUIRED"
    Expected Result: Clear determination with evidence
    Failure Indicators: Unable to determine; conflicting signals
    Evidence: .sisyphus/evidence/task-3-redis-check.txt

  Scenario: Redis is required but not available (BLOCKER path)
    Tool: Bash
    Preconditions: Redis determined to be required
    Steps:
      1. Report finding to user
      2. STOP execution — do not proceed without user decision
    Expected Result: User notified, plan paused
    Failure Indicators: Proceeding without Redis when it's required
    Evidence: .sisyphus/evidence/task-3-redis-blocker.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-redis-check.txt — determination and evidence

  **Commit**: NO

- [ ] 4. Backup Existing Coordination System

  **What to do**:
  - Create a timestamped backup of the entire coordination directory:
    `cp -r ~/.config/opencode/coordination/ ~/.config/opencode/coordination-backup-$(date +%Y%m%d-%H%M%S)/`
  - Verify backup completeness: compare file counts and sizes
  - Also backup the coordination plugin file:
    `cp ~/.config/opencode/plugins/coordination.js ~/.config/opencode/coordination-backup-*/coordination.js.backup`
  - Record the backup location for rollback instructions

  **Must NOT do**:
  - Delete or modify any original files during backup
  - Skip verification of backup completeness

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File copy and verification, no complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 6 (must have backup before pausing coordination)
  - **Blocked By**: None (can start immediately)

  **References**:
  **Pattern References**:
  - `~/.config/Claude/coordination/` — directory to back up (132KB total)
  - `~/.config/Claude/coordination/task-registry.json` — critical state file
  - `~/.config/Claude/coordination/helpers.sh` — bash functions
  - `~/.config/Claude/coordination/messages/` — filesystem inbox
  - Note: Path may be `~/.config/opencode/` or `~/.config/Claude/` — check both and back up whichever exists

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Complete backup created
    Tool: Bash
    Preconditions: Coordination directory exists
    Steps:
      1. Create timestamped backup directory
      2. Copy all coordination files recursively
      3. Compare file count: `find ~/.config/opencode/coordination/ -type f | wc -l` vs backup
      4. Verify task-registry.json exists in backup and is valid JSON
    Expected Result: Backup has same file count, task-registry.json parses as valid JSON
    Failure Indicators: Missing files, invalid JSON, different file counts
    Evidence: .sisyphus/evidence/task-4-backup-verification.txt

  Scenario: Backup path recorded for rollback
    Tool: Bash
    Preconditions: Backup exists
    Steps:
      1. Record exact backup path
      2. Verify path is accessible: `ls <backup-path>/task-registry.json`
    Expected Result: Path recorded and accessible
    Evidence: .sisyphus/evidence/task-4-backup-path.txt
  ```

  **Evidence to Capture**:
  - [ ] task-4-backup-verification.txt — file counts and JSON validation
  - [ ] task-4-backup-path.txt — exact backup directory path

  **Commit**: NO

- [ ] 5. Install opencode-swarm-plugin Globally

  **What to do**:
  - Run `npm install -g opencode-swarm-plugin`
  - Verify the `swarm` CLI is available: `which swarm && swarm --version`
  - Run `swarm doctor` to check installation health (note: may warn about Redis or embedding model)
  - If `swarm doctor` fails on Redis: check Task 3 findings. If Redis IS required and absent, STOP
  - If `swarm doctor` passes or only warns on non-critical items: proceed

  **Must NOT do**:
  - Install with `--force` or `--legacy-peer-deps` unless install fails and requires it
  - Modify global npm configuration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single npm install command + verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 3 (all pre-flight must pass)

  **References**:
  **External References**:
  - Installation docs: `https://github.com/joelhooks/swarm-tools#opencode` — npm install -g opencode-swarm-plugin && swarm setup

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: swarm CLI installed and accessible
    Tool: Bash
    Preconditions: Prerequisites validated (Tasks 1-3)
    Steps:
      1. Run `npm install -g opencode-swarm-plugin`
      2. Run `which swarm` — verify path exists
      3. Run `swarm --version` — capture version
      4. Run `swarm doctor` — capture full output
    Expected Result: swarm in PATH, version >= 0.63.x, doctor passes or has only non-critical warnings
    Failure Indicators: npm install fails, swarm not found, doctor has critical failures
    Evidence: .sisyphus/evidence/task-5-install.txt

  Scenario: Installation doesn't break existing global packages
    Tool: Bash
    Preconditions: swarm installed
    Steps:
      1. Run `npm list -g --depth=0` — verify other global packages still present
      2. Verify Bun still works: `bun --version`
    Expected Result: Existing packages intact
    Evidence: .sisyphus/evidence/task-5-global-packages.txt
  ```

  **Evidence to Capture**:
  - [ ] task-5-install.txt — install output + swarm doctor output
  - [ ] task-5-global-packages.txt — global package list

  **Commit**: NO

- [ ] 6. Pause coordination.js Plugin

  **What to do**:
  - Locate coordination plugin: check both `~/.config/opencode/plugins/coordination.js` and `~/.config/Claude/plugins/coordination.js`
  - Rename to `.paused`: `mv coordination.js coordination.js.paused`
  - Verify the original file no longer loads (plugins are directory-scanned)
  - DO NOT delete the file — rename only
  - Note: All existing OpenCode sessions will lose coordination awareness. New sessions won't have coordination injected into system prompts

  **Must NOT do**:
  - Delete coordination.js (must be restorable)
  - Modify superpowers.js or any other plugin
  - Touch oh-my-opencode.json

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file rename
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential, after Task 5)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 4, 5 (backup must exist + swarm installed before pausing)

  **References**:
  **Pattern References**:
  - `~/.config/Claude/plugins/` — plugins directory (verify exact path)
  - `~/.config/Claude/coordination/COORDINATION.md` — documents the coordination protocol being paused

  **WHY Each Reference Matters**:
  - Plugin directory location determines where to rename the file
  - COORDINATION.md describes what functionality is being disabled

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: coordination.js paused, not deleted
    Tool: Bash
    Preconditions: Backup exists (Task 4), swarm installed (Task 5)
    Steps:
      1. Locate coordination.js: `find ~/.config -name "coordination.js" -path "*/plugins/*" 2>/dev/null`
      2. Rename: `mv <path>/coordination.js <path>/coordination.js.paused`
      3. Verify renamed: `ls <path>/coordination.js.paused` — exists
      4. Verify original gone: `ls <path>/coordination.js` — should not exist
    Expected Result: .paused file exists, original does not
    Failure Indicators: Original still exists, .paused not created, wrong path
    Evidence: .sisyphus/evidence/task-6-pause-coordination.txt

  Scenario: Other plugins unaffected
    Tool: Bash
    Preconditions: coordination.js renamed
    Steps:
      1. List plugins directory: `ls ~/.config/Claude/plugins/` (or opencode equivalent)
      2. Verify superpowers.js still exists
      3. Verify no other files were modified
    Expected Result: Only coordination.js renamed, everything else intact
    Evidence: .sisyphus/evidence/task-6-plugins-intact.txt
  ```

  **Evidence to Capture**:
  - [ ] task-6-pause-coordination.txt — before/after directory listing
  - [ ] task-6-plugins-intact.txt — full plugins directory listing

  **Commit**: NO

- [ ] 7. Run swarm setup for OpenCode

  **What to do**:
  - Run `swarm setup` — this configures swarm for the OpenCode environment
  - Follow any interactive prompts (select OpenCode as platform)
  - Verify setup completed: `swarm doctor` should now pass all checks
  - Document any configuration files created and where they were placed

  **Must NOT do**:
  - Modify any OpenCode configuration manually
  - Select Claude Code as platform (we're using OpenCode)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single setup command + verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6 (coordination must be paused first)

  **References**:
  **External References**:
  - Setup docs: `https://github.com/joelhooks/swarm-tools#opencode`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: swarm setup completes and doctor passes
    Tool: Bash
    Preconditions: swarm installed (Task 5), coordination paused (Task 6)
    Steps:
      1. Run `swarm setup` — capture full output
      2. Run `swarm doctor` — verify all checks pass
      3. Run `swarm config` — capture configuration paths
    Expected Result: Setup completes without errors, doctor passes all checks
    Failure Indicators: Setup fails, doctor reports critical errors
    Evidence: .sisyphus/evidence/task-7-setup.txt
  ```

  **Evidence to Capture**:
  - [ ] task-7-setup.txt — setup output + doctor output + config paths

  **Commit**: NO

- [ ] 8. Initialize Hive in O.G.R.E. Project + Gitignore

  **What to do**:
  - Navigate to O.G.R.E. project root: `/home/shuff57/Documents/GitHub/O.G.R.E-OllamaGradingRubricEvaluator/`
  - Run `swarm init` to initialize the Hive in this project
  - Add `.hive/` to `.gitignore` (append, don't overwrite)
  - Verify `.hive/` directory was created
  - Verify git ignores it: `git check-ignore .hive/`

  **Must NOT do**:
  - Commit .hive/ to git during the trial
  - Initialize hive in any other project
  - Overwrite existing .gitignore content

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: init command + gitignore edit
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential, after Task 7)
  - **Blocks**: Tasks 9, 10, 11, 12 (all smoke tests need hive)
  - **Blocked By**: Task 7 (swarm must be configured)

  **References**:
  **Pattern References**:
  - `/home/shuff57/Documents/GitHub/O.G.R.E-OllamaGradingRubricEvaluator/.gitignore` — append .hive/ here

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Hive initialized and gitignored
    Tool: Bash
    Preconditions: swarm configured (Task 7)
    Steps:
      1. Run `swarm init` in O.G.R.E. project root
      2. Verify: `ls -la .hive/` — directory exists
      3. Verify .gitignore contains `.hive/`: `grep -q '.hive/' .gitignore`
      4. Verify git ignores it: `git check-ignore .hive/`
    Expected Result: .hive/ exists, gitignored, git confirms ignoring
    Failure Indicators: .hive/ not created, not in gitignore, git tracks it
    Evidence: .sisyphus/evidence/task-8-hive-init.txt

  Scenario: Existing .gitignore content preserved
    Tool: Bash
    Preconditions: .gitignore modified
    Steps:
      1. Verify .gitignore still contains key existing entries (node_modules, dist, etc.)
      2. Run `git diff .gitignore` — should only show .hive/ addition
    Expected Result: Only .hive/ added, nothing removed
    Evidence: .sisyphus/evidence/task-8-gitignore-diff.txt
  ```

  **Evidence to Capture**:
  - [ ] task-8-hive-init.txt — init output + directory listing
  - [ ] task-8-gitignore-diff.txt — git diff of .gitignore

  **Commit**: YES
  - Message: `chore: gitignore .hive/ for swarm-tools trial`
  - Files: `.gitignore`
  - Pre-commit: `git check-ignore .hive/`

- [ ] 9. Smoke Test: Hive Task Tracking

  **What to do**:
  - Create a test cell (task) in the Hive
  - List cells to verify it appears
  - Close the cell
  - Verify the full lifecycle works

  **Must NOT do**:
  - Leave test data that looks like real work

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: CLI command testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 11, 12)
  - **Blocks**: Task 13
  - **Blocked By**: Task 8 (hive must be initialized)

  **References**:
  **External References**:
  - Hive API: `https://github.com/joelhooks/swarm-tools#hive` — hive_create, hive_cells, hive_close

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full Hive cell lifecycle
    Tool: Bash
    Preconditions: Hive initialized (Task 8)
    Steps:
      1. Create cell: Use swarm CLI or MCP tool to create a test cell titled "Smoke test task"
      2. List cells: Query for the created cell
      3. Close cell: Close it with reason "Smoke test complete"
      4. Verify closed: List cells, confirm status is closed
    Expected Result: Cell created, listed, closed — full lifecycle works
    Failure Indicators: Creation fails, cell not found in list, close fails
    Evidence: .sisyphus/evidence/task-9-hive-lifecycle.txt

  Scenario: Hive status healthy after operations
    Tool: Bash
    Steps:
      1. Run `swarm hive status` or equivalent after cell operations
    Expected Result: Status reports healthy
    Evidence: .sisyphus/evidence/task-9-hive-status.txt
  ```

  **Evidence to Capture**:
  - [ ] task-9-hive-lifecycle.txt — create/list/close output
  - [ ] task-9-hive-status.txt — hive status after test

  **Commit**: NO

- [ ] 10. Smoke Test: Hivemind Memory

  **What to do**:
  - Store a test memory in Hivemind: "O.G.R.E. swarm trial: mxbai-embed-large is the embedding model"
  - Query/recall the memory with a related search: "what embedding model"
  - Verify the stored memory is retrieved
  - Test that LightRAG still works independently (no interference)

  **Must NOT do**:
  - Modify LightRAG configuration or data
  - Store real project secrets in test memories

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: CLI memory operations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 9, 11, 12)
  - **Blocks**: Task 13
  - **Blocked By**: Task 8 (hive must be initialized)

  **References**:
  **External References**:
  - Hivemind API: `https://github.com/joelhooks/swarm-tools#hivemind` — hivemind_store, hivemind_find
  **Pattern References**:
  - `.agents/memory/scripts/query_memory.py` — verify LightRAG still works after Hivemind setup

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Hivemind memory store and recall roundtrip
    Tool: Bash
    Preconditions: Swarm configured with Ollama embedding model
    Steps:
      1. Store memory via swarm CLI or MCP: "O.G.R.E. swarm trial test entry"
      2. Wait 2 seconds for indexing
      3. Recall/find memory: search for "swarm trial"
      4. Verify the stored entry is returned in results
    Expected Result: Stored memory is retrieved with relevant similarity score
    Failure Indicators: Store fails (Ollama/embedding issue), recall returns empty
    Evidence: .sisyphus/evidence/task-10-hivemind-roundtrip.txt

  Scenario: LightRAG still works independently
    Tool: Bash
    Preconditions: Hivemind is active
    Steps:
      1. Run: `python3 .agents/memory/scripts/query_memory.py "coordination system"`
      2. Verify it returns results or "no data yet" (not an error)
    Expected Result: LightRAG responds without errors — no interference from Hivemind
    Failure Indicators: LightRAG throws errors, can't connect to Ollama, model conflicts
    Evidence: .sisyphus/evidence/task-10-lightrag-independent.txt
  ```

  **Evidence to Capture**:
  - [ ] task-10-hivemind-roundtrip.txt — store + recall output
  - [ ] task-10-lightrag-independent.txt — LightRAG query output

  **Commit**: NO

- [ ] 11. Smoke Test: /swarm Command

  **What to do**:
  - Verify the `/swarm` command is recognized in an OpenCode session
  - Test with a simple decomposition: `/swarm "create a hello world test file"`
  - Observe: does it decompose into subtasks? Does it attempt to spawn workers?
  - Document the behavior — this is exploratory, not pass/fail
  - Note: This test may need to be run from within an actual OpenCode session, not a Bash subagent. Document if CLI-only testing is insufficient

  **Must NOT do**:
  - Let swarm make actual code changes to the O.G.R.E. project during smoke test
  - Leave spawned workers running after the test

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Command verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 9, 10, 12)
  - **Blocks**: Task 13
  - **Blocked By**: Task 8 (hive must be initialized)

  **References**:
  **External References**:
  - /swarm command: `https://github.com/joelhooks/swarm-tools#commands` — decompose and spawn parallel workers

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: /swarm command recognized and decomposes
    Tool: Bash (or interactive OpenCode session)
    Preconditions: Swarm configured and initialized
    Steps:
      1. Check if swarm CLI has a "run" or "exec" command for testing
      2. If CLI-testable: run `swarm run "create a test file"` or equivalent
      3. If session-only: document that this requires manual OpenCode session testing
      4. Observe decomposition output — does it create subtasks?
    Expected Result: Command recognized, task decomposed into subtasks
    Failure Indicators: "Unknown command", swarm crashes, no decomposition
    Evidence: .sisyphus/evidence/task-11-swarm-command.txt
  ```

  **Evidence to Capture**:
  - [ ] task-11-swarm-command.txt — command output or documentation of session-only requirement

  **Commit**: NO

- [ ] 12. Verify New OpenCode Session Starts Cleanly

  **What to do**:
  - Confirm that starting a fresh OpenCode session works with swarm active and coordination paused
  - Check: does the session start without errors?
  - Check: does the swarm plugin inject into the system prompt?
  - Check: are swarm tools/commands available?
  - Check: does the session NOT have the old coordination block ("## Your Session", coord_* references)?

  **Must NOT do**:
  - Modify OpenCode configuration to make this work

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Session verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 9, 10, 11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 8

  **References**:
  **Pattern References**:
  - The system prompt currently contains "## Cross-Session Coordination Status" block — this should be absent after pausing coordination.js

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Session starts with swarm, without old coordination
    Tool: Bash / OpenCode session
    Preconditions: coordination.js paused, swarm configured
    Steps:
      1. Start a new OpenCode session (or verify current session state)
      2. Check if swarm tools are available (e.g., /swarm, /hive, /inbox)
      3. Verify old coordination block is absent from session behavior
    Expected Result: Session starts cleanly, swarm tools available, no coordination errors
    Failure Indicators: Session fails to start, error about missing coordination, swarm tools not available
    Evidence: .sisyphus/evidence/task-12-session-clean.txt
  ```

  **Evidence to Capture**:
  - [ ] task-12-session-clean.txt — session start verification

  **Commit**: NO

- [ ] 13. Test Rollback Procedure

  **What to do**:
  - Document the complete rollback procedure
  - Perform a DRY-RUN of rollback steps (verify each is possible without executing):
    1. `mv ~/.config/opencode/plugins/coordination.js.paused ~/.config/opencode/plugins/coordination.js` — verify .paused file exists
    2. Backup location is known and accessible
    3. `npm uninstall -g opencode-swarm-plugin` — verify command works (but don't actually uninstall yet)
    4. `.hive/` can be removed: `rm -rf .hive/` (verify it's gitignored so removal is clean)
  - Verify LightRAG still works after all swarm operations (was not corrupted)
  - Record rollback procedure as a standalone document

  **Must NOT do**:
  - Actually perform the rollback (we're starting the trial, not ending it)
  - Remove any swarm state during verification

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification and documentation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (sequential, after all smoke tests)
  - **Blocks**: F1, F2 (final verification)
  - **Blocked By**: Tasks 9, 10, 11, 12 (all smoke tests must complete first)

  **References**:
  **Pattern References**:
  - Task 4 backup path — needed for rollback
  - Task 6 — paused file location

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rollback procedure is complete and actionable
    Tool: Bash
    Preconditions: All smoke tests complete
    Steps:
      1. Verify .paused file exists: `ls ~/.config/opencode/plugins/coordination.js.paused` or equivalent
      2. Verify backup exists: `ls <backup-path>/task-registry.json`
      3. Verify uninstall command works: `npm uninstall -g opencode-swarm-plugin --dry-run` (if supported) or just `which swarm`
      4. Verify .hive/ is gitignored: `git check-ignore .hive/`
      5. Verify LightRAG works: `python3 .agents/memory/scripts/query_memory.py "test query"`
    Expected Result: All rollback prerequisites confirmed, procedure documented
    Failure Indicators: Missing backup, missing .paused file, LightRAG broken
    Evidence: .sisyphus/evidence/task-13-rollback-verification.txt

  Scenario: Rollback time estimate under 2 minutes
    Tool: Bash
    Steps:
      1. List all rollback steps with estimated time
      2. Total should be under 2 minutes
    Expected Result: Documented procedure totaling < 2 minutes
    Evidence: .sisyphus/evidence/task-13-rollback-procedure.md
  ```

  **Evidence to Capture**:
  - [ ] task-13-rollback-verification.txt — all rollback prerequisites confirmed
  - [ ] task-13-rollback-procedure.md — complete rollback procedure document

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 2 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (run command, check file). For each "Must NOT Have": search for forbidden changes — reject with detail if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Trial Readiness Check** — `unspecified-high`
  Start from clean state. Verify: `swarm doctor` passes, `swarm hive status` works, coordination.js is paused (not deleted), LightRAG still functions, backup exists and is complete, .hive/ is gitignored, rollback procedure is documented and tested. Test one real workflow: start new OpenCode session → `/swarm "create a test task"` → verify it decomposes.
  Output: `Doctor [PASS/FAIL] | Hive [PASS/FAIL] | Coordination [PAUSED/ERROR] | LightRAG [PASS/FAIL] | Backup [PASS/FAIL] | Rollback [PASS/FAIL] | VERDICT`

---

## Commit Strategy

| # | Message | Files | Pre-commit |
|---|---------|-------|------------|
| 1 | `chore: gitignore .hive/ for swarm-tools trial` | `.gitignore` | `git check-ignore .hive/` |

> Most changes happen in `~/.config/opencode/` (system config, not repo). Only the gitignore change needs committing.

---

## Success Criteria

### Verification Commands
```bash
swarm doctor                    # Expected: all checks pass
swarm hive status               # Expected: initialized, healthy
ollama list | grep mxbai        # Expected: mxbai-embed-large present
ls ~/.config/opencode/plugins/coordination.js.paused  # Expected: exists
ls ~/.config/opencode/coordination-backup-*/          # Expected: backup dir exists
git check-ignore .hive/         # Expected: .hive/ (gitignored)
python3 .agents/memory/scripts/query_memory.py "test"  # Expected: no errors (LightRAG intact)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Swarm doctor passes
- [ ] Smoke tests pass for Hive, Hivemind, and /swarm
- [ ] Rollback procedure verified
- [ ] LightRAG memory system unaffected
