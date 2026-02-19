# Tauri Z-Index Issue: GradingPanel Appearing Under Webview

## Problem Summary

The `GradingPanel` (floating drawer) is positioned with `position: fixed; z-index: 10000` but appears **UNDER** the embedded Tauri webview. This is a fundamental architectural issue with how Tauri manages child webviews.

---

## Root Cause Analysis

### Why Z-Index Doesn't Work

**Tauri webviews are native OS windows, not HTML elements.**

In Tauri v2, when you call `window.add_child()` in Rust (lib.rs:234), you're creating a **native Windows child window** that:
- Renders outside the HTML/CSS layer
- Has its own native window handle (HWND on Windows)
- Cannot be layered with HTML elements using CSS z-index
- Always appears "on top" of HTML content within the parent window's bounds

**Current Architecture (lib.rs:233-238):**
```rust
if let Some(window) = app_clone.get_window("main") {
    match window.add_child(
        builder,
        tauri::LogicalPosition::new(0.0, 60.0),
        tauri::LogicalSize::new(800.0, 600.0),
    ) {
```

The webview is a **child window** of the main Tauri window. HTML elements (like GradingPanel) cannot layer above it.

### Current Bounds Calculation (Browser.svelte:66-91)

```typescript
function updateWebviewBounds() {
  const sidebar = document.querySelector('.sidebar');
  const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 60;
  
  const navBar = document.querySelector('.nav-bar');
  const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 50;
  
  const presetsPanel = showPresets ? document.querySelector('.presets-panel') : null;
  const presetsPanelHeight = presetsPanel ? presetsPanel.getBoundingClientRect().height : 0;

  const x = sidebarWidth;
  const y = navBarHeight + presetsPanelHeight;
  const width = window.innerWidth - sidebarWidth;  // ← PROBLEM: Doesn't account for drawer
  const height = window.innerHeight - y;
  
  setWebviewBounds(x, y, width, height);
}
```

**The issue:** The webview width calculation ignores the GradingPanel drawer on the right, so the webview extends all the way to the right edge and overlaps the drawer.

---

## Solution Comparison

### Option A: Adjust Webview Bounds (RECOMMENDED ✅)

**Approach:** Reduce webview width to leave space for the drawer on the right.

**Pros:**
- ✅ Preserves floating drawer UX (no revert to sidebar)
- ✅ Minimal code changes
- ✅ Works with existing Tauri architecture
- ✅ Drawer can be toggled/resized without webview recreation
- ✅ Matches the old sidebar approach (which worked)

**Cons:**
- ⚠️ Webview doesn't fill full width when drawer is collapsed
- ⚠️ Requires syncing drawer width with webview bounds

**Implementation:**
```typescript
function updateWebviewBounds() {
  const sidebar = document.querySelector('.sidebar');
  const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 60;
  
  const navBar = document.querySelector('.nav-bar');
  const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 50;
  
  const presetsPanel = showPresets ? document.querySelector('.presets-panel') : null;
  const presetsPanelHeight = presetsPanel ? presetsPanel.getBoundingClientRect().height : 0;

  // Get grading panel width (60px when collapsed, ~400px when expanded)
  const gradingPanel = document.querySelector('.grading-panel');
  const gradingPanelWidth = gradingPanel ? gradingPanel.getBoundingClientRect().width : 0;

  const x = sidebarWidth;
  const y = navBarHeight + presetsPanelHeight;
  const width = window.innerWidth - sidebarWidth - gradingPanelWidth;  // ← FIXED
  const height = window.innerHeight - y;
  
  if (width > 0 && height > 0) {
    setWebviewBounds(x, y, width, height);
  }
}
```

---

### Option B: Inject Toggle Button Into Webview

**Approach:** Create a floating button INSIDE the webview content that toggles the drawer.

**Pros:**
- ✅ Button always visible and clickable
- ✅ No z-index issues (button is inside webview)

**Cons:**
- ❌ Requires injecting HTML into every page loaded
- ❌ Button position varies by page layout
- ❌ Drawer still can't overlay webview (still appears under)
- ❌ Complex to maintain across different websites
- ❌ Doesn't solve the core z-index problem

**Why it won't work:** The drawer itself still can't appear above the webview. You'd only solve the button visibility problem, not the drawer layering problem.

---

### Option C: Use Tauri's Window Layering API

**Approach:** Create the drawer as a separate Tauri window instead of HTML.

**Pros:**
- ✅ Native window can layer above webview
- ✅ True floating window behavior

