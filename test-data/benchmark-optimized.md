# O.G.R.E. Multi-Model Consistency Benchmark Report

**Generated:** 2026-03-01T07:05:13.857Z
**Models:** 10 | **Runs per model:** 3 | **Students:** 25
**Tolerance:** ±1 | **Sweep:** none | **Chunk size:** 30

## Per-Model Summary

| Model | Runs | Mean Score | Std Dev | Run-to-Run Variance |
|-------|------|-----------|---------|---------------------|
| GLM-5 | 2/3 | 5.76 | 0.00 | 0.0000 |
| Kimi-K2.5 | 3/3 | 6.61 | 0.09 | 0.0085 |
| Minimax-M2.5 | 3/3 | 6.25 | 0.60 | 0.3605 |
| Gemini 3 Flash | 3/3 | 7.07 | 0.30 | 0.0917 |
| DeepSeek 3.2 | 3/3 | 5.97 | 0.10 | 0.0101 |
| Qwen 3.5 397B | 3/3 | 6.84 | 0.18 | 0.0336 |
| Mistral Large 3 | 3/3 | 7.77 | 0.05 | 0.0021 |
| GPT-OSS 120B | 3/3 | 6.04 | 0.45 | 0.1984 |
| Haiku 4.5 | 3/3 | 6.52 | 0.04 | 0.0016 |
| Sonnet 4.6 | 3/3 | 5.93 | 0.06 | 0.0037 |

## Score Matrix

| Student                   | GLM-5    | Kimi-K2.5 | Minimax-M2.5 | Gemini 3 Flash | DeepSeek 3.2 | Qwen 3.5 397B | Mistral Large 3 | GPT-OSS 120B | Haiku 4.5 | Sonnet 4.6 |
| ------------------------- | -------- | --------- | ------------ | -------------- | ------------ | ------------- | --------------- | ------------ | --------- | ---------- |
| Alvarez, Emiliano         |      6.5 |       8.0 |          7.7 |            8.7 |          7.7 |           8.3 |             9.0 |          7.0 |       8.0 |        7.0 |
| Cartwright, Juliet        |      6.0 |       8.0 |          7.7 |            8.7 |          7.7 |           8.0 |             7.0 |          7.0 |       7.0 |        6.0 |
| Consoli, Ben              |      8.0 |       8.0 |          8.0 |            8.7 |          7.7 |           8.0 |            10.0 |          7.3 |       9.0 |        8.0 |
| Cox, Jenna                |      3.5 |       5.7 |          5.3 |            6.3 |          4.3 |           5.3 |             6.0 |          5.7 |       4.0 |        4.0 |
| Davis, Cecilia            |      2.5 |       4.0 |          4.0 |            3.0 |          3.0 |           4.0 |             4.3 |          3.0 |       3.0 |        2.0 |
| Doris, Nicole             |      3.5 |       6.0 |          4.7 |            5.3 |          4.7 |           6.0 |             8.0 |          4.0 |       6.0 |        5.0 |
| Guichard, Sophia          |      6.5 |       8.0 |          7.0 |            8.0 |          6.7 |           7.0 |             9.0 |          7.0 |       8.7 |        7.0 |
| Guzman Rangel, Jimena     |      9.0 |       9.0 |          7.3 |           10.0 |          9.0 |           9.3 |            10.0 |          8.3 |       9.0 |        9.0 |
| Herl, Chrey               |      8.0 |       8.0 |          7.3 |            8.7 |          7.3 |           8.0 |             9.7 |          7.7 |       8.7 |        8.0 |
| Jimmerson, Kwan           |      2.5 |       3.0 |          2.0 |            3.0 |          3.0 |           3.7 |             4.0 |          2.3 |       2.0 |        2.0 |
| Johnson, Kenzie           |      9.0 |       9.0 |          8.3 |           10.0 |          9.0 |           9.3 |            10.0 |          8.7 |       9.0 |        9.0 |
| Laparan, Elle             |      7.0 |       8.0 |          6.3 |            9.7 |          7.3 |           8.3 |             8.0 |          7.0 |       7.0 |        7.0 |
| Martin, Makenzie          |      8.0 |       7.7 |          7.7 |            9.7 |          7.7 |           8.3 |             9.0 |          8.0 |       8.0 |        8.0 |
| melton, myla              |      3.0 |       4.3 |          3.3 |            3.3 |          3.3 |           5.0 |             5.0 |          3.0 |       3.0 |        3.0 |
| Metroka, Layla            |      4.0 |       5.0 |          6.7 |            5.0 |          4.7 |           5.0 |             7.0 |          4.3 |       6.7 |        5.0 |
| Milton, Joshua            |      7.5 |       6.7 |          6.7 |            8.7 |          7.0 |           8.3 |             8.0 |          6.7 |       6.7 |        7.0 |
| Parker, Tyson             |      7.5 |       8.0 |          6.3 |            9.3 |          7.3 |           8.3 |             8.0 |          7.7 |       7.3 |        7.3 |
| Plummer, Justin           |      3.5 |       4.3 |          5.0 |            4.0 |          3.3 |           4.0 |             7.0 |          4.3 |       5.0 |        4.0 |
| Price, Lynn               |      5.0 |       7.7 |          7.3 |            7.0 |          6.3 |           7.0 |             9.0 |          6.7 |       8.0 |        7.0 |
| Simcox, Foster            |      8.0 |       8.0 |          7.7 |            8.7 |          7.7 |           8.3 |             9.7 |          8.3 |       8.7 |        8.0 |
| Sorenson, Jack            |      7.0 |       7.3 |          7.3 |            8.0 |          6.3 |           8.3 |             8.7 |          7.0 |       8.0 |        6.7 |
| Stratton, Tessa           |      5.5 |       7.0 |          5.0 |            8.0 |          5.3 |           7.7 |             7.0 |          6.3 |       5.3 |        5.0 |
| Teran, William            |      3.0 |       4.0 |          5.7 |            4.0 |          3.0 |           4.7 |             6.0 |          3.0 |       4.0 |        3.3 |
| Xiong, William            |      2.0 |       2.3 |          3.7 |            2.0 |          2.0 |           2.0 |             5.0 |          2.3 |       3.0 |        2.0 |
| Zimmerman, Caidyn         |      8.0 |       8.3 |          8.3 |            9.0 |          8.0 |           8.7 |            10.0 |          8.3 |       8.0 |        8.0 |

