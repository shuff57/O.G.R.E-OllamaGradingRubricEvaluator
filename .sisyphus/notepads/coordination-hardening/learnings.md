# Learnings — coordination-hardening

## [2026-03-18] Session Start

### Key Architecture Facts
- `~/.config/opencode/plugins/coordination.js` is loaded at session init — in-place edits are safe for running sessions
- `~/.config/opencode/coordination/helpers.sh` owns ALL registry mutation via flock — never bypass it
- Plugin `tool.execute.before` hook currently logs conflicts but does NOT block (advisory-only, TODO at line 471-473)
- Registry path: `~/.config/opencode/coordination/task-registry.json`
- Lock file: `~/.config/opencode/coordination/.registry.lock`
- Messages dir: `~/.config/opencode/coordination/messages/`

### Existing Shell Tests
- `test_progress.sh` — tests coord_update_progress / coord_get_progress
- `test_messaging.sh` — tests coord_send_message / coord_drain_inbox
- `test_subscriptions.sh` — tests coord_subscribe / completion notifications
- NO enforcement or worktree tests exist yet

### Session Schema (current vs desired)
Current: `{ label, pid, created_at }`
Desired: `{ label, pid, created_at, last_seen, heartbeat_at, mode, status, worktree_path }`

### Task Schema (current vs desired)
Current: `{ id, status, claimed_by, claimed_at, files, completed_at }`
Desired: adds `released_at`, `release_reason`, `progress`, `progress_msg`, `events`

### Allowed Values
- session modes: `read_only | planning | implementation`
- task statuses: `pending | in_progress | completed | cancelled | blocked | abandoned`

### Worktree
- This plan runs in `.worktrees/coordination-hardening` on branch `feature/coordination-hardening`
- Target files are in `~/.config/opencode/` — NOT in the repo worktree
- Commits for coordination files go to `~/.config/opencode/` (if it's a git repo) or are tracked separately

### Critical Constraint
- The coordination files live in `~/.config/opencode/` which may or may not be a git repo
- Check before attempting git commits in that directory

## [2026-03-18] Verification gotcha: helpers.sh resets temp env on source

- `helpers.sh` assigns `REGISTRY` and `LOCKFILE` at load time, so `REGISTRY=... LOCKFILE=... source helpers.sh` does **not** preserve temp paths.
- Safe test pattern is: `source helpers.sh` first, then reassign `REGISTRY`/`LOCKFILE`, and ensure temp files do not already exist so `_init_registry` seeds valid JSON.
- Using `mktemp` without removing the file leaves an empty registry file that causes jq update pipelines to emit empty output; remove temp files first if the helper expects to initialize them.

## [2026-03-18] Critical Discovery: ~/.config/opencode is NOT a git repo

The plan's commit steps reference `git add ~/.config/opencode/...` but that directory is not a git repo.

**Adjusted approach:**
- Make all changes directly to `~/.config/opencode/coordination/helpers.sh` and `~/.config/opencode/plugins/coordination.js`
- Verify changes work via shell tests
- Track progress via plan checkboxes only (no git commits for these files)
- The plan's "Commit" steps become "Verify and checkpoint" steps instead

**helpers.sh structure:**
- Lines 1-87: coord_add_session, coord_claim_task
- Lines 89-120: coord_complete_task
- Lines 122-168: coord_check_conflicts, coord_check_stale
- Lines 170-208: coord_update_progress, coord_get_progress
- Lines 210-302: messaging helpers
- Lines 304-353: test_flock + main entry point

**Existing test pattern (from test_progress.sh etc):**
- Tests source helpers.sh, use a temp registry, run assertions, print PASS/FAIL
