# Learnings: fix-add-item-dropdown

## Task 1: DOM Inspection (2026-03-02)

### Key Discovery: The select element IS visible
- `#addtype0-t` exists, is `display: inline-block`, `visibility: visible`, 122×17px
- CDP `DOM.getBoxModel` SUCCEEDS on the `<select>` element
- The `-32000` error is NOT caused by a hidden select

### Root Cause Hypothesis
The error likely comes from Playwright internally targeting `<option>` elements inside native `<select>`, which do NOT have independent layout objects in the browser rendering tree. Native `<option>` elements are rendered by the browser's widget system, not as layout boxes.

### Critical Pattern: Block IDs
- Documented: `addtype0-1-t` (sequential block numbering)
- Actual: `addtype0-6-t` (dash-separated, non-sequential)
- Pattern: `addtype{block}-{subblock}-{position}` where position is `t` (top) or `b` (bottom)
- The skill file's documented IDs don't match reality — IDs depend on actual block structure

### additem() Function
```javascript
function additem(blk,tb) {
    var type = document.getElementById('addtype'+blk+'-'+tb).value;
    if (tb=='BB' || tb=='LB') { tb = 'b';}
    if (type!='') {
        var toopen = 'https://www.myopenmath.com/course/add' + type + '.php?block='+blk+'&tb='+tb+'&cid=301265';
        window.location = toopen;
    }
}
```
- Uses `window.location = url` for navigation (full-page nav, not AJAX)
- Reads value from the select, constructs URL, navigates
- onchange handler: `onchange="additem('0','t')"`

### Select Options (9 total)
| Value | Text |
|-------|------|
| (empty) | Add An Item... |
| assessment2 | Add Assessment |
| inlinetext | Add Inline Text |
| linkedtext | Add Link |
| forum | Add Forum |
| wiki | Add Wiki |
| drillassess | Add Drill |
| block | Add Block |
| calendar | Add Calendar |

### Fix Strategies (ranked)
1. **Best**: `page.evaluate(() => { el.value = type; additem(blk, tb); })` — uses page's own JS
2. **Simplest**: `page.goto(constructedUrl)` — skip dropdown entirely
3. **Fallback**: Try `selectOption()`, catch -32000, fall back to #1

### Tool Access Pattern
- Playwriter CLI sessions don't persist (extension not connected)
- Playwright MCP has separate browser (no user cookies)
- **Working approach**: Raw CDP via WebSocket to user's Chrome (port 9222)
- Chrome debug targets: `curl http://127.0.0.1:9222/json`

---

## Session 2 Additions (2026-03-02): Block Interaction & Playwriter

### Playwriter Version Mismatch
Global `playwriter` CLI may be an older version than the Chrome extension. Mismatched versions cause relay restarts and session drops. Always use:
```bash
npx playwriter@latest
```

### Block Dual-ID System
MOM blocks have two separate identifiers:
1. **`bid`** — numeric DOM ID used in `blockh{bid}` and `addtype0-{bid}-t` select IDs
2. **`path`** — hierarchical position string (e.g., `0-1`) used in URL params: `id=`, `copyid=`, `folder=`

Extract both from `toggleblock` onclick attribute:
```javascript
const m = onclick.match(/toggleblock\(event,'(\d+)','([^']+)'\)/);
// m[1] = bid (numeric), m[2] = path (hierarchical)
```

### Options Trigger is `<a role="button">`, Not `<button>`
Target with:
```javascript
page.getByRole('button', { name: 'Options for {BlockName}' })
```
`dropdownMenuCtrl*` IDs repeat across nested blocks — never use them to target a specific block.

### No "Hide" in Options Dropdown
Hiding a block is done via Modify page, NOT the Options dropdown:
```
addblock.php?cid={cid}&id={path}
```
Navigate there → select Hidden radio → submit.

### Hidden State Detection
- Anchor wrapped in `<b><i>...</i></b>` = hidden (visible = `<b>...</b>` only, no `<i>`)
- `<span class="instrdates">` contains `<i>Hidden</i>` when hidden

### Live Test (cid=301265)
- Created TEST SECTION block → `blockh24`, path `0-1`
- Successfully hid it via `addblock.php?cid=301265&id=0-1`
- TEST SECTION block still exists on the course page (needs cleanup)
