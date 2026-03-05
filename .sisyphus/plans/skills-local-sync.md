# Skills Local Sync from ~/.claude/skills/

## TL;DR

> **Quick Summary**: Add a feature that reads skill files from `~/.claude/skills/` on disk and imports them into OGRE's SQLite Skills DB, so locally installed Claude Code skills appear in the OGRE Skills page.
>
> **Deliverables**:
> - Rust: `scan_claude_skills` command reads `~/.claude/skills/` and returns file contents
> - `skills-api.ts`: `syncLocalSkills()` function that calls the command and saves to DB
> - `Skills.svelte`: "Sync Local Skills" button + auto-sync on page mount
>
> **Estimated Effort**: Medium (3-layer change: Rust → TS → Svelte)
> **Parallel Execution**: Sequential waves (Rust → TS → Svelte)
> **Critical Path**: Rust command → TS function → Svelte UI → Verification

---

## Context

### Original Request
User copied gb-pipeline skill files to `.claude/skills/` and expected them to appear in OGRE's Skills page. The files are for Claude Code / OpenCode automation, but the user wants them accessible and manageable in OGRE too.

### Architecture Discovered

**Current skills system:**
- OGRE Skills page (`Skills.svelte`) calls `getSkills()` → reads from SQLite `skills` table
- Skills table schema: `id, name, description, content, source, source_id, is_active`
- Unique index on `(source, source_id) WHERE source IS NOT NULL` — prevents duplicates
- `saveSkill()` in `db.ts` inserts/updates
- `parseSkillMarkdown()` extracts `name` and `description` from markdown (frontmatter or first heading/paragraph)
- No filesystem reading exists anywhere in the app
- No `tauri-plugin-fs` in Cargo.toml (but Rust `std::fs` works fine)
- Tauri 2 provides `app.path().home_dir()` — no extra crate needed

**Local skills path:** `{home_dir}/.claude/skills/`
- Each subdirectory is a skill
- Reads `SKILL.md` first, then `CLAUDE.md` as fallback
- Existing gb-* skills: `gb-pipeline`, `gb-compare`, `gb-new-assignment`, `gb-sync`

**Deduplication strategy:** `source: 'local-claude'`, `source_id: folderName`
- First sync imports all found skills
- Subsequent syncs skip already-imported skills (existing `getSkillBySource` handles this)
- Changed file content on disk: NOT auto-updated (would need explicit re-sync or a "force update" option — out of scope)

---

## Work Objectives

### Core Objective
Make locally installed Claude Code skills (from `~/.claude/skills/`) visible and manageable in OGRE's Skills page without manual file upload.

### Concrete Deliverables
- `ogre-desktop/src-tauri/src/lib.rs` — `scan_claude_skills` Tauri command added and registered
- `ogre-desktop/src/lib/skills-api.ts` — `syncLocalSkills()` function added
- `ogre-desktop/src/pages/Skills.svelte` — "Sync Local Skills" button + auto-sync on mount

### Definition of Done
- [x] `scan_claude_skills` Tauri command returns skill folders from `~/.claude/skills/`
- [x] `syncLocalSkills()` imports new skills into OGRE DB, skips existing ones
- [x] Skills page shows a "Sync Local Skills" button
- [x] Skills page auto-syncs on mount (silent, no UI blocking)
- [x] After sync, gb-pipeline, gb-compare, gb-new-assignment, gb-sync appear in "My Skills"
- [x] Running sync again does NOT create duplicates
- [x] All existing tests pass

### Must Have
- `scan_claude_skills` reads `SKILL.md` first, then `CLAUDE.md` from each subdirectory
- Deduplication via `source: 'local-claude'` + `source_id: folderName`
- Auto-sync on Skills page mount (silent, no spinner — fires and forgets unless error)
- Manual "Sync Local Skills" button for explicit re-sync

### Must NOT Have
- Do NOT auto-update already-imported skills when disk content changes (keep simple: import once)
- Do NOT delete OGRE skills when `.claude/skills/` folder is removed
- Do NOT expose the `~/.claude/skills/` path in the UI
- Do NOT modify the skills table schema (no migration needed)
- Do NOT change any other OGRE page (browser, settings, etc.)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Rust — independent):
└── Task 1: Add scan_claude_skills command to lib.rs

