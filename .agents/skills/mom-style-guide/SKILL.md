---
name: mom-style-guide
description: Use when authoring or reviewing MyOpenMath questions and you need the repository's house style for voice, rubric design, randomization, default question types, formatting, naming, and prohibited patterns.
---

# MOM Style Guide

> This is the design-philosophy companion for MyOpenMath question writing. It preserves the WHY behind O.G.R.E.'s MOM conventions: voice, rubric design, randomization, layout, naming, and safety rules. It is not a syntax reference, not a workflow guide, not a macro lookup, and not a browser workflow.

## Prerequisites
- A MOM question topic, prompt, or draft to evaluate
- Access to the relevant companion skill when syntax or workflow details are needed
- Permission to ask follow-up questions instead of improvising when a convention is unclear

## When to Use
- Writing a new MyOpenMath question and you need the repository's house style
- Reviewing a draft MOM question that feels too textbook, too brittle, too generic, or too AI-written
- Choosing between auto-graded vs. essay defaults, rubric structure, or randomization strategy
- Checking student-facing layout, naming, or visual consistency before finalizing a MOM item

## When NOT to Use
- You need exact MOM syntax, macros, answer-type scaffolds, or randomizer signatures, use `mom-frq`
- You need browser automation, DOM selectors, or MOM page navigation, use `mom-page-map`
- You need the specialized matrix inverse workflow/template, use `mom-matrix-inverse`

## Guardrails

> ⚠️ **Must NOT:**
> - Turn this guide into a syntax reference or substitute it for `mom-frq`
> - Default to essay/FRQ unless the user explicitly asks for open-ended written response
> - Hardcode scenario text, numerical values, dataset values, or answers that appear in the question
> - Reveal the correct answer inside the student rubric or student-facing checklist
> - Invent MOM functions or use standard PHP tags/functions in MOM pseudo-PHP
> - Use em dashes, stiff academic prose, or obvious AI filler language
> - Add features, abstractions, or files that the task did not request
> - Ignore the established template for the question type being written

## Quick Start
1. Pick the default question type from this guide before drafting.
2. Apply the voice, rubric, randomization, formatting, naming, and safety rules below.
3. If implementation syntax is needed, keep this guide loaded and consult `mom-frq` for the HOW.

## Companion References

| Companion | Role | Use it for |
|-----------|------|------------|
| `mom-frq` reference material | Reference | Syntax, answer types, libraries, macros, templates, randomizer signatures, rubric HTML implementation |
| `mom-frq` workflow | Workflow | Authoring process, output structure, and question-production steps |
| `mom-matrix-inverse` | Workflow | Matrix question template and solution guide |
| `mom-page-map` | Navigation | Browser automation, DOM selectors, MOM URLs |
| `mom-style-guide` | Philosophy | Voice, rubric design, randomization strategy, layout, naming, guardrails |

This guide sets the WHY. Companion skills set the HOW.

## Workflow

### Phase 1: Scope the question
- **INPUT:** Topic, user request, and any existing draft
- **ACTION:** Decide whether the task needs philosophy/style guidance here or syntax/workflow support from a companion skill
- **OUTPUT:** Clear split between conventions to apply now and companion references to consult separately

### Phase 2: Apply house style
- **INPUT:** Question prompt, rubric plan, randomized context, and student-facing layout
- **ACTION:** Apply the question style, vocabulary, quality criteria, formatting, naming, and prohibited-pattern rules from this guide
- **OUTPUT:** A draft that matches MOM house style without leaking answers or inventing unsupported behavior

### Phase 3: Review before handoff
- **INPUT:** Final question draft
- **ACTION:** Check defaults, randomization, rubric neutrality, visual consistency, and prohibited patterns; ask instead of improvising if any convention is uncertain
- **OUTPUT:** A style-compliant draft ready for implementation or review

## Question Style

Core principle: write like a friendly, warm, concise instructor talking to students they respect. Think conversational, not textbook. Students are people, not assessment subjects.

- Use second-person prompts: `Explain in your own words...`, not `Students should explain...`
- Write rubric items as action verbs: `Describe the method`, `Identify the population`, not outcome-spoiling directions
- Make model narratives instructor-quality but approachable, and keep them to 2-5 sentences
- Use `<b>bold</b>` for key concepts inside model narratives
- Never use em dashes; use commas, periods, semicolons, or restructure instead
- Avoid hedging such as `It is important to note that...`; just say the thing
- Vary sentence length and structure so the writing does not sound templated
- Skip stiff academic register; prefer `this question asks students to...` over `the pedagogical objective of this assessment item is...`
- Do not force identical rubric structures across categories; if one category needs 2 items and another needs 3, that is fine

