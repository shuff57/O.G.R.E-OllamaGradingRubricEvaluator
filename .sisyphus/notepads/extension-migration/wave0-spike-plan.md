# Wave 0.2 Spike: eval_webview_script with Message Passing

## Spike Goal
Create proof-of-concept for JavaScript execution with return values using Tauri's message passing system.

## Architecture

### Pattern: Eval Bridge via IPC
```
┌─────────────┐                  ┌──────────────┐
│   Rust      │ invoke           │  Webview JS  │
│  Command    │─────────────────>│  eval()      │
│ eval_script │                  │              │
│             │<─────────────────│  invoke()    │
│             │  return result   │  callback    │
└─────────────┘                  └──────────────┘
```

### Flow
1. Rust calls `webview.eval()` to inject a wrapper script
2. Wrapper script executes target code and captures result
3. Wrapper calls `invoke("_eval_callback", { id, result })`
4. Rust command returns result to original caller

## Implementation Plan

### File Structure
```
ogre-desktop/src-tauri/src/
├── lib.rs                      # Add eval_webview_script command
└── webview_eval.rs (NEW)       # Eval bridge implementation

ogre-desktop/src/lib/
└── browser.ts                  # Add evalScript() wrapper
```

### Rust Implementation (lib.rs)

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

// Global registry for pending eval callbacks
type EvalRegistry = Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>;

#[tauri::command]
async fn eval_webview_script(
    app: tauri::AppHandle,
    script: String,
) -> Result<String, String> {
    let eval_id = uuid::Uuid::new_v4().to_string();
    let wv = app.get_webview("embedded-browser")
        .ok_or("Embedded browser not open")?;
    
    // Create channel for result
    let (tx, rx) = oneshot::channel::<String>();
    
    // Store callback in registry
    let registry = app.state::<EvalRegistry>();
    {
        let mut guard = registry.lock().unwrap();
        guard.insert(eval_id.clone(), tx);
    }
    
    // Inject wrapper script that calls back with result
    let wrapper = format!(r#"
        (async () => {{
            try {{
                const result = await (async () => {{ {} }})();
                await window.__TAURI_INTERNALS__.invoke('_eval_callback', {{
                    id: '{}',
                    success: true,
                    result: JSON.stringify(result)
                }});
            }} catch (error) {{
                await window.__TAURI_INTERNALS__.invoke('_eval_callback', {{
                    id: '{}',
                    success: false,
                    error: String(error)
                }});
            }}
        }})();
    "#, script, eval_id, eval_id);
    
    wv.eval(&wrapper)
        .map_err(|e| format!("Failed to inject script: {}", e))?;
    
    // Wait for callback (with timeout)
    match tokio::time::timeout(
        tokio::time::Duration::from_secs(10),
        rx
    ).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(_)) => Err("Callback channel closed".to_string()),
        Err(_) => Err("Timeout waiting for eval result".to_string()),
    }
}

#[tauri::command]
async fn _eval_callback(
    app: tauri::AppHandle,
    id: String,
    success: bool,
    result: Option<String>,
    error: Option<String>,
) -> Result<(), String> {
    let registry = app.state::<EvalRegistry>();
    let tx = {
        let mut guard = registry.lock().unwrap();
        guard.remove(&id)
    };
    
    if let Some(tx) = tx {
        let response = if success {
            result.unwrap_or_else(|| "null".to_string())
        } else {
            format!("{{\"error\": \"{}\"}}", error.unwrap_or_else(|| "Unknown error".to_string()))
        };
        let _ = tx.send(response);
    }
    
    Ok(())
}
```

### TypeScript Wrapper (browser.ts)

```typescript
import { invoke } from '@tauri-apps/api/core';

/**
 * Execute JavaScript in the embedded browser webview and return the result.
 * 
 * @param script - JavaScript code to execute (must return a value)
 * @returns Promise resolving to the serialized result (JSON string)
 * 
 * @example
 * // Extract student name
 * const name = await evalScript(`
 *   document.querySelector('.student-name')?.textContent || 'Unknown'
 * `);
 * 
 * @example
 * // Extract all answers
 * const answers = await evalScript(`
 *   [...document.querySelectorAll('.answer')].map(el => el.value)
 * `);
 */
export async function evalScript(script: string): Promise<string> {
  return await invoke<string>('eval_webview_script', { script });
}

/**
 * Execute JavaScript and parse JSON result.
 */
