# Discovery Panel Checkbox Overflow Fix

**Date:** 2026-03-16
**Scope:** ogre-desktop UI — DiscoveryPanel sidebar

## What Was Done
- Fixed "Estimated Students" field being off-screen in the Discovery sidebar
- Checkboxes were wrapping onto 3 lines each, consuming excessive vertical space
- All four form items (3 checkboxes + 1 input) now fit on-screen without scrolling

## Root Cause
Global CSS in `app.css` applied `width: 100%` to ALL inputs:
```css
input, select, textarea { width: 100%; ... }
```
This made `<input type="checkbox">` elements expand to full container width, pushing their adjacent label text to wrap onto multiple lines.

## Fix Applied
1. **`ogre-desktop/src/app.css`** — Changed global selector to exclude checkboxes/radios:
   ```css
   input:not([type="checkbox"]):not([type="radio"]), select, textarea { width: 100%; ... }
   ```
2. **`ogre-desktop/src/components/grading/DiscoveryPanel.svelte`** — Compacted spacing and fixed checkbox alignment:
   - Reduced `.discovery-panel` gap from `spacing-3` to `spacing-2`
   - Reduced `.mode-content` padding from `spacing-3` to `spacing-2`, removed margin-bottom
   - Reduced `.form-mode-inputs` gap from `spacing-2` to `spacing-1`
   - Added `white-space: nowrap` on `.checkbox` labels
   - Added `.checkbox input[type="checkbox"] { width: auto; margin: 0; flex-shrink: 0; }`

## Patterns Noticed
- **Global CSS selectors for form inputs should always exclude checkbox/radio types.** The `width: 100%` rule is correct for text inputs, selects, and textareas but breaks checkbox/radio layout. This is a common CSS pitfall — any future global input styling should use `:not([type="checkbox"]):not([type="radio"])`.
- **Sidebar panels are vertically constrained.** When stacking ProviderSelector + DiscoveryPanel content, every pixel of padding/gap matters. Prefer `spacing-1` and `spacing-2` over `spacing-3` for sidebar panel internals.

## Dev Environment Notes
- **Tauri app can't preview in Chrome** without Tauri DB. The setup wizard checks `getSetting('setup_complete')` which requires Tauri invoke. Temporary bypass: `setupComplete = !(window as any).__TAURI_INTERNALS__` in App.svelte catch block. Remember to revert.
- **Missing npm packages** `@tauri-apps/plugin-opener` and `@tauri-apps/plugin-shell` caused Vite import resolution errors. These were installed to fix browser-mode rendering.
- **Wayland + Tauri** — xdotool can't find Tauri windows on Wayland (Cosmic/Pop!_OS). CDP port 9222 is configured for WebView2 (Windows) only, not webkit2gtk on Linux. Use `cosmic-screenshot` for desktop captures.

## Skill Improvement Suggestions
- Consider a `tauri-dev-preview` skill for reliably previewing Tauri apps in browser mode (setup wizard bypass, missing plugin stubs)
