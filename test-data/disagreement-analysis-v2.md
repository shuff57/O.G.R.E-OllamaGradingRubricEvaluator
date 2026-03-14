# Disagreement Analysis — Grading Prompt Optimization V2

## Data Source
Historical benchmark (March 8, 2026) used as proxy baseline because T1 fresh baseline is blocked on Anthropic authentication.

### Rubric Scope (10 pts total)
- **Fairness Judgment (5 pts)**
  - States fair/unfair with clear position
  - Identifies expected frequency per category
  - Compares observed values to expected values
- **Chi-Square Test Purpose (5 pts)**
  - Describes what χ² goodness-of-fit measures
  - Explains observed vs expected usage (ideally including formula and larger/smaller statistic interpretation)

## Summary
- 3 students show cross-model disagreement above tolerance (|diff| > 1.0).
- **Metroka** affects two model-pair disagreements (highest leverage).
- **Price** affects GLM-5 vs Sonnet disagreement.
- **melton** affects Sonnet vs Qwen35-FT disagreement.
- To reach 95% agreement: fix Metroka (resolves two pairs) + fix either Price or melton (resolves one additional pair).

## Student Disagreements

### 1) Metroka, Layla
**Scores:** GLM-5 = 3.3, Sonnet 4.6 = 4.7, Qwen35-FT = 3.3  
**Pairwise disagreement:** GLM-5 vs Sonnet (1.4), Sonnet vs Qwen35-FT (1.4)

**Response:**
> "The distribution appears fair because the observed counts are extremely close to the expectation of 10 per category, with only minor fluctuations typical of random chance."

**Rubric-aligned analysis:**
- Fairness Judgment:
  - Clear fair/unfair position: **met**
  - Expected frequency identified (10 per category): **met**
  - Specific observed values compared: **not explicit** (general comparison only)
- Chi-Square Test Purpose:
  - No χ² purpose explanation: **missing**
  - No observed-vs-expected mechanism/formula meaning: **missing**

**Classification:** **Score Deflation** (GLM-5 and Qwen35-FT too low vs Sonnet)  
**Disagreement type:** **Partial-credit boundary ambiguity**

**Root cause:**
Models diverge on credit for fairness-comparison language when specific observed numbers are omitted. Sonnet awards more partial credit for "expected value + close comparison"; GLM-5/Qwen35-FT apply a stricter interpretation.

**Recommendation:**
Add explicit partial-credit guidance that general comparison language (e.g., "extremely close") earns partial comparison credit when expected value is correctly identified, even without enumerating individual observed counts.

---

### 2) Price, Lynn
**Scores:** GLM-5 = 6.3, Sonnet 4.6 = 7.7, Qwen35-FT = 7.0  
**Pairwise disagreement:** GLM-5 vs Sonnet (1.4)

**Response:**
> "The distribution is fair. A chi-square test would show how well the observed die result match the expected results for a fair die. If a die were fair each number would appear with equal frequency. A chie square test would compare observed from expected and if the results are close to the expected, it supports the conclusion. A goodness of fit test measures how well the observed data fits the expected and the test uses the observed frequencies from the die rolls and compares them to the expected frequencies to determine if the differences are significant."

**Rubric-aligned analysis:**
- Fairness Judgment:
  - Clear fair/unfair position: **met**
  - Expected equal frequency: **met (implied)**
  - Specific observed values compared: **not explicit**
- Chi-Square Test Purpose:
  - Describes χ²/gof purpose: **met**
  - Explains observed vs expected use: **met (conceptual)**
  - Formula and explicit larger/smaller statistic interpretation: **partial/missing**

**Classification:** **Score Deflation** (GLM-5 too low)  
**Disagreement type:** **Partial-credit boundary ambiguity**

**Root cause:**
GLM-5 penalizes the lack of explicit observed-value listing more heavily than Sonnet and Qwen35-FT, despite acceptable conceptual coverage of both major rubric categories.

**Recommendation:**
Apply the same partial-credit clarification as Metroka so that general observed-vs-expected comparison plus correct expected-frequency framing receives consistent partial credit.

---

### 3) melton, myla
**Scores:** GLM-5 = 3.7, Sonnet 4.6 = 3.7, Qwen35-FT = 5.0  
**Pairwise disagreement:** Sonnet vs Qwen35-FT (1.3), GLM-5 vs Qwen35-FT (1.3)

**Response:**
> "The counts are not overall equal, the x2 goodness of fit test measures the observed and expected frequencies. If the observed data closely matches the expected frequencies, this means it follows the expected distribution."

**Rubric-aligned analysis:**
- Fairness Judgment:
  - Position taken (not equal): **met**
  - Expected frequency per category identified: **missing**
  - Specific observed-vs-expected comparison: **missing**
- Chi-Square Test Purpose:
  - States observed vs expected concept: **met (basic)**
  - Formula details and statistic interpretation (larger/smaller): **missing**

**Classification:** **Score Inflation** (Qwen35-FT too high)  
**Disagreement type:** **Edge-case over-credit from short-answer rule**

**Root cause:**
Qwen35-FT over-applies the CRITICAL guidance that short accurate answers can score high, even when full rubric coverage is not present (missing expected frequency and key χ² detail).

**Recommendation:**
Constrain short-answer bonus language so it applies only when all rubric criteria are addressed accurately; brevity cannot compensate for missing sub-criteria.

## Unified Prompt Patch Recommendations

### Patch A: Clarify partial credit for general-comparison evidence in Fairness Judgment
**Target pattern:** Metroka + Price (GLM-5 strictness drift)  
**Intent:** Normalize 40–60%/60–80% application when expected frequency is identified and comparison is conceptual but not numerically enumerated.

**Proposed additive text (targeted):**
> For Fairness Judgment comparison credit: if a student correctly identifies the expected frequency and explicitly states that observed counts are "close" or "not close" to expected, award partial credit for comparison even without listing each observed value. Reserve full comparison credit for responses that cite concrete observed counts/categories.

### Patch B: Restrict short-accurate-answer bonus to complete criterion coverage
**Target pattern:** melton (Qwen35-FT generosity drift)  
**Intent:** Prevent inflation when responses are concise but omit required sub-criteria.

**Proposed additive text (targeted):**
> The "short, accurate answers can score high" rule applies only when all rubric criteria are substantively addressed. Do not award 8+ if any required sub-criterion is missing (e.g., missing expected frequency identification, missing χ² mechanism detail such as formula/statistic interpretation).

## Priority Order
1. **Patch A first** (addresses Metroka + Price and resolves highest-leverage disagreements).
2. **Patch B second** (addresses melton and reduces Qwen35-FT over-credit edge case).
