---
name: mom-frq
description: Use when writing or rewriting MyOpenMath free-response questions, creating IMathAS PHP question code, or authoring essay-type or multipart assessment items from a topic description.
---

# MOM Free-Response Questions

> This skill guides writing of MyOpenMath (IMathAS) question code. It covers question type selection, PHP variable setup, scoring method selection, rubric design, and feedback configuration. Output is production-ready PHP for use in the MOM question editor.

## Prerequisites
- Access to MyOpenMath question editor
- Understanding of the topic and desired question type
- `mom-style-guide` skill for style and quality rules

## When to Use
- Writing a new free-response or essay question from a topic description
- Rewriting an existing question to add randomization or improve structure
- Authoring multipart questions combining number, function, essay, or file types
- Creating rubric-scored essay questions with `essayrubric` scoring

## When NOT to Use
- Auto-generated multiple-choice only questions → use standard MOM question types directly
- Simple numeric answer questions with no randomization → can write directly without the skill
- When research on existing patterns is needed first → use `mom-fact-finder` and `mom-patterns` first

## Guardrails

> ⚠️ **Must NOT:**
> - Use em dashes (—) in question text — not supported in MOM rendering
> - Use `$$` LaTeX delimiters — MOM uses `\(` and `\)` for inline math
> - Reference exact answer values or formulas directly in `$qtext` (students could inspect source)
> - Skip `loadlibrary()` call when using subject-specific functions (undefined function errors)
> - Hardcode scoring method without checking if rubric grading is needed

## Quick Start
1. Identify question type (see Section 1 of references/php-patterns.md)
2. Set `$scoremethod`, `$anstypes`, `$displayformat` for each part
3. Build `$qtext` with `\(` math delimiters and `$a`, `$b` randomization variables
4. Test in MOM editor with "Preview"

## Workflow

### Phase 1: Question Design
- **INPUT**: Topic description, desired format (essay / multipart / number)
- **ACTION**: Choose question type; identify randomization opportunities; select scoring method
- **OUTPUT**: Design spec: type, scoring method, variables needed

**Scoring Method Quick Reference:**
| Method | Use When |
|--------|---------|
| `takeanything` | Essay graded by teacher (any answer accepted) |
| `essayrubric` | Essay with auto-generated rubric display |
| `singlescore` | Multipart where all parts must be correct for any credit |

### Phase 2: Variable Setup
- **INPUT**: Design spec
- **ACTION**: Declare randomization variables; set up `$anstypes`, `$scoremethod`, `$displayformat`
- **OUTPUT**: PHP variable block

```php
// Randomized coefficients
$a = rand(2,8);
$b = rand(1,5);
$c = rrand(1,8,2);  // random with 2 decimal places

// Essay question setup
$anstypes = array("essay");
$displayformat[0] = "editornopaste";
$scoremethod[0] = "takeanything";   // teacher grades

// Multipart: number + essay
$anstypes = array("number","essay");
$scoremethod[0] = "";               // auto-grade number
$scoremethod[1] = "takeanything";   // teacher grades essay
$displayformat[1] = "editornopaste";
```

### Phase 3: Build Question Text
- **INPUT**: Variables declared; scoring setup done
- **ACTION**: Write `$qtext` with HTML + LaTeX math; reference randomized variables
- **OUTPUT**: Complete `$qtext` string

```php
$qtext = "A car travels at \($a\) mph for \($b\) hours.
<br><br>
(a) How far does it travel? <br>
<br>
(b) Explain in your own words what the distance formula means.";
```

### Phase 4: Library and Feedback
- **INPUT**: Subject domain (algebra, calculus, stats, etc.)
- **ACTION**: Add `loadlibrary()` if using subject functions; add `getfeedbacktxtessay()` for essay prompts
- **OUTPUT**: Complete question code

```php
loadlibrary("statistics");   // for stats functions like normalcdf()

// Essay feedback helper
$qtext .= getfeedbacktxtessay("Show all your work");
```

## Error Handling

| Problem | Action |
|---------|--------|
| "Undefined function" error | Add `loadlibrary("subjectname")` — check `mom-lib-map` for correct library |
| Essay not showing text box | Verify `$displayformat[i] = "editornopaste"` and `$anstypes[i] = "essay"` |
| Rubric not displaying | Add `$scoremethod[0] = "essayrubric"` — requires rubric structure in question |
| Math not rendering | Check for `$$` delimiters — replace with `\(` and `\)` |
| Randomization not working | Verify `rand()` vs `rrand()` — `rrand(1,8,2)` for 2 decimal places |
| File upload not appearing | Set `$answerformat[i] = "images,.pdf"` and `$scoremethod[i] = "takeanything"` |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `$$` for LaTeX | Replace with `\( ... \)` for inline, `\[ ... \]` for display |
| Using em dashes (—) | Use regular hyphen (-) or "to" in question text |
| Forgetting `loadlibrary` | Check `mom-lib-map` for the right library call |
| Hardcoding answer in qtext | Use `$a`, `$b` variables; never expose `$answer` in qtext |
| Wrong index for multipart | $anstypes, $scoremethod, $displayformat are 0-indexed arrays |
| `singlescore` for multipart | Only use if you want all-or-nothing grading; usually omit for partial credit |

## Selectors / References
- Full PHP syntax reference: `references/php-patterns.md`
- Library functions by subject: load `mom-lib-map` skill
- Existing patterns: load `mom-patterns` skill
- Style rules: load `mom-style-guide` skill
