# Anchors + Leniency Dry Run Report

**Date:** 2026-04-01
**Model:** nemotron-3-super:cloud (Ollama)
**Assignment:** CLT Statistics — 30 students, Max Score: 10

---

## The Question

When the leniency slider rewrites the rubric, should the scoring anchor positions (Excellent=95%, Adequate=80%, etc.) also shift? Or does that double-dip?

## Results

| Condition | Description | Avg | Median |
|-----------|-------------|-----|--------|
| **A** | Original rubric + default anchors | **5.80** | 6 |
| **B** | Lenient rubric + default anchors | **8.47** | 9 |
| **C** | Lenient rubric + shifted anchors (90/70/55/35) | **7.67** | 8 |
| **D** | Strict rubric + default anchors | **6.10** | 6 |

### Key Comparisons

| Comparison | Diff | Meaning |
|-----------|------|---------|
| **B vs A** (rubric rewrite effect) | **+2.67** | Lenient rubric alone raised avg by 2.67 points |
| **C vs B** (anchor shift on top) | **-0.80** | Adding shifted anchors LOWERED scores by 0.80 |
| **D vs A** (strict rubric effect) | **+0.30** | Strict rubric barely changed avg |

---

## Verdict: Keep anchors fixed. Rubric rewrite alone is a powerful lever.

Shifting anchors on top of rubric rewriting **hurt** scores (C was 0.80 lower than B). The rubric rewrite alone produced a massive +2.67 point lift — that's the real lever. Adding anchor shifts confused the model's calibration and partially cancelled out the rubric effect.

---

## Per-Student Breakdown

| Student | A (baseline) | B (lenient rubric) | C (lenient + anchors) | D (strict) | B-A | C-B |
|---------|---|---|---|---|---|---|
| Anderson, Marcus | 10 | 10 | 10 | 10 | 0 | 0 |
| Chen, Lily | 9 | 10 | 10 | 10 | +1 | 0 |
| Diaz, Roberto | 9 | 10 | 10 | 9 | +1 | 0 |
| Johnson, Devin | 9 | 10 | 10 | 10 | +1 | 0 |
| Thompson, Brianna | 9 | 10 | 10 | 10 | +1 | 0 |
| Flores, Isabella | 7 | 10 | 10 | 6 | +3 | 0 |
| Martinez, Sofia | 7 | 10 | 10 | 10 | +3 | 0 |
| Nguyen, Kevin | 7 | 10 | 10 | 6 | +3 | 0 |
| Patel, Priya | 7 | 10 | 10 | 10 | +3 | 0 |
| Uribe, Daniel | 7 | 10 | 10 | 9 | +3 | 0 |
| Washington, Malik | 6 | 10 | 10 | 6 | +4 | 0 |
| Xu, Michelle | 6 | 10 | 10 | 5 | +4 | 0 |
| Zhang, Amy | 7 | 10 | 10 | 10 | +3 | 0 |
| Harris, Kayla | 6 | 9 | 10 | 5 | +3 | +1 |
| Rivera, Carmen | 6 | 9 | 8 | 6 | +3 | -1 |
| Vargas, Elena | 6 | 10 | 8 | 6 | +4 | -2 |
| Adams, Hailey | 6 | 9 | 7 | 5 | +3 | -2 |
| Brooks, Jaylen | 6 | 9 | 7 | 6 | +3 | -2 |
| Davis, Amara | 6 | 9 | 7 | 5 | +3 | -2 |
| Evans, Tyler | 6 | 9 | 7 | 6 | +3 | -2 |
| Garcia, Diego | 6 | 9 | 7 | 6 | +3 | -2 |
| Ibrahim, Fatima | 5 | 9 | 7 | 5 | +4 | -2 |
| Kim, Sarah | 6 | 9 | 7 | 5 | +3 | -2 |
| Lopez, Miguel | 6 | 9 | 7 | 5 | +3 | -2 |
| O'Brien, Patrick | 3 | 9 | 7 | 3 | +6 | -2 |
| Quinn, Aiden | 3 | 7 | 4 | 3 | +4 | -3 |
| Young, Caleb | 1 | 4 | 3 | 2 | +3 | -1 |
| Cooper, Maya | 1 | 2 | 2 | 2 | +1 | 0 |
| Smith, Jordan | 1 | 2 | 2 | 2 | +1 | 0 |
| Bennett, Chase | 0 | 0 | 0 | 0 | 0 | 0 |

---

## Analysis

### 1. Rubric rewriting is extremely effective

The lenient rubric (B) lifted 24 of 30 students' scores vs baseline (A). The average jumped from 5.80 to 8.47 — a **2.67 point increase**. This is far more powerful than the weight-slider approach (which produced near-zero shifts).

### 2. Shifting anchors double-dips and hurts

Adding shifted anchors (C) lowered 14 students' scores vs rubric-only (B), raised only 1, and left 15 unchanged. The shifted anchors told the model "7/10 is adequate" which caused it to compress mid-range students down from 9 to 7. The rubric was already doing the leniency work — the anchors fought against it.

### 3. Strict rubric had minimal effect

Condition D (strict rubric) only raised the average by 0.30 vs baseline. The strict rubric added requirements like "n ≥ 30 for non-normal populations" — but the model was already grading against the original criteria at similar strictness. This suggests the original rubric is already on the strict side of what the model considers "default."

### 4. The lenient rubric may be TOO lenient at 15%

O'Brien went from 3 to 9 (a +6 jump) — that's a weak response getting near-perfect credit. The 15% leniency level might need to be capped or the AI rewrite prompt tightened to prevent over-softening.

---

## Recommendations

1. **Do NOT shift anchor positions with the leniency slider.** Keep them fixed at 95/80/65/45. The rubric rewrite alone is the right lever.

2. **The current implementation (rubric rewrite only) is correct.** No changes needed to the anchor generation pipeline.

3. **Consider capping the lenient end.** At 15% leniency, weak students got inflated scores (O'Brien 3→9). A minimum leniency of 25-30% might prevent over-softening, or the AI rewrite prompt could include guardrails like "do not remove criteria entirely, only soften the language."

4. **Strict direction needs work.** The AI strict rewrite at 85% only moved the average by +0.30 — barely noticeable. The strict rewrite prompt may need to be more aggressive (add NEW requirements, not just tighten existing wording).
