#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MemoriesDir = Join-Path $env:USERPROFILE 'agent-memories\hivemind'

Write-Host '=== Hivemind Memory Setup ==='

# Ensure memories directory
if (-not (Test-Path $MemoriesDir)) {
    New-Item -ItemType Directory -Path $MemoriesDir -Force | Out-Null
}
$MemoriesFile = Join-Path $MemoriesDir 'memories.jsonl'
if (-not (Test-Path $MemoriesFile)) {
    New-Item -ItemType File -Path $MemoriesFile | Out-Null
}
Write-Host "  Memories file: $MemoriesFile"

# Check Ollama
Write-Host 'Checking Ollama...'
try {
    $null = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 5
    Write-Host '  Ollama: running'
} catch {
    Write-Host '  WARNING: Ollama not running. Start with: ollama serve'
    Write-Host '  Memory will still work (no embeddings until Ollama available)'
}

# Check/pull embedding model
Write-Host 'Checking nomic-embed-text model...'
try {
    $models = & ollama list 2>&1
    if ($models -match 'nomic-embed-text') {
        Write-Host '  nomic-embed-text: available'
    } else {
        Write-Host '  Pulling nomic-embed-text...'
        & ollama pull nomic-embed-text
    }
} catch {
    Write-Host "  WARNING: Could not check/pull. Run 'ollama pull nomic-embed-text' manually."
}

Write-Host ''
Write-Host '=== Claude Peers MCP Setup ==='

$PeersDir = Join-Path $env:USERPROFILE 'claude-peers-mcp'

# Check bun
$bunPath = Get-Command bun -ErrorAction SilentlyContinue
if ($bunPath) {
    $bunVersion = & bun --version 2>&1
    Write-Host "  Bun: $bunVersion"
} else {
    Write-Host '  WARNING: Bun not installed. Install from https://bun.sh'
    Write-Host '  Claude Peers requires Bun to run.'
}

# Clone or update
if (Test-Path $PeersDir) {
    Write-Host "  claude-peers-mcp: found at $PeersDir"
    Push-Location $PeersDir
    & git pull --ff-only 2>&1 | Out-Null
    & bun install --silent 2>&1 | Out-Null
    Pop-Location
    Write-Host '  Updated to latest.'
} else {
    Write-Host '  Cloning claude-peers-mcp...'
    & git clone https://github.com/louislva/claude-peers-mcp.git $PeersDir 2>&1 | Out-Null
    Push-Location $PeersDir
    & bun install --silent 2>&1 | Out-Null
    Pop-Location
    Write-Host "  Installed at $PeersDir"
}

# Register MCP server with user scope (available from any directory)
$claudePath = Get-Command claude -ErrorAction SilentlyContinue
if ($claudePath) {
    & claude mcp add --scope user --transport stdio claude-peers -- bun "$PeersDir\server.ts" 2>&1 | Out-Null
    Write-Host '  MCP server: registered (user scope)'
} else {
    Write-Host "  NOTE: Run 'claude mcp add --scope user --transport stdio claude-peers -- bun $PeersDir\server.ts'"
}

Write-Host ''
Write-Host '=== Setup Complete ==='
Write-Host ''
Write-Host 'Hivemind memory (no Python venv required):'
Write-Host "  Index:  python $ScriptDir\index_reflection.py <file.md>"
Write-Host "  Query:  python $ScriptDir\query_memory.py '<query>'"
Write-Host ''
Write-Host 'Claude Peers (real-time inter-session messaging):'
Write-Host '  Launch with channels: claude --dangerously-load-development-channels server:claude-peers'
