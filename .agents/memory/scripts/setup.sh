#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMORY_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$MEMORY_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python venv at $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
fi

echo "Installing LightRAG into venv..."
"$VENV_DIR/bin/pip" install -q lightrag-hku ollama

echo "Verifying Ollama connectivity..."
curl -s localhost:11434/api/tags > /dev/null || { echo "ERROR: Ollama is not running. Start with: ollama serve"; exit 1; }

echo "Creating working directory..."
mkdir -p "$MEMORY_DIR/lightrag_workdir"

echo "Setup complete."
echo "  venv: $VENV_DIR"
echo "  Run scripts with: $VENV_DIR/bin/python3 scripts/index_reflection.py <file>"
