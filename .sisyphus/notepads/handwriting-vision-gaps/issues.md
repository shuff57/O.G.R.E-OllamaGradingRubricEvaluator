# Issues — handwriting-vision-gaps

## 2026-03-10 Session: ses_3267b54c1ffec2Bdw405k3G4bs

### Pre-existing Bug (Out of Scope)
- FONTS list at line 516 references `Caveat-Regular.ttf` but downloaded file is `Caveat[wght].ttf`
- Do NOT fix this — flagged for separate plan
- Script runs despite this (Kalam-Regular.ttf alternates)

## 2026-03-10 Session: task-2 probability foundations

### Environment blocker
- Full `python3 test-data/gen-handwriting-images.py` run failed in this environment because Python lacks `pip` and `ensurepip`
- Captured required validation outputs using a standalone Python AST snippet instead of full script execution
