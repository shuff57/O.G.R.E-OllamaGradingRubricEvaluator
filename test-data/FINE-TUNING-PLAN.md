# Fine-Tuning Plan — Resume on Another Machine

## Goal
Get GPT-OSS (or Qwen3-14B) to 95% agreement with GLM-5 + Sonnet 4.6 on grading.

## Current Status

| Metric | Score |
|--------|-------|
| GLM-5 vs Sonnet | 96% ✅ |
| GPT-OSS vs Sonnet | 80% |
| GPT-OSS vs GLM-5 | 80% |

**Problem:** GPT-OSS 120B interprets partial-credit edge cases differently than GLM+Sonnet consensus. Prompt optimization hit a ceiling — we need fine-tuning.

## What's Ready (pushed to repo)

1. **Training data:** `test-data/finetune-gptoss-qwen.jsonl` (25 examples)
   - Uses GLM+Sonnet consensus scores as ground truth
   - Score range: 2-9, heavy on 6-8

2. **Prompts:** `grading-server/grading.js` (CoR v2)
   - Best prompt state — chain-of-rubric with explicit point ranges
   - Synced to `ogre-desktop/src-tauri/binaries/server-bundle/grading.js`

3. **Benchmark data:** `test-data/benchmark-cor-v2.json`
   - Raw scores for all 25 students, 3 models, 3 runs each

4. **Decision doc:** `test-data/fine-tuning-decision.md`
   - Full analysis + recommendations

## What We Need

**More training examples** — The 25 we have aren't enough. We need 50-80 minimum.

**Where to get them:** User has additional graded examples across different topics (not just this chi-square rubric).

## Next Steps (run on other machine)

### Step 1: Get the data
```bash
git pull
cd test-data
# User to add: more graded student responses from other topics
```

### Step 2: Generate balanced training set
```bash
node -e "
const all = require('./all-graded-students.json'); // <- need this file
const v2 = require('./benchmark-cor-v2.json');
// Combine, balance score distribution, output JSONL
"
```

### Step 3: Test Qwen3-14B natural alignment (no fine-tune)
Before fine-tuning, test if Qwen3-14B naturally agrees better:
```bash
node test-data/run-benchmark.js --only=Qwen3-14B --output=test-data/benchmark-qwen3.json
```
If it hits 90%+ agreement → skip fine-tuning.

### Step 4: LoRA fine-tune (if needed)
Using Unsloth for 4-bit QLoRA on 12GB VRAM:
```bash
# Train on balanced JSONL
# Target: 1-2 epochs, rank 16-32, lr ~1e-5
```

### Step 5: Re-benchmark
Compare fine-tuned model agreement vs baseline.

## Files to Create/Edit on Other Machine

| File | Action |
|------|--------|
| `test-data/all-graded-students.json` | User to provide |
| `test-data/finetune-balanced.jsonl` | Generate from combined data |
| `test-data/benchmark-qwen3.json` | Run if testing Qwen3 |

## Hardware

- RTX 4070 12GB VRAM
- 32GB system RAM
- Can run Qwen3-14B with 4-bit QLoRA

## Questions for User

1. Where are the additional graded examples from other topics?
2. What format are they in (JSON, CSV, etc.)?
3. Do you want to test Qwen3-14B first before committing to fine-tuning?
 
X
Y
