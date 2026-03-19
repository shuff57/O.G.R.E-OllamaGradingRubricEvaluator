# Cross-Session Coordination Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cross-session coordination fully reliable by enforcing file claims before mutation, isolating implementation work in dedicated worktrees, cleaning stale sessions automatically, and surfacing trustworthy live status to every session.

**Architecture:** Extend the existing coordination stack instead of replacing it. Keep `helpers.sh` as the authoritative mutation API for the registry, make `plugins/coordination.js` the enforcement point for tool usage and session state, and tighten startup/commit/worktree policy around those two layers. Add a small, testable set of registry fields (`last_seen`, `mode`, `worktree_path`, `heartbeat_at`) and hard gates so coordination becomes mandatory instead of advisory.

**Tech Stack:** OpenCode plugin (`~/.config/opencode/plugins/coordination.js`), bash helpers (`~/.config/opencode/coordination/helpers.sh`), JSON registry/schema, shell test harnesses, git worktrees, jq, bash, node.

---

## Scope and Design Constraints

### Must Have
- Mandatory claim enforcement before any mutating tool action
- Mandatory claim validation before commit / PR creation / other git write actions
- Dedicated worktree requirement for implementation sessions when multiple live sessions exist
- Session heartbeat + stale-session cleanup with automatic claim release after grace period
- Accurate coordination status surfaced in session context and `/coordination-check`
- Backward-compatible migration of existing task registry data

### Must NOT Have
- Do NOT replace the registry format wholesale — extend it incrementally
- Do NOT require claims for purely read-only sessions
- Do NOT silently edit or discard another session’s uncommitted working tree
- Do NOT rely on advisory warnings only — enforcement must block unsafe mutation
- Do NOT use branch-wide diff ranges like `origin/<branch>..HEAD` in verification of scope fidelity

### Implementation Notes From Existing Code
- `~/.config/opencode/plugins/coordination.js:471-473` explicitly says enforcement is still TODO; current system is advisory-only
- `~/.config/opencode/coordination/helpers.sh` already owns registry mutation and flocking — extend this, don’t bypass it
- `~/.config/opencode/coordination/task-registry.schema.json` already documents `last_seen`/`status` but the live registry does not populate them consistently
- Existing shell tests exist for coordination helpers (`test_progress.sh`, `test_messaging.sh`, `test_subscriptions.sh`) but there are no plugin-level tests yet

---

## File Map

### Core files to modify
- Modify: `~/.config/opencode/plugins/coordination.js`
  - Add hard enforcement for write/edit and git mutation paths
  - Add session heartbeat updates
  - Add worktree validation and richer status output
- Modify: `~/.config/opencode/coordination/helpers.sh`
  - Add session heartbeat/update helpers
  - Add claim extension / takeover / stale-release helpers
  - Add worktree-aware session/task fields
- Modify: `~/.config/opencode/coordination/task-registry.schema.json`
  - Update schema doc to match enforced fields and stale-cleanup lifecycle
- Modify: `~/.config/opencode/coordination/COORDINATION.md`
  - Update protocol to reflect mandatory enforcement and auto stale cleanup
- Modify: `~/.config/opencode/rules/coordination.md`
  - Tighten rules to match hard enforcement
- Modify: `~/.config/opencode/commands/coordination-check.md`
  - Make dashboard report heartbeat/worktree/claim health explicitly

### Likely new files
- Create: `~/.config/opencode/coordination/test_enforcement.sh`
  - End-to-end shell test for helper enforcement semantics and stale cleanup
- Create: `~/.config/opencode/coordination/test_worktree_policy.sh`
  - Shell test for worktree sharing/validation behavior
- Create: `~/.config/opencode/plugins/__tests__/coordination.test.js` **if plugin test harness already exists or is easy to add**
  - Unit tests for path extraction / mutation gating / status block generation

### Existing files to read before coding
- Read: `~/.config/opencode/plugins/coordination.js:1-552`
- Read: `~/.config/opencode/coordination/helpers.sh:1-353`
- Read: `~/.config/opencode/coordination/task-registry.schema.json:1-23`
- Read: `~/.config/opencode/coordination/COORDINATION.md:1-391`
- Read: `~/.config/opencode/rules/coordination.md:1-11`
- Read: `~/.config/opencode/commands/coordination-check.md:1-24`
- Read: `~/.config/opencode/coordination/test_progress.sh`
- Read: `~/.config/opencode/coordination/test_messaging.sh`
- Read: `~/.config/opencode/coordination/test_subscriptions.sh`

