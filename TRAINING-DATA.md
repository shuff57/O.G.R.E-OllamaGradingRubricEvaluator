# Training Data

Training data, fine-tuning scripts, notebooks, and model weights have been migrated to:

**Repository**: [shuff57-llm-finetune](https://github.com/shuff57/shuff57-llm-finetune)  
**Local path**: `../shuff57-llm-finetune/ogre/`

## What was moved

- `test-data/` → Training JSONL datasets, Jupyter notebooks, training scripts, handwriting images, benchmark tools
- `fine-tuned-model/` → Fine-tuned GGUF model weights and Ollama Modelfiles

## Quick access

```bash
# Navigate to training data
cd ../shuff57-llm-finetune/ogre/

# Load fine-tuned model into Ollama
ollama create stat-grader -f ../shuff57-llm-finetune/ogre/fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader
```
