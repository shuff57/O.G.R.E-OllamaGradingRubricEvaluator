# Implementation Guide: Fix Drawer Z-Index Issue

## Overview

This guide provides the exact code changes needed to fix the GradingPanel drawer appearing under the webview.

**Root Cause:** Tauri's child webview is a native OS window that always renders above HTML elements. CSS z-index has no effect.

**Solution:** Reduce the webview width to leave space for the drawer, just like the sidebar.

---

## File Changes

### 1. `ogre-desktop/src/pages/Browser.svelte`

#### Change 1: Update `updateWebviewBounds()` function

**Location:** Lines 66-91

**Current Code:**
```typescript
function updateWebviewBounds() {
  if (!browserCreated) return;
  
  // Get actual sidebar width from DOM (handles both collapsed and expanded states)
  const sidebar = document.querySelector('.sidebar');
  const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 60;
  
  // Get the nav-bar height from the DOM element
  const navBar = document.querySelector('.nav-bar');
  const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 50;
  
  // Calculate presets panel height if visible
  const presetsPanel = showPresets ? document.querySelector('.presets-panel') : null;
  const presetsPanelHeight = presetsPanel ? presetsPanel.getBoundingClientRect().height : 0;

  const x = sidebarWidth;
  const y = navBarHeight + presetsPanelHeight;
  const width = window.innerWidth - sidebarWidth; // Full width - grading panel is now overlay
  const height = window.innerHeight - y;
  
  if (width > 0 && height > 0) {
    setWebviewBounds(x, y, width, height).catch((e) => {
      console.error('Failed to set webview bounds:', e);
    });
  }
}
```

**New Code:**
```typescript
function updateWebviewBounds() {
  if (!browserCreated) return;
  
  // Get actual sidebar width from DOM (handles both collapsed and expanded states)
  const sidebar = document.querySelector('.sidebar');
  const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 60;
  
  // Get the nav-bar height from the DOM element
  const navBar = document.querySelector('.nav-bar');
  const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 50;
  
  // Calculate presets panel height if visible
  const presetsPanel = showPresets ? document.querySelector('.presets-panel') : null;
  const presetsPanelHeight = presetsPanel ? presetsPanel.getBoundingClientRect().height : 0;

  // NEW: Get grading panel width (60px when collapsed, ~400px when expanded)
  const gradingPanel = document.querySelector('.grading-panel');
  const gradingPanelWidth = gradingPanel ? gradingPanel.getBoundingClientRect().width : 0;

  const x = sidebarWidth;
  const y = navBarHeight + presetsPanelHeight;
  const width = window.innerWidth - sidebarWidth - gradingPanelWidth; // FIXED: Account for drawer
  const height = window.innerHeight - y;
  
  if (width > 0 && height > 0) {
    setWebviewBounds(x, y, width, height).catch((e) => {
      console.error('Failed to set webview bounds:', e);
    });
  }
}
```

**What Changed:**
- Added lines to get grading panel width from DOM
- Updated width calculation to subtract `gradingPanelWidth`
- Comment updated to reflect the fix

---

#### Change 2: Update reactive statement to include drawer visibility

**Location:** Lines 93-99

**Current Code:**
```typescript
// Recalculate webview bounds when presets panel visibility changes
$: {
  showPresets;
  if (browserCreated) {
    tick().then(() => updateWebviewBounds());
  }
}
```

**New Code:**
```typescript
// Recalculate webview bounds when presets panel or drawer visibility changes
$: {
  showPresets;
  showGradingPanel;  // NEW: Trigger update when drawer is toggled
  if (browserCreated) {
    tick().then(() => updateWebviewBounds());
  }
}
```

**What Changed:**
- Added `showGradingPanel` to reactive statement
- Now updates webview bounds when drawer is toggled

---

### 2. `ogre-desktop/src/pages/GradingPanel.svelte`

#### Change 1: Emit event when drawer is resized

**Location:** Lines 147-151 (in `handleResizeMove` function)

**Current Code:**
```typescript
function handleResizeMove(e: MouseEvent) {
  if (!isResizing) return;
  const newWidth = window.innerWidth - e.clientX;
  width = Math.max(360, Math.min(800, newWidth));
}
```

**New Code:**
```typescript
function handleResizeMove(e: MouseEvent) {
  if (!isResizing) return;
  const newWidth = window.innerWidth - e.clientX;
  width = Math.max(360, Math.min(800, newWidth));
  
  // NEW: Notify Browser.svelte to update webview bounds
  window.dispatchEvent(new CustomEvent('ogre:drawer-resized', { detail: { width } }));
}
```

**What Changed:**
- Added event dispatch when drawer width changes
- Allows Browser.svelte to update webview bounds during resize

---

#### Change 2: Emit event when drawer is collapsed/expanded

**Location:** Lines 54-56 (in `toggleCollapse` function)

**Current Code:**
```typescript
function toggleCollapse() {
  isCollapsed = !isCollapsed;
}
```

