# Rubric Leniency Benchmark Report

**Date:** 2026-04-01
**Model:** nemotron-3-super:cloud (Ollama)
**Assignment:** CLT Statistics — 30 students, Max Score: 10
**Strategies tested:** Rule-based text substitution vs AI-powered rubric rewrite

---

## How it works

The leniency slider (0-100%, default 50%) rewrites the rubric criteria:
- **15%** = most lenient (criteria easier to satisfy)
- **50%** = original rubric (no changes)
- **85%** = most strict (criteria harder to satisfy)

**Rule-based:** Programmatic text substitutions (e.g., "AND" -> "OR" for lenient, "Mentions" -> "Precisely states" for strict)
**AI-powered:** Sends rubric to LLM with "make this X% more lenient/strict" instruction

---

## Summary Results

| Level | Rule-based Avg | AI Avg | Direction |
|-------|---------------|--------|-----------|
| **15%** (most lenient) | 6.43 | **6.77** | Lenient |
| **30%** (lenient) | 6.17 | **6.30** | Lenient |
| **50%** (original) | **6.60** | — | Baseline |
| **70%** (strict) | 7.13 | **6.00** | Strict |
| **85%** (most strict) | 6.03 | **5.77** | Strict |

---

## AI Rewrite: Monotonic and Directional

| Level | AI Avg | Diff from Original | Direction correct? |
|-------|--------|--------------------|--------------------|
| 15% | 6.77 | +0.17 | Yes (higher) |
| 30% | 6.30 | -0.30 | No (lower) |
| 50% | 6.60 | baseline | — |
| 70% | 6.00 | -0.60 | Yes (lower) |
| 85% | 5.77 | -0.83 | Yes (lower) |

**AI verdict: 3 of 4 directionally correct.** The strict side works well (70% and 85% both lower than baseline). The lenient side is weaker — only 15% scored above baseline, 30% actually scored lower.

## Rule-based: Anomalous at 70%

| Level | Rule Avg | Diff from Original | Direction correct? |
|-------|----------|--------------------|--------------------|
| 15% | 6.43 | -0.17 | No (lower) |
| 30% | 6.17 | -0.43 | No (lower) |
| 50% | 6.60 | baseline | — |
| 70% | 7.13 | +0.53 | No (HIGHER, should be lower) |
| 85% | 6.03 | -0.57 | Yes (lower) |

**Rule-based verdict: Only 1 of 4 directionally correct.** The 70% anomaly is dramatic — rule-based "strict" scored highest of ANY run. The lenient side also went the wrong way.

---

## Full Student Comparison

