# Discovery Accuracy Phase 1 — Heuristic & Snapshot Fixes

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Discover Page heuristic accuracy from ~40% to ~80% on MyOpenMath grading pages by fixing gaps in the DOM walker, heuristic detector, and feedback type detection — all without requiring AI calls or GDK input simulation.

**Architecture:** Five targeted changes to existing files. The DOM walker already captures `contenteditable`, `role`, `aria-label`, and `class` — enough to detect TinyMCE. The heuristic detector simply doesn't look for these patterns. Hidden inputs are skipped entirely by the walker. This plan adds the missing pattern matching and hidden input capture.

**Tech Stack:** TypeScript, vitest (TDD), no new dependencies

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `ogre-desktop/src/lib/dom-snapshot.ts` | Modify | Always capture `input[type="hidden"]` even when `skipHidden: true` |
| `ogre-desktop/src/lib/dom-snapshot.test.ts` | Modify | Add tests for hidden input capture |
| `ogre-desktop/src/lib/heuristic-detector.ts` | Modify | Add TinyMCE feedback detection, hidden input correlation, questionRegion, fullCreditLink |
| `ogre-desktop/src/lib/heuristic-detector.test.ts` | Modify | Add tests for new detections |
| `ogre-desktop/src/lib/discover.ts` | Modify | Default `includeExtractionConfig: true`, enhance heuristic-to-profile feedback type mapping |

---

## Task 1: Capture Hidden Inputs in DOM Walker

**Files:**
- Modify: `ogre-desktop/src/lib/dom-snapshot.ts` (the `buildSmartWalkScript()` IIFE, ~line 103-106)
- Test: `ogre-desktop/src/lib/dom-snapshot.test.ts`

**Context:** The `isHiddenElement()` function checks `offsetWidth === 0 && offsetHeight === 0`. Hidden inputs always have zero dimensions, so they're skipped by `skipHidden: true` (the default). But `input[type="hidden"]` elements carry critical form data (student IDs, feedback sync inputs) that grading profiles need.

- [x] **Step 1: Write failing test — hidden inputs should be captured**

Add to `dom-snapshot.test.ts`:

```typescript
describe('hidden input capture', () => {
  it('should capture input[type="hidden"] even with skipHidden: true', () => {
    // The buildSmartWalkScript runs in browser context, so this test
    // verifies the SnapshotNode output includes hidden inputs
    const mockSnapshot: SnapshotResult = {
      nodes: [
        mkNode('div', { depth: 0, priority: 'medium', children: [
          mkNode('input', { depth: 1, priority: 'critical', attrs: { type: 'text', name: 'score' } }),
          mkNode('input', { depth: 1, priority: 'low', attrs: { type: 'hidden', name: 'fb-123' } }),
        ]}),
      ],
      meta: DEFAULT_META,
    };
    const flat = flattenSnapshot(mockSnapshot);
    const hiddenInputs = flat.filter(n => n.tag === 'input' && n.attrs['type'] === 'hidden');
    expect(hiddenInputs.length).toBe(1);
    expect(hiddenInputs[0].attrs['name']).toBe('fb-123');
  });
});
```

- [x] **Step 2: Run test to verify it passes** (this tests the mock, not the walker itself)

Run: `cd ogre-desktop && npx vitest run src/lib/dom-snapshot.test.ts -v`

- [x] **Step 3: Modify the walker to always capture hidden inputs**

In `dom-snapshot.ts`, inside `buildSmartWalkScript()`, find the hidden element skip logic and add an exception for `input[type="hidden"]`:

```javascript
// In the isHiddenElement check within the walk function (~line 141):
// BEFORE:
// if(!isR&&opts.skipHidden&&hidden(el))return;

// AFTER: Allow hidden inputs through even when skipHidden is true
if(!isR&&opts.skipHidden&&hidden(el)){
  // Always capture input[type="hidden"] — they carry form data needed by profiles
  if(!(el.tagName&&el.tagName.toLowerCase()==="input"&&el.getAttribute("type")==="hidden"))return;
}
```

