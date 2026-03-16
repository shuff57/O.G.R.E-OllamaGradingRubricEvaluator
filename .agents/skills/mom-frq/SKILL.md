---
name: mom-frq
description: Use when writing or rewriting MyOpenMath free-response, essay, or multipart PHP/IMathAS questions, especially when the task needs `loadlibrary()` guidance, FRQ rubric patterns, randomized context generation, qtext HTML construction, or safe essay scoring setup.
---

# MyOpenMath FRQ Authoring

> Write MyOpenMath free-response questions in real PHP/IMathAS syntax, not generic pseudocode. This skill helps with essay-only FRQs, multipart questions that include essay parts, rubric/model-response construction, and the supporting randomization/library patterns needed to make those questions production-ready.

## Overview
- Target platform: MyOpenMath / IMathAS question code
- Primary output: a runnable Common Control + Question Text pattern for FRQ or multipart assessment items
- Safety goal: preserve exact MOM syntax (`$anstypes`, `$displayformat`, `$scoremethod`, `loadlibrary()`, `$questiontext`) and avoid brittle pseudo-PHP

## Prerequisites
- The prompt, topic, or standard the question should assess
- Permission to author PHP/IMathAS question code
- Access to any needed subject library names (`stats`, `matrix`, `polys`, etc.)
- A willingness to keep student-facing rubric text separate from instructor-only model answers

## When to Use
- User asks for a MyOpenMath FRQ, essay question, or written-response item
- User needs PHP/IMathAS code for a MOM free-response prompt
- User wants a multipart question with an essay part, file upload, or manual grading flow
- User needs help choosing between `takeanything`, `essayrubric`, and `singlescore`
- User needs `loadlibrary()` guidance, randomized contexts, or HTML `$questiontext` construction

## When NOT to Use
- The task is a normal browser-grading workflow rather than authoring MOM code
- The task is pure fact lookup about existing MOM questions; use `mom-fact-finder`
- The task is a subject-content explainer rather than question authoring; use the appropriate `mom-lib-map` skill/reference
- The user only needs a short math explanation with no PHP/IMathAS output

## Guardrails

> ⚠️ **Must NOT:**
> - Never replace real MyOpenMath syntax with generic pseudocode or another language.
> - Never use `$displayformat[0] = "editor"` for essay FRQs; use `"editornopaste"`.
> - Never put model answers in the student-facing rubric block.
> - Never claim a question is auto-graded if it uses essay/manual-grading patterns.
> - Never skip `loadlibrary()` when the code relies on library-only helpers.
> - Never invent unsupported score methods or feedback helpers; keep to verified patterns.
> - Never bury multipart part indices; make per-part `$anstypes`, `$answer`, `$scoremethod`, and `$answerformat` explicit.

## Quick Start
1. Choose essay-only, multipart-with-essay, or multipart-with-file structure.
2. Pick the scoring pattern: `takeanything`, `essayrubric`, or `singlescore`.
3. Build randomized variables, then assemble `$questiontext`, `$rubricbutton`, and instructor-only output.

## Workflow

### Phase 1: Pick the FRQ structure
- **INPUT:** Topic, grading expectations, whether the prompt needs writing only or mixed answer types
- **ACTION:** Choose one of these verified structures:

| Structure | Use when | Core setup |
|-----------|----------|------------|
| Essay only | One written explanation or justification | `$anstypes = array("essay"); $displayformat[0] = "editornopaste";` |
| Multipart with essay | Question mixes numeric/matrix work and written justification | `$anstypes = array("number","essay")` or similar |
| Multipart with file upload | Student submits supporting work image/PDF in addition to a scored response | `$anstypes = array("matrix","file")` plus file part rules |

- **OUTPUT:** Chosen part structure with answer types and part indices locked in

### Phase 2: Choose the scoring method deliberately
- **INPUT:** Whether MOM should auto-score, rubric-score, or simply accept manual grading
- **ACTION:** Use the verified score-method decision rules below.

