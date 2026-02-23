@echo off
REM O.G.R.E Grading Server Launcher
REM This script runs the grading server using Bun

cd /d "%~dp0"
bun run server.js