## Vocabulary Conventions

- Student-facing rubric items must be neutral and descriptive, not answer-revealing
- Prefer plain, high-school-friendly language over formal jargon when both are accurate
- Use direct verbs such as `describe`, `identify`, `compare`, `justify`, and `explain`
- Keep teacher-facing targets specific and concrete, including exact correct answers in quotes when grading needs them
- When randomized context changes the target, interpolate `$variables` instead of hardcoding prose

## Quality Criteria

### Rubric design philosophy
- Default to **10 points total** unless the user explicitly requests another total
- Aim for **2-4 rubric categories** based on distinct conceptual components; exceed 4 only when the question truly has 5+ distinct concepts
- Give each category **1-3 checklist items** based on complexity, not symmetry
- Distribute points by conceptual weight, not evenly
- Student rubric items stay neutral; instructor targets must be specific
- Model narrative variables use the `$r_` prefix, one per rubric category, then combine into `$sample_narrative`

Does NOT cover the exact rubric HTML implementation pattern. Use `mom-frq` for the HOW.

### What makes a good MOM question
- The question type matches the learning goal and defaults to auto-graded unless prose reasoning is explicitly required
- Randomization creates meaningfully different scenarios, not superficial number swaps
- The rubric separates conceptual components cleanly and awards weight based on mathematical importance
- The student-facing prompt is concise, respectful, and easy to parse
- The implementation uses MOM-safe constructs instead of improvised PHP or invented helpers

## Randomization Strategy

Choose the pattern that matches the question type.

### FRQ / essay questions
- Use a minimum of **3 meaningfully different context scenarios**
- Store contexts in a `$contexts` array and pick one with a random index
- If you use parallel arrays, index all of them with the same random variable
- Contexts must differ in scenario, not just in numbers

### Algorithm-based questions
- Use MOM's built-in randomizer functions instead of hardcoded values
- For matrix questions, use **construct-from-solution**: generate the answer matrix first, then derive the question from it
- This construct-from-solution pattern guarantees clean arithmetic and whole-number solutions for matrix questions

### Never hardcode
- Scenario text
- Numerical values
- Dataset values
- Any answer that appears in the question

Does NOT cover randomizer function signatures. Use `mom-frq` reference material for exact syntax.

## Default Question Types

Always default to auto-graded question types. Use essay/FRQ only when explicitly requested.

| Scenario | Default type |
|----------|--------------|
| Numeric answer (exact value) | `number` or `calculated` in a multipart |
| Choose from options | `choices` with `$displayformat[n] = "select"` |
| Multiple distinct sub-questions | `multipart` combining `number` + `choices` |
| Open-ended written response | `essay`, only when the user explicitly asks for FRQ |

**Why:** O.G.R.E. uses these questions to assess understanding, not to collect essays by default. Auto-graded types give fast feedback, reduce ambiguity, and avoid unnecessary AI grading.

**Multipart implication:** Mixed multipart items should declare the answer-type mix with `$anstypes = array(...)` and use `$displayformat[n] = "select"` for dropdown rendering. Use `mom-frq` for the exact syntax scaffold.

## Formatting Rules

### Student-facing explanation and narrative formatting
- Student-facing text uses `font-family:Arial`
- Question text uses `font-size:medium; line-height:1.6`
- Model narratives stay readable, concise, and use `<b>bold</b>` only for key concepts

### Visual consistency palette

Sourced from Khan Academy (Perseus design system), Brilliant.org, and Desmos.

| Color | Purpose |
|-------|---------|
| `#1865f2` | Primary accent, badge background, callout border, interactive elements |
| `#21242c` | Body text |
| `#374151` | Secondary text |
| `#f7f9fa` | Table header background |
| `#dee1e3` | Table header bottom border (2px), row separator |
| `#e5e7eb` | Card border, column separators |
| `#f0f7ff` | Instruction callout background |
| `#f0f4ff` | Collapsible summary background |
| `#fafafa` | Content area background inside collapsibles |
| `#e8f5e9` | Correct answer highlight, model response area |
| `#4CAF50` | Accent bar border, highlight border |
| `#fff9ea` | Alternating row tint in rubric tables |
| `#ccc` | General borders, separators |
| `#2E7D32` | `Model Narrative Response` label text |