| Pattern | Use when | Verified syntax |
|---------|----------|-----------------|
| Manual FRQ default | Most essay prompts; teacher grades later | `$scoremethod = "takeanything"` or `$scoremethod[0] = "takeanything"` |
| Rubric-scored essay | Prompt includes explicit checklist/point categories in qtext | `$scoremethod[0] = "essayrubric"` |
| Multipart single total | One essay part belongs to a larger multi-part item with one combined score | `$scoremethod = "singlescore"` |

- Use `getfeedbacktxtessay($stuanswers[$thisq], "...")` when the prompt should give post-submission essay feedback.
- Keep file-upload parts ungraded unless the user explicitly wants something else:

```php
$anstypes = array("matrix","file");
$scoremethod[1] = "takeanything";
$answerformat[1] = "images,.pdf";
```

- **OUTPUT:** A scoring choice that matches the real grading model

### Phase 3: Load libraries and randomize safely
- **INPUT:** Subject area, desired variability, clean-answer constraints
- **ACTION:**
  - Add `loadlibrary("...")` only when using library-specific helpers.
  - Use always-available randomizers first; add `where (...)` constraints to protect quality.
  - Prefer generating a known clean solution first, then deriving the prompt from it.

Core patterns to preserve:

```php
loadlibrary("stats");
loadlibrary("matrix");
loadlibrary("stats,matrix");

$a = rand(1,9);
$x0,$y0 = nonzerodiffrands(-4,4,2);
$contexts = array("scenario A","scenario B","scenario C");
$i = rand(0, count($contexts)-1);
$topic = $contexts[$i];

$a,$b = diffrands(-5,5,2) where ($a+$b != 0);
$p = rrand(0.2,0.8,0.05);
```

- If a `where` condition is too restrictive, loosen it or add an `else` fallback so generation does not fail.
- **OUTPUT:** Stable randomized variables plus any needed `loadlibrary()` declarations

### Phase 4: Build qtext and rubric HTML
- **INPUT:** Prompt text, randomized values, grading expectations, optional model response
- **ACTION:**
  - Build `$questiontext` as HTML, usually with `<div>`, `<p>`, `<ul>`, `<table>`, and interpolated values.
  - Keep student-facing rubric UI in `$rubricbutton`.
  - Keep instructor-only rubric targets and model response in `$rubricanswerbutton`.
  - End the Common Control output in the verified IMathAS order.

Minimal essay scaffold:

```php
$anstypes = array("essay");
$displayformat[0] = "editornopaste";

$rubricbutton = '<div class="rubric-container">Student checklist only</div>';
$rubricanswerbutton = '<div class="rubric-container">Instructor rubric with targets</div>';

$questiontext = '<div style="font-family:Arial;font-size:medium;line-height:1.6;">'
  . '<p>Scenario: '.$topic.'</p>'
  . '<p><b>Essay Prompt:</b><br>Explain your reasoning.</p>'
  . $rubricbutton
  . '</div>';

// $questiontext
// $answerbox[0]
// ///
// $rubricanswerbutton
```

- For variable injection inside HTML strings, use concatenation or careful interpolation; watch negative-number cases like `"($a)^2"`.
- **OUTPUT:** Runnable `$questiontext` block plus student/instructor rubric separation

### Phase 5: Handle multipart questions explicitly
- **INPUT:** Multiple parts, potentially mixed answer types, possibly a single final score
- **ACTION:**
  - Declare every part in `$anstypes`.
  - Set part-specific answers, formats, and score methods by index.
  - Reference the matching answer boxes in order.

Verified multipart pattern:

```php
$anstypes = array("number","essay","file");
$answer[0] = 42;
$displayformat[1] = "editornopaste";
$scoremethod[1] = "takeanything";
$scoremethod[2] = "takeanything";
$answerformat[2] = "images,.pdf";

$questiontext = 'Part (a): '.$answerbox[0].'<br><br>'
  . 'Part (b): '.$answerbox[1].'<br><br>'
  . 'Upload work: '.$answerbox[2];
```

