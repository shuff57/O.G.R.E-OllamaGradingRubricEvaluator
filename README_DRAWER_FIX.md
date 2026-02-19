# GradingPanel Drawer Z-Index Fix - Complete Documentation

## 📋 Documentation Index

This folder contains comprehensive analysis and implementation guides for fixing the GradingPanel drawer appearing under the Tauri webview.

### Start Here

1. **[DRAWER_ZINDEX_SUMMARY.md](DRAWER_ZINDEX_SUMMARY.md)** ⭐ **START HERE**
   - Executive summary of the problem and solution
   - 5-minute read
   - Best for: Quick understanding of the issue

2. **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** 
   - Code changes at a glance
   - Before/after diagrams
   - Testing checklist
   - Best for: Implementation reference

### Deep Dives

3. **[TAURI_ZINDEX_ANALYSIS.md](TAURI_ZINDEX_ANALYSIS.md)**
   - Root cause analysis
   - Why z-index doesn't work
   - Solution comparison (A, B, C)
   - Detailed implementation approach
   - Best for: Understanding the architecture

4. **[TAURI_ARCHITECTURE_DIAGRAM.md](TAURI_ARCHITECTURE_DIAGRAM.md)**
   - Visual diagrams of the problem
   - Event flow diagrams
   - Before/after layouts
   - Why other solutions fail
   - Best for: Visual learners

5. **[IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)**
   - Exact line-by-line code changes
   - Step-by-step testing procedures
   - Debugging tips
   - Performance considerations
   - Rollback plan
   - Best for: Actually implementing the fix

---

## 🎯 Quick Summary

### Problem
The GradingPanel drawer appears **UNDER** the webview despite `z-index: 10000`.

### Root Cause
Tauri webviews are native OS windows that always render above HTML elements. CSS z-index has no effect.

### Solution
Reduce the webview width to leave space for the drawer (same approach as the sidebar).

### Implementation
- Modify `Browser.svelte` (4 changes)
- Modify `GradingPanel.svelte` (2 changes)
- ~20 lines of code
- 30 minutes to implement + test

### Risk Level
🟢 **Very Low** — Only affects webview positioning, no state changes

---

## 📖 Reading Guide

### For Managers/Decision Makers
→ Read: **DRAWER_ZINDEX_SUMMARY.md**
- Time: 5 minutes
- Outcome: Understand the problem and solution

### For Developers Implementing the Fix
→ Read in order:
1. **DRAWER_ZINDEX_SUMMARY.md** (5 min)
2. **QUICK_REFERENCE.md** (5 min)
3. **IMPLEMENTATION_GUIDE.md** (20 min)
4. Implement the changes (15 min)
5. Test using the checklist (10 min)

### For Architects/Technical Leads
→ Read in order:
1. **TAURI_ZINDEX_ANALYSIS.md** (15 min)
2. **TAURI_ARCHITECTURE_DIAGRAM.md** (10 min)
3. **IMPLEMENTATION_GUIDE.md** (20 min)
- Outcome: Full understanding of the architecture and solution

### For Code Reviewers
→ Read:
1. **QUICK_REFERENCE.md** (5 min)
2. **IMPLEMENTATION_GUIDE.md** (20 min)
- Focus on: Testing section and debugging tips

---

## 🚀 Quick Start

### 1. Understand the Problem (5 min)
```bash
# Read the executive summary
cat DRAWER_ZINDEX_SUMMARY.md
```

### 2. Review the Changes (5 min)
```bash
# See what needs to change
cat QUICK_REFERENCE.md
```

### 3. Implement the Fix (15 min)
```bash
# Follow the step-by-step guide
cat IMPLEMENTATION_GUIDE.md
# Then make the changes in:
# - ogre-desktop/src/pages/Browser.svelte
# - ogre-desktop/src/pages/GradingPanel.svelte
```

### 4. Test the Fix (10 min)
```bash
npm run tauri:dev
# Follow the testing checklist in IMPLEMENTATION_GUIDE.md
```

### 5. Commit the Changes
```bash
git add ogre-desktop/src/pages/Browser.svelte ogre-desktop/src/pages/GradingPanel.svelte
git commit -m "fix: adjust webview bounds to account for drawer width"
```

---

## 📊 Document Comparison

| Document | Length | Audience | Purpose |
|----------|--------|----------|---------|
| DRAWER_ZINDEX_SUMMARY.md | 2 pages | Everyone | Quick overview |
| QUICK_REFERENCE.md | 2 pages | Developers | Implementation reference |
| TAURI_ZINDEX_ANALYSIS.md | 4 pages | Architects | Deep technical analysis |
| TAURI_ARCHITECTURE_DIAGRAM.md | 3 pages | Visual learners | Diagrams and flows |
| IMPLEMENTATION_GUIDE.md | 6 pages | Developers | Step-by-step guide |

---

## ✅ Verification Checklist

After reading the documentation, you should be able to answer:

- [ ] Why does CSS z-index not work for the drawer?
- [ ] What is the recommended solution?
- [ ] Why is it better than the alternatives?
- [ ] What files need to be modified?
- [ ] How many lines of code need to change?
- [ ] What is the estimated implementation time?
- [ ] What is the risk level?
- [ ] How do you test the fix?
- [ ] How do you rollback if something breaks?

---

## 🔗 Related Files

- `ogre-desktop/src/pages/Browser.svelte` — Main webview bounds calculation
- `ogre-desktop/src/pages/GradingPanel.svelte` — Drawer component
- `ogre-desktop/src-tauri/src/lib.rs` — Tauri backend (webview creation)

---

## 💡 Key Insights

1. **Tauri webviews are native OS windows**, not HTML elements
2. **Native windows always render above HTML**, regardless of z-index
3. **The solution is to adjust webview bounds**, not fight the architecture
4. **This is the same approach used for the sidebar**, which works perfectly
5. **The fix is low-risk** because it only affects webview positioning

---

## 🆘 Need Help?

### If you're confused about the problem
→ Read: **TAURI_ZINDEX_ANALYSIS.md** (Root Cause section)

### If you're confused about the solution
→ Read: **TAURI_ARCHITECTURE_DIAGRAM.md** (Solution A section)

### If you're confused about implementation
→ Read: **IMPLEMENTATION_GUIDE.md** (File Changes section)

### If something breaks
→ Read: **IMPLEMENTATION_GUIDE.md** (Rollback Plan section)

---

## 📝 Document Metadata

- **Created:** 2025-02-19
- **Status:** Ready to implement
- **Estimated effort:** 30 minutes
- **Risk level:** Very low
- **Files affected:** 2
- **Lines of code:** ~20

---

**Next step:** Read [DRAWER_ZINDEX_SUMMARY.md](DRAWER_ZINDEX_SUMMARY.md) →
