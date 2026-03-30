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
Write-Host 'Setup complete. No Python venv required.'
Write-Host "  Index:  python $ScriptDir\index_reflection.py <file.md>"
Write-Host "  Query:  python $ScriptDir\query_memory.py '<query>'"
