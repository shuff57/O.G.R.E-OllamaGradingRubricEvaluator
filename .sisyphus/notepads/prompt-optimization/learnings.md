# Baseline Frozen Benchmark - Findings

**Date:** 2026-02-28

## Task Summary
Attempted to capture frozen baseline benchmark for 3 models (GPT-OSS 120B, GLM-5, Sonnet 4.6) at ±1.0 tolerance.

## Results

### Output Files Created
- `test-data/baseline-frozen.json` - ✅ Created with correct structure
- `test-data/baseline-frozen.md` - ✅ Created with correct structure

### Benchmark Execution
- Ran: `bun run test-data/run-benchmark.js --only=GPT-OSS,GLM-5,Sonnet --tolerance=1 --output=test-data/baseline-frozen.json`
- customInstructions commented out in CONFIG for fair baseline

### Data Points
| Model | Successful Runs | Mean Score |
|-------|-----------------|------------|
| GLM-5 | 0/3 | N/A |
| GPT-OSS 120B | 0/3 | N/A |
| Sonnet 4.6 | 0/3 | N/A |

### Failure Reasons
1. **GLM-5 & GPT-OSS 120B**: Ollama server not accessible at localhost:3456
   - Error: "Unable to connect. Is the computer able to access the url?"
   
2. **Sonnet 4.6**: Invalid Anthropic refresh token
   - Error: "Refresh token not found or invalid"

## Conclusion
**Benchmark failed due to infrastructure issues** - not code or configuration problems:
- The O.G.R.E. grading server needs to be running on localhost:3456
- Ollama needs to be running with required models (glm-5:cloud, gpt-oss:120b-cloud)
- Anthropic API credentials need valid refresh token

The benchmark script executed correctly - only the backend services are unavailable.

## Test Dataset Creation - T2

**Date:** 2026-02-28

### Schema Pattern
- Rubric: `{essayPrompt, checklistItems[], rubricItems[], modelText, maxScore}`
- Students: `[{index, name, response}]`
- `checklistItems` has `{category, points, items[]}` — category includes points label like `"Process & Location (4 pts)"`
- `maxScore` is a string ("10"), not a number
- `rubricItems` is always `[]` in existing data

### Diversification Strategy
- Chi-square rubric: 2 categories (5+5). Biology: 3 categories (4+3+3). History: 3 categories (4+3+3)
- Different category structures prevent overfitting to one rubric shape
- Both new rubrics use 3-part evaluation: knowledge → application → broader thinking

### Student Response Quality
- 18 students per subject, spanning 0-10 score range
- Edge cases: empty string, joke responses, "didn't do reading" responses
- Quality determined by rubric criteria coverage, not just response length
- Short responses can score well if they hit key rubric items (e.g., Mitchell's terse but accurate biology answer)

### Files Created
- `test-data/test-biology-rubric.json` — Photosynthesis essay (3 categories: Process/Location, Inputs/Outputs, Broader Significance)
- `test-data/test-biology-students.json` — 18 students
- `test-data/test-history-rubric.json` — Civil War causes essay (3 categories: Cause ID/Evidence, Interconnection, Evaluation/Argument)
- `test-data/test-history-students.json` — 18 students
