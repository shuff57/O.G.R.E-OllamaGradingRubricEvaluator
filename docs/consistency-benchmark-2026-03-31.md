# Nemotron-3-Super Consistency Benchmark — 2026-03-31

## Overview

5-run consistency benchmark comparing **nemotron-3-super:cloud** with and without custom grading instructions, using the full OGRE production pipeline (`buildBatchPrompt` via `/api/grade` SSE endpoint).

**Baseline:** Sonnet + OGRE prompt (from 2026-03-29 benchmark)
**Students:** 17 (same MOM mean-vs-median question, 3 jittered versions)
**Max Score:** 4 pts

## Results: No Custom Instructions (Default Pipeline)

| Student | Base | R1 | R2 | R3 | R4 | R5 | Mean | StdDev | AvgErr |
|---------|------|----|----|----|----|----|------|--------|--------|
| Brandt, Laura | 1.50 | 3.25 | 3.25 | 3.25 | 2.50 | 2.75 | 3.00 | 0.32 | 1.50 |
| Calderon, Gabriella | 2.75 | 3.50 | 3.50 | 3.50 | 2.75 | 3.25 | 3.30 | 0.29 | 0.55 |
| Chagoya, Julie | 3.25 | 3.50 | 3.50 | 4.00 | 3.25 | 3.25 | 3.50 | 0.27 | 0.25 |
| Costner, Adam | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.00 | 0.00 |
| Disney, Ben | 1.50 | 2.00 | 2.00 | 2.50 | 1.50 | 1.50 | 1.90 | 0.37 | 0.40 |
| Franco, Melody | 2.50 | 2.75 | 2.50 | 2.75 | 2.75 | 2.50 | 2.65 | 0.12 | 0.15 |
| Fuentes, Nayeli | 2.50 | 2.50 | 2.50 | 2.50 | 2.50 | 2.50 | 2.50 | 0.00 | 0.00 |
| Garcia, Hazel | 3.25 | 3.50 | 3.50 | 3.50 | 3.25 | 3.25 | 3.40 | 0.12 | 0.15 |
| Goodwin, Reed | 2.75 | 3.50 | 3.50 | 3.50 | 3.25 | 3.25 | 3.40 | 0.12 | 0.65 |
| Hastain, Emma | 2.75 | 3.50 | 3.50 | 3.50 | 2.75 | 3.25 | 3.30 | 0.29 | 0.55 |
| Humble, Layla | 2.50 | 3.50 | 3.50 | 4.00 | 3.25 | 3.25 | 3.50 | 0.27 | 1.00 |
| Lakhanpal, Neha | 0.75 | 0.50 | 0.50 | 0.50 | 0.00 | 0.50 | 0.40 | 0.20 | 0.35 |
| Matthews, Sammy | 1.25 | 2.00 | 2.00 | 2.00 | 1.50 | 1.50 | 1.80 | 0.24 | 0.55 |
| Quiroz, Paulina | 0.75 | 0.75 | 1.25 | 1.50 | 0.75 | 0.75 | 1.00 | 0.32 | 0.25 |
| Rosales, Elizabeth | 1.25 | 2.50 | 1.25 | 2.00 | 1.50 | 2.50 | 1.95 | 0.51 | 0.70 |
| Sutton, Caidin | 3.50 | 3.50 | 3.50 | 4.00 | 3.25 | 3.25 | 3.50 | 0.27 | 0.00 |
| Tuman, Charlie | 2.75 | 3.50 | 3.50 | 3.50 | 2.75 | 3.25 | 3.30 | 0.29 | 0.55 |

| Metric | Value |
|--------|-------|
| **Mean StdDev** | **0.237** |
| **Mean Error vs Baseline** | **0.447** |
| **Max StdDev** | 0.510 (Rosales) |
| **Bias** | +0.43 (inflates) |

## Results: With Custom Lenient Instructions

Custom instructions:
> Grade very leniently. Give partial credit for any attempt that is vaguely correct. Do not deduct points for lack of explicit formula notation or symbolic notation of any kind. If a student demonstrates understanding of a concept through explanation alone — without writing out formulas or symbols — award full credit for that rubric item. Reward the concept, not the notation. Do NOT penalize brevity. A concise response that correctly addresses each rubric criterion deserves full marks. Only deduct when a rubric criterion is genuinely missing or wrong — not because the student could have written more.