**Cons:**
- ❌ Massive refactor (drawer is currently Svelte component)
- ❌ Loses all Svelte reactivity and state management
- ❌ Requires IPC communication between windows
- ❌ Drawer can't share state with main app easily
- ❌ Overkill for this use case

**Why not recommended:** The drawer is deeply integrated with the app's state management (provider selection, rubric state, etc.). Moving it to a separate window would require rewriting the entire grading panel architecture.

---

## Recommended Solution: Option A

### Implementation Steps

#### 1. Update `Browser.svelte` bounds calculation

```typescript
function updateWebviewBounds() {
  if (!browserCreated) return;
  
  const sidebar = document.querySelector('.sidebar');
  const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 60;
  
  const navBar = document.querySelector('.nav-bar');
  const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 50;
  
  const presetsPanel = showPresets ? document.querySelector('.presets-panel') : null;
  const presetsPanelHeight = presetsPanel ? presetsPanel.getBoundingClientRect().height : 0;

  // NEW: Account for grading panel width
  const gradingPanel = document.querySelector('.grading-panel');
  const gradingPanelWidth = gradingPanel ? gradingPanel.getBoundingClientRect().width : 0;

  const x = sidebarWidth;
  const y = navBarHeight + presetsPanelHeight;
  const width = window.innerWidth - sidebarWidth - gradingPanelWidth;  // ← FIXED
  const height = window.innerHeight - y;
  
  if (width > 0 && height > 0) {
    setWebviewBounds(x, y, width, height).catch((e) => {
      console.error('Failed to set webview bounds:', e);
    });
  }
}
```

#### 2. Update resize handler to trigger webview bounds update

The existing `handleSidebarChanged()` already handles sidebar animation. Add a similar handler for drawer resize:

```typescript
// In GradingPanel.svelte, emit event when width changes
function handleResizeMove(e: MouseEvent) {
  if (!isResizing) return;
  const newWidth = window.innerWidth - e.clientX;
  width = Math.max(360, Math.min(800, newWidth));
  
  // NEW: Notify Browser.svelte to update webview bounds
  window.dispatchEvent(new CustomEvent('ogre:drawer-resized', { detail: { width } }));
}
```

#### 3. Listen for drawer resize in Browser.svelte

```typescript
onMount(async () => {
  // ... existing code ...
  
  // Handle drawer resize
  window.addEventListener('ogre:drawer-resized', handleResize);
});

onDestroy(() => {
  // ... existing code ...
  window.removeEventListener('ogre:drawer-resized', handleResize);
});
```

#### 4. Update reactive statement to include drawer visibility

```typescript
// Recalculate webview bounds when drawer visibility or size changes
$: {
  showGradingPanel;  // NEW: Add drawer visibility
  if (browserCreated) {
    tick().then(() => updateWebviewBounds());
  }
}
```

---

## Why the Floating Toggle Button Appears in Chrome

The floating toggle button (if you have one) appears in Chrome instead of the Tauri webview because:

1. **Chrome is the default browser** for opening links/debugging
2. **The button is likely in the main Svelte app**, not injected into the webview
3. **It's not being rendered in the Tauri context** at all

**To fix:** Ensure the button is part of the Tauri app's HTML, not a separate Chrome window. The button should be in `Browser.svelte` or `GradingPanel.svelte`, which are rendered by Tauri's main webview.

---

## Testing Checklist

After implementing Option A:

- [ ] Webview doesn't overlap drawer when drawer is expanded
- [ ] Webview expands to fill space when drawer is collapsed
- [ ] Drawer can be resized without webview jumping
- [ ] Sidebar collapse/expand still works correctly
- [ ] Presets panel show/hide still works correctly
- [ ] No visual glitches during transitions
- [ ] Webview bounds update smoothly with RAF animation
- [ ] Grading panel content is fully visible and clickable

---

## Summary

| Aspect | Option A | Option B | Option C |
|--------|----------|----------|----------|
| **Solves z-index issue** | ✅ Yes | ❌ No | ✅ Yes |
| **Preserves drawer UX** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Code complexity** | 🟢 Low | 🟡 Medium | 🔴 High |
| **Refactor scope** | 🟢 Small | 🟡 Medium | 🔴 Large |
| **Recommended** | ✅ YES | ❌ No | ❌ No |

**Recommendation: Implement Option A** — it's the simplest, most maintainable solution that preserves the floating drawer UX while fixing the z-index issue.
