# Build Fix Applied - 2026-02-13

## Critical Configuration Fix
**Fixed**: `tauri.conf.json` externalBin was empty
- **Before**: `"externalBin": []`
- **After**: `"externalBin": ["binaries/grading-server"]`

## Impact
This configuration tells Tauri to bundle the sidecar binary into the installer. Without this, the grading server wouldn't be included in the distributed app.

## Naming Convention Reference
- Config: `"binaries/grading-server"` (base name, no extension)
- Disk file: `grading-server-x86_64-pc-windows-msvc.exe` (Tauri appends target triple + .exe)
- Tauri resolves automatically based on target platform

## Next Steps
1. Verify cargo check passes with new config
2. Trigger CI build via GitHub Actions
3. Download and verify installer artifact

## Verification Command
```bash
cd ogre-desktop/src-tauri && cargo check
```
