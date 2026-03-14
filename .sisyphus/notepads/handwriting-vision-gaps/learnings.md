# Learnings — handwriting-vision-gaps

## 2026-03-10 Session: ses_3267b54c1ffec2Bdw405k3G4bs

### Script Structure
- `test-data/gen-handwriting-images.py` is the ONLY file to modify
- CELL 4 (line ~299) contains: RESPONSES list, rubric dicts, then CELL 5
- Rubric dicts come BEFORE RESPONSES list in the file
- CELL 4 ends at line 521 (before CELL 5)
- Validation block should be added AFTER line 513 (after `]` closing RESPONSES) and BEFORE CELL 5 marker

### Key Patterns
- Rubric dict keys: `question` (str) + either `checklist` (list of str) OR `steps` (str)
- RESPONSES entry keys: `id` (str), `rubric` (R_* variable), `score` (int), `text` (str with Unicode math)
- ID naming: `{topic_slug}_{quality_band}` e.g. `t_test_weak`, `binomial_strong`
- Unicode math chars in `text` field get converted by `to_render_text()` before rendering
- Font filename bug: FONTS list references `Caveat-Regular.ttf` but downloaded file is `Caveat[wght].ttf` — do NOT fix this

### Constraints
- Max 45 chars per rendered line (after to_render_text conversion)
- Max 8 lines per response
- Max 300 chars total per response
- Score bands: weak 2-4, partial 5-7, strong 8-9 (VARY within bands, don't lock to 3/6/9)

### Validation Block to Add
```python
# Validate response text constraints
for resp in RESPONSES:
    lines = to_render_text(resp["text"]).split("\n")
    for i, line in enumerate(lines):
        assert len(line) <= 50, f"{resp['id']} line {i+1} is {len(line)} chars: '{line[:60]}'"
    assert len(lines) <= 10, f"{resp['id']} has {len(lines)} lines (max 10)"
print(f"All {len(RESPONSES)} responses pass length validation.")
```

### Script Execution
- Must run from `test-data/` directory: `cd test-data && python gen-handwriting-images.py`
- Downloads fonts if not present, generates images, saves JSONL+JSON+zip

## 2026-03-10 Session: task-2 probability foundations

### Response authoring pattern
- Added 4 new rubric dicts directly after `R_BINOMIAL` and before `RESPONSES`
- Added 12 responses at end of `RESPONSES` (3 per new topic)
- Maintained score variation bands across new topics: weak (2-3), partial (5-6), strong (8-9)

### Length-safety pattern
- Kept all lines <= 50 chars after `to_render_text()` substitutions
- Split long equations across lines for conditional probability and random-variable entries
- Verified all 24 responses via AST-based extraction and conversion-equivalent length check

## 2026-03-10T14:41:50-07:00 Task 7: Final Verification
- The exact partial-validation command is blocked here by missing `pip`/Pillow, but the same pre-`QUALITIES` code path can be validated by injecting temporary `sitecustomize` stubs for `subprocess.run`, `numpy`, and `PIL`.
- AST extraction of `_SUBS`, `_MULTI_SUBS`, `to_render_text`, rubric constants, `RESPONSES`, and the validation loop is sufficient to verify all 66 IDs, duplicate-free coverage, all 22 topic slugs, and score spread without invoking the rendering pipeline.
- Existing `test-data/finetune-grading-vision.jsonl` still contains 24 lines from an older run; verification should record that as stale rather than treat it as the finalized 198-entry artifact.