- [x] **Step 4: Set priority for hidden inputs**

In the `classify()` function inside `buildSmartWalkScript()`, add a rule for hidden inputs:

```javascript
// Add after the existing input type checks:
if(tag==="input"){
  var tp=(attrs.type||"").toLowerCase();
  if(tp==="hidden"&&(attrs.name||"").match(/^fb[-_]/i))return"high";
  if(tp==="hidden")return"medium";
  // ...existing rules...
}
```

- [x] **Step 5: Run all dom-snapshot tests**

Run: `cd ogre-desktop && npx vitest run src/lib/dom-snapshot.test.ts -v`
Expected: All pass

- [x] **Step 6: Commit**

```bash
git add ogre-desktop/src/lib/dom-snapshot.ts ogre-desktop/src/lib/dom-snapshot.test.ts
git commit -m "feat(discovery): capture input[type=hidden] in DOM walker even with skipHidden"
```

---

## Task 2: Detect TinyMCE / Contenteditable Feedback Boxes

**Files:**
- Modify: `ogre-desktop/src/lib/heuristic-detector.ts` (~line 248-256)
- Test: `ogre-desktop/src/lib/heuristic-detector.test.ts`

**Context:** `findFeedbackBox()` only looks for `<textarea>` elements. TinyMCE inline editors are `<div contenteditable="true" role="textbox">` with class containing `mce` or `fbbox`. The DOM walker already captures `contenteditable`, `role`, and `class` attributes — the heuristic just doesn't check them.

- [x] **Step 1: Write failing test — detect contenteditable feedback**

Add to `heuristic-detector.test.ts`:

```typescript
describe('TinyMCE / contenteditable feedback detection', () => {
  it('should detect div[contenteditable][role="textbox"] as feedback box', () => {
    const snapshot = buildBatchSnapshot({
      extraNodes: [
        mkNode('div', {
          depth: 2,
          priority: 'high',
          attrs: {
            contenteditable: 'true',
            role: 'textbox',
            class: 'fbbox',
            'aria-label': 'Feedback',
          },
        }),
      ],
    });
    const result = detectGradingStructure(snapshot);
    expect(result).not.toBeNull();
    expect(result!.candidateSelectors.feedbackBox).toBeTruthy();
    expect(result!.candidateSelectors.feedbackBox).toContain('contenteditable');
  });

  it('should prefer contenteditable div over plain textarea when both exist', () => {
    const snapshot = buildBatchSnapshot({
      extraNodes: [
        mkNode('textarea', { depth: 2, priority: 'medium', attrs: { name: 'rawfb' } }),
        mkNode('div', {
          depth: 2,
          priority: 'high',
          attrs: { contenteditable: 'true', role: 'textbox', class: 'fbbox' },
        }),
      ],
    });
    const result = detectGradingStructure(snapshot);
    expect(result).not.toBeNull();
    expect(result!.candidateSelectors.feedbackBox).toContain('contenteditable');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd ogre-desktop && npx vitest run src/lib/heuristic-detector.test.ts -t "TinyMCE" -v`
Expected: FAIL — current `findFeedbackBox` only matches `<textarea>`

- [x] **Step 3: Rewrite `findFeedbackBox` to detect contenteditable editors**

In `heuristic-detector.ts`, replace the `findFeedbackBox` function:

