# Grading Prompt Reference

This document shows exactly what the AI sees when grading a student. All dynamic
values are shown as `{{placeholders}}`. The actual prompt is built in
`grading.js` — `buildBatchPrompt()` (batch) and `buildSingleGradePrompt()` (single).

---

## System Role

> You are an expert grading assistant. Grade ALL students in this batch against
> the provided rubric. Output: JSON array only.

---

## Grading Philosophy

(from `grading-constants.js`)

- Award credit proportional to rubric criterion coverage
- Partial credit for conceptual understanding even with imprecision
- Conceptual understanding > mechanical precision
- Use full 0-10 scoring range per anchors
- Off-topic = 0
- Custom instructions take precedence

---

## Question / Prompt

```
MAX SCORE: {{virtualMax}}

QUESTION/PROMPT:
{{essayPrompt — the question students were answering}}
```

---

## Grading Requirements (flattened checklist)

The checklist categories are flattened into a numbered list so the AI writes
feedback for each individual requirement, not per category.

```
GRADING REQUIREMENTS (write feedback for EACH numbered item):
1. [Identify the Correct Test] Name the appropriate statistical test for this scenario.
2. [Identify the Correct Test] Explain why this test fits the study design.
3. [Rule Out Alternatives] Explain why a paired t-test would not be appropriate here.
4. [Rule Out Alternatives] Explain why repeated two-sample t-tests would be problematic.
5. [Rule Out Alternatives] Explain why a chi-square test does not apply.
6. [Clarity and Reasoning] Provide a clear, organized explanation that connects each reasoning step to the scenario.

SCORING BY CATEGORY:
- Identify the Correct Test: 5 points total
- Rule Out Alternatives: 3 points total
- Clarity and Reasoning: 2 points total
```

---

## Partial Credit & Thoroughness Rules

```
PARTIAL CREDIT RULE: When a requirement is addressed conceptually but lacks
specific values, formulas, or concrete evidence, award 40-60% of that
category's points. Award 20-40% if only loosely related; 60-80% if
substantially complete but missing one key element. Evaluate each requirement
INDEPENDENTLY.

For 5-point categories: 1-2 pts (20-40%), 2-3 pts (40-60%), 3-4 pts (60-80%);
reserve 4-5 pts for essentially complete/correct coverage.

CONCEPTUAL THOROUGHNESS RULE: When a student demonstrates genuine understanding
but has execution flaws (arithmetic errors, missing units, informal notation),
award 60-80% of that category's points. Concept mastery with flawed execution
always scores higher than rote correctness without understanding.
```

---

## Key Concepts (rubricItems, if present)

```
KEY CONCEPTS TO ADDRESS:
{{category}}:
  - {{sub-item}}
  - {{sub-item}}
```

---

## Model Response (if provided)

```
MODEL RESPONSE (for reference):
{{teacher's model answer}}
```

---

## Scoring Anchors

```
SCORING ANCHORS (use these as calibration references):
- Excellent ({{score}}/{{max}}): {{description}}
- Adequate ({{score}}/{{max}}): {{description}}
- Below Average ({{score}}/{{max}}): {{description}}
- Minimal ({{score}}/{{max}}): {{description}}
```

---

## Scoring Scale (0-10)

| Score | Label |
|-------|-------|
| 0 | No submission or entirely off-topic |
| 1 | Minimal — only tangentially related |
| 2 | Very limited — significant gaps |
| 3 | Below basic — some relevant ideas but mostly incomplete |
| 4 | Approaching — shows awareness but falls short |
| 5 | Developing — demonstrates partial understanding |
| 6 | Adequate — addresses most criteria with some gaps |
| 7 | Competent — addresses all criteria, minor issues |
| 8 | Proficient — correctly addresses all rubric criteria |
| 9 | Advanced — thorough, precise, well-communicated |
| 10 | Excellent — comprehensive, precise, clearly communicated |

---

## Critical Scoring Floor

```
A response that correctly hits every rubric criterion earns 8-9, REGARDLESS of length.
A short, accurate answer scores higher than a long, partially-wrong one.
Only drop below 8 if a rubric criterion is genuinely missing or incorrect.
Score 8 requires all rubric criteria to be substantively correct;
score 7 when one criterion is only partially met or missing a key element.
```

---

## Feedback Format Rule

This appears OUTSIDE the JSON template to ensure the AI reads it before
generating output:

```
FEEDBACK FORMAT RULE: The feedback string must contain one section for EACH
numbered requirement from GRADING REQUIREMENTS. Do NOT group by category.
Use HTML tags: <strong> for the requirement header, <blockquote> for the
student's words (or "You did not address this."), <p> for your evaluation,
<em> for the "To improve" line. Wrap all math expressions in backticks, e.g.
`x^2 + 3x` or `p < 0.05`. For ANY requirement that is not at full credit, you
MUST include both (a) a specific reason citing the student's words or
omission, and (b) a "To improve" line with an actionable next step.
```

MOM's feedback box does not render Markdown — it stores HTML and renders math
from backtick-delimited ASCIIMath via `rendermathnode()` / MathJax.

---

## JSON Response Template (batch)

```json
[
  {
    "studentIndex": 0,
    "criterion_scores": {
      "Identify the Correct Test": "<0-5 pts>",
      "Rule Out Alternatives": "<0-3 pts>",
      "Clarity and Reasoning": "<0-2 pts>"
    },
    "score": "<integer 0-10>",
    "feedback": "<see feedback format below>"
  }
]
```

---

## Feedback Format (inside the feedback string)

The AI is instructed to write this exact HTML structure for each numbered
requirement:

```html
<p><strong>Name the appropriate statistical test for this scenario.</strong></p>
<blockquote>You said: "I would use a one-way ANOVA because we are comparing three groups."</blockquote>
<p>Correct! One-way ANOVA is the right choice for comparing means across three independent groups with one factor.</p>

<p><strong>Explain why this test fits the study design.</strong></p>
<blockquote>You said: "ANOVA works because there are more than two groups."</blockquote>
<p>Incomplete. You identified the multi-group aspect, but did not mention that the groups are independent or that we are comparing means of a continuous variable.</p>
<p><em>To improve: Explain that the design has one independent variable with three levels, the groups are independent, and the response variable is continuous.</em></p>

<p><strong>Explain why a paired t-test would not be appropriate here.</strong></p>
<blockquote>You did not address this.</blockquote>
<p>A paired t-test requires two related measurements on the same subjects. This scenario has three separate groups, so pairing does not apply (e.g. the statistic `t = (\bar{d})/(s_d/\sqrt{n})` assumes matched pairs).</p>
<p><em>To improve: State that paired tests need matched or repeated-measures data, which this design lacks.</em></p>
```

### Key formatting rules:
- `<strong>` for the requirement label — makes it visually distinct
- `<blockquote>` for the student's words — clearly separates "what they said"
- `<p>` for the teacher's evaluation
- `<em>` for the "To improve" line — visually distinct call-to-action
- One section per requirement, never grouped by category
- Backticks `` `...` `` for inline math (ASCIIMath, rendered by MathJax)
- Any requirement not at full credit MUST include both a reason and a
  "To improve" line

---

## Calibration Examples (if available)

Bridge responses from previous chunks and/or historical calibration examples
are appended for cross-batch consistency. These provide score anchoring but
do not replace the rubric.

---

## Files

| File | What it does |
|------|-------------|
| `grading.js` | Builds the prompt, parses responses |
| `grading-constants.js` | Philosophy text, scoring scale descriptors |
| `server.js` | HTTP endpoints, SSE streaming |