export async function evalScriptJSON<T = any>(script: string): Promise<T> {
  const result = await evalScript(script);
  return JSON.parse(result);
}
```

## Test Cases

### Test 1: Simple Value Return
```typescript
const result = await evalScript(`42`);
assert(result === "42");
```

### Test 2: String Return
```typescript
const result = await evalScript(`"hello world"`);
assert(result === '"hello world"');
```

### Test 3: Object Return
```typescript
const result = await evalScriptJSON(`({ name: "John", age: 30 })`);
assert(result.name === "John");
assert(result.age === 30);
```

### Test 4: Array Return
```typescript
const result = await evalScriptJSON(`[1, 2, 3, 4, 5]`);
assert(Array.isArray(result));
assert(result.length === 5);
```

### Test 5: DOM Query
```typescript
const result = await evalScript(`document.title`);
console.log("Page title:", result);
```

### Test 6: Complex DOM Extraction
```typescript
const students = await evalScriptJSON(`
  [...document.querySelectorAll('.student-row')].map(row => ({
    id: row.dataset.studentId,
    name: row.querySelector('.name')?.textContent,
    score: row.querySelector('.score')?.value
  }))
`);
console.log("Extracted students:", students);
```

### Test 7: Error Handling
```typescript
try {
  await evalScript(`throw new Error("Test error")`);
  assert(false, "Should have thrown");
} catch (error) {
  assert(error.includes("Test error"));
}
```

### Test 8: Timeout Handling
```typescript
try {
  await evalScript(`new Promise(() => {})`); // Never resolves
  assert(false, "Should have timed out");
} catch (error) {
  assert(error.includes("Timeout"));
}
```

### Test 9: Performance (Latency Measurement)
```typescript
const iterations = 100;
const start = Date.now();

for (let i = 0; i < iterations; i++) {
  await evalScript(`42`);
}

const duration = Date.now() - start;
const avgLatency = duration / iterations;
console.log(`Average latency: ${avgLatency}ms per call`);

// Expected: < 10ms per call for local IPC
// Threshold: < 50ms acceptable, > 100ms concerning
```

### Test 10: Batch Operations
```typescript
// Test parallel execution
const promises = [];
for (let i = 0; i < 10; i++) {
  promises.push(evalScript(`${i}`));
}

const results = await Promise.all(promises);
assert(results.length === 10);
results.forEach((result, i) => {
  assert(result === String(i));
});
```

## Success Criteria

### Performance Thresholds
- ✅ **Average latency < 50ms** per call
- ✅ **P99 latency < 100ms**
- ✅ **Support 200+ calls** per session without memory leaks
- ✅ **Parallel execution** of 10+ concurrent calls

### Functional Requirements
- ✅ Returns primitive values (number, string, boolean)
- ✅ Returns complex objects (JSON serializable)
- ✅ Returns arrays
- ✅ Handles DOM queries
- ✅ Error propagation from JS to Rust
- ✅ Timeout handling (10s default)
- ✅ No memory leaks (registry cleanup on timeout/error)

### Decision Criteria
**GO:** All success criteria met
**NO-GO:** Performance > 100ms average OR functional requirements not met

## Known Risks

### Risk 1: Latency
- **Issue:** Message passing adds round-trip overhead
- **Mitigation:** Measure actual latency, compare against threshold
- **Fallback:** If > 100ms, consider platform-specific eval with return

### Risk 2: Serialization Limits
- **Issue:** Large DOM extractions might exceed IPC limits
- **Mitigation:** Test with real-world data sizes (30 students × 5 fields)
- **Fallback:** Chunked extraction if needed

### Risk 3: Concurrent Calls
- **Issue:** Multiple parallel evals might interfere
- **Mitigation:** Each call has unique ID, registry is thread-safe
- **Fallback:** Queue if concurrency issues arise

### Risk 4: Memory Leaks
- **Issue:** Orphaned callbacks if timeout/error before callback
- **Mitigation:** Timeout cleanup, explicit registry pruning
- **Fallback:** Periodic registry sweep

## Implementation Timeline

- **Step 1:** Add eval_webview_script Rust command (2 hours)
- **Step 2:** Add TypeScript wrapper (1 hour)
- **Step 3:** Create test page with sample DOM (1 hour)
- **Step 4:** Run all 10 test cases (2 hours)
- **Step 5:** Performance benchmarking (1 hour)
- **Step 6:** Document results (1 hour)

**Total:** 8 hours

## Next Steps After Spike

### If GO Decision
1. Create production implementation in Wave 1
2. Add error handling, retry logic, better timeouts
3. Add capability declaration for security
4. Document API patterns for Wave 2/3 usage

### If NO-GO Decision
1. Research platform-specific eval methods via `with_webview()`
2. Explore Tauri plugin ecosystem for existing solutions
3. Consider hybrid approach (screenshot + OCR for read, IPC for write)
4. Escalate to user with alternative strategies

---

**Status:** Ready to implement
**Next Action:** Create spike implementation files