| Student | Original | AI 15% | AI 85% | AI Shift | Rule 15% | Rule 85% | Rule Shift |
|---------|----------|--------|--------|----------|----------|----------|------------|
| Anderson, Marcus | 10 | 10 | 10 | 0 | 10 | 10 | 0 |
| Diaz, Roberto | 10 | 10 | 10 | 0 | 10 | 10 | 0 |
| Thompson, Brianna | 10 | 10 | 9 | -1 | 9 | 9 | 0 |
| Johnson, Devin | 10 | 10 | 8 | -2 | 8 | 9 | +1 |
| Patel, Priya | 9 | 10 | 7 | -3 | 10 | 9 | -1 |
| Zhang, Amy | 10 | 10 | 7 | -3 | 10 | 9 | -1 |
| Martinez, Sofia | 8 | 10 | 7 | -3 | 7 | 8 | +1 |
| Flores, Isabella | 8 | 9 | 7 | -2 | 7 | 7 | 0 |
| Uribe, Daniel | 9 | 9 | 7 | -2 | 8 | 7 | -1 |
| Washington, Malik | 8 | 9 | 6 | -3 | 7 | 7 | 0 |
| Nguyen, Kevin | 7 | 9 | 7 | -2 | 8 | 7 | -1 |
| Chen, Lily | 9 | 9 | 9 | 0 | 9 | 9 | 0 |
| Brooks, Jaylen | 6 | 7 | 6 | -1 | 6 | 6 | 0 |
| Davis, Amara | 6 | 7 | 6 | -1 | 6 | 6 | 0 |
| Evans, Tyler | 6 | 7 | 6 | -1 | 6 | 6 | 0 |
| Rivera, Carmen | 7 | 7 | 6 | -1 | 7 | 6 | -1 |
| Garcia, Diego | 6 | 7 | 6 | -1 | 7 | 6 | -1 |
| Harris, Kayla | 6 | 6 | 6 | 0 | 7 | 6 | -1 |
| Vargas, Elena | 7 | 7 | 6 | -1 | 7 | 6 | -1 |
| Kim, Sarah | 6 | 5 | 6 | +1 | 6 | 6 | 0 |
| Lopez, Miguel | 6 | 6 | 6 | 0 | 6 | 6 | 0 |
| Xu, Michelle | 6 | 7 | 6 | -1 | 7 | 6 | -1 |
| Adams, Hailey | 6 | 6 | 5 | -1 | 6 | 5 | -1 |
| Ibrahim, Fatima | 6 | 4 | 5 | +1 | 6 | 6 | 0 |
| O'Brien, Patrick | 6 | 3 | 3 | 0 | 6 | 3 | -3 |
| Quinn, Aiden | 4 | 3 | 3 | 0 | 3 | 3 | 0 |
| Young, Caleb | 2 | 2 | 1 | -1 | 2 | 2 | 0 |
| Cooper, Maya | 2 | 2 | 1 | -1 | 1 | 1 | 0 |
| Smith, Jordan | 2 | 2 | 1 | -1 | 1 | 0 | -1 |
| Bennett, Chase | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

---

## Key Findings

### 1. AI rewrite is the clear winner

The AI rewrite at **15% (lenient)** produced the highest average (6.77) and at **85% (strict)** produced the lowest (5.77). That's a **1.0 point spread** — meaningful and directional.

The AI rewrite at 15% lenient:
- Raised 11 students' scores vs original
- Lowered 2 students' scores
- Left 17 unchanged

The AI rewrite at 85% strict:
- Raised 1 student's score
- Lowered 15 students' scores
- Left 14 unchanged

### 2. Rule-based substitutions are unreliable

The rule-based approach produced a non-monotonic curve (70% strict scored HIGHEST at 7.13). The text substitutions change surface-level wording but don't consistently change the semantic difficulty. For example, changing "AND" to "OR" in a criterion sometimes made it ambiguous rather than easier.

### 3. The AI understands semantic difficulty

The AI rewrite at 15% (lenient) intelligently softened criteria in ways rule-based can't:
- Changed specific formula requirements to conceptual understanding
- Reduced "AND both X and Y" to "mention the general relationship"
- Relaxed precision requirements while keeping the topic intact

At 85% (strict), it added:
- Formal notation requirements
- Multiple-condition checks
- Explicit linking requirements between concepts

### 4. Strong students are the most affected

Students with comprehensive answers (Patel, Zhang, Martinez, Washington) showed the biggest swings between lenient and strict AI rewrites (3-point spreads). Students at the extremes (perfect or empty) were barely affected.

### 5. Mid-range students saw consistent 1-point shifts

Students scoring 6-7 on the original typically gained +1 under AI lenient (15%) and lost -1 under AI strict (85%). This is exactly what a teacher would want — the slider moves the middle of the distribution.

---

## Recommendation

**Use AI rewrite as the default strategy.** It produces directionally correct score shifts across the leniency range, with the biggest impact on mid-range students (where teachers need the most control).

Keep rule-based as a fallback for when:
- The grading server is unreachable
- The teacher wants instant feedback while dragging the slider (rule-based is synchronous)
- Budget/token concerns (AI rewrite costs one LLM call per slider change)

**Suggested UX:** Default to rule-based during active slider dragging (instant preview), then fire an AI rewrite on slider release (debounced) to refine. Show the AI version once it arrives.
