# Wave 0 Research: Tauri v2 Webview Eval Capabilities

## Research Goal
Determine if Tauri v2 webview supports JavaScript execution with return values, which is critical for migrating the Chrome extension's batch grading functionality.

## Current State (Phase 1)

### Existing Usage in Codebase
From `ogre-desktop/src-tauri/src/lib.rs`:

```rust
// Fire-and-forget eval calls (no return value needed)
wv.eval("history.back()")     // Line 268
wv.eval("history.forward()")  // Line 277
wv.eval("location.reload()")  // Line 286
wv.eval(&script)              // Line 344 (autofill injection)
```

**Pattern:** All current uses are fire-and-forget - they execute JS but don't capture return values.

## Requirements for Extension Migration

### Chrome Extension Pattern
```javascript
// Extension's current approach (batch-grader.js)
const results = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: () => {
    // Extract student data
    return {
      name: document.querySelector('.student-name').textContent,
      responses: [...document.querySelectorAll('.answer')].map(el => el.value)
    };
  }
});

const data = results[0].result; // Get returned value
```

**Key Requirement:** Must be able to execute arbitrary JS and get serialized JSON back.

### Batch Grader Use Cases
The batch grader makes ~30+ calls per session that need return values:

1. **Extract student list** (1 call)
   - Returns: `Array<{id, name, status}>`
   
2. **For each student** (~30 iterations):
   - Extract rubric text (1 call) → Returns: `string`
   - Extract student responses (1 call) → Returns: `Array<string>`
   - Grade with AI (desktop-side, no webview)
   - Fill score field (1 call) → Returns: `boolean` (success)
   - Fill feedback field (1 call) → Returns: `boolean` (success)
   - Click save button (1 call) → Returns: `boolean` (success)
   - Navigate to next student (1 call) → Returns: `boolean` (success)

**Total:** ~200+ webview eval calls per 30-student session, most requiring return values.

## Tauri v2 API Investigation

### Official Documentation
From https://v2.tauri.app/reference/javascript/api/namespacewebview/:

> **Note:** The webfetch documentation showed the API structure but was truncated. Need to check:
> 1. Does `Webview.eval()` return a Promise?
> 2. Can it serialize and return JavaScript values?
> 3. What's the return type signature?

### Rust API (from docs.rs/tauri)
From Tauri v2 Webview docs (https://docs.rs/tauri/2.10.2/tauri/webview/struct.Webview.html):

```rust
pub fn eval(&self, js: impl Into<String>) -> Result<()>
```

**CONFIRMED:** Returns `Result<()>` — **fire-and-forget only, NO return values!**

### Alternative API: `evaluate_script`?
✅ **VERIFIED:** No alternative methods exist on Webview struct. The only eval-related method is `eval()`.

Available Webview methods (from Rust docs):
- `eval()` — Fire-and-forget JS execution
- `navigate()` — Navigate to URL
- `reload()` — Reload page
- `on_message()` — Handle IPC messages
- `with_webview()` — Access platform-specific webview
- No `evaluate_script()`, `execute_script()`, or similar methods

**Conclusion:** Tauri v2 does NOT support direct JavaScript execution with return values via the Webview API.

## Research Questions (ANSWERED)

### Critical Questions
1. ✅ **Does `wv.eval()` support return values?**
   - **ANSWER:** NO - Confirmed signature is `eval(&self, js: impl Into<String>) -> Result<()>`
   - Returns `Result<()>` which means fire-and-forget only

2. ✅ **Is there an `evaluate_script()` or similar method?**
   - **ANSWER:** NO - Verified against full Rust API documentation
   - Only eval-related method is `eval()` which doesn't return values

3. 🔴 **MUST use message passing as workaround?**
   - Pattern: JS calls `invoke()` → Rust handler → Returns value
   - This is the ONLY way to get data back from webview JavaScript
   - Question: What's the latency? Can we batch operations?

4. ❓ **What about Tauri v2 plugin ecosystem?**
   - Need to search GitHub/Discord for community solutions
   - Could we create a custom plugin if needed?

### Secondary Questions
5. ❓ **Performance implications**
   - If using message passing, what's the round-trip latency?
   - Can we batch multiple evals to reduce overhead?

6. ❓ **Serialization limits**
   - What types can be returned? (JSON only? DOM nodes?)
   - Size limits on returned data?

## Next Steps

### Task 0.1: Documentation Deep Dive (CURRENT)
- [x] Review existing codebase usage
- [ ] Check full Tauri v2 Rust API docs for all eval methods
- [ ] Review Tauri v2 JavaScript API for webview methods
- [ ] Search Tauri Discord/GitHub for "evaluate script return value"
- [ ] Check Tauri v1 → v2 migration guide for changes

### Task 0.2: Spike Implementation (NEXT)
Create proof-of-concept to test:

1. **Test 1: Direct eval with return**
   ```rust
   // Does this work?
   let result = wv.eval("JSON.stringify({test: 'data'})");
   ```

2. **Test 2: Message passing workaround**
   ```rust
   // Register handler
   #[tauri::command]
   async fn eval_and_return(app: AppHandle, script: String) -> Result<String, String> {
       // Execute script that calls invoke("callback", data)
       // Wait for callback event
       // Return data
   }
   ```

3. **Test 3: Search for alternatives**
   - Check if webview exposes `execute_script()` or similar
   - Look for Tauri plugins that add this functionality

### Decision Criteria

**GO Decision:**
- Can reliably execute JS and return serialized values
- Round-trip latency < 100ms for single calls
- Supports JSON serialization of complex objects
- Can handle 200+ calls per session without memory leaks

**NO-GO Decision:**
- No mechanism to return values from webview JS
- Workarounds add >500ms latency per call
- Serialization limited to primitives only
- Must fall back to screenshot + OCR approach

## Risk Mitigation

If direct eval with return values is not possible:

### Option A: Message Passing Bridge
```rust
// Pattern: Webview JS → invoke() → Rust handler → Returns value
// Pro: Uses standard Tauri IPC
// Con: Higher latency, more complex code
```

### Option B: Hybrid Approach
```rust
// Use eval for simple actions (click, fill)
// Use invoke for data extraction (return values needed)
// Pro: Leverages both mechanisms
// Con: Two different patterns to maintain
```

### Option C: Screenshot + AI Extraction
```rust
// Fallback to visual approach if eval doesn't work
// Pro: Works for any site
// Con: Slow, expensive, less reliable
```

### Option D: Custom Tauri Plugin
```rust
// Build our own webview script evaluator
// Pro: Full control, optimal performance
// Con: Significant dev effort, platform-specific code
```

## Timeline

- **Task 0.1 (Documentation):** 2 hours
- **Task 0.2 (Spike POC):** 4-8 hours
- **Decision Point:** After spike completes
- **Contingency Planning:** 4 hours if need alternative approach

**Total Wave 0 Estimate:** 10-14 hours

## References

- Tauri v2 Webview Rust API: https://docs.rs/tauri/2.10.2/tauri/webview/struct.Webview.html
- Tauri v2 JavaScript API: https://v2.tauri.app/reference/javascript/api/namespacewebview/
- Chrome Extension scripting API: https://developer.chrome.com/docs/extensions/reference/api/scripting
- Current implementation: `ogre-desktop/src-tauri/src/lib.rs` lines 268-347

---

**Last Updated:** 2026-02-17 09:27 AM PST
**Status:** Task 0.1 IN PROGRESS
**Next Action:** Complete documentation review, then begin spike POC