---

## Chunk 1: Registry + Helper Hardening

### Task 1: Expand registry session metadata and helper primitives

**Files:**
- Modify: `~/.config/opencode/coordination/helpers.sh`
- Modify: `~/.config/opencode/coordination/task-registry.schema.json`

- [x] **Step 1: Add failing schema/behavior notes to the plan scratchpad (read-only prep)**

Document the current/desired session object shape in a temp note before touching code:

```json
{
  "label": "opencode-session",
  "pid": "12345",
  "created_at": 1773861730.880839,
  "last_seen": 1773861730.880839,
  "heartbeat_at": 1773861730.880839,
  "mode": "planning",
  "status": "active",
  "worktree_path": "/abs/path"
}
```

- [x] **Step 2: Write/extend helper tests for session metadata behavior**

In a new shell test (or extend an existing one), verify:
- `coord_add_session` writes `last_seen`, `heartbeat_at`, `mode`, `status`, and `worktree_path`
- `coord_touch_session` updates timestamps without replacing created_at
- helpers preserve backward compatibility when existing session entries lack new keys

Run example:

```bash
bash ~/.config/opencode/coordination/test_enforcement.sh
```

Expected initially: FAIL because helpers don’t populate/update the new fields yet.

- [x] **Step 3: Implement helper functions for live session updates**

Add these helpers to `helpers.sh`:

```bash
coord_touch_session() {
  local session_id="$1"
  local mode="${2:-}"
  local worktree_path="${3:-}"
  # update last_seen/heartbeat_at/status and optional mode/worktree_path
}

coord_set_session_mode() {
  local session_id="$1"
  local mode="$2"
}

coord_release_stale_task() {
  local task_id="$1"
  # set status=abandoned or cancelled_by_stale_cleanup, clear claimed_by, add released_at
}
```

Also update `coord_add_session` signature so it can accept optional `mode` and `worktree_path` without breaking current callers.

- [x] **Step 4: Update the schema doc to match reality**

Extend `task-registry.schema.json` to document:
- session fields: `created_at`, `last_seen`, `heartbeat_at`, `mode`, `status`, `worktree_path`
- task lifecycle fields: `released_at`, `release_reason`, `progress`, `progress_msg`, `events`
- allowed session modes: `read_only | planning | implementation`
- allowed task statuses: `pending | in_progress | completed | cancelled | blocked | abandoned`

- [x] **Step 5: Run helper tests and inspect registry output**

Run:

```bash
bash ~/.config/opencode/coordination/test_enforcement.sh
source ~/.config/opencode/coordination/helpers.sh && coord_read | jq '.sessions'
```

Expected:
- tests pass
- session objects include the new fields

- [ ] **Step 6: Commit**

```bash
git add ~/.config/opencode/coordination/helpers.sh \
        ~/.config/opencode/coordination/task-registry.schema.json \
        ~/.config/opencode/coordination/test_enforcement.sh
git commit -m "feat(coordination): add session heartbeat and stale-release helpers"
```

---

### Task 2: Implement stale detection and automatic cleanup policy in helpers

**Files:**
- Modify: `~/.config/opencode/coordination/helpers.sh`
- Test: `~/.config/opencode/coordination/test_enforcement.sh`

- [x] **Step 1: Add failing tests for stale release policy**

Test these scenarios:
- dead PID + old `claimed_at` → stale
- missing PID + old claim → stale
- live PID + recent heartbeat → not stale
- stale task can be released automatically by helper

Expected initially: FAIL because stale detection only reports tasks; it does not release them.

- [x] **Step 2: Implement stale release helpers and grace policy**

Add helpers:

```bash
coord_list_stale_tasks() { ... }
coord_cleanup_stale_tasks() { ... }
```

Policy:
- stale threshold: configurable, default 30m heartbeat + 2h claim age
- cleanup marks task `abandoned`
- preserves file list, owner history, release timestamp, release reason
- never deletes historical tasks

- [x] **Step 3: Emit machine-readable cleanup output**

`coord_cleanup_stale_tasks` should print JSON like:

```json
[
  {"id":"task-123","claimed_by":"oc-ses-...","release_reason":"dead_pid"}
]
```

This will support plugin/dashboard visibility later.

- [x] **Step 4: Re-run tests**

Run:

```bash
bash ~/.config/opencode/coordination/test_enforcement.sh
```

Expected: all stale-detection and stale-release tests pass.

- [x] **Step 5: Commit**

