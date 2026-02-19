# GradingPanel Z-Index Issue: Executive Summary

## Problem

The GradingPanel floating drawer appears **UNDER** the embedded Tauri webview despite having `z-index: 10000`.

## Root Cause

**Tauri webviews are native OS windows, not HTML elements.**

When you create a child webview with `window.add_child()` in Rust, it becomes a native Windows child window (HWND). Native windows always render above HTML content — CSS z-index has **zero effect** on them.

```
HTML Layer (z-index works here)
    ↓
Native Webview Layer (always on top, z-index ignored)
```

## Solution: Adjust Webview Bounds (Recommended ✅)

Instead of trying to layer HTML above the webview, reduce the webview's width to leave space for the drawer.

**Current (Broken):**
```
Webview width = window.width - sidebar.width
                = 1920 - 60 = 1860px
                ↓ Overlaps drawer
```

**Fixed:**
```
Webview width = window.width - sidebar.width - drawer.width
                = 1920 - 60 - 400 = 1460px
                ↓ Leaves space for drawer
```

## Why This Works

This is the **same approach used for the sidebar**. The webview is positioned to the right of the sidebar, not overlapped by it. We apply the same logic to the drawer.

## Implementation

**Files to modify:**
1. `ogre-desktop/src/pages/Browser.svelte` — Update bounds calculation
2. `ogre-desktop/src/pages/GradingPanel.svelte` — Emit resize events

**Lines of code:** ~20 changes

**Complexity:** Low

**Risk:** Very low (only affects webview positioning)

## What Changes

### Browser.svelte

```typescript
// OLD: Doesn't account for drawer
const width = window.innerWidth - sidebarWidth;

// NEW: Accounts for drawer
const gradingPanel = document.querySelector('.grading-panel');
const gradingPanelWidth = gradingPanel ? gradingPanel.getBoundingClientRect().width : 0;
const width = window.innerWidth - sidebarWidth - gradingPanelWidth;
```

### GradingPanel.svelte

```typescript
// Emit events when drawer is resized or toggled
window.dispatchEvent(new CustomEvent('ogre:drawer-resized', { detail: { width } }));
window.dispatchEvent(new CustomEvent('ogre:drawer-toggled', { detail: { isCollapsed } }));
```

### Browser.svelte (Event Listeners)

```typescript
// Listen for drawer events and update webview bounds
window.addEventListener('ogre:drawer-resized', handleResize);
window.addEventListener('ogre:drawer-toggled', handleResize);
```

## Why Other Solutions Don't Work

| Solution | Why It Fails |
|----------|-------------|
| **Increase z-index** | Native windows ignore CSS z-index |
| **Inject button into webview** | Drawer still hidden behind webview |
| **Separate Tauri window for drawer** | Loses state management, requires IPC, massive refactor |

## Expected Outcome

✅ Drawer visible and clickable
✅ Webview doesn't overlap drawer
✅ Smooth resize animations
✅ Works with sidebar collapse/expand
✅ Works with presets panel show/hide

## Testing

```bash
npm run tauri:dev
```

1. Navigate to a website
2. Click grading panel toggle
3. Verify drawer appears on right (not hidden)
4. Verify drawer is clickable
5. Resize drawer by dragging left edge
6. Verify webview shrinks/expands smoothly

## Documentation

Three detailed documents have been created:

1. **TAURI_ZINDEX_ANALYSIS.md** — Deep technical analysis
   - Root cause explanation
   - Solution comparison (A, B, C)
   - Why z-index doesn't work
   - Recommended approach

2. **TAURI_ARCHITECTURE_DIAGRAM.md** — Visual diagrams
   - Before/after layouts
   - Event flow diagrams
   - Why other solutions fail
   - Implementation checklist

3. **IMPLEMENTATION_GUIDE.md** — Step-by-step code changes
   - Exact line-by-line changes
   - Testing procedures
   - Debugging tips
   - Performance considerations

## Next Steps

1. Read **TAURI_ZINDEX_ANALYSIS.md** for full context
2. Review **IMPLEMENTATION_GUIDE.md** for exact code changes
3. Implement changes in Browser.svelte and GradingPanel.svelte
4. Test using the checklist in IMPLEMENTATION_GUIDE.md
5. Commit with message: "fix: adjust webview bounds to account for drawer width"

## Questions?

- **Why can't we just use a higher z-index?** Native windows always render above HTML, regardless of z-index.
- **Why not move the drawer to a separate window?** That would require rewriting the entire grading panel architecture and losing state management.
- **Will this affect performance?** No, bounds updates are debounced (100ms) and use RAF animation (300ms).
- **Can we revert if something breaks?** Yes, just `git checkout` the files.

---

**Status:** Ready to implement ✅

**Estimated time:** 30 minutes (implementation + testing)

**Risk level:** Very low
