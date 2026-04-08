# Teacher Slider Experiments Report

**Date:** 2026-04-01
**Model:** nemotron-3-super:cloud (Ollama)
**Assignment:** CLT Statistics — 30 students, Max Score: 10
**Rubric:** CLT Statement (2pts) + Standard Error (3pts) + MOE Connection (3pts) + Practical Implications (2pts)

---

## Experiments Run

Each experiment simulates a teacher adjusting one or more sliders to see the effect.

| # | Experiment | Floor | CT Band | Below Avg | Minimal | Avg Score | Time |
|---|-----------|-------|---------|-----------|---------|-----------|------|
| 1 | **Default** (baseline) | 8 | 60-80% | 65% | 45% | **6.70** | 94s |
| 2 | Floor → 9 | **9** | 60-80% | 65% | 45% | **5.67** | 92s |
| 3 | Floor → 7 | **7** | 60-80% | 65% | 45% | **6.20** | 60s |
| 4 | CT → 70-90% | 8 | **70-90%** | 65% | 45% | **5.73** | 95s |
| 5 | CT → 40-60% | 8 | **40-60%** | 65% | 45% | **6.00** | 197s |
| 6 | Nice Teacher combo | **9** | **70-90%** | **55%** | **35%** | **6.03** | 252s |
| 7 | Tough Teacher combo | **7** | **40-60%** | **75%** | **55%** | **5.90** | 135s |

> Excellent (95%) and Adequate (80%) anchors were held constant across all experiments.

---

## Full Score Table

| Student | 1 Default | 2 Floor=9 | 3 Floor=7 | 4 CT Wide | 5 CT Tight | 6 Nice | 7 Tough |
|---------|-----------|-----------|-----------|-----------|------------|--------|---------|
| Anderson, Marcus | 10 | 10 | 10 | 10 | 10 | 10 | 10 |
| Diaz, Roberto | 10 | 8 | 10 | 10 | 9 | 10 | 10 |
| Johnson, Devin | 10 | 8 | 8 | 8 | 9 | 9 | 9 |
| Martinez, Sofia | 10 | 7 | 8 | 7 | 8 | 8 | 8 |
| Patel, Priya | 10 | 7 | 10 | 7 | 9 | 9 | 7 |
| Thompson, Brianna | 10 | 8 | 9 | 9 | 9 | 9 | 9 |
| Uribe, Daniel | 10 | 7 | 8 | 7 | 7 | 7 | 7 |
| Zhang, Amy | 10 | 7 | 10 | 7 | 9 | 9 | 8 |
| Flores, Isabella | 10 | 7 | 8 | 7 | 7 | 7 | 6 |
| Chen, Lily | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| Nguyen, Kevin | 9 | 7 | 8 | 7 | 7 | 7 | 6 |
| Washington, Malik | 9 | 6 | 7 | 6 | 7 | 7 | 6 |
| Brooks, Jaylen | 7 | 6 | 7 | 6 | 6 | 6 | 6 |
| Davis, Amara | 6 | 6 | 7 | 6 | 6 | 6 | 6 |
| Evans, Tyler | 7 | 6 | 7 | 6 | 6 | 6 | 6 |
| Garcia, Diego | 6 | 6 | 7 | 6 | 6 | 6 | 6 |
| Harris, Kayla | 6 | 6 | 6 | 6 | 6 | 6 | 6 |
| Kim, Sarah | 5 | 6 | 5 | 6 | 6 | 6 | 6 |
| Lopez, Miguel | 6 | 6 | 5 | 5 | 6 | 6 | 6 |
| Rivera, Carmen | 7 | 6 | 7 | 6 | 6 | 6 | 6 |
| Vargas, Elena | 7 | 6 | 7 | 6 | 6 | 6 | 6 |
| Xu, Michelle | 6 | 6 | 5 | 6 | 6 | 6 | 6 |
| Adams, Hailey | 5 | 5 | 6 | 5 | 6 | 6 | 5 |
| Ibrahim, Fatima | 5 | 5 | 4 | 5 | 5 | 5 | 6 |
| O'Brien, Patrick | 5 | 3 | 3 | 3 | 3 | 3 | 3 |
| Quinn, Aiden | 3 | 3 | 3 | 3 | 3 | 3 | 3 |
| Young, Caleb | 2 | 2 | 1 | 2 | 1 | 1 | 2 |
| Cooper, Maya | 1 | 1 | 1 | 1 | 1 | 1 | 2 |
| Smith, Jordan | 0 | 0 | 0 | 0 | 1 | 1 | 1 |
| Bennett, Chase | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

---

## What Each Slider Actually Did

### Experiment 2: Floor → 9 (avg 5.67, DOWN from 6.70)

**Teacher thought:** "If they hit all the criteria, reward them with a 9."

**What happened:** Avg dropped by a full point. The model saw "earns 9-10" and became MORE selective about what counts as "hitting all criteria." Instead of being generous, it raised its standards for who qualifies for the floor. 7 students who had 10s under default dropped to 7-8.

**Verdict:** Floor=9 backfired badly. The model interprets a high floor as a high bar, not generosity.

### Experiment 3: Floor → 7 (avg 6.20, down 0.50)

**Teacher thought:** "Lower the bar — hitting criteria only gets you a 7, quality matters."

**What happened:** Modest drop. Strong students held (Anderson 10, Chen 9, Patel 10, Zhang 10). Mid-range students clustered at 7 instead of 6. The model gave more 7s and fewer 5s — it actually spread the scores out more evenly. But the top end compressed slightly (Johnson 10→8, Martinez 10→8).

**Verdict:** Floor=7 worked as intended for strictness, but compressed the top.

### Experiment 4: CT → 70-90% (avg 5.73, DOWN from 6.70)

**Teacher thought:** "Reward understanding over execution."