```bash
git add ~/.config/opencode/coordination/helpers.sh \
        ~/.config/opencode/coordination/test_enforcement.sh
git commit -m "feat(coordination): add automatic stale claim cleanup"
```

---

## Chunk 2: Plugin Enforcement and Session Modes

### Task 3: Add hard write/edit enforcement in coordination plugin

**Files:**
- Modify: `~/.config/opencode/plugins/coordination.js`
- Test: `~/.config/opencode/plugins/__tests__/coordination.test.js` (if feasible)

- [x] **Step 1: Write failing tests (or deterministic manual harness) for mutation gating**

Cover:
- write/edit to unclaimed file in implementation mode → blocked
- write/edit to file claimed by another session → blocked
- write/edit to file claimed by current session → allowed
- write/edit in read-only/planning mode with no claims → blocked if mutating

If no plugin unit harness exists, create a lightweight node script under `coordination/` that calls the gating functions directly.

- [x] **Step 2: Refactor plugin into testable helpers**

Extract pure functions from `coordination.js`:

```js
function getMutationTargets(tool, args) { ... }
function getSessionMode(registry, sessionId) { ... }
function getConflictsForTargets(registry, sessionId, targets) { ... }
function shouldBlockMutation({ tool, sessionMode, targets, conflicts, claimedFiles }) { ... }
```

This keeps the hook logic thin and testable.

- [x] **Step 3: Replace advisory logging with hard blocking**

Update `'tool.execute.before'` so that for mutating tools it:
- normalizes all target files
- checks current session mode
- refuses mutation when:
  - session has no implementation claim
  - file not claimed by current session
  - file claimed by another session
- returns/throws a blocking error with actionable text

Required error shape:

```text
[coordination] BLOCKED: <file>
Reason: claimed by <session/task> | no active claim | wrong worktree
Resolution: claim file, switch worktree, or wait for conflicting task
```

- [x] **Step 4: Re-run plugin tests / harness**

Run one of:

```bash
node ~/.config/opencode/plugins/__tests__/coordination.test.js
```

or

```bash
node ~/.config/opencode/coordination/test_plugin_enforcement.js
```

Expected: blocked and allowed cases match the policy exactly.

- [ ] **Step 5: Commit**

```bash
git add ~/.config/opencode/plugins/coordination.js \
        ~/.config/opencode/plugins/__tests__/coordination.test.js \
        ~/.config/opencode/coordination/test_plugin_enforcement.js
git commit -m "feat(coordination): enforce file claims before mutation"
```

---

### Task 4: Add session heartbeat, mode inference, and richer status blocks

**Files:**
- Modify: `~/.config/opencode/plugins/coordination.js`
- Modify: `~/.config/opencode/commands/coordination-check.md`

- [x] **Step 1: Write failing checks for session mode and heartbeat updates**

Verify that every transformed system prompt refreshes:
- `last_seen`
- `heartbeat_at`
- session `status`

Also verify the status block includes:
- live session count
- in-progress task count
- stale claim count
- shared-worktree warning count

- [x] **Step 2: Implement heartbeat updates inside `experimental.chat.system.transform`**

After `safeSessionId(rawSessionID)`, call helper(s) to upsert:
- `last_seen`
- `heartbeat_at`
- session mode (`planning` by default; `implementation` when active task/worktree present)
- session worktree path when known

- [x] **Step 3: Improve the status block**

Replace the current summary with a dashboard that reports:
- active live sessions
- stale sessions
- in-progress tasks
- orphaned tasks
- sessions sharing same worktree
- claimed files count

Target output shape:

```text
## Cross-Session Coordination Status
Live sessions: 8
Implementation sessions: 3
In-progress tasks: 2
Stale claims: 1
Shared worktree warnings: 2
⚠ Worktree collision: oc-ses-a, oc-ses-b -> /path
⚠ Stale task: task-123 (dead pid)
```

- [x] **Step 4: Update `/coordination-check` command doc**

Make it explicitly show:
- `heartbeat_at`
- `mode`
- `worktree_path`
- `release_reason`
- whether sessions are alive by PID

- [x] **Step 5: Verify output manually**

Run:

```bash
source ~/.config/opencode/coordination/helpers.sh && coord_read | jq .
```

Then start a fresh session and confirm the injected system block shows the new fields.

- [ ] **Step 6: Commit**

```bash
git add ~/.config/opencode/plugins/coordination.js \
        ~/.config/opencode/commands/coordination-check.md
git commit -m "feat(coordination): add heartbeat tracking and status dashboards"
```

---

## Chunk 3: Worktree Policy and Git Mutation Gates

