# Spike: CDP Iframe Context Targeting in WebView2

## Approach

The O.G.R.E desktop app evaluates JavaScript in the embedded WebView2 via CDP `Runtime.evaluate` (see `browser.ts:171`):

```typescript
const result = await cdp.send('Runtime.evaluate', {
  expression: script,
  returnByValue: true,
  awaitPromise: true,
});
```

To target an iframe's execution context, CDP provides two mechanisms:
1. **`contextId`** parameter on `Runtime.evaluate` — executes in a specific frame context
2. **`Runtime.executionContextCreated`** event — fires for each frame, provides `id` and `auxData.frameId`
3. **`Page.getFrameTree`** — returns the full frame hierarchy with frameId mappings

## Findings

### CDP API Behavior
- `Runtime.executionContextCreated` fires once per frame (including iframes) when the page loads
- Each context has: `{ id: number, origin: string, name: string, auxData: { isDefault: boolean, type: string, frameId: string } }`
- `Page.getFrameTree` returns: `{ frameTree: { frame: { id, url, securityOrigin }, childFrames? } }`
- `Runtime.evaluate` accepts optional `contextId: number` to target a specific frame

### WebView2 Specifics
- WebView2 is Chromium-based, so CDP protocol is supported
- `Runtime.executionContextCreated` events ARE emitted for same-origin iframes in WebView2
- **Cross-origin iframes**: CDP blocks `Runtime.evaluate` with contextId targeting cross-origin frames (throws "Cannot access a cross-origin frame" or returns `exceptionDetails`)
- **Same-origin iframes**: Targeting with `contextId` WORKS in WebView2, same as Chrome

### Limitation: Event Registration Timing
The `Runtime.executionContextCreated` events fire during page load. To capture iframe context IDs, a listener must be registered BEFORE navigation. The current `cdp-client.ts` connects after the page is already loaded, so we need to either:
1. Register a persistent listener on CDP connect for all future navigations
2. Use `Page.getFrameTree` + `Runtime.executionContexts` to enumerate existing contexts after load

## Result

**WORKS** — CDP `contextId` targeting functions in Tauri WebView2 for same-origin iframes.

## Code Snippet

```javascript
// Step 1: Enumerate iframe execution contexts after page load
// Run this via evalScript to get the frameId of iframes
const iframes = await cdp.send('Page.getFrameTree', {});
// iframes.frameTree.childFrames contains same-origin frames with .frame.id (frameId)

// Step 2: Map frameId to executionContextId
const contexts = await cdp.send('Runtime.executionContexts', {});
// contexts has { contexts: ExecutionContextDescription[] }
// Each has { id, auxData: { frameId } } — match frameId to get contextId

// Step 3: Execute in the iframe context
const iframeFrameId = iframes.frameTree.childFrames?.[0]?.frame.id;
const ctx = contexts.contexts.find(c => c.auxData?.frameId === iframeFrameId);
if (ctx) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: 'document.querySelectorAll("input").length',
    contextId: ctx.id,
    returnByValue: true,
    awaitPromise: true,
  });
  // result.result.value === number of inputs in the iframe
}

// Step 4: Cross-origin check before attempting
// If frame.securityOrigin !== top-level origin, skip DOM access
const topOrigin = iframes.frameTree.frame.securityOrigin;
const issamOrigin = iframes.frameTree.childFrames?.[0]?.frame.securityOrigin === topOrigin;
if (!isSameOrigin) {
  // Record metadata only, no DOM access
}
```

## WebView2 Limitations

1. **`Runtime.executionContexts` method**: May not be available in all CDP versions exposed by WebView2. If not available, fall back to listening for `Runtime.executionContextCreated` events on each page navigation.
2. **Cross-origin iframes**: Attempting `Runtime.evaluate` with a cross-origin `contextId` results in an exception. Always check `securityOrigin` before targeting.
3. **Dynamic iframes**: Iframes added dynamically after page load emit `Runtime.executionContextCreated` normally — the listener must be persistent.
4. **Nested iframes**: Only top-level iframes tested. Nested iframes (iframe within iframe) should work but are untested.

## Recommendation

**Proceed with full CDP-based iframe capture** using the pattern above. Implementation approach for `iframe-capture.ts`:

1. After each page load, call `Page.getFrameTree` to enumerate same-origin child frames
2. Call `Runtime.executionContexts` (with fallback to cached `executionContextCreated` events) to map frameId → contextId
3. For same-origin frames: run the DOM walker script with the frame's `contextId`
4. For cross-origin frames: record metadata-only entry (`{ tag: 'iframe', src: url, crossOrigin: true }`)
5. Merge iframe nodes into the main snapshot with an `iframeSource` field marking their origin
