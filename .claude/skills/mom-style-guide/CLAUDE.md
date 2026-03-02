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

## Default Question Types

**Always default to auto-graded question types. Use essay/FRQ only when explicitly requested.**

| Scenario | Default type |
|----------|-------------|
| Numeric answer (exact value) | `number` or `calculated` in a multipart |
| Choose from options | `choices` with `$displayformat[n] = "select"` (dropdown) |
| Multiple distinct sub-questions | `multipart` combining `number` + `choices` |
| Open-ended written response | `essay` — only when user explicitly asks for FRQ |

**Why:** OGRE uses these questions to *assess* student understanding, not to collect essays. Auto-graded types (number boxes + dropdowns) give instant feedback, prevent ambiguity, and don't require AI grading. Essay/FRQ is appropriate only when the learning goal requires prose reasoning that a rubric must evaluate.

**Implication for randomization:** Multipart questions can mix `number`, `calculated`, and `choices` sub-parts. Use `$anstypes = array(...)` to declare the mix. Use `$displayformat[n] = "select"` for dropdown rendering. See `mom-frq/CLAUDE.md` Section 3 for multipart syntax.

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

Sourced from Khan Academy (Perseus design system), Brilliant.org, and Desmos — the industry standard for modern assessment tools.

| Color | Purpose |
|-------|---------|
| `#1865f2` | Primary accent — badge background, callout border, interactive elements (Khan Academy blue) |
| `#21242c` | Body text — softer than pure black, easier on eyes |
| `#374151` | Secondary text — labels, de-emphasized content |
| `#f7f9fa` | Table header background — light, non-distracting |
| `#dee1e3` | Table header bottom border (2px), row separator |
| `#e5e7eb` | Card border, column separators |
| `#f0f7ff` | Instruction callout background (light blue tint) |
| `#f0f4ff` | Collapsible summary background (matrix solution guides) |
| `#fafafa` | Content area background inside collapsibles |
| `#e8f5e9` | Correct answer highlight, model response area |
| `#4CAF50` | Accent bar border, highlight border (green) |
| `#fff9ea` | Alternating row tint in rubric tables |
| `#ccc` | General borders, separators |
| `#2E7D32` | "Model Narrative Response" label text (dark green) |

**Multipart question layout (card-per-part pattern):**

Use this layout for all multipart auto-graded questions. Each sub-part gets its own white card. Never use bare `<p>` tags with bold `a.` labels. Sourced from Khan Academy Perseus component patterns.

- **Outer wrapper**: `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:16px; line-height:1.6; color:#21242c; max-width:688px` — 688px matches the optimal reading width used by Khan Academy
- **Data table**: wrapped in `<div style="border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.08),0 2px 4px -2px rgba(0,0,0,0.05);border:1px solid #e5e7eb;display:inline-block;">`. Header row: `background:#f7f9fa; font-weight:600; color:#21242c; border-bottom:2px solid #dee1e3`. Column cells: `border-left:1px solid #e5e7eb`. Never use `border="1"` attribute.
- **Instruction callout** *(optional — default: omit)*: `background:#f0f7ff; border-left:4px solid #1865f2; padding:10px 16px; border-radius:0 8px 8px 0` — the 4px left border is the Khan Academy style. **Before including this, ask the user: "Include an instruction hint? (default: no)"** If no answer or default, leave it out entirely.
- **Part cards**: `background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:20px; margin:10px 0; box-shadow:0 4px 6px -1px rgba(0,0,0,0.07),0 2px 4px -2px rgba(0,0,0,0.04)` — dual-layer shadow gives depth without heaviness
- **Part label chips** (a, b, c…): `display:inline-block; background:#e8f0fe; color:#1865f2; border-radius:6px; padding:3px 10px; font-size:13px; font-weight:700; margin-right:10px; vertical-align:middle` — light blue pill/chip, not a filled circle. Rounded rectangle, not `border-radius:50%`.
- **Answer box wrapper**: wrap every `$answerbox[n]` in `<div style="margin-top:12px;text-align:center;">$answerbox[n]</div>` — never use a bare `<br>` before the answer box. This pads the input away from the question text and centers it in the card.

**Typography and layout rules:**

- Font: always `font-family:Arial` for student-facing text
- Question text: `font-size:medium; line-height:1.6`
- Rubric tables: `border-radius:8px`, `border-collapse:separate`
- FRQ questions: use `$css_block` (see `mom-frq/CLAUDE.md` Section 11 for full implementation)
- Matrix solution guides: inline CSS using the same palette, no `$css_block`
- Multipart questions: always use card-per-part layout (see above) — no `$css_block` needed

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
