# MOM Style Guide: Design Philosophy and Conventions

This guide captures the design philosophy behind writing quality MyOpenMath questions. Load it alongside any `mom-*` skill when authoring questions. It explains the WHY behind conventions, while companion skills explain the HOW. This guide is NOT a syntax reference, not a workflow guide, and not a macro lookup. See the relationship table below for what each companion file covers.

---

## Relationship to Existing Skills

| File | Domain | What it covers |
|------|--------|----------------|
| `mom-frq/CLAUDE.md` | Reference | Syntax, answer types, libraries, macros, templates |
| `mom-frq/SKILL.md` | Workflow | Authoring process, batch mode, file output, manifest |
| `mom-matrix-inverse/SKILL.md` | Workflow | Matrix question template and solution guide |
| `mom-page-map/CLAUDE.md` | Navigation | Browser automation, DOM selectors, MOM URLs |
| This guide | Philosophy | Voice, rubric design, randomization strategy, guardrails |

This guide sets the WHY. Companion skills set the HOW.

---

## Voice & Tone

Core principle: write like a friendly, warm, concise instructor talking to students they respect. Think conversational, not textbook. Students are people, not assessment subjects.

**Rules (DO / DON'T):**

- Use second-person prompts: "Explain in your own words..." NOT "Students should explain..."
- Write rubric items as action verbs: "Describe the method", "Identify the population" NOT outcomes like "Take many samples"
- Make model narratives instructor-quality but approachable. Use `<b>bold</b>` for key concepts. Keep it to 2-5 sentences.
- Never use em dashes. Use commas, periods, semicolons, or restructure the sentence instead.
- Avoid hedging language. Don't write "It is important to note that..." Just say the thing.
- Vary sentence length and structure. Don't make every sentence the same length.
- Skip formal academic register. Say "this question asks students to..." instead of "the pedagogical objective of this assessment item is..."
- Avoid repetitive structure in rubric categories. If one category has 2 items and another has 3, that's fine. Don't force identical counts.

---

## Rubric Design Philosophy

- Default to 10 points total. Only override this if the user explicitly requests a different total.
- Aim for 2-4 rubric categories based on how many distinct conceptual components the question has. A simple concept explanation might need 2 categories. A multi-part analysis might need 4. Only exceed 4 if the question genuinely has 5+ distinct concepts.
- Each category gets 1-3 checklist items. Let complexity drive the count. A straightforward category might only need 1 item. A meatier one might need 3.
- Student rubric items must be NEUTRAL. Describe what to address, not the correct answer. "Describe the sampling method" is neutral. "Take many random samples" reveals the answer.
- Instructor targets must be SPECIFIC. State the exact correct answer for grading, in quotes. Interpolate `$variables` when the answer depends on randomized context.
- Distribute points by conceptual weight, not evenly. A category covering 2 steps might be worth 4 points while a simple identification is 2 points.
- Model narrative uses `$r_` prefix variables, one per rubric category. Compose them into `$sample_narrative` with `<b>` bold on key phrases. See `mom-frq/SKILL.md` for the exact pattern.
- Does NOT cover: how to write the rubric HTML code. See `mom-frq/CLAUDE.md` Section 11.

---

## Randomization Strategy

Two patterns, pick based on question type:

**FRQ (essay) questions:** Use minimum 3 meaningfully different context scenarios. Store them in a `$contexts` array and use a random index to pick one. When using parallel arrays, index all of them by the same random variable. Contexts must be genuinely different scenarios, not just different numbers. "Surveying students about study habits" and "counting defective products in a factory" are meaningfully different.

**Algorithm-based questions (matrix, numeric, draw):** Use MOM's built-in randomizer functions rather than hardcoded values. See `mom-frq/CLAUDE.md` Section 4 for the full randomizer reference. For matrix questions specifically, use construct-from-solution: generate the answer matrix first, then derive the question from it. This guarantees clean arithmetic and whole-number solutions.

**Never hardcode** scenario text, numerical values, dataset values, or any answer that appears in the question.

Does NOT cover: randomizer function signatures. See `mom-frq/CLAUDE.md` Section 4.

---

## AI Behavioral Guardrails

Three domains. All apply to every MOM question generation task.

### Structural Guardrails

- Don't add features not explicitly requested
- Don't create files beyond what the task specifies
- Don't over-abstract with helper variables that add complexity without clarity
- Follow the established template for the question type (FRQ scaffold, matrix scaffold)

### Voice Guardrails

- No em dashes anywhere in generated text or code
- No AI-sounding prose. Skip phrases like "It's worth noting that...", "Leveraging the concept of...", "This approach ensures that..."
- No stiff academic phrasing. Students are people, not assessment subjects.
- Vary the structure. Don't produce rubric categories with lockstep identical item counts.

### Safety Guardrails

- Never invent MOM functions. If unsure a function exists, check `mom-frq/CLAUDE.md` first.
- Never use `<?php ?>` tags, `echo`, `print`, `function`, or `class`. MOM is pseudo-PHP only.
- Never use standard PHP functions like `array_rand`, `number_format`, or `shuffle`. Use MOM equivalents.
- Never put model answers in the student rubric (`$rubricbutton`). Keep it to neutral checkboxes only.
- When uncertain about any convention, default to strict. Ask rather than improvise.

---

## Visual Consistency

**Color palette (hex + purpose, NOT CSS code):**

| Color | Purpose |
|-------|---------|
| `#f0f4ff` | Collapsible summary background (matrix solution guides) |
| `#f8f8f8` | Collapsible summary background (FRQ rubrics) |
| `#fafafa` | Content area background inside collapsibles |
| `#e8f5e9` | Correct answer highlight, model response area |
| `#4CAF50` | Accent bar border, highlight border (green) |
| `#fff9ea` | Alternating row tint in rubric tables |
| `#ccc` | Borders, separators |
| `#2E7D32` | "Model Narrative Response" label text (dark green) |

**Typography and layout rules:**

- Font: always `font-family:Arial` for student-facing text
- Question text: `font-size:medium; line-height:1.6`
- Rubric tables: `border-radius:8px`, `border-collapse:separate`
- FRQ questions: use `$css_block` (see `mom-frq/CLAUDE.md` Section 11 for full implementation)
- Matrix solution guides: inline CSS using the same palette, no `$css_block`

Does NOT cover: the full CSS/JS block implementation. See `mom-frq/CLAUDE.md` Section 11.

---

## Naming Conventions

**Files:**

- FRQ: `q{N}-{kebab-slug}.php` where N matches manifest entry number
- Matrix: `matrix-{2x2|3x3}-{rref|equation|inverse-equation}.php`
- Draw: `{kebab-description}.php`

**Variables in Common Control:**

- `$r_` prefix for narrative model answer components, one per rubric category
- `$sample_narrative` for the composed model response string
- `$contexts` / `$topic` for randomized scenario arrays
- `$i` for the scenario index: `rand(0, count($contexts)-1)`
- Parallel arrays: name them descriptively based on what they hold (`$populations`, `$claimed_values`, etc.)

**Comment markers:**

- Major sections: `// === SECTION NAME ===`
- Numbered subsections within Common Control: `/* ---------- N. Subsection Name ---------- */`
- File header: `// === NAME - DESCRIPTION: Title - Short description. ===`