### Task 5: Enforce dedicated worktree policy for implementation sessions

**Files:**
- Modify: `~/.config/opencode/plugins/coordination.js`
- Modify: `~/.config/opencode/rules/coordination.md`
- Create: `~/.config/opencode/coordination/test_worktree_policy.sh`

- [x] **Step 1: Write failing tests for worktree collision policy**

Cover:
- single live implementation session in a worktree → allowed
- multiple implementation sessions sharing one worktree → warning or block depending on mutation path
- implementation session in main workspace while other live sessions exist → blocked
- planning/read-only session in shared workspace → allowed

- [x] **Step 2: Implement worktree detection and comparison**

In plugin/helpers, derive current worktree via:

```bash
git rev-parse --show-toplevel
git worktree list --porcelain
```

Persist normalized `worktree_path` per session.

- [x] **Step 3: Add worktree enforcement rules**

Policy:
- implementation mode requires a registered worktree path
- if multiple live implementation sessions share one worktree, mutating actions are blocked unless session is the only claimant for all target files
- main workspace implementation is blocked when another live implementation session exists anywhere in same repo

- [x] **Step 4: Update coordination rule text**

Revise `rules/coordination.md` to say:
- implementation work must run in dedicated worktree
- shared workspace is read-only unless explicitly solo
- commits require both claim ownership and worktree match

- [x] **Step 5: Run worktree-policy tests**

Run:

```bash
bash ~/.config/opencode/coordination/test_worktree_policy.sh
```

Expected: all worktree-policy scenarios pass.

- [ ] **Step 6: Commit**

```bash
git add ~/.config/opencode/plugins/coordination.js \
        ~/.config/opencode/rules/coordination.md \
        ~/.config/opencode/coordination/test_worktree_policy.sh
git commit -m "feat(coordination): enforce dedicated worktrees for implementation sessions"
```

---

### Task 6: Add git commit/PR mutation guards using claims + worktree validation

**Files:**
- Modify: `~/.config/opencode/plugins/coordination.js`
- Modify: `~/.config/opencode/coordination/helpers.sh`

- [x] **Step 1: Write failing tests/manual checks for git mutation gating**

Cover:
- `git commit` with staged unclaimed file → blocked
- `git commit` with file claimed by another session → blocked
- `git commit` with correct claims/worktree → allowed
- `gh pr create` with unresolved stale/conflict warnings → blocked

- [x] **Step 2: Implement staged-file inspection helpers**

Add helper or plugin logic to inspect:

```bash
git diff --cached --name-only
```

Normalize staged paths against claimed file list and current worktree.

- [x] **Step 3: Add hard gate for git mutation commands**

In plugin `tool.execute.before`, detect `bash` calls containing:
- `git commit`
- `git merge`
- `gh pr create`

Block unless:
- every staged file is claimed by current session
- no staged file is claimed by another session
- session worktree matches registered `worktree_path`
- no unresolved stale conflicts remain

- [x] **Step 4: Verify manually with a scratch repo/worktree**

Exercise:
- claim file A in session 1
- attempt commit of file A from session 2 → blocked
- attempt commit from session 1 → allowed

- [ ] **Step 5: Commit**

```bash
git add ~/.config/opencode/plugins/coordination.js \
        ~/.config/opencode/coordination/helpers.sh
git commit -m "feat(coordination): block git mutations without valid claims"
```

---

## Chunk 4: Operational Docs, Migration, and Verification

### Task 7: Update protocol docs and migration story

**Files:**
- Modify: `~/.config/opencode/coordination/COORDINATION.md`
- Modify: `~/.config/opencode/rules/coordination.md`
- Modify: `~/.config/opencode/coordination/AGENTS.md` (if it contains outdated coordination behavior)

- [x] **Step 1: Rewrite protocol to match enforced behavior**

Update docs to reflect:
- claims are mandatory before mutation
- stale claims are auto-released after grace policy
- read-only/planning vs implementation session modes
- worktree isolation policy
- commit/PR gating behavior

- [x] **Step 2: Add migration guidance**

Document how existing sessions/tasks are upgraded:
- missing fields are defaulted lazily by helper/plugin calls
- stale entries are preserved historically but marked abandoned
- old sessions without worktree path become `planning` until upgraded

- [x] **Step 3: Add operator troubleshooting section**

Include commands for:

```bash
source ~/.config/opencode/coordination/helpers.sh
coord_read | jq .
coord_check_stale
coord_cleanup_stale_tasks
```

and how to resolve blocked commits/worktree collisions safely.

