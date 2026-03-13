# Decisions — handwriting-vision-gaps

## 2026-03-10 Session: ses_3267b54c1ffec2Bdw405k3G4bs

### Execution Order
Tasks are STRICTLY sequential (single file). Order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → F1-F4

### Rubric Formats
- All new topics use `checklist` format EXCEPT one-prop-z and two-prop-z which use `steps` format
- This matches the plan specification

### Commit Strategy
- Commit 1: After Task 1
- Commit 2: After Tasks 2+3 combined
- Commit 3: After Tasks 4+5 combined
- Commit 4: After Task 6
- Commit 5: After Task 7

### Score Banding
Must vary within bands:
- Weak: 2-4
- Partial: 5-7
- Strong: 8-9
Do NOT lock to exactly 3/6/9 for every topic

## 2026-03-10 Session: task-2 probability foundations

### Validation decision
- Used conversion-equivalent standalone validation to prove required output lines:
  - `All 24 responses pass length validation.`
  - `24 responses x 3 quality levels = 72 images`
- Rationale: direct script run blocked by missing `pip` bootstrap in environment