## Pairwise Agreement

Agreement = % of students where score difference ≤ ±1

| Model Pair | Agreement | Agree/Total |
|------------|-----------|-------------|
| GLM-5 vs Kimi-K2.5 | 64.0% | 16/25 |
| GLM-5 vs Minimax-M2.5 | 52.0% | 13/25 |
| GLM-5 vs Gemini 3 Flash | 56.0% | 14/25 |
| GLM-5 vs DeepSeek 3.2 | 84.0% | 21/25 |
| GLM-5 vs Qwen 3.5 397B | 52.0% | 13/25 |
| GLM-5 vs Mistral Large 3 | 28.0% | 7/25 |
| GLM-5 vs GPT-OSS 120B | 92.0% | 23/25 |
| GLM-5 vs Haiku 4.5 | 76.0% | 19/25 |
| GLM-5 vs Sonnet 4.6 | 92.0% | 23/25 |
| Kimi-K2.5 vs Minimax-M2.5 | 68.0% | 17/25 |
| Kimi-K2.5 vs Gemini 3 Flash | 84.0% | 21/25 |
| Kimi-K2.5 vs DeepSeek 3.2 | 80.0% | 20/25 |
| Kimi-K2.5 vs Qwen 3.5 397B | 92.0% | 23/25 |
| Kimi-K2.5 vs Mistral Large 3 | 48.0% | 12/25 |
| Kimi-K2.5 vs GPT-OSS 120B | 92.0% | 23/25 |
| Kimi-K2.5 vs Haiku 4.5 | 84.0% | 21/25 |
| Kimi-K2.5 vs Sonnet 4.6 | 80.0% | 20/25 |
| Minimax-M2.5 vs Gemini 3 Flash | 56.0% | 14/25 |
| Minimax-M2.5 vs DeepSeek 3.2 | 80.0% | 20/25 |
| Minimax-M2.5 vs Qwen 3.5 397B | 56.0% | 14/25 |
| Minimax-M2.5 vs Mistral Large 3 | 20.0% | 5/25 |
| Minimax-M2.5 vs GPT-OSS 120B | 76.0% | 19/25 |
| Minimax-M2.5 vs Haiku 4.5 | 76.0% | 19/25 |
| Minimax-M2.5 vs Sonnet 4.6 | 72.0% | 18/25 |
| Gemini 3 Flash vs DeepSeek 3.2 | 64.0% | 16/25 |
| Gemini 3 Flash vs Qwen 3.5 397B | 88.0% | 22/25 |
| Gemini 3 Flash vs Mistral Large 3 | 52.0% | 13/25 |
| Gemini 3 Flash vs GPT-OSS 120B | 56.0% | 14/25 |
| Gemini 3 Flash vs Haiku 4.5 | 68.0% | 17/25 |
| Gemini 3 Flash vs Sonnet 4.6 | 64.0% | 16/25 |
| DeepSeek 3.2 vs Qwen 3.5 397B | 68.0% | 17/25 |
| DeepSeek 3.2 vs Mistral Large 3 | 28.0% | 7/25 |
| DeepSeek 3.2 vs GPT-OSS 120B | 96.0% | 24/25 |
| DeepSeek 3.2 vs Haiku 4.5 | 68.0% | 17/25 |
| DeepSeek 3.2 vs Sonnet 4.6 | 96.0% | 24/25 |
| Qwen 3.5 397B vs Mistral Large 3 | 56.0% | 14/25 |
| Qwen 3.5 397B vs GPT-OSS 120B | 64.0% | 16/25 |
| Qwen 3.5 397B vs Haiku 4.5 | 64.0% | 16/25 |
| Qwen 3.5 397B vs Sonnet 4.6 | 52.0% | 13/25 |
| Mistral Large 3 vs GPT-OSS 120B | 24.0% | 6/25 |
| Mistral Large 3 vs Haiku 4.5 | 56.0% | 14/25 |
| Mistral Large 3 vs Sonnet 4.6 | 28.0% | 7/25 |
| GPT-OSS 120B vs Haiku 4.5 | 76.0% | 19/25 |
| GPT-OSS 120B vs Sonnet 4.6 | 92.0% | 23/25 |
| Haiku 4.5 vs Sonnet 4.6 | 88.0% | 22/25 |

