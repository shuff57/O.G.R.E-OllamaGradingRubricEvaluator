# ollama

Local LLM serving and model management.

## Working directory

Any (system-wide CLI).

## Key commands

| Command | Purpose |
|---------|---------|
| `ollama serve` | Start the Ollama server (required before grading or memory) |
| `ollama list` | List locally available models |
| `ollama pull <model>` | Download a model |
| `ollama create <name> -f <Modelfile>` | Create a custom model from a Modelfile |
| `ollama run <model>` | Interactive chat with a model |
| `ollama rm <model>` | Remove a local model |

## Project-specific models

- `llama3.2` — default model for LightRAG memory queries
- `nomic-embed-text` — embedding model for LightRAG indexing
- Fine-tuned Modelfiles live in `../shuff57-llm-finetune/ogre/fine-tuned-model/`:
  - `Modelfile-qwen3.5-9B-stat-grader`
  - `Modelfile-qwen3.5-35B-A3B-stat-grader`

## Creating a fine-tuned model

```bash
ollama create stat-grader -f ../shuff57-llm-finetune/ogre/fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader
```

## Notes

- Ollama must be running for the grading-server to use local models.
- The grading-server's `ollama` provider connects to `http://localhost:11434` by default.
- Memory scripts also require Ollama for both LLM and embedding calls.
