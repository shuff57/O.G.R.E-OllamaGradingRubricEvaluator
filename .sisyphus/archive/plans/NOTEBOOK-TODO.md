# Pending: Replace Training Notebook

## What to do
Replace `OGRE_Finetune_Qwen35_9B.ipynb` with a notebook built from `colab_train_qwen35_grader.py`.

## Why
`colab_train_qwen35_grader.py` is a more complete, correct training script that the current notebook is missing:

- **Cell 3b** — loads `finetune-grading-vision.jsonl`, decodes base64 images, prepares vision dataset
- **`UnslothVisionDataCollator`** — handles mixed text+image batches correctly
- **`train_on_responses_only`** — model only learns from assistant outputs, not prompts (better training signal)
- **`remove_unused_columns=False`** — required when dataset has extra columns like `images`
- **Drive checkpoint recovery** — auto-resumes if Colab runtime disconnects (saves every 50 steps)
- **3 epochs instead of 2** — better for the small 283-entry dataset
- **`enable_thinking=False`** — explicitly disables Qwen3.5 thinking mode during training

## How
Convert `colab_train_qwen35_grader.py` (already structured with `# %%` cell markers) to `.ipynb` format and replace the current notebook.

## Current status
Training is running in Colab on L4 GPU using `OGRE_Finetune_Qwen35_9B.ipynb` (text-only, 283 entries).
Vision data (`finetune-grading-vision.jsonl`, 24 entries, base64 images embedded) is NOT yet included in this run.
