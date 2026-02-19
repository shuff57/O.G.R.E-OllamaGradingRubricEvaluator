# Quick Reference: Drawer Z-Index Fix

## The Problem in One Sentence

Tauri's native webview always renders above HTML elements, so CSS z-index can't make the drawer appear on top.

## The Solution in One Sentence

Reduce the webview width to leave space for the drawer instead of trying to layer HTML above it.

---

## Code Changes at a Glance

### Browser.svelte: Line 83

```diff
- const width = window.innerWidth - sidebarWidth;
+ const gradingPanel = document.querySelector('.grading-panel');
+ const gradingPanelWidth = gradingPanel ? gradingPanel.getBoundingClientRect().width : 0;
+ const width = window.innerWidth - sidebarWidth - gradingPanelWidth;
```

### Browser.svelte: Line 95

```diff
  $: {
    showPresets;
+   showGradingPanel;
    if (browserCreated) {
```

### Browser.svelte: Line 184

```diff
  window.addEventListener('ogre:sidebar-changed', handleSidebarChanged);
+ window.addEventListener('ogre:drawer-resized', handleResize);
+ window.addEventListener('ogre:drawer-toggled', handleResize);
```

### Browser.svelte: Line 193

```diff
  window.removeEventListener('ogre:sidebar-changed', handleSidebarChanged);
+ window.removeEventListener('ogre:drawer-resized', handleResize);
+ window.removeEventListener('ogre:drawer-toggled', handleResize);
```

### GradingPanel.svelte: Line 55

```diff
  function toggleCollapse() {
    isCollapsed = !isCollapsed;
+   window.dispatchEvent(new CustomEvent('ogre:drawer-toggled', { detail: { isCollapsed } }));
  }
```

### GradingPanel.svelte: Line 150

```diff
  function handleResizeMove(e: MouseEvent) {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    width = Math.max(360, Math.min(800, newWidth));
+   window.dispatchEvent(new CustomEvent('ogre:drawer-resized', { detail: { width } }));
  }
```

---

## Why This Works

| Component | Role |
|-----------|------|
| **GradingPanel** | Emits events when resized/toggled |
| **Browser** | Listens for events and updates webview bounds |
| **Tauri (Rust)** | Repositions/resizes native webview |

**Flow:** Drawer changes → Event → Browser updates bounds → Webview shrinks/expands

---

## Before vs After

### Before (Broken)
```
┌─────────────────────────────────────────┐
│ Sidebar │ Webview (full width)  │ Drawer│
│         │ ┌──────────────────────────┐  │
│         │ │ NATIVE WEBVIEW           │  │
│         │ │ Overlaps drawer ❌       │  │
│         │ └──────────────────────────┘  │
└─────────────────────────────────────────┘
```

### After (Fixed)
```
┌─────────────────────────────────────────┐
│ Sidebar │ Webview (reduced) │ Drawer    │
│         │ ┌────────────────┐│ ✅ Visible│
│         │ │ NATIVE WEBVIEW ││           │
│         │ │ Doesn't overlap││           │
│         │ └────────────────┘│           │
└─────────────────────────────────────────┘
```

---

## Testing Checklist

- [ ] Drawer appears on right side
- [ ] Drawer is not hidden behind webview
- [ ] Drawer content is clickable
- [ ] Collapse button works
- [ ] Resize handle works
- [ ] Webview shrinks when drawer expands
- [ ] Webview expands when drawer collapses
- [ ] No visual glitches or jumping
- [ ] Works with sidebar collapse/expand
- [ ] Works with presets panel show/hide

---

## Debugging

**Drawer still hidden?**
```javascript
// Check if grading panel exists
document.querySelector('.grading-panel')

// Check its width
document.querySelector('.grading-panel').getBoundingClientRect().width

// Check webview bounds in console
// Should see: width = 1920 - 60 - 400 = 1460
```

**Webview not resizing?**
- Check browser console for errors
- Verify event listeners are attached
- Check that `handleResize()` is being called
- Verify `setWebviewBounds()` is being invoked

---

## Key Insight

**Don't fight the architecture. Work with it.**

Tauri's native webviews can't be layered with HTML. Instead of trying to layer HTML above the webview, adjust the webview's bounds to leave space for the HTML drawer.

This is the same approach used for the sidebar — and it works perfectly.

---

## Files to Modify

1. `ogre-desktop/src/pages/Browser.svelte` (4 changes)
2. `ogre-desktop/src/pages/GradingPanel.svelte` (2 changes)

**Total:** ~20 lines of code

**Time:** 30 minutes (implementation + testing)

**Risk:** Very low

---

## Rollback

If anything breaks:
```bash
git checkout ogre-desktop/src/pages/Browser.svelte
git checkout ogre-desktop/src/pages/GradingPanel.svelte
```

---

## Full Documentation

- **TAURI_ZINDEX_ANALYSIS.md** — Why z-index doesn't work
- **TAURI_ARCHITECTURE_DIAGRAM.md** — Visual diagrams
- **IMPLEMENTATION_GUIDE.md** — Detailed step-by-step guide
- **DRAWER_ZINDEX_SUMMARY.md** — Executive summary
- **QUICK_REFERENCE.md** — This file

Start with **DRAWER_ZINDEX_SUMMARY.md** for overview, then **IMPLEMENTATION_GUIDE.md** for details.