```typescript
function findFeedbackBox(allNodes: SnapshotNode[]): SnapshotNode | null {
  // Priority 1: contenteditable div with role="textbox" (TinyMCE inline, rich editors)
  const contenteditableEditor = allNodes.find(
    (n) =>
      n.attrs['contenteditable'] === 'true' &&
      (n.attrs['role'] === 'textbox' ||
        (n.attrs['class'] ?? '').includes('mce') ||
        (n.attrs['class'] ?? '').includes('fbbox') ||
        (n.attrs['aria-label'] ?? '').toLowerCase().includes('feedback')),
  );
  if (contenteditableEditor) return contenteditableEditor;

  // Priority 2: textarea that isn't the score input
  return (
    allNodes.find((n) => n.tag === 'textarea' && !isScoreInput(n)) ??
    allNodes.find((n) => n.tag === 'textarea') ??
    null
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd ogre-desktop && npx vitest run src/lib/heuristic-detector.test.ts -v`
Expected: All pass including new TinyMCE tests

- [x] **Step 5: Commit**

```bash
git add ogre-desktop/src/lib/heuristic-detector.ts ogre-desktop/src/lib/heuristic-detector.test.ts
git commit -m "feat(discovery): detect TinyMCE/contenteditable feedback editors in heuristics"
```

---

## Task 3: Correlate Hidden Inputs with Feedback Elements

**Files:**
- Modify: `ogre-desktop/src/lib/heuristic-detector.ts` (~line 339-356)
- Test: `ogre-desktop/src/lib/heuristic-detector.test.ts`

**Context:** When a contenteditable feedback box is found, there's usually a hidden input nearby with a matching `name` prefix (like `fb-` or `feedback_`) that the form actually submits. The heuristic currently always returns `feedbackHidden: null`. This task adds correlation logic.

- [x] **Step 1: Write failing test — hidden input correlation**

Add to `heuristic-detector.test.ts`:

```typescript
describe('hidden input correlation', () => {
  it('should find feedbackHidden when hidden input name matches feedback pattern', () => {
    const snapshot = buildBatchSnapshot({
      extraNodes: [
        mkNode('div', {
          depth: 2, priority: 'high',
          attrs: { contenteditable: 'true', role: 'textbox', class: 'fbbox' },
        }),
        mkNode('input', {
          depth: 2, priority: 'medium',
          attrs: { type: 'hidden', name: 'fb-123' },
        }),
      ],
    });
    const result = detectGradingStructure(snapshot);
    expect(result).not.toBeNull();
    expect(result!.candidateSelectors.feedbackHidden).toBeTruthy();
    expect(result!.candidateSelectors.feedbackHidden).toContain('hidden');
  });

  it('should not set feedbackHidden for plain textarea (no sync needed)', () => {
    const snapshot = buildBatchSnapshot({
      extraNodes: [
        mkNode('textarea', { depth: 2, priority: 'medium', attrs: { name: 'feedback' } }),
      ],
    });
    const result = detectGradingStructure(snapshot);
    expect(result).not.toBeNull();
    expect(result!.candidateSelectors.feedbackHidden).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd ogre-desktop && npx vitest run src/lib/heuristic-detector.test.ts -t "hidden input" -v`
Expected: FAIL — current code always returns `feedbackHidden: null`

- [x] **Step 3: Add `findFeedbackHidden` function**

Add to `heuristic-detector.ts`:

```typescript
const FEEDBACK_HIDDEN_NAME_RE = /^fb[-_]|^feedback[-_]|^comment[-_]/i;

function findFeedbackHidden(
  allNodes: SnapshotNode[],
  feedbackNode: SnapshotNode | null,
): SnapshotNode | null {
  if (!feedbackNode) return null;

  // Only look for hidden sync when feedback is a contenteditable editor (not plain textarea)
  const isRichEditor = feedbackNode.attrs['contenteditable'] === 'true';
  if (!isRichEditor) return null;

  // Find hidden input with a feedback-like name
  return (
    allNodes.find(
      (n) =>
        n.tag === 'input' &&
        (n.attrs['type'] ?? '').toLowerCase() === 'hidden' &&
        FEEDBACK_HIDDEN_NAME_RE.test(n.attrs['name'] ?? ''),
    ) ?? null
  );
}
```

- [x] **Step 4: Wire into `detectGradingStructure`**

