#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMORIES_DIR="$HOME/agent-memories/hivemind"

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
echo "=== Claude Peers MCP Setup ==="

PEERS_DIR="$HOME/claude-peers-mcp"

# Check bun
if command -v bun > /dev/null 2>&1; then
    echo "  Bun: $(bun --version)"
else
    echo "  WARNING: Bun not installed. Install from https://bun.sh"
    echo "  Claude Peers requires Bun to run."
fi

# Clone or update
if [ -d "$PEERS_DIR" ]; then
    echo "  claude-peers-mcp: found at $PEERS_DIR"
    cd "$PEERS_DIR" && git pull --ff-only 2>/dev/null && bun install --silent 2>/dev/null
    echo "  Updated to latest."
else
    echo "  Cloning claude-peers-mcp..."
    git clone https://github.com/louislva/claude-peers-mcp.git "$PEERS_DIR" 2>/dev/null
    cd "$PEERS_DIR" && bun install --silent 2>/dev/null
    echo "  Installed at $PEERS_DIR"
fi

# Register MCP server with user scope (available from any directory)
if command -v claude > /dev/null 2>&1; then
    claude mcp add --scope user --transport stdio claude-peers -- bun "$PEERS_DIR/server.ts" 2>/dev/null || true
    echo "  MCP server: registered (user scope)"
else
    echo "  NOTE: Run 'claude mcp add --scope user --transport stdio claude-peers -- bun $PEERS_DIR/server.ts'"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Hivemind memory (no Python venv required):"
echo "  Index:  python3 $SCRIPT_DIR/index_reflection.py <file.md>"
echo "  Query:  python3 $SCRIPT_DIR/query_memory.py '<query>'"
echo ""
echo "Claude Peers (real-time inter-session messaging):"
echo "  Launch with channels: claude --dangerously-load-development-channels server:claude-peers"
