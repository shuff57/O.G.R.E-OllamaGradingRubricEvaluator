# O.G.R.E. Multi-Model Consistency Benchmark Report

**Generated:** 2026-02-26T22:28:22.071Z
**Models:** 3 | **Runs per model:** 3 | **Students:** 25
**Tolerance:** ±0.5 | **Sweep:** none | **Chunk size:** 30

## Per-Model Summary

| Model | Runs | Mean Score | Std Dev | Run-to-Run Variance |
|-------|------|-----------|---------|---------------------|
| Kimi-K2.5 | 3/3 | 6.84 | 0.52 | 0.2704 |
| Minimax-M2.5 | 3/3 | 6.63 | 0.26 | 0.0661 |
| Gemini 3 Flash | 3/3 | 7.56 | 0.07 | 0.0048 |

## Score Matrix

| Student                   | Kimi-K2.5 | Minimax-M2.5 | Gemini 3 Flash |
| ------------------------- | --------- | ------------ | -------------- |
| Alvarez, Emiliano         |       8.7 |          8.3 |            9.0 |
| Cartwright, Juliet        |       7.7 |          7.3 |            9.0 |
| Consoli, Ben              |       8.7 |          8.0 |            9.3 |
| Cox, Jenna                |       5.3 |          4.7 |            7.7 |
| Davis, Cecilia            |       3.7 |          4.0 |            3.7 |
| Doris, Nicole             |       6.0 |          6.0 |            6.3 |
| Guichard, Sophia          |       7.7 |          8.3 |            9.0 |
| Guzman Rangel, Jimena     |       9.7 |          8.7 |           10.0 |
| Herl, Chrey               |       8.7 |          7.7 |            9.3 |
| Jimmerson, Kwan           |       2.0 |          2.3 |            3.7 |
| Johnson, Kenzie           |       9.7 |          9.0 |           10.0 |
| Laparan, Elle             |       8.7 |          7.0 |            9.3 |
| Martin, Makenzie          |       8.7 |          8.0 |            9.0 |
| melton, myla              |       4.0 |          4.0 |            4.3 |
| Metroka, Layla            |       4.3 |          6.0 |            4.7 |
| Milton, Joshua            |       7.0 |          6.7 |            9.0 |
| Parker, Tyson             |       8.0 |          7.0 |            9.0 |
| Plummer, Justin           |       5.0 |          5.0 |            4.7 |
| Price, Lynn               |       8.3 |          8.0 |            8.3 |
| Simcox, Foster            |       9.0 |          8.7 |           10.0 |
| Sorenson, Jack            |       8.0 |          8.0 |            9.0 |
| Stratton, Tessa           |       6.7 |          5.7 |            8.0 |
| Teran, William            |       4.3 |          5.3 |            4.7 |
| Xiong, William            |       2.3 |          3.0 |            2.0 |
| Zimmerman, Caidyn         |       9.0 |          9.0 |           10.0 |

## Pairwise Agreement

Agreement = % of students where score difference ≤ ±0.5

| Model Pair | Agreement | Agree/Total |
|------------|-----------|-------------|
| Kimi-K2.5 vs Minimax-M2.5 | 48.0% | 12/25 |
| Kimi-K2.5 vs Gemini 3 Flash | 48.0% | 12/25 |
| Minimax-M2.5 vs Gemini 3 Flash | 20.0% | 5/25 |

## Flagged Disagreements

Students where max−min score spread ≥ 3 points across models:

| Student | Spread | Kimi-K2.5 | Minimax-M2.5 | Gemini 3 Flash |
|---------|--------|--------|--------|--------|
| Cox, Jenna | 3.0 | 5.3 | 4.7 | 7.7 |