In the main detection function, after `findFeedbackBox`, add:

```typescript
// After line 340: const feedbackNode = findFeedbackBox(allNodes);
const feedbackHiddenNode = findFeedbackHidden(allNodes, feedbackNode);
```

And update the return object:

```typescript
feedbackHidden: feedbackHiddenNode ? selectorFor(feedbackHiddenNode) : null,
```

- [x] **Step 5: Run tests**

Run: `cd ogre-desktop && npx vitest run src/lib/heuristic-detector.test.ts -v`
Expected: All pass

- [x] **Step 6: Commit**

```bash
git add ogre-desktop/src/lib/heuristic-detector.ts ogre-desktop/src/lib/heuristic-detector.test.ts
git commit -m "feat(discovery): correlate hidden inputs with contenteditable feedback editors"
```

---

## Task 4: Detect questionRegion and fullCreditLink

**Files:**
- Modify: `ogre-desktop/src/lib/heuristic-detector.ts`
- Test: `ogre-desktop/src/lib/heuristic-detector.test.ts`

**Context:** The heuristic always returns `questionRegion: null` and `fullCreditLink: null`. These can be detected structurally:
- `questionRegion`: a container div with `role="region"`, or a parent of repeating rows
- `fullCreditLink`: an `<a>` element with class/text matching "full credit"

- [x] **Step 1: Write failing tests**

```typescript
describe('questionRegion and fullCreditLink detection', () => {
  it('should detect div[role="region"] as questionRegion', () => {
    const snapshot = buildBatchSnapshot({
      extraNodes: [
        mkNode('div', {
          depth: 1, priority: 'medium',
          attrs: { role: 'region', 'aria-label': 'Question 1' },
          children: [
            mkNode('input', { depth: 2, priority: 'critical', attrs: { type: 'number' } }),
          ],
        }),
      ],
    });
    const result = detectGradingStructure(snapshot);
    expect(result).not.toBeNull();
    expect(result!.candidateSelectors.questionRegion).toBeTruthy();
  });

  it('should detect a.fullcredlink or link with full credit text', () => {
    const snapshot = buildBatchSnapshot({
      extraNodes: [
        mkNode('a', {
          depth: 2, priority: 'medium',
          attrs: { class: 'fullcredlink', href: '#' },
          text: 'Full Credit',
        }),
      ],
    });
    const result = detectGradingStructure(snapshot);
    expect(result).not.toBeNull();
    expect(result!.candidateSelectors.fullCreditLink).toBeTruthy();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

- [x] **Step 3: Add detection functions**

```typescript
function findQuestionRegion(allNodes: SnapshotNode[]): SnapshotNode | null {
  // Look for div/section with role="region" and aria-label containing "question"
  return (
    allNodes.find(
      (n) =>
        (n.tag === 'div' || n.tag === 'section') &&
        n.attrs['role'] === 'region' &&
        (n.attrs['aria-label'] ?? '').toLowerCase().includes('question'),
    ) ??
    // Fallback: div with class containing "question" that has inputs as descendants
    allNodes.find(
      (n) =>
        n.tag === 'div' &&
        (n.attrs['class'] ?? '').toLowerCase().includes('question') &&
        n.children?.some((c) => flatChildren(c).some(isScoreInput) || isScoreInput(c)),
    ) ??
    null
  );
}

const FULL_CREDIT_RE = /full\s*cred|fullcred/i;

function findFullCreditLink(allNodes: SnapshotNode[]): SnapshotNode | null {
  return (
    allNodes.find(
      (n) =>
        n.tag === 'a' &&
        (FULL_CREDIT_RE.test(n.attrs['class'] ?? '') ||
          FULL_CREDIT_RE.test(n.text ?? '')),
    ) ?? null
  );
}
```

- [x] **Step 4: Wire into `detectGradingStructure`**

```typescript
const questionRegionNode = findQuestionRegion(allNodes);
const fullCreditNode = findFullCreditLink(allNodes);

