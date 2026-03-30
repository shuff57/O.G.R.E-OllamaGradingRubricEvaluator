---
name: claude-peers
description: Real-time peer discovery and messaging between concurrent Claude Code sessions via localhost broker
type: capability
---

# Claude Peers MCP

Real-time messaging between concurrent Claude Code instances on the same machine.

## What It Does

- **Peer discovery** — find other running Claude Code sessions (scoped by machine, directory, or git repo)
- **Direct messaging** — send/receive messages between sessions in real time
- **Work summaries** — each session broadcasts what it's doing so others can find the right peer

## Architecture

- **Broker daemon** (`~/claude-peers-mcp/broker.ts`) — singleton HTTP server on `localhost:7899` with SQLite backing; auto-launched by first MCP server
- **MCP server** (`~/claude-peers-mcp/server.ts`) — one per Claude Code session; registers with broker, exposes tools, pushes channel notifications
- **Ephemeral** — peers and messages disappear when sessions end (use Hivemind for durable memory)

## Tools Available

| Tool | Purpose |
|------|---------|
| `list_peers` | Discover other Claude Code instances (scope: machine/directory/repo) |
| `send_message` | Send message to a specific peer by ID |
| `set_summary` | Update your work description visible to other peers |
| `check_messages` | Manual fallback to poll for new messages |

## When to Use

- Running parallel sessions (e.g., one grading, one authoring) that need to coordinate
- Swarm-style work where multiple terminals handle different phases
- Checking if another session is already working on something before starting

## When NOT to Use

- For durable cross-session memory → use Hivemind (`session-reflector`)
- For milestone/planning state → use `.planning/` and GSD
- For reaching Pi agents → those are on the Pi network, not localhost

## Setup

Installed at `~/claude-peers-mcp/`. Registered with `--scope user` so it's available from any directory.

```bash
# Setup is included in the agents setup script:
bash .agents/memory/scripts/setup.sh

# Or manual quickstart:
git clone https://github.com/louislva/claude-peers-mcp.git ~/claude-peers-mcp
cd ~/claude-peers-mcp && bun install
claude mcp add --scope user --transport stdio claude-peers -- bun ~/claude-peers-mcp/server.ts

# Launch — broker starts automatically on first run:
claude --dangerously-skip-permissions --dangerously-load-development-channels server:claude-peers
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLAUDE_PEERS_PORT` | `7899` | Broker port |
| `CLAUDE_PEERS_DB` | `~/claude-peers.db` | SQLite database location |