Wave 2 (TypeScript — after Wave 1):
└── Task 2: Add syncLocalSkills() to skills-api.ts

Wave 3 (Svelte — after Wave 2):
└── Task 3: Skills.svelte — button + auto-sync on mount

Wave FINAL:
├── Task F1: Plan compliance audit
└── Task F2: Test run
```

---

## TODOs

- [x] 1. Rust: Add `scan_claude_skills` command

  **What to do**:

  1. Add a new struct for the return type (near the top of lib.rs, after existing structs):
     ```rust
     #[derive(serde::Serialize)]
     struct LocalSkillFile {
         folder: String,   // directory name, e.g. "gb-pipeline"
         content: String,  // raw markdown content of SKILL.md or CLAUDE.md
     }
     ```

  2. Add the command function (add AFTER the `inject_webview_script` command, before the OAuth section):
     ```rust
     #[tauri::command]
     async fn scan_claude_skills(app: tauri::AppHandle) -> Result<Vec<LocalSkillFile>, String> {
         let home = app.path().home_dir()
             .map_err(|e| format!("Failed to get home dir: {}", e))?;
         let skills_dir = home.join(".claude").join("skills");

         if !skills_dir.exists() {
             return Ok(vec![]);
         }

         let entries = std::fs::read_dir(&skills_dir)
             .map_err(|e| format!("Failed to read skills dir: {}", e))?;

         let mut results = Vec::new();
         for entry in entries.flatten() {
             let path = entry.path();
             if !path.is_dir() { continue; }

             let folder = path.file_name()
                 .unwrap_or_default()
                 .to_string_lossy()
                 .to_string();

             // Try SKILL.md first, then CLAUDE.md
             let content = [path.join("SKILL.md"), path.join("CLAUDE.md")]
                 .iter()
                 .find(|p| p.exists())
                 .and_then(|p| std::fs::read_to_string(p).ok());

             if let Some(content) = content {
                 results.push(LocalSkillFile { folder, content });
             }
         }

         Ok(results)
     }
     ```

  3. Register in `invoke_handler![]` (lib.rs line ~839-858):
     Add `scan_claude_skills,` to the list (alphabetically near `set_webview_bounds` or at end of browser commands section)

  **Pattern references**:
  - `lib.rs:19-44` — existing struct definitions (add `LocalSkillFile` here)
  - `lib.rs:839-858` — `invoke_handler![]` macro (add `scan_claude_skills,`)
  - `lib.rs:681-706` — `run()` function where `app.path()` is used — confirms `app.path().home_dir()` pattern is available

  **Must NOT do**:
  - Do NOT add any new Cargo.toml dependencies (std::fs is sufficient)
  - Do NOT change any existing commands
  - Do NOT read files outside `~/.claude/skills/`

  **Acceptance Criteria**:
  - [ ] `LocalSkillFile` struct defined with `folder` and `content` fields, serializable
  - [ ] `scan_claude_skills` function exists and registered in invoke_handler
  - [ ] `cargo build` exits 0

  **QA Scenarios**:
  ```
  Scenario: Rust compiles
    Tool: Bash
    Steps: cd ogre-desktop && cargo build 2>&1 | tail -5
    Expected: Finished / no errors
    Evidence: .sisyphus/evidence/task-1-skills-cargo-build.txt

  Scenario: scan_claude_skills registered
    Tool: Grep
    Steps: grep -n "scan_claude_skills" src-tauri/src/lib.rs
    Expected: At least 2 matches (definition + invoke_handler)
    Evidence: .sisyphus/evidence/task-1-command-registered.txt
  ```

  **Commit**: NO — commit after F1/F2

- [x] 2. TypeScript: Add `syncLocalSkills()` to skills-api.ts

  **What to do**:

  1. Read `ogre-desktop/src/lib/skills-api.ts` fully first (it already has `installSkill`, `searchSkills`, `buildSkillInjection` etc.)

  2. Add import at top of skills-api.ts if not already present:
     ```typescript
     import { invoke } from '@tauri-apps/api/core';
     ```
     Check if `invoke` is already imported — skills-api.ts uses `tauriFetch`, not `invoke`. So need to add this import.

  3. Add `LocalSkillFile` interface (before `syncLocalSkills`):
     ```typescript
     interface LocalSkillFile {
       folder: string;
       content: string;
     }
     ```

  4. Add `syncLocalSkills` function at the end of the file:
     ```typescript
     /**
      * Scan ~/.claude/skills/ for local skill files and import new ones into OGRE's DB.
      * Skips skills already imported (identified by source='local-claude' + source_id=folder).
      * Returns counts of imported vs skipped skills.
      */
     export async function syncLocalSkills(): Promise<{ imported: number; skipped: number }> {
       let imported = 0;
       let skipped = 0;

       try {
         const files = await invoke<LocalSkillFile[]>('scan_claude_skills');

         for (const file of files) {
           const existing = await getSkillBySource('local-claude', file.folder);
           if (existing) {
             skipped++;
             continue;
           }

           const parsed = parseSkillMarkdown(file.content);
           await saveSkill({
             name: parsed.name || file.folder,
             description: parsed.description || '',
             content: file.content,
             source: 'local-claude',
             source_id: file.folder,
             is_active: 0,
           });
           imported++;
         }
       } catch {
         // Silently fail — local skills sync is best-effort
       }

       return { imported, skipped };
     }
     ```

  5. Add required imports at top of file if not already there:
     ```typescript
     import { parseSkillMarkdown } from './skill-parser';
     ```
     Check if `parseSkillMarkdown` is already imported — likely not, since skills-api.ts currently only imports from `./db`.

  **Pattern references**:
  - `skills-api.ts:109` — `import { getSkillBySource, saveSkill, getActiveSkills } from './db'` — `getSkillBySource` is already imported
  - `skills-api.ts:130-147` — `installSkill` function — follow exact same saveSkill call pattern
  - `skill-parser.ts:12-67` — `parseSkillMarkdown` function
  - `db.ts:67-77` — `Skill` interface showing all required saveSkill fields

  **Must NOT do**:
  - Do NOT modify `installSkill` or any existing function
  - Do NOT suppress TypeScript errors with `as any` or `@ts-ignore`
  - Do NOT catch errors silently in a way that makes debugging impossible (log to console is OK)

  **Acceptance Criteria**:
  - [ ] `syncLocalSkills` function exported from skills-api.ts
  - [ ] Uses `source: 'local-claude'` and `source_id: file.folder`
  - [ ] Calls `getSkillBySource` before `saveSkill` (deduplication)
  - [ ] LSP diagnostics clean on skills-api.ts

  **QA Scenarios**:
  ```
  Scenario: LSP clean
    Tool: lsp_diagnostics
    Steps: run on ogre-desktop/src/lib/skills-api.ts
    Expected: No errors
    Evidence: .sisyphus/evidence/task-2-skills-lsp.txt

  Scenario: syncLocalSkills exported
    Tool: Grep
    Steps: grep -n "export.*syncLocalSkills" src/lib/skills-api.ts
    Expected: 1 match
    Evidence: .sisyphus/evidence/task-2-export-check.txt
  ```

  **Commit**: NO — commit after F1/F2

- [x] 3. Svelte: Add sync button + auto-sync to Skills.svelte

  **What to do**:

  1. Read `ogre-desktop/src/pages/Skills.svelte` fully first

  2. Import `syncLocalSkills`:
     ```svelte
     import { searchSkills, fetchTrendingSkills, buildSkillContentUrl, installSkill, syncLocalSkills } from '../lib/skills-api';
     ```
     (Add `syncLocalSkills` to existing import — check current imports at top of script)

  3. Add state for sync feedback:
     ```typescript
     let syncMessage = $state<string | null>(null);
     let syncing = $state(false);
     ```

  4. Add `handleSyncLocal` function:
     ```typescript
     async function handleSyncLocal() {
       if (syncing) return;
       syncing = true;
       syncMessage = null;
       try {
         const { imported, skipped } = await syncLocalSkills();
         if (imported > 0) {
           await loadSkills();
           syncMessage = `Imported ${imported} new skill${imported === 1 ? '' : 's'} from ~/.claude/skills/`;
         } else {
           syncMessage = skipped > 0 ? 'All local skills already imported.' : 'No local skills found.';
         }
       } catch {
         syncMessage = 'Failed to sync local skills.';
       } finally {
         syncing = false;
         // Clear message after 4 seconds
         setTimeout(() => { syncMessage = null; }, 4000);
       }
     }
     ```

  5. Call auto-sync silently on mount (after `loadSkills()`):
     ```typescript
     onMount(() => {
       loadSkills();
       syncLocalSkills().then(({ imported }) => {
         if (imported > 0) loadSkills(); // Refresh if new skills found
       }).catch(() => {}); // Silent fail
     });
     ```

  6. Add "Sync Local Skills" button to the toolbar (next to existing buttons in `.toolbar` div):
     ```svelte
     <button onclick={handleSyncLocal} disabled={syncing}>
       {syncing ? 'Syncing…' : 'Sync Local Skills'}
     </button>
     {#if syncMessage}
       <span class="sync-message">{syncMessage}</span>
     {/if}
     ```

  **Must NOT do**:
  - Do NOT block the UI during auto-sync on mount (fire-and-forget)
  - Do NOT change the My Skills / Find Skills / Create Skill tab structure
  - Do NOT modify SkillCard, SkillSearch, or SkillCreator components

  **Acceptance Criteria**:
  - [ ] "Sync Local Skills" button visible in the toolbar
  - [ ] Auto-sync fires silently on mount
  - [ ] If new skills found: `loadSkills()` called, toast/message shown
  - [ ] Running sync twice does NOT duplicate skills in the list
  - [ ] LSP diagnostics clean on Skills.svelte

  **QA Scenarios**:
  ```
  Scenario: LSP clean
    Tool: lsp_diagnostics
    Steps: run on ogre-desktop/src/pages/Skills.svelte
    Expected: No errors
    Evidence: .sisyphus/evidence/task-3-skills-lsp.txt

  Scenario: Button present in template
    Tool: Grep
    Steps: grep -n "Sync Local Skills" src/pages/Skills.svelte
    Expected: 1+ matches
    Evidence: .sisyphus/evidence/task-3-button-present.txt

  Scenario: syncLocalSkills called in onMount
    Tool: Grep
    Steps: grep -n "syncLocalSkills" src/pages/Skills.svelte
    Expected: 2+ matches (import + onMount + handleSyncLocal)
    Evidence: .sisyphus/evidence/task-3-onmount-call.txt
  ```

  **Commit**: YES — after F1/F2
  - Message: `feat(skills): auto-sync skills from ~/.claude/skills/ into OGRE`
  - Files: `src-tauri/src/lib.rs`, `src/lib/skills-api.ts`, `src/pages/Skills.svelte`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `quick`
  1. Verify `scan_claude_skills` in lib.rs: struct defined, function defined, registered in invoke_handler
  2. Verify `syncLocalSkills` in skills-api.ts: exported, uses correct source/source_id, calls getSkillBySource
  3. Verify Skills.svelte: button present, auto-sync in onMount, syncing state
  4. Verify no schema changes (no new migrations in lib.rs)
  5. Verify no files outside 3 target files were modified
  Output: `Deliverables [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Compile + Regression Tests** — `quick`
  1. `cargo build` — exit 0
  2. `npx vitest run --config ogre-desktop/vitest.config.ts ogre-desktop/src/lib/skills-api.test.ts` — PASS
  3. LSP diagnostics clean on all 3 changed files
  Output: `Rust [PASS/FAIL] | Tests [PASS/FAIL] | LSP [PASS/FAIL] | VERDICT: APPROVE/REJECT`

---

## Success Criteria

- [x] `scan_claude_skills` Rust command compiles and registered
- [x] `syncLocalSkills()` exported from skills-api.ts
- [x] Skills page has "Sync Local Skills" button
- [x] After sync, gb-pipeline et al appear in My Skills
- [x] No duplicates on repeated sync
- [x] All existing tests pass