// Update return:
questionRegion: questionRegionNode ? selectorFor(questionRegionNode) : null,
fullCreditLink: fullCreditNode ? selectorFor(fullCreditNode) : null,
```

- [x] **Step 5: Run tests, verify all pass**

- [x] **Step 6: Commit**

```bash
git add ogre-desktop/src/lib/heuristic-detector.ts ogre-desktop/src/lib/heuristic-detector.test.ts
git commit -m "feat(discovery): detect questionRegion and fullCreditLink in heuristics"
```

---

## Task 5: Map Feedback Type in Heuristic-to-Profile Conversion + Default Extraction

**Files:**
- Modify: `ogre-desktop/src/lib/discover.ts` (~line 799, `heuristicToDiscoveryResult` + extraction default)

**Context:** When the heuristic path succeeds, `heuristicToDiscoveryResult()` converts detection results to a `DiscoveryResult`. Currently it always sets `feedback.type: 'textarea'` regardless of what was detected. It also doesn't infer `requiresHiddenSync` or `htmlWrap`. Additionally, `includeExtractionConfig` defaults to false.

- [x] **Step 1: Find `heuristicToDiscoveryResult`**

Read `discover.ts` and locate the function that maps `HeuristicDetection` → `DiscoveryResult`. Check what it sets for `feedback.type`.

- [x] **Step 2: Update feedback type inference**

When the heuristic finds a contenteditable feedback box (from Task 2), set:
- `feedback.type = 'tinymce-inline'` (if contenteditable + role=textbox)
- `feedback.requiresHiddenSync = true` (if feedbackHidden was found)
- `feedback.htmlWrap = true` (if tinymce-inline)

```typescript
// In heuristicToDiscoveryResult:
const isContenteditable = feedbackSelector?.includes('contenteditable') ?? false;
const hasHiddenSync = !!heuristic.candidateSelectors.feedbackHidden;

feedback: {
  type: isContenteditable ? 'tinymce-inline' : 'textarea',
  requiresHiddenSync: hasHiddenSync,
  htmlWrap: isContenteditable,
},
```

- [x] **Step 3: Default includeExtractionConfig to true**

Find the `DiscoveryOptions` type and the `runDiscovery` defaults. Change `includeExtractionConfig` default from `false` to `true`.

- [x] **Step 4: Run full test suite**

Run: `cd ogre-desktop && npx vitest run -v`
Expected: All 1193+ tests pass

- [x] **Step 5: Commit**

```bash
git add ogre-desktop/src/lib/discover.ts
git commit -m "feat(discovery): infer feedback type from heuristics + default extraction config on"
```

---

## Final Verification

- [ ] `cargo check` — zero errors
- [ ] `npx vitest run` — all tests pass, no regressions
- [ ] Manual test: run Discover Page on MOM grading page, verify improved detection
- [ ] Compare new heuristic output against built-in MOM profile — target 80%+ field match

---

## Expected Results After Plan Completion

| Selector Field | Before (40%) | After (target 80%) |
|---------------|-------------|-------------------|
| studentSection | 🟡 Wrong class | 🟡 Same (repeating row parent) |
| studentName | 🟡 Over-scoped | 🟡 Same (text near input) |
| scoreInput | ✅ Works | ✅ Same |
| feedbackBox | ❌ Raw textarea | ✅ `div[contenteditable][role="textbox"]` |
| feedbackHidden | ❌ null | ✅ `input[type="hidden"][name^="fb"]` |
| questionRegion | ❌ null | ✅ `div[role="region"]` or `div.question*` |
| fullCreditLink | ✅ Works | ✅ Same |
| feedback.type | ❌ textarea | ✅ tinymce-inline |
| requiresHiddenSync | ❌ false | ✅ true |
| htmlWrap | ❌ false | ✅ true |
| extraction | ❌ missing | ✅ discovered (AI second pass) |
