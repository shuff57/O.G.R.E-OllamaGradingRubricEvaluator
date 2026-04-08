# Grading Weights Dry Run Report

**Date:** 2026-04-01
**Model:** nemotron-3-super:cloud (Ollama)
**Assignment:** CLT Statistics — 30 students, Max Score: 10
**Rubric:** 4 categories (CLT Statement 2pts, Standard Error 3pts, MOE Connection 3pts, Practical Implications 2pts)

---

## Weight Configurations Tested

| Setting | Excellent | Adequate | Below Avg | Minimal | Conceptual Thoroughness | Score Floor |
|---------|-----------|----------|-----------|---------|------------------------|-------------|
| **Default** | 95% | 80% | 65% | 45% | 60-80% | 8 |
| **Lenient** | 90% | 75% | 60% | 40% | 65-85% | 7 |
| **Strict** | 97% | 85% | 70% | 50% | 50-70% | 8 |

---

## Full Score Comparison: Default vs Lenient vs Strict

| Student | Default | Lenient | Strict | L-D | S-D | Notes |
|---------|---------|---------|--------|-----|-----|-------|
| Anderson, Marcus | 10 | 10 | 10 | 0 | 0 | Perfect — all presets agree |
| Diaz, Roberto | 10 | 10 | 10 | 0 | 0 | Perfect — all presets agree |
| Patel, Priya | 9 | 7 | 10 | -2 | +1 | Strict rewarded detail, lenient penalized |
| Zhang, Amy | 9 | 7 | 10 | -2 | +1 | Same pattern as Patel |
| Chen, Lily | 9 | 9 | 9 | 0 | 0 | Strong — stable |
| Thompson, Brianna | 9 | 9 | 9 | 0 | 0 | Strong — stable |
| Johnson, Devin | 9 | 8 | 8 | -1 | -1 | Both shifted down |
| Martinez, Sofia | 8 | 7 | 8 | -1 | 0 | Lenient dropped, strict held |
| Flores, Isabella | 6 | 7 | 8 | +1 | +2 | **Strict scored highest** |
| Uribe, Daniel | 6 | 7 | 8 | +1 | +2 | **Strict scored highest** |
| Nguyen, Kevin | 6 | 7 | 7 | +1 | +1 | Both raised |
| Brooks, Jaylen | 6 | 6 | 7 | 0 | +1 | Strict raised |
| Davis, Amara | 6 | 6 | 7 | 0 | +1 | Strict raised |
| Evans, Tyler | 6 | 6 | 7 | 0 | +1 | Strict raised |
| Garcia, Diego | 6 | 6 | 7 | 0 | +1 | Strict raised |
| Rivera, Carmen | 6 | 6 | 7 | 0 | +1 | Strict raised |
| Vargas, Elena | 6 | 6 | 7 | 0 | +1 | Strict raised |
| Washington, Malik | 6 | 6 | 7 | 0 | +1 | Strict raised |
| Adams, Hailey | 6 | 6 | 6 | 0 | 0 | Stable |
| Harris, Kayla | 6 | 6 | 6 | 0 | 0 | Stable |
| Kim, Sarah | 6 | 6 | 4 | 0 | -2 | **Strict penalized heavily** |
| Lopez, Miguel | 6 | 6 | 4 | 0 | -2 | **Strict penalized heavily** |
| Xu, Michelle | 6 | 6 | 5 | 0 | -1 | Strict dropped |
| Ibrahim, Fatima | 5 | 5 | 4 | 0 | -1 | Strict dropped |
| O'Brien, Patrick | 3 | 3 | 3 | 0 | 0 | Weak — stable |
| Quinn, Aiden | 3 | 3 | 3 | 0 | 0 | Vague — stable |
| Cooper, Maya | 2 | 2 | 1 | 0 | -1 | Strict penalized minimal |
| Smith, Jordan | 1 | 2 | 0 | +1 | -1 | Misconception: lenient +1, strict 0 |
| Young, Caleb | 1 | 2 | 1 | +1 | 0 | Lenient gave marginal credit |
| Bennett, Chase | 0 | 0 | 0 | 0 | 0 | Empty — all agree |

---

## Summary Statistics

| Metric | Default | Lenient | Strict |
|--------|---------|---------|--------|
| **Mean Score** | 5.93 | 5.90 | 6.17 |
| **Median** | 6 | 6 | 7 |
| **Students scoring 0-3** | 5 | 4 | 6 |
| **Students scoring 4-6** | 15 | 15 | 9 |
| **Students scoring 7-8** | 4 | 6 | 11 |
| **Students scoring 9-10** | 6 | 5 | 4 |

| vs Default | Lenient | Strict |
|------------|---------|--------|
| **Avg Diff** | -0.03 | +0.23 |
| **Scored higher** | 5 | 13 |
| **Scored lower** | 4 | 6 |
| **Unchanged** | 21 | 11 |

---

## Analysis

### The weights ARE working — but not as labeled

The "strict" preset actually produced **higher** average scores (6.17 vs 5.93) and moved 13 students UP. This is the opposite of what "strict" should do. Here's why:

**Higher anchors created a wider scoring range, not a stricter one.** When the Adequate anchor moved from 80%→85% and Below Average from 65%→70%, the model had more room in the 7-8 range and pulled many 6s up to 7. The tighter conceptual thoroughness band (50-70%) didn't counteract this — the anchor positioning dominated.

### What each lever actually did

| Lever | Expected Effect | Actual Effect |
|-------|----------------|---------------|
| **Anchor positions (all shifted)** | Strict = harder to reach tiers | Strict = model recalibrated upward for mid-range |
| **Conceptual thoroughness band** | Strict 50-70% = less partial credit | Barely visible — drowned out by anchor effect |
| **Score floor (7 vs 8)** | Lenient = lower minimum for good work | Lenient floor=7 pulled strong students DOWN (Patel 9→7, Zhang 9→7) |

### Key findings

1. **Score floor should NOT decrease for lenient.** Lowering from 8→7 told the model "7 is fine for all-criteria-met," which pulled strong students down rather than lifting weak ones. **Keep floor at 8 for all presets.**

2. **Strict anchors accidentally helped mid-range students.** Moving Adequate to 85% told the model "8.5/10 is adequate" — so students previously stuck at 6 got bumped to 7 because the model now saw 7 as "below adequate" rather than "adequate." This is a scale compression effect, not strictness.

3. **The 6-cluster problem.** Default mode clusters 16/30 students at exactly 6. Strict broke this cluster apart (only 3 at 6), spreading students into 4, 5, 7, and 8. This is actually more useful differentiation, even though it's not "stricter."

4. **Edge cases behaved correctly across all presets:**
   - Empty (Bennett): always 0
   - Misconception (Smith): 1 default, 2 lenient, 0 strict
   - Perfect answers (Anderson, Diaz): always 10

### Recommendations for v2 presets

| Setting | Excellent | Adequate | Below Avg | Minimal | CT Band | Floor | Goal |
|---------|-----------|----------|-----------|---------|---------|-------|------|
| **Lenient** | 95% (keep) | 80% (keep) | 55% | 35% | 70-90% | 8 (keep) | Lift bottom without pulling top down |
| **Default** | 95% | 80% | 65% | 45% | 60-80% | 8 | Unchanged |
| **Strict** | 95% (keep) | 80% (keep) | 75% | 55% | 40-60% | 8 (keep) | Raise bottom thresholds, tighten partial credit |

**Core principle:** Only move the **lower two anchors** (Below Average, Minimal) between presets. Keep Excellent, Adequate, and Score Floor fixed so the top end stays calibrated. Shift leniency/strictness through how much credit the bottom half gets.
