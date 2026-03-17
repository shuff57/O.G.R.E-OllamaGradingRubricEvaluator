# Discovery Accuracy Phase 1 — Session Learnings (2026-03-17)

## What Was Done
- Executed full 5-task plan via subagent delegation (4 subagents, all TDD)
- Task 1: DOM walker now captures input[type="hidden"] even with skipHidden=true; fb-* names get priority "high"
- Task 2: Heuristic detector finds contenteditable+role=textbox feedback (TinyMCE inline editors)
- Task 3: Hidden input correlation — feedbackHidden populated when contenteditable editor + hidden input with fb-* name found
- Task 4: questionRegion (div[role="region"]) and fullCreditLink (a.fullcredlink) now detected
- Task 5: heuristicToDiscoveryResult infers feedback type (tinymce-inline vs textarea), requiresHiddenSync, htmlWrap; includeExtractionConfig defaults to true
- Post-merge bugfix: feedbackBox regressed to null — three root causes fixed

## Key Discovery: Static Analysis Ceiling
- Phase 1 improved scoreInput (now matches built-in profile exactly via aria-label) and recovered feedbackBox from null
- But TinyMCE contenteditable div STILL not detected on live MOM pages
- Root cause confirmed: TinyMCE initializes AFTER DOM snapshot runs — the contenteditable div doesn't exist at snapshot time
- Static analysis cannot solve this — Phase 2 (GDK interaction) is required to click feedback area, trigger TinyMCE init, then re-scan

## Patterns Noticed
- **contentEditable is a JS property, not HTML attribute on TinyMCE**: `el.attributes` doesn't include it. Must check `el.contentEditable === "true"` as property fallback in walker.
- **TinyMCE hides original textarea**: Sets `display: none` → offsetWidth=0 → walker skips it. Must add textarea exception alongside hidden input exception in skipHidden filter.
- **Heuristic unit tests pass but live page fails**: The disconnect is DOM snapshot timing vs TinyMCE lifecycle. Unit tests use mock snapshots with the "correct" attributes; live pages don't have those attributes yet.
- **Subagent single-task directive works**: Tasks 2-4 refused when batched, succeeded when dispatched individually. Each took ~1-2 min with full TDD.
- **UPSERT bug was cross-platform**: The saveSiteProfile INSERT/UPDATE branch logic was broken on ALL platforms when profiles have pre-generated UUIDs, not just Linux.

## Corrections Received
- First feedbackBox fix attempt added JSON.stringify in the async IIFE wrapper (wrong — double JSON). Reverted to letting wry serialize natively.
- Contenteditable detection needed THREE fixes, not one: walker property check + hidden textarea exception + relaxed heuristic. Single-point fixes were insufficient.

## Profile Comparison Results (Phase 1 vs Built-in MOM)
| Field | Match? | Notes |
|-------|--------|-------|
| scoreInput | ✅ | Now uses aria-label="Score" — exact match |
| fullCreditLink | ✅ | a.fullcredlink — exact match |
| save.buttonText | ✅ | Quick Save — exact match |
| feedbackBox | 🟡 | Finds textarea (hidden by TinyMCE), not the contenteditable div |
| studentName | 🟡 | div.headerpane > b vs b — more specific but functional |
| studentSection | 🟡 | Different class than built-in |
| questionRegion | 🟡 | div.scrollpane vs div[role="region"] |
| feedbackHidden | ❌ | Still null — needs contenteditable detection to trigger correlation |
| feedback.type | ❌ | Still textarea — needs TinyMCE to initialize first |
| extraction | ❌ | Contains datetime timestamp, not config object — possible DB column issue |

## Open Issues
- Extraction field in DB contains datetime string instead of JSON config — possible column mismatch or serialization bug
- URL patterns always `["blank"]` — URL capture not working on Linux embedded browser
- Anthropic API 400 during AI-path discovery — undiagnosed, likely content length or auth issue
- Phase 2 (GDK event injection) needed for TinyMCE detection on live pages

## Skill Improvement Suggestions
- Discovery pipeline should have a "post-interaction re-scan" stage: snapshot → interact → snapshot again → diff
- DOM walker should have a "form element preservation" mode that never skips any form-related element regardless of visibility
- Profile comparison tool would be useful — automated field-by-field diff against a reference profile
