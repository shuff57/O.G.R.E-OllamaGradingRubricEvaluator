# Batch Panel UX - Task Learnings

## Task Completed
Converted Grading Instruction Checkboxes to Toggle Buttons in BatchPanel.svelte

## Changes Made

### 1. Removed Boolean State Variables
- Removed: `isNonZeroOnly`, `isLenient`, `isStrict` ($state boolean variables)
- These were replaced with derived state from the textarea content

### 2. Added Derived State
```typescript
let isNonZeroActive = $derived(customInstructions.includes(PRESETS.nonZero));
let isLenientActive = $derived(customInstructions.includes(PRESETS.lenient));
let isStrictActive = $derived(customInstructions.includes(PRESETS.strict));
```
- Uses `$derived` to track if preset text is present in `customInstructions`
- No separate state variables needed - reactive to textarea content

### 3. Added Toggle Handler
```typescript
function togglePreset(key: 'nonZero' | 'lenient' | 'strict') {
  const text = PRESETS[key];
  if (customInstructions.includes(text)) {
    customInstructions = customInstructions.replace(text, '').replace(/\n{3,}/g, '\n\n').trim();
  } else {
    customInstructions = customInstructions.trim()
      ? customInstructions.trim() + '\n\n' + text
      : text;
  }
}
```
- Appends preset text when clicked (if not present)
- Removes preset text when clicked again (if present)
- Normalizes multiple newlines to double newlines

### 4. Replaced Checkbox Markup with Toggle Buttons
- Three `<button class="btn-preset">` elements replaced checkbox inputs
- Buttons show active state via `class:active={isNonZeroActive}` etc.
- Button click calls `togglePreset('nonZero')` etc.
- Disabled during batch running

### 5. Updated handleContinueGrading()
- Removed separate boolean preset checks
- Now reads ONLY from `customInstructions` textarea
- Preset texts are already included in the textarea when toggled on

### 6. Removed Unused CSS
- Removed `.preset-checkboxes` and `.preset-label` CSS rules
- These were no longer needed after conversion

## Key Insights
- The `.btn-preset` CSS class already existed but was unused - reused it
- Using `$derived` is cleaner than maintaining separate $state for toggle tracking
- The toggle logic handles edge cases: empty textarea, multiple presets active
- The approach ensures multiple buttons can be active simultaneously (not mutually exclusive)

## Verification
- Build passed: `npm run build` in ogre-desktop/ completed successfully
- Only one file modified: `ogre-desktop/src/components/grading/BatchPanel.svelte`

## Date
2026-02-22



---

## Task Completed
Auto-Extract Rubric on Page Load

## Changes Made

### 1. Updated Imports from batch-grader.ts
Added three standalone functions to the import:
```typescript
import {
  BatchGrader,
  DEFAULT_MYOPENMATH_PROFILE,
  CANVAS_SPEEDGRADER_PROFILE,
  BUILT_IN_PROFILES,
  detectProfile,
  extractRubric,
  extractPageContent,
  isRubricSufficient,
} from '../../lib/batch-grader';
```

### 2. Added autoExtractRubric() Async Function
```typescript
async function autoExtractRubric() {
  // Guard: don't extract if batch is active or library rubric is selected
  if (batchPhase !== 'idle') return;
  if (sourceRubricId !== null) return;

  try {
    const rubric = await extractRubric(activeProfile.selectors);
    if (extractionCancelled) return;
    if (isRubricSufficient(rubric)) {
      extractedRubric = rubric;
      rubricText = formatRubricForDisplay(rubric);
      rubricMaxScore = rubric.maxScore || '10';
      essayPrompt = rubric.essayPrompt || '';
    } else {
      // Rubric not sufficient — try fallback page content extraction
      const pageContent = await extractPageContent();
      if (pageContent.content) {
        essayPrompt = pageContent.content;
      }
    }
  } catch {
    // Silent failure — try extractPageContent as fallback
    try {
      const pageContent = await extractPageContent();
      if (pageContent.content) {
        essayPrompt = pageContent.content;
      }
    } catch {
      // Completely silent — nothing to extract
    }
  }
}
```
- Uses standalone `extractRubric()` directly (not BatchGrader instance)
- Checks `isRubricSufficient()` before populating rubric fields
- Falls back to `extractPageContent()` for non-grading pages
- Completely silent on failure - no errors shown

### 3. Added $effect for Auto-Extraction
```typescript
// Effect: auto-extract when profile is detected
$effect(() => {
  const profile = detectedProfile;
  const url = currentPageUrl;
  if (!profile || !url) return;
  if (batchPhase !== 'idle') return;
  if (sourceRubricId !== null) return;
  autoExtractRubric();
});
```
- Triggers when profile is detected AND page URL is available
- Guards: skips if batch active or library rubric selected
- Reuses existing `detectedProfile` and `currentPageUrl` state variables

## Key Insights
- Uses standalone `extractRubric()` directly instead of creating a BatchGrader instance
- The `extractionCancelled` flag from Task 2 is used to abort if user cancels
- Silent failure ensures non-grading pages don't show errors
- Effect runs after `doRefreshPageData()` sets `detectedProfile` and `currentPageUrl`
- Uses existing `formatRubricForDisplay()` helper function already in the file

## Verification
- Build passed: `npm run build` in ogre-desktop/ completed successfully
- Only one file modified: `ogre-desktop/src/components/grading/BatchPanel.svelte`

## Date
2026-02-22