| Student | Base | R1 | R2 | R3 | R4 | R5 | Mean | StdDev | AvgErr |
|---------|------|----|----|----|----|----|------|--------|--------|
| Brandt, Laura | 1.50 | 2.50 | 3.50 | 3.25 | 3.50 | 2.50 | 3.05 | 0.46 | 1.55 |
| Calderon, Gabriella | 2.75 | 2.75 | 4.00 | 3.50 | 4.00 | 2.50 | 3.35 | 0.62 | 0.60 |
| Chagoya, Julie | 3.25 | 3.25 | 4.00 | 3.50 | 4.00 | 2.75 | 3.50 | 0.47 | 0.25 |
| Costner, Adam | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.75 | 0.00 | 0.00 |
| Disney, Ben | 1.50 | 2.00 | 2.50 | 2.00 | 2.50 | 1.50 | 2.10 | 0.37 | 0.60 |
| Franco, Melody | 2.50 | 2.75 | 3.25 | 2.50 | 3.25 | 2.00 | 2.75 | 0.47 | 0.25 |
| Fuentes, Nayeli | 2.50 | 2.50 | 2.75 | 2.50 | 2.75 | 2.00 | 2.50 | 0.27 | 0.00 |
| Garcia, Hazel | 3.25 | 3.25 | 4.00 | 3.50 | 4.00 | 2.75 | 3.50 | 0.47 | 0.25 |
| Goodwin, Reed | 2.75 | 3.25 | 4.00 | 3.50 | 4.00 | 2.75 | 3.50 | 0.47 | 0.75 |
| Hastain, Emma | 2.75 | 2.75 | 3.50 | 3.50 | 4.00 | 2.50 | 3.25 | 0.55 | 0.50 |
| Humble, Layla | 2.50 | 3.25 | 4.00 | 3.50 | 4.00 | 3.25 | 3.60 | 0.34 | 1.10 |
| Lakhanpal, Neha | 0.75 | 0.75 | 0.00 | 0.50 | 0.50 | 0.50 | 0.45 | 0.24 | 0.30 |
| Matthews, Sammy | 1.25 | 2.00 | 2.50 | 2.00 | 2.50 | 1.50 | 2.10 | 0.37 | 0.85 |
| Quiroz, Paulina | 0.75 | 1.25 | 1.50 | 1.50 | 1.25 | 0.50 | 1.20 | 0.37 | 0.45 |
| Rosales, Elizabeth | 1.25 | 2.50 | 2.75 | 2.50 | 2.75 | 1.50 | 2.40 | 0.46 | 1.15 |
| Sutton, Caidin | 3.50 | 3.25 | 4.00 | 3.50 | 4.00 | 2.75 | 3.50 | 0.47 | 0.00 |
| Tuman, Charlie | 2.75 | 3.25 | 4.00 | 3.50 | 4.00 | 2.75 | 3.50 | 0.47 | 0.75 |

| Metric | Value |
|--------|-------|
| **Mean StdDev** | **0.407** |
| **Mean Error vs Baseline** | **0.550** |
| **Max StdDev** | 0.624 (Calderon) |
| **Bias** | +0.51 (inflates more) |

## Head-to-Head Comparison

| Metric | Default | + Lenient Instructions | Change |
|--------|---------|----------------------|--------|
| **Run-to-run StdDev** | **0.237** | 0.407 | +72% worse |
| **Error vs Baseline** | **0.447** | 0.550 | +23% worse |
| **Max Student StdDev** | **0.510** | 0.624 | +22% worse |
| **Inflation Bias** | +0.43 | +0.51 | +19% more inflated |

### Per-Student StdDev Comparison

| Student | Default StdDev | Lenient StdDev | Change |
|---------|---------------|----------------|--------|
| Costner, Adam | 0.00 | 0.00 | = |
| Fuentes, Nayeli | 0.00 | 0.27 | worse |
| Franco, Melody | 0.12 | 0.47 | worse |
| Garcia, Hazel | 0.12 | 0.47 | worse |
| Goodwin, Reed | 0.12 | 0.47 | worse |
| Lakhanpal, Neha | 0.20 | 0.24 | ~ same |
| Matthews, Sammy | 0.24 | 0.37 | worse |
| Chagoya, Julie | 0.27 | 0.47 | worse |
| Humble, Layla | 0.27 | 0.34 | worse |
| Sutton, Caidin | 0.27 | 0.47 | worse |
| Calderon, Gabriella | 0.29 | 0.62 | much worse |
| Hastain, Emma | 0.29 | 0.55 | much worse |
| Tuman, Charlie | 0.29 | 0.47 | worse |
| Brandt, Laura | 0.32 | 0.46 | worse |
| Quiroz, Paulina | 0.32 | 0.37 | ~ same |
| Disney, Ben | 0.37 | 0.37 | = |
| Rosales, Elizabeth | 0.51 | 0.46 | slightly better |

## Key Findings

### 1. Custom lenient instructions HURT consistency
StdDev jumped from 0.237 to 0.407 (+72%). The vague directive "grade very leniently" introduces ambiguity — the model interprets "lenient" differently on each run, swinging between moderate and aggressive inflation.

### 2. Default pipeline is already lenient enough
The GRADING_PHILOSOPHY already includes: "Award partial credit on any criterion where the student shows understanding" and "do not compress toward the middle." The custom instructions add redundant directives that compete with the built-in calibration.

### 3. Error vs baseline also increased
Mean error went from 0.447 to 0.550. The instructions didn't just add noise — they pushed scores higher while also making them less predictable.

### 4. Litmus tests still work
Costner (0.75 base) was perfect across all 10 runs in both conditions. Lakhanpal stayed low. Quiroz crept up slightly with lenient instructions (mean 1.20 vs 1.00).

### 5. The biggest consistency losers
Calderon (0.29 → 0.62 StdDev), Hastain (0.29 → 0.55), and Garcia/Goodwin/Franco (0.12 → 0.47). These mid-range students are most sensitive to grading ambiguity.

## Recommendation

**Do not use broad lenient instructions.** The default OGRE pipeline philosophy is already calibrated for partial credit and concept-over-notation. If you want higher scores, use the **scoring anchors** or adjust the rubric criteria directly — these are deterministic and don't hurt consistency.

If specific notation-penalization is a recurring issue, add a narrow, targeted instruction like:
> "Do not require formula notation for the Outlier Impact criterion — verbal explanation of how the outlier affects the mean is sufficient for full credit."

This is specific enough to be applied consistently across runs.

## Test Environment

- **Date:** 2026-03-31
- **Model:** nemotron-3-super:cloud (Ollama cloud)
- **Pipeline:** Full OGRE production (`/api/grade` SSE endpoint, `buildBatchPrompt`)
- **Server:** localhost:3456 (grading-server via Bun)
- **Temperature:** 0.2 (server default)
- **Runs:** 5 per condition (10 total)