- Use `$scoremethod = "singlescore"` when the multipart item should receive one combined score instead of independent part scores.
- **OUTPUT:** An index-safe multipart FRQ pattern

### Phase 6: Add feedback and instructor guidance
- **INPUT:** Whether students should see a follow-up explanation after submission
- **ACTION:**
  - Use `getfeedbacktxtessay()` only for essay-response feedback after submission.
  - Keep the feedback instructional, not punitive.
  - If the prompt is purely manually graded, make that explicit in the surrounding setup.

Verified pattern:

```php
$scoremethod = "takeanything";
$hidetips = true;
$fb = getfeedbacktxtessay($stuanswers[$thisq],"Answers will vary. Here are a few possible reasons:<ul><li>Reason 1</li><li>Reason 2</li></ul>");
```

- **OUTPUT:** Optional essay feedback block aligned to MOM manual-grading behavior

### Phase 7: Final QA before delivering code
- **INPUT:** Draft MOM PHP/IMathAS question
- **ACTION:** Verify each item before handing it off:
  - Correct `loadlibrary()` declarations
  - Correct `$anstypes` length and part indices
  - Essay parts use `$displayformat[part] = "editornopaste"`
  - Student rubric and instructor rubric are separated
  - `$questiontext` references the right `$answerbox[...]` values
  - Score methods match actual grading intent
  - Any matrix/file multipart parts include `answersize` / `answerformat` as needed
- **OUTPUT:** A deliverable MOM code block with fewer hidden grading/setup errors

## Error Handling

| Problem | Action |
|---------|--------|
| Essay editor allows paste | Replace `"editor"` with `$displayformat[0] = "editornopaste"`. |
| Stats/matrix helper is undefined | Add the correct `loadlibrary("stats")`, `loadlibrary("matrix")`, or combined call. |
| Randomizer keeps failing | Relax the `where (...)` condition or add an `else` fallback. |
| Multipart part writes to wrong answer box | Re-check `$anstypes` order and match each prompt fragment to `$answerbox[index]`. |
| Rubric reveals answers to students | Move model targets out of `$rubricbutton` and into `$rubricanswerbutton`. |
| File upload part is being graded like math | Set that part to `$scoremethod[i] = "takeanything"` and restrict `answerformat` appropriately. |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using generic PHP pseudocode instead of MOM syntax | Keep real IMathAS variables and output markers exactly as MOM expects. |
| Forgetting `editornopaste` for essay inputs | Always set `$displayformat[essayPart] = "editornopaste"`. |
| Choosing `essayrubric` just because the question has a rubric block | Use `essayrubric` only when the scoring model truly follows rubric categories in qtext. |
| Hardcoding one scenario when the prompt should vary | Use arrays plus `rand()`, `rrand()`, or `diffrands()` to rotate contexts and values. |
| Building ugly algebra text like `3+-4` or `1*x` | Use helpers from the reference such as `makepretty()`, `polymakeprettydisp()`, or related format macros. |
| Forgetting instructor-only output at the end | Finish with `// $questiontext`, `// $answerbox[...]`, `// ///`, then `// $rubricanswerbutton`. |

## References
- Core PHP/IMathAS patterns, randomizers, score-method examples, library notes, and worked examples: `references/php-patterns.md`
- Use the reference file when the request needs concrete syntax for `loadlibrary()`, `rand()/rrand()/diffrands()`, matrix construction, statistics helpers, or full FRQ scaffolds.

## Deliverable Shape
- Prefer returning one complete MyOpenMath code block the user can adapt immediately.
- If the task is ambiguous, present:
  1. score-method choice,
  2. library list,
  3. randomized variables,
  4. `$questiontext` / answer-box structure,
  5. instructor rubric or feedback block.
