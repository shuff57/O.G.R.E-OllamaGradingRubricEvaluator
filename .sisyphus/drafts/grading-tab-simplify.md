# Draft: Simplify Grading Tab Single/Batch Toggle

## Requirements (confirmed)
- Batch mode is the default (was: `graderSubMode = $state('single')`)
- A toggle switches to "single student mode"
- When single mode is active, show a text box to enter the student name
- The toggle should feel like a simple option/override, not equal peers

## Current Implementation (from code)
- **File**: `ogre-desktop/src/pages/GradingPanel.svelte` (line 32)
  - `let graderSubMode = $state('single');` — default is currently SINGLE
  - Sub-mode toggle is a pill-style dual-button (Single | Batch) at lines 444–460
  - Toggles between `StudentWorkCard` (single) and `BatchPanel` (batch)
- **Single mode** (`StudentWorkCard`): No student name field currently — student work is manually pasted in a textarea
- **Batch mode** (`BatchPanel`): Reads all students from the page via CDP

## What Needs to Change
1. `graderSubMode` default → `'batch'`
2. Replace the big pill toggle with a subtle checkbox/toggle labeled "Single student mode"
3. When single mode is ON: show a text input for student name below the toggle
4. StudentWorkCard currently has no `studentName` prop — this is a new addition

## Open Questions
- Should the student name text box be passed to `StudentWorkCard` to include in the grading prompt?
- Where should the name appear? In the prompt to the AI, or just as a label in the results display?
- Should the name persist (saved in state between uses) or reset each time?

## Scope Boundaries
- INCLUDE: GradingPanel.svelte toggle change + StudentWorkCard name prop
- EXCLUDE: Batch pipeline changes, rubric logic, provider selector, any server-side changes
