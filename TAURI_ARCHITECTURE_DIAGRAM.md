# Tauri Window Architecture Diagram

## Current Problem: Z-Index Doesn't Work

```
┌─────────────────────────────────────────────────────────────────┐
│                    Tauri Main Window (HTML)                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Sidebar (HTML)  │  Browser Content (HTML)  │ Drawer (HTML)  │
│  │                 │                          │ z-index:10000  │
│  │                 │  ┌────────────────────┐  │ (HIDDEN!)      │
│  │                 │  │ NATIVE WEBVIEW     │  │                │
│  │                 │  │ (Child Window)     │  │                │
│  │                 │  │ Overlays HTML      │  │                │
│  │                 │  │ (Can't be layered) │  │                │
│  │                 │  └────────────────────┘  │                │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

PROBLEM: Native webview (child window) renders ABOVE all HTML elements
         CSS z-index has NO EFFECT on native windows
```

---

## Solution A: Adjust Webview Bounds (RECOMMENDED)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Tauri Main Window (HTML)                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Sidebar │  Browser Content (HTML)  │ Drawer (HTML)      │  │
│  │         │                          │ z-index:10000      │  │
│  │         │  ┌────────────────────┐  │ ✅ NOW VISIBLE!    │  │
│  │         │  │ NATIVE WEBVIEW     │  │                    │  │
│  │         │  │ (Reduced Width)    │  │                    │  │
│  │         │  │ Doesn't overlap    │  │                    │  │
│  │         │  │ drawer anymore     │  │                    │  │
│  │         │  └────────────────────┘  │                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

SOLUTION: Reduce webview width to leave space for drawer
          Webview bounds = window.width - sidebar.width - drawer.width
```

### Bounds Calculation Flow

```
updateWebviewBounds()
  ├─ Get sidebar width (60px or 240px)
  ├─ Get nav bar height (50px)
  ├─ Get presets panel height (if visible)
  ├─ Get grading panel width (60px collapsed, ~400px expanded) ← NEW
  │
  └─ Calculate webview bounds:
      x = sidebar.width
      y = nav.height + presets.height
      width = window.width - sidebar.width - drawer.width ← FIXED
      height = window.height - y
      
      setWebviewBounds(x, y, width, height)
```

---

## Event Flow: Drawer Resize → Webview Update

```
GradingPanel.svelte (Drawer)
  │
  ├─ User drags resize handle
  │  └─ handleResizeMove() updates width state
  │     └─ Emits 'ogre:drawer-resized' event
  │
Browser.svelte (Main)
  │
  ├─ Listens for 'ogre:drawer-resized'
  │  └─ Calls handleResize() (debounced)
  │     └─ Calls updateWebviewBounds()
  │        └─ Calls setWebviewBounds(x, y, width, height)
  │
lib.rs (Rust Backend)
  │
  └─ set_webview_bounds() command
     └─ wv.set_position() + wv.set_size()
        └─ Native webview repositioned/resized
```

---

## Comparison: Before vs After

### BEFORE (Current - Broken)

```
Window Layout:
┌─────────────────────────────────────────────────────────┐
│ Sidebar │ Webview (full width - sidebar)  │ Drawer      │
│         │ ┌──────────────────────────────┐│ (hidden)    │
│         │ │ NATIVE WEBVIEW               ││             │
│         │ │ Extends to right edge        ││             │
│         │ │ Overlaps drawer              ││             │
│         │ └──────────────────────────────┘│             │
└─────────────────────────────────────────────────────────┘

Webview bounds:
  x = 60
  y = 50
  width = 1920 - 60 = 1860  ← WRONG: Doesn't account for drawer
  height = 1080 - 50 = 1030
```

### AFTER (Fixed)

```
Window Layout:
┌─────────────────────────────────────────────────────────┐
│ Sidebar │ Webview (reduced width) │ Drawer (visible)    │
│         │ ┌──────────────────────┐│ ┌────────────────┐  │
│         │ │ NATIVE WEBVIEW       ││ │ Grading Panel  │  │
│         │ │ Doesn't overlap      ││ │ ✅ Clickable   │  │
│         │ │ drawer anymore       ││ │ ✅ Visible     │  │
│         │ └──────────────────────┘│ └────────────────┘  │
└─────────────────────────────────────────────────────────┘

Webview bounds:
  x = 60
  y = 50
  width = 1920 - 60 - 400 = 1460  ← CORRECT: Accounts for drawer
  height = 1080 - 50 = 1030
```

---

## Why Other Solutions Don't Work

### Option B: Inject Button Into Webview

```
Problem: Drawer still can't layer above webview

┌─────────────────────────────────────────────────────────┐
│ Sidebar │ Webview (full width)  │ Drawer (still hidden) │
│         │ ┌──────────────────────────────────────────┐  │
│         │ │ NATIVE WEBVIEW                           │  │
│         │ │ ┌──────────────────────────────────────┐ │  │
│         │ │ │ Injected Button (visible)            │ │  │
│         │ │ │ ✅ Can click button                  │ │  │
│         │ │ │ ❌ But drawer still under webview    │ │  │
│         │ │ └──────────────────────────────────────┘ │  │
│         │ └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Result: Button is visible, but drawer is still hidden behind webview
```

### Option C: Separate Tauri Window for Drawer

```
Massive refactor required:

┌─────────────────────────────────────────────────────────┐
│                    Tauri Main Window                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Sidebar │ Webview │ (empty space for drawer)    │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                              ↓
                    ┌──────────────────┐
                    │ Separate Tauri   │
                    │ Window (Drawer)  │
                    │ ✅ Can layer     │
                    │ ❌ Loses state   │
                    │ ❌ IPC overhead  │
                    └──────────────────┘

Problems:
  - Drawer loses access to app state (provider, rubric, etc.)
  - Requires IPC communication for every state change
  - Drawer can't use Svelte reactivity
  - Massive refactor of grading panel architecture
```

---

## Implementation Checklist

### Phase 1: Update Bounds Calculation
- [ ] Modify `updateWebviewBounds()` in Browser.svelte
- [ ] Add grading panel width to calculation
- [ ] Test with drawer collapsed and expanded

### Phase 2: Add Drawer Resize Event
- [ ] Add `ogre:drawer-resized` event emission in GradingPanel.svelte
- [ ] Listen for event in Browser.svelte
- [ ] Verify bounds update on resize

### Phase 3: Sync Drawer Visibility
- [ ] Update reactive statement to include `showGradingPanel`
- [ ] Test drawer toggle updates webview bounds

### Phase 4: Testing
- [ ] Webview doesn't overlap drawer
- [ ] Drawer is fully clickable
- [ ] Smooth transitions during resize
- [ ] No visual glitches
- [ ] Works with sidebar collapse/expand
- [ ] Works with presets panel show/hide

---

## Key Insight

**The fundamental issue:** Tauri's child webviews are native OS windows that always render above HTML content. You can't use CSS z-index to layer HTML above them.

**The solution:** Don't try to layer HTML above the webview. Instead, adjust the webview's bounds to leave space for the HTML drawer.

This is the same approach used for the sidebar — the webview is positioned to the right of the sidebar, not overlapped by it.
