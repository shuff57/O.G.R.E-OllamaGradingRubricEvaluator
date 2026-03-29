#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMORIES_DIR="$HOME/pi-memories/hivemind"

echo "=== Hivemind Memory Setup ==="

# Ensure memories directory
mkdir -p "$MEMORIES_DIR"
touch "$MEMORIES_DIR/memories.jsonl"
echo "  Memories file: $MEMORIES_DIR/memories.jsonl"

# Check Ollama
echo "Checking Ollama..."
if curl -s localhost:11434/api/tags > /dev/null 2>&1; then
    echo "  Ollama: running"
else
    echo "  WARNING: Ollama not running. Start with: ollama serve"
    echo "  Memory will still work (no embeddings until Ollama available)"
fi

# Check/pull embedding model
echo "Checking nomic-embed-text model..."
if ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
    echo "  nomic-embed-text: available"
else
    echo "  Pulling nomic-embed-text..."
    ollama pull nomic-embed-text 2>/dev/null || echo "  WARNING: Could not pull. Run 'ollama pull nomic-embed-text' manually."
fi

echo ""
echo "Setup complete. No Python venv required."
echo "  Index:  python3 $SCRIPT_DIR/index_reflection.py <file.md>"
echo "  Query:  python3 $SCRIPT_DIR/query_memory.py '<query>'"
