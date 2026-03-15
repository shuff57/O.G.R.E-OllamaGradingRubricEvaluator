#!/bin/bash
set -e
echo "Installing LightRAG..."
pip install lightrag-hku
echo "Verifying Ollama connectivity..."
curl -s localhost:11434/api/tags > /dev/null || { echo "ERROR: Ollama is not running. Start with: ollama serve"; exit 1; }
echo "Creating working directory..."
mkdir -p lightrag_workdir
echo "Setup complete. Run index_reflection.py to index session reflections."