**New Code:**
```typescript
function toggleCollapse() {
  isCollapsed = !isCollapsed;
  
  // NEW: Notify Browser.svelte to update webview bounds
  window.dispatchEvent(new CustomEvent('ogre:drawer-toggled', { detail: { isCollapsed } }));
}
```

**What Changed:**
- Added event dispatch when drawer is collapsed/expanded
- Allows Browser.svelte to update webview bounds immediately

---

### 3. `ogre-desktop/src/pages/Browser.svelte` (continued)

#### Change 3: Listen for drawer events

**Location:** Lines 129-185 (in `onMount` function)

**Current Code:**
```typescript
onMount(async () => {
  // Load saved URLs
  const saved = await getSetting('browser_saved_urls');
  if (saved) {
    try { savedUrls = JSON.parse(saved); } catch { savedUrls = []; }
  }

  // Set up listeners
  unlistenUrl = await listenBrowserUrlChanged((url) => {
    urlInput = url;
  });

  unlistenLoaded = await listenBrowserPageLoaded(async (url: string) => {
    isLoading = false;
    urlInput = url;
    await tryAutofill(url);
  });

  // Listen for webview creation success/failure
  unlistenStatus = await listenBrowserStatus(async (status: string) => {
    if (status === 'embedded-open') {
      browserCreated = true;
      showPresets = false;
      isLoading = false;
      
      await tick();
      updateWebviewBounds();
      await showWebview().catch(() => {});
    } else if (status === 'error') {
      browserCreated = false;
      isLoading = false;
      showToast('Failed to create browser. Please try again.');
    }
  });

  // Check if webview already exists
  try {
    const currentUrl = await getEmbeddedUrl();
    if (currentUrl) {
      browserCreated = true;
      urlInput = currentUrl;
      showPresets = false;
      await tick();
      updateWebviewBounds();
    }
  } catch {
    // Webview doesn't exist yet — that's fine
  }

  // Handle window resize with debounce
  window.addEventListener('resize', handleResize);

  // Handle sidebar changes with RAF animation
  window.addEventListener('ogre:sidebar-changed', handleSidebarChanged);
});
```

**New Code:**
```typescript
onMount(async () => {
  // Load saved URLs
  const saved = await getSetting('browser_saved_urls');
  if (saved) {
    try { savedUrls = JSON.parse(saved); } catch { savedUrls = []; }
  }

  // Set up listeners
  unlistenUrl = await listenBrowserUrlChanged((url) => {
    urlInput = url;
  });

  unlistenLoaded = await listenBrowserPageLoaded(async (url: string) => {
    isLoading = false;
    urlInput = url;
    await tryAutofill(url);
  });

  // Listen for webview creation success/failure
  unlistenStatus = await listenBrowserStatus(async (status: string) => {
    if (status === 'embedded-open') {
      browserCreated = true;
      showPresets = false;
      isLoading = false;
      
      await tick();
      updateWebviewBounds();
      await showWebview().catch(() => {});
    } else if (status === 'error') {
      browserCreated = false;
      isLoading = false;
      showToast('Failed to create browser. Please try again.');
    }
  });

  // Check if webview already exists
  try {
    const currentUrl = await getEmbeddedUrl();
    if (currentUrl) {
      browserCreated = true;
      urlInput = currentUrl;
      showPresets = false;
      await tick();
      updateWebviewBounds();
    }
  } catch {
    // Webview doesn't exist yet — that's fine
  }

  // Handle window resize with debounce
  window.addEventListener('resize', handleResize);

  // Handle sidebar changes with RAF animation
  window.addEventListener('ogre:sidebar-changed', handleSidebarChanged);

  // NEW: Handle drawer resize events
  window.addEventListener('ogre:drawer-resized', handleResize);
  window.addEventListener('ogre:drawer-toggled', handleResize);
});
```

**What Changed:**
- Added listeners for `ogre:drawer-resized` and `ogre:drawer-toggled` events
- Both trigger `handleResize()` which debounces and calls `updateWebviewBounds()`

---

#### Change 4: Clean up drawer event listeners

**Location:** Lines 187-195 (in `onDestroy` function)

**Current Code:**
```typescript
onDestroy(() => {
  if (unlistenUrl) unlistenUrl();
  if (unlistenLoaded) unlistenLoaded();
  if (unlistenStatus) unlistenStatus();
  if (resizeTimeout) clearTimeout(resizeTimeout);
  if (sidebarAnimationId) cancelAnimationFrame(sidebarAnimationId);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('ogre:sidebar-changed', handleSidebarChanged);
});
```

**New Code:**
```typescript
onDestroy(() => {
  if (unlistenUrl) unlistenUrl();
  if (unlistenLoaded) unlistenLoaded();
  if (unlistenStatus) unlistenStatus();
  if (resizeTimeout) clearTimeout(resizeTimeout);
  if (sidebarAnimationId) cancelAnimationFrame(sidebarAnimationId);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('ogre:sidebar-changed', handleSidebarChanged);
  // NEW: Clean up drawer event listeners
  window.removeEventListener('ogre:drawer-resized', handleResize);
  window.removeEventListener('ogre:drawer-toggled', handleResize);
});
```