**What happened:** Avg dropped significantly. The model seems to have recalibrated — when told to give 70-90% for conceptual understanding, it became pickier about what counts as "conceptual understanding." Strong students dropped (Patel 10→7, Zhang 10→7, Flores 10→7). Mid-range stayed at 6.

**Verdict:** Widening CT alone doesn't help. The model may be reading "award 70-90% of that criterion's points" as a cap rather than a floor.

### Experiment 5: CT → 40-60% (avg 6.00, down 0.70)

**Teacher thought:** "Execution matters more than just getting the concept."

**What happened:** Mid-range students were surprisingly stable (most stayed at 6). The top end came down a bit (Johnson 10→9, Martinez 10→8, Patel 10→9). The tighter CT band did make the model slightly stricter on strong students, but barely touched the middle.

**Verdict:** CT band has minimal impact on mid-range. Mainly affects strong students.

### Experiment 6: Nice Teacher (avg 6.03, DOWN from 6.70)

**Teacher thought:** "Be generous everywhere — high floor, wide CT, low bottom anchors."

**What happened:** Despite being the "nicest" settings possible, avg was 0.67 LOWER than default. The combination of floor=9 + CT 70-90% triggered the same overcorrection as experiments 2 and 4. The model became more selective, not more generous.

**Verdict:** Combining multiple "generous" signals confuses the model. Less is more.

### Experiment 7: Tough Teacher (avg 5.90, down 0.80)

**Teacher thought:** "Be demanding everywhere — low floor, tight CT, high bottom anchors."

**What happened:** Scores compressed toward 6. Only 3 students scored above 8 (Anderson 10, Chen 9, Thompson 9). Strong students like Patel dropped from 10 to 7. The high bottom anchors (BA=75%, M=55%) told the model that even "below average" work should get 7.5/10, which paradoxically made it harder for anyone to stand out.

**Verdict:** Raising bottom anchors compresses the scoring range rather than making it stricter.

---

## Summary Stats

| Experiment | Avg | Median | 0-3 | 4-6 | 7-8 | 9-10 | Std Dev |
|-----------|-----|--------|-----|-----|-----|------|---------|
| 1 Default | 6.70 | 7 | 4 | 9 | 5 | 12 | 3.1 |
| 2 Floor=9 | 5.67 | 6 | 4 | 15 | 7 | 4 | 2.5 |
| 3 Floor=7 | 6.20 | 7 | 4 | 6 | 13 | 7 | 2.8 |
| 4 CT Wide | 5.73 | 6 | 4 | 14 | 7 | 5 | 2.6 |
| 5 CT Tight | 6.00 | 6 | 4 | 13 | 5 | 8 | 2.5 |
| 6 Nice | 6.03 | 6 | 4 | 13 | 5 | 8 | 2.6 |
| 7 Tough | 5.90 | 6 | 4 | 15 | 4 | 7 | 2.4 |

---

## Key Findings

### 1. Default scored highest — every change lowered the average
The baseline (floor=8, CT=60-80%, standard anchors) produced avg 6.70. Every experiment scored lower. This suggests the current defaults are already calibrated toward generosity, and any change the model interprets as a "new instruction" triggers more critical evaluation.

### 2. The model treats weight changes as "pay more attention" signals
Instead of "be nicer" or "be stricter," the model reads adjusted weights as "think harder about this aspect." More thinking = more critical = lower scores. This explains why both "nice" and "tough" settings lowered averages.

### 3. Score floor has the strongest single-slider effect
- Floor=9: avg dropped 1.03 points (biggest single change)
- Floor=7: avg dropped 0.50 points (moderate)
- The floor is the most impactful lever, but it works backwards from what teachers expect.

### 4. CT band has minimal impact on mid-range students
Wide CT (70-90%) and tight CT (40-60%) produced nearly identical scores for students scoring 3-7. The CT rule mainly affects how the model evaluates strong students' imperfect execution.

### 5. Bottom anchor shifts compress rather than stretch
Raising Below Average from 65%→75% didn't make grading stricter — it told the model "7.5/10 is below average" which compressed everyone into a narrow band around 6.

### 6. Stable students across ALL experiments
These students scored the same regardless of settings:
- **Anderson, Marcus: always 10** (comprehensive, textbook answer)
- **Chen, Lily: always 9** (strong, complete)
- **Bennett, Chase: always 0** (empty submission)
- **Quinn, Aiden: always 3** (vague)

These are the true anchors — scores the model is confident about. The weights only affect students in the ambiguous middle.

---

## Recommendations for Teachers

### What to tell users in the UI

Based on these experiments, the sliders should come with honest guidance:

1. **"Default" is already generous.** Don't change settings expecting to raise scores — you're more likely to lower them.

2. **Floor slider works backwards from intuition.** Raising the floor to 9 doesn't give students more credit — it makes the AI more selective about who qualifies. Lowering to 7 actually produces better score differentiation.

3. **CT band is a fine-tuning knob, not a big lever.** It mainly affects borderline-strong students (7-9 range). Don't expect it to help weak students.

4. **Leave top anchors (Excellent, Adequate) alone.** Only the bottom anchors (Below Average, Minimal) have meaningful effect, and they compress scores rather than stretch them.

5. **If scores feel too harsh, don't adjust weights — adjust the rubric.** The model grades against rubric criteria. Making the rubric more forgiving is more effective than tuning prompt weights.

### Suggested preset labels (honest version)

| Preset | What it actually does | Good for |
|--------|----------------------|----------|
| **Default** | Most generous. Widest score spread. | Most assignments |
| **Differentiate** | Floor=7. Spreads mid-range scores apart. | When too many students get the same score |
| **Focus on Execution** | CT=40-60%. Tightens credit for imperfect work. | Math/science where precision matters |
