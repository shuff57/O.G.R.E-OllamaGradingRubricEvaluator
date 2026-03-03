# Prompt Budget Spec: DOM Snapshot Adaptive Truncation

## Current Budget Analysis

### Current walker output per node
The `DOM_SNAPSHOT_SCRIPT` (discover.ts:532) produces nodes shaped as:
```json
{ "depth": 2, "tag": "input", "attrs": {"type":"text","name":"score"}, "text": "...", "childCount": 0 }
```

Measuring a representative node:
- Fixed overhead (JSON keys + punctuation): ~60 chars
- `depth` value: 1-2 chars  
- `tag` (avg): ~4 chars (`div`, `span`, `input`, `textarea`)
- `attrs` object (0-3 attrs typically): ~40 chars avg (keys + values)
- `text` field (0-150 chars): ~50 chars avg (many nodes have no text)
- `childCount`: 1-3 chars

**Average chars-per-node: ~160 chars**

At 12,000 char budget:
- `12000 / 160 ≈ 75 nodes` from a 500-node walk typically fit
- The current truncation loop (`snapshot.slice(0, 90%)`) removes ~50 nodes per pass = 7+ passes average
- **Problem**: slicing removes from the END — discards deep nodes which often include the actual form inputs

### What Gets Cut
With the current end-slice strategy on a 500-node page:
- ~425 nodes are captured
- Truncation removes ~350 nodes to reach 12K
- The remaining 75 nodes are the SHALLOWEST nodes (headers, navbars, wrappers) — the LEAST useful content
- Form inputs (deeper in the tree) are systematically cut

## Priority-Based Truncation

### Algorithm

Replace the current `slice(0, 90%)` with a priority-sorted truncation:

```typescript
function priorityTruncate(nodes: SnapshotNode[], budgetChars: number): SnapshotNode[] {
  // Priority order: critical > high > medium > low > noise
  const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low', 'noise'];
  
  let result = [...nodes];
  let serialized = JSON.stringify(result);
  
  if (serialized.length <= budgetChars) return result;
  
  // Evict lowest-priority nodes first, working up the priority ladder
  for (const evictPriority of ['noise', 'low', 'medium']) {
    if (serialized.length <= budgetChars) break;
    
    // Remove nodes of this priority level one at a time from the END
    result = result.filter((n, i) => {
      if (n.priority !== evictPriority) return true;
      // Keep first occurrence of each priority bucket for context
      const isFirst = result.findIndex(x => x.priority === evictPriority) === i;
      return isFirst;
    });
    serialized = JSON.stringify(result);
  }
  
  // Emergency: if still over budget, slice high-priority nodes from the middle
  if (serialized.length > budgetChars) {
    while (serialized.length > budgetChars && result.length > 10) {
      result.splice(Math.floor(result.length / 2), 1);
      serialized = JSON.stringify(result);
    }
  }
  
  return result;
}
```

### Priority Classification Summary
| Priority | Elements | Budget behavior |
|----------|----------|-----------------|
| `critical` | `input`, `textarea`, `select`, `button` | **NEVER evicted** |
| `high` | Elements with `role`, `aria-label`, `name`, `data-testid` | Evicted last |
| `medium` | `table`, `tr`, `td`, `form`, `label`, `h1-h6`, `a` | Evicted 3rd |
| `low` | `div`/`span` with attributes | Evicted 2nd |
| `noise` | Empty `div`/`span` — no attrs, no text, ≤1 child | **Evicted first** |

### Expected improvement
With priority-based eviction on a 500-node messy page:
- ~200 `noise` nodes evicted first → clears ~32K chars
- ~100 `low` nodes evicted next → clears ~16K chars
- Remaining ~200 `medium`/`high`/`critical` nodes → ~32K, still over budget
- Evict `medium` wrappers → ~75 meaningful nodes remain at ~12K
- Result: 75 nodes of **signal** vs 75 nodes of **noise** with current approach

## Bounding Box Overhead

Adding `bbox: { x, y, w, h }` (4 integers) per node:
- `"bbox":{"x":120,"y":340,"w":200,"h":32}` ≈ **38 chars**
- At 500 nodes: 500 × 38 = **19,000 extra chars** — exceeds the entire 12K budget alone

**Recommendation: Do NOT include bbox data in the AI prompt by default.**

Instead:
1. Capture bbox in the walker (for spatial reasoning and visibility filtering)
2. Use bbox for local processing: filter `w=0,h=0` nodes as invisible (drop them)
3. Store bbox in `SnapshotResult.metadata` or as a parallel array, NOT in the AI prompt JSON
4. If bbox is needed for AI (future feature): add a `--include-bbox` flag and increase budget to 20K

## Recommendations

### 1. Keep 12K as the default, add a configurable cap
```typescript
const DEFAULT_PROMPT_BUDGET = 12_000; // chars
const MAX_PROMPT_BUDGET = 20_000;     // with bbox enabled
```
The 12K limit maps to ~75 priority-filtered nodes — sufficient for well-structured pages. Messy pages benefit more from QUALITY of selected nodes than quantity.

### 2. Report truncation details in SnapshotMetadata
```typescript
interface SnapshotMetadata {
  totalDomNodes: number;
  capturedNodes: number;      // after walker budget (500)
  promptNodes: number;        // after priority truncation to fit 12K
  droppedFromPrompt: number;  // capturedNodes - promptNodes
  evictedByPriority: Record<'noise'|'low'|'medium', number>;
}
```

### 3. Walker budget can increase to 1000 nodes
With priority eviction, capturing more nodes is fine — they'll be filtered before the prompt. Increase `MAX_NODES` from 500 to 1000 to capture deeper form elements, but the prompt still receives the priority-selected 75-100 best nodes.

### 4. Text truncation stays at 150 chars
At 160 chars/node avg, text is already the largest per-node cost. Reducing to 80 chars would allow ~150 nodes in 12K — worth considering for nodes marked `low`/`noise`.
