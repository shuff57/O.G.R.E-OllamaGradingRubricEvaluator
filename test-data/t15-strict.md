# O.G.R.E. Multi-Model Consistency Benchmark Report

**Generated:** 2026-03-01T16:29:03.191Z
**Models:** 3 | **Runs per model:** 3 | **Students:** 25
**Tolerance:** ±1 | **Sweep:** none | **Chunk size:** 30

## Per-Model Summary

| Model | Runs | Mean Score | Std Dev | Run-to-Run Variance |
|-------|------|-----------|---------|---------------------|
| GLM-5 | 1/3 | 5.48 | 0.00 | 0.0000 |
| GPT-OSS 120B | 2/3 | 5.84 | 0.34 | 0.1152 |
| Sonnet 4.6 | 3/3 | 5.93 | 0.02 | 0.0005 |

## Score Matrix

| Student                   | GLM-5    | GPT-OSS 120B | Sonnet 4.6 |
| ------------------------- | -------- | ------------ | ---------- |
| Alvarez, Emiliano         |      7.0 |          5.5 |        7.0 |
| Cartwright, Juliet        |      6.0 |          5.5 |        6.0 |
| Consoli, Ben              |      8.0 |          8.0 |        8.0 |
| Cox, Jenna                |      3.0 |          5.0 |        4.0 |
| Davis, Cecilia            |      2.0 |          2.0 |        2.0 |
| Doris, Nicole             |      4.0 |          3.5 |        5.0 |
| Guichard, Sophia          |      6.0 |          8.0 |        7.0 |
| Guzman Rangel, Jimena     |      9.0 |          9.0 |        9.0 |
| Herl, Chrey               |      8.0 |          8.0 |        7.7 |
| Jimmerson, Kwan           |      2.0 |          2.0 |        2.0 |
| Johnson, Kenzie           |      9.0 |          9.0 |        9.0 |
| Laparan, Elle             |      7.0 |          6.0 |        7.0 |
| Martin, Makenzie          |      8.0 |          6.5 |        8.0 |
| melton, myla              |      2.0 |          2.5 |        3.0 |
| Metroka, Layla            |      4.0 |          3.5 |        4.7 |
| Milton, Joshua            |      8.0 |          7.0 |        7.0 |
| Parker, Tyson             |      8.0 |          8.0 |        7.7 |
| Plummer, Justin           |      2.0 |          3.5 |        4.0 |
| Price, Lynn               |      4.0 |          7.0 |        7.0 |
| Simcox, Foster            |      8.0 |          9.0 |        8.0 |
| Sorenson, Jack            |      7.0 |          8.5 |        6.0 |
| Stratton, Tessa           |      4.0 |          5.0 |        5.3 |
| Teran, William            |      2.0 |          3.0 |        3.3 |
| Xiong, William            |      1.0 |          2.0 |        2.0 |
| Zimmerman, Caidyn         |      8.0 |          9.0 |        8.7 |

## Pairwise Agreement

Agreement = % of students where score difference ≤ ±1

| Model Pair | Agreement | Agree/Total |
|------------|-----------|-------------|
| GLM-5 vs GPT-OSS 120B | 72.0% | 18/25 |
| GLM-5 vs Sonnet 4.6 | 84.0% | 21/25 |
| GPT-OSS 120B vs Sonnet 4.6 | 80.0% | 20/25 |

## Flagged Disagreements

Students where max−min score spread ≥ 3 points across models:

| Student | Spread | GLM-5 | GPT-OSS 120B | Sonnet 4.6 |
|---------|--------|--------|--------|--------|
| Price, Lynn | 3.0 | 4.0 | 7.0 | 7.0 |