- [ ] **Step 4: Commit**

```bash
git add ~/.config/opencode/coordination/COORDINATION.md \
        ~/.config/opencode/rules/coordination.md \
        ~/.config/opencode/coordination/AGENTS.md
git commit -m "docs(coordination): document enforced claims and worktree policy"
```

---

### Task 8: End-to-end verification in a controlled multi-session simulation

**Files:**
- Use: `~/.config/opencode/coordination/test_enforcement.sh`
- Use: `~/.config/opencode/coordination/test_worktree_policy.sh`
- Use: `~/.config/opencode/coordination/test_progress.sh`
- Use: `~/.config/opencode/coordination/test_subscriptions.sh`
- Use: `~/.config/opencode/coordination/test_messaging.sh`

- [x] **Step 1: Run helper + messaging regression suite**

```bash
bash ~/.config/opencode/coordination/test_progress.sh
bash ~/.config/opencode/coordination/test_messaging.sh
bash ~/.config/opencode/coordination/test_subscriptions.sh
bash ~/.config/opencode/coordination/test_enforcement.sh
bash ~/.config/opencode/coordination/test_worktree_policy.sh
```

Expected: all pass.

- [x] **Step 2: Run manual two-session simulation**

Scenario A:
- session A claims file X
- session B attempts write/edit on file X → blocked

Scenario B:
- session A dies or fake PID is inserted
- stale cleanup runs
- session B can claim file X afterward

Scenario C:
- two implementation sessions share worktree
- plugin warns/blocks mutation as designed

Scenario D:
- staged unclaimed file during commit → blocked

- [x] **Step 3: Save evidence under `.sisyphus/evidence/coordination-hardening-*`**

Capture command outputs for each major scenario.

- [ ] **Step 4: Commit any final test harness/evidence plumbing**

```bash
git add ~/.config/opencode/coordination \
        ~/.config/opencode/plugins/coordination.js
git commit -m "test(coordination): verify multi-session enforcement end to end"
```

---

## Commit Strategy

Expected commit count for plan verification: **8 commits**

1. `feat(coordination): add session heartbeat and stale-release helpers`
2. `feat(coordination): add automatic stale claim cleanup`
3. `feat(coordination): enforce file claims before mutation`
4. `feat(coordination): add heartbeat tracking and status dashboards`
5. `feat(coordination): enforce dedicated worktrees for implementation sessions`
6. `feat(coordination): block git mutations without valid claims`
7. `docs(coordination): document enforced claims and worktree policy`
8. `test(coordination): verify multi-session enforcement end to end`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each Must Have: verify implementation exists in helpers/plugin/docs/tests. For each Must NOT Have: search for advisory-only leftovers, silent bypasses, and undocumented destructive cleanup. Check evidence files with glob patterns like `.sisyphus/evidence/coordination-hardening-*`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run all coordination shell tests and review changed files for: broken jq usage, unsafe temp-file handling, missing lock coverage, silent catch-and-continue paths in enforcement logic, and unclear operator messages. Confirm plugin logic follows existing style and does not bypass `helpers.sh` for registry mutation.
  Output: `Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Full Coordination Test Verification** — `unspecified-high`
  Run the full coordination test set with verbose output. Verify new enforcement/worktree tests pass. Confirm legacy messaging/progress/subscription tests still pass.
  Output: `Total [N scripts] | Pass [N] | Fail [N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  Compare actual implementation against the expected 8 plan commits using `git diff HEAD~8..HEAD --name-only` (NOT `origin/branch..HEAD`). Verify all changes are confined to the coordination plugin/helpers/schema/docs/tests and any intentional support files explicitly named in this plan. Flag unaccounted files.
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Execution Notes

- This work should be implemented in a dedicated worktree because it changes the coordination system itself.
- Start with helper/schema changes before plugin enforcement so there is a stable API for the plugin to call.
- Prefer small pure functions in `coordination.js` so enforcement logic can be tested without spawning full plugin sessions.
- Any plugin enforcement that cannot be tested automatically must have a reproducible shell simulation recorded in `.sisyphus/evidence/`.

## Success Criteria

- Mutating tools are blocked unless the current session holds the necessary claims
- Commits/PR creation are blocked when staged files are unclaimed, cross-claimed, or in the wrong worktree
- Every live session updates `last_seen`/`heartbeat_at`
- Dead sessions’ claims are auto-released after grace policy, without deleting historical task records
- `/coordination-check` and injected session status reflect real liveness, stale claims, and worktree collisions
- Full coordination regression suite passes