## Flagged Disagreements

Students where max−min score spread ≥ 3 points across models:

| Student | Spread | GLM-5 | Kimi-K2.5 | Minimax-M2.5 | Gemini 3 Flash | DeepSeek 3.2 | Qwen 3.5 397B | Mistral Large 3 | GPT-OSS 120B | Haiku 4.5 | Sonnet 4.6 |
|---------|--------|--------|--------|--------|--------|--------|--------|--------|--------|--------|--------|
| Doris, Nicole | 4.5 | 3.5 | 6.0 | 4.7 | 5.3 | 4.7 | 6.0 | 8.0 | 4.0 | 6.0 | 5.0 |
| Laparan, Elle | 3.3 | 7.0 | 8.0 | 6.3 | 9.7 | 7.3 | 8.3 | 8.0 | 7.0 | 7.0 | 7.0 |
| Metroka, Layla | 3.0 | 4.0 | 5.0 | 6.7 | 5.0 | 4.7 | 5.0 | 7.0 | 4.3 | 6.7 | 5.0 |
| Parker, Tyson | 3.0 | 7.5 | 8.0 | 6.3 | 9.3 | 7.3 | 8.3 | 8.0 | 7.7 | 7.3 | 7.3 |
| Plummer, Justin | 3.7 | 3.5 | 4.3 | 5.0 | 4.0 | 3.3 | 4.0 | 7.0 | 4.3 | 5.0 | 4.0 |
| Price, Lynn | 4.0 | 5.0 | 7.7 | 7.3 | 7.0 | 6.3 | 7.0 | 9.0 | 6.7 | 8.0 | 7.0 |
| Stratton, Tessa | 3.0 | 5.5 | 7.0 | 5.0 | 8.0 | 5.3 | 7.7 | 7.0 | 6.3 | 5.3 | 5.0 |
| Teran, William | 3.0 | 3.0 | 4.0 | 5.7 | 4.0 | 3.0 | 4.7 | 6.0 | 3.0 | 4.0 | 3.3 |
| Xiong, William | 3.0 | 2.0 | 2.3 | 3.7 | 2.0 | 2.0 | 2.0 | 5.0 | 2.3 | 3.0 | 2.0 |