### Multipart card-per-part layout
- Use the card-per-part layout for all multipart auto-graded questions
- Each sub-part gets its own white card; never use bare `<p>` tags with bold `a.` labels
- **Outer wrapper:** `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:16px; line-height:1.6; color:#21242c; max-width:688px` — 688px matches the reading width used by Khan Academy
- **Data table wrapper:** `<div style="border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.08),0 2px 4px -2px rgba(0,0,0,0.05);border:1px solid #e5e7eb;display:inline-block;">`
- **Header row:** `background:#f7f9fa; font-weight:600; color:#21242c; border-bottom:2px solid #dee1e3`
- **Column cells:** `border-left:1px solid #e5e7eb`
- Never use the `border="1"` table attribute
- **Instruction callout** is optional and defaults to omitted; before including it, ask exactly: `Include an instruction hint? (default: no)`
- **Instruction callout style:** `background:#f0f7ff; border-left:4px solid #1865f2; padding:10px 16px; border-radius:0 8px 8px 0`
- The 4px instruction-callout border is the Khan Academy pattern
- **Part cards:** `background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:20px; margin:10px 0; box-shadow:0 4px 6px -1px rgba(0,0,0,0.07),0 2px 4px -2px rgba(0,0,0,0.04)` — dual-layer shadow gives depth without heaviness
- **Part label chips:** `display:inline-block; background:#e8f0fe; color:#1865f2; border-radius:6px; padding:3px 10px; font-size:13px; font-weight:700; margin-right:10px; vertical-align:middle`
- Use rounded rectangle chips, not filled circles and not `border-radius:50%`
- Wrap every `$answerbox[n]` as `<div style="margin-top:12px;text-align:center;">$answerbox[n]</div>`
- Never place a bare `<br>` before the answer box

### Layout and code-format conventions
- Rubric tables use `border-radius:8px` and `border-collapse:separate`
- FRQ questions use `$css_block`; use `mom-frq` for the full implementation pattern
- Matrix solution guides use inline CSS with the same palette and do not use `$css_block`
- Multipart questions use the card-per-part layout and do not need `$css_block`
- MOM code stays in pseudo-PHP only, without `<?php ?>`, `echo`, `print`, `function`, or `class`

## Naming Conventions

### Files
- FRQ: `q{N}-{kebab-slug}.php`, where `N` matches the manifest entry number
- Matrix: `matrix-{2x2|3x3}-{rref|equation|inverse-equation}.php`
- Draw: `{kebab-description}.php`

### Common Control variables
- `$r_` prefix for narrative model-answer components, one per rubric category
- `$sample_narrative` for the composed model response string
- `$contexts` or `$topic` for randomized scenario arrays
- `$i` for the scenario index: `rand(0, count($contexts)-1)`
- Parallel arrays use descriptive names such as `$populations` or `$claimed_values`

### Comment markers
- Major sections: `// === SECTION NAME ===`
- Numbered subsections in Common Control: `/* ---------- N. Subsection Name ---------- */`
- File header: `// === NAME - DESCRIPTION: Title - Short description. ===`

## Prohibited Patterns

- No em dashes anywhere in generated text or code
- No AI-sounding filler such as `It's worth noting that...`, `Leveraging the concept of...`, or `This approach ensures that...`
- No stiff academic phrasing that treats students like assessment subjects
- No invented MOM functions; if unsure a function exists, check `mom-frq` before using it
- No standard PHP functions such as `array_rand`, `number_format`, or `shuffle`; use MOM equivalents
- No student rubric that contains model answers or answer-revealing phrasing
- No extra helper abstractions that make the question harder to read without adding clarity
- No unrequested features or files

## Error Handling

| Problem | Action |
|---------|--------|
| Need exact syntax, macro signatures, or rubric HTML | Keep this guide loaded, then consult `mom-frq` instead of improvising |
| Unsure whether a MOM function exists | Check `mom-frq` before writing it; never invent a function |
| User asks for a written-response topic without specifying type | Default to auto-graded unless they explicitly request essay/FRQ |
| Draft feels generic, stiff, or AI-written | Rewrite using the Question Style and Vocabulary Conventions sections |
| Randomization only changes numbers | Redesign contexts so the scenarios are meaningfully different |
| Unsure whether a layout convention applies | Choose the stricter convention or ask the user rather than guessing |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Writing student rubric items as answer keys | Rewrite them as neutral prompts such as `Describe...` or `Identify...` |
| Using essay by default for any open-ended prompt | Use `number`, `calculated`, `choices`, or `multipart` unless essay is explicitly requested |
| Hardcoding values into the question text | Replace them with MOM randomization and shared indices for parallel arrays |
| Using bare `<p>` labels or bare `<br>` before `$answerbox[n]` | Use the card-per-part layout and centered answer-box wrapper |
| Making every rubric category structurally identical | Let conceptual complexity determine category size and point weight |
| Using standard PHP habits in MOM code | Stay within MOM pseudo-PHP and MOM-specific function patterns |