**What Changed:**
- Added cleanup for drawer event listeners
- Prevents memory leaks when component is destroyed

---

## Testing Steps

### 1. Basic Functionality
```bash
npm run tauri:dev
```

### 2. Test Drawer Visibility
- [ ] Open the app
- [ ] Navigate to a website
- [ ] Click the grading panel toggle button
- [ ] Verify drawer appears on the right
- [ ] Verify drawer is NOT hidden behind webview
- [ ] Verify drawer content is clickable

### 3. Test Drawer Collapse/Expand
- [ ] Click the collapse button (arrow icon)
- [ ] Verify drawer collapses to 60px width
- [ ] Verify webview expands to fill the space
- [ ] Click expand button
- [ ] Verify drawer expands back to ~400px
- [ ] Verify webview shrinks accordingly

### 4. Test Drawer Resize
- [ ] Hover over the left edge of the drawer
- [ ] Drag to resize the drawer
- [ ] Verify webview width updates smoothly
- [ ] Verify no visual glitches or jumping

### 5. Test with Sidebar
- [ ] Collapse the sidebar
- [ ] Verify webview bounds update correctly
- [ ] Expand the sidebar
- [ ] Verify webview bounds update correctly

### 6. Test with Presets Panel
- [ ] Toggle presets panel visibility
- [ ] Verify webview bounds update correctly
- [ ] Verify drawer still visible and clickable

### 7. Stress Test
- [ ] Rapidly toggle drawer on/off
- [ ] Rapidly resize drawer
- [ ] Rapidly toggle sidebar
- [ ] Verify no crashes or memory leaks

---

## Debugging Tips

### If drawer is still hidden:

1. **Check if grading panel element exists:**
   ```javascript
   // In browser console
   document.querySelector('.grading-panel')
   ```

2. **Check grading panel width:**
   ```javascript
   const panel = document.querySelector('.grading-panel');
   panel.getBoundingClientRect().width
   ```

3. **Check webview bounds:**
   ```javascript
   // In Rust console (check logs)
   // Should see: "set_webview_bounds: x=60, y=50, width=1460, height=1030"
   ```

4. **Verify reactive statement is working:**
   ```javascript
   // Add console.log in updateWebviewBounds()
   console.log('Updating bounds:', { x, y, width, height });
   ```

### If webview doesn't resize smoothly:

1. **Check debounce timeout:**
   - Current: 100ms (line 104)
   - Try increasing to 200ms if too jittery

2. **Check RAF animation:**
   - Current: 300ms duration (line 113)
   - Should match CSS transition duration

3. **Check event frequency:**
   - `handleResizeMove` fires on every mousemove
   - Debounce ensures bounds only update every 100ms

---

## Performance Considerations

### Current Approach (Recommended)
- **Debounced bounds updates:** 100ms
- **RAF animation:** 300ms (matches CSS)
- **Event listeners:** 3 total (resize, sidebar-changed, drawer-resized, drawer-toggled)
- **DOM queries:** 4 per update (sidebar, nav, presets, drawer)

### Optimization Options (if needed)

**Option 1: Cache DOM elements**
```typescript
let sidebarEl: HTMLElement | null = null;
let navBarEl: HTMLElement | null = null;
let presetsPanelEl: HTMLElement | null = null;
let gradingPanelEl: HTMLElement | null = null;

onMount(() => {
  sidebarEl = document.querySelector('.sidebar');
  navBarEl = document.querySelector('.nav-bar');
  gradingPanelEl = document.querySelector('.grading-panel');
  // ... rest of setup
});

function updateWebviewBounds() {
  const sidebarWidth = sidebarEl?.getBoundingClientRect().width ?? 60;
  const navBarHeight = navBarEl?.getBoundingClientRect().height ?? 50;
  const presetsPanelHeight = showPresets ? presetsPanelEl?.getBoundingClientRect().height ?? 0 : 0;
  const gradingPanelWidth = gradingPanelEl?.getBoundingClientRect().width ?? 0;
  // ... rest of calculation
}
```

**Option 2: Use ResizeObserver instead of events**
```typescript
const resizeObserver = new ResizeObserver(() => {
  handleResize();
});

onMount(() => {
  const drawer = document.querySelector('.grading-panel');
  if (drawer) resizeObserver.observe(drawer);
});

onDestroy(() => {
  resizeObserver.disconnect();
});
```

---

## Summary of Changes

| File | Changes | Lines |
|------|---------|-------|
| Browser.svelte | Update bounds calculation, add reactive statement, add event listeners | 66-91, 93-99, 129-185, 187-195 |
| GradingPanel.svelte | Emit events on resize and toggle | 54-56, 147-151 |

**Total lines changed:** ~20 lines of code

**Complexity:** Low

**Risk:** Very low (only affects webview positioning, no state changes)

---

## Rollback Plan

If something goes wrong, simply revert the changes:

```bash
git checkout ogre-desktop/src/pages/Browser.svelte
git checkout ogre-desktop/src/pages/GradingPanel.svelte
```

The old behavior (drawer hidden) will return immediately.
