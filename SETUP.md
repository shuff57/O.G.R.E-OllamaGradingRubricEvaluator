# Grading Skill Setup Guide

This guide explains how to set up and use the **autonomous grading skill** (`/grade`) for AI-powered batch grading on web-based platforms.

## What is the Grading Skill?

The `/grade` skill is an AI agent command that:
- Navigates to your grading page (e.g., MyOpenMath)
- Extracts the rubric and all student responses automatically
- Grades each student based on the rubric
- Fills in scores and feedback directly on the page
- Saves progress automatically and supports resuming sessions

**Currently supported platforms:** MyOpenMath (`gradeallq2.php` pages)

## Prerequisites

Before using the grading skill, you need:

### 1. Chrome Browser
Any Chromium-based browser works (Chrome, Edge, Brave).

### 2. Playwriter MCP
The skill uses **Playwriter MCP** to control your browser and interact with grading pages.

Playwriter MCP is configured as an MCP server in your AI environment — see [Playwriter MCP Configuration](#4-playwriter-mcp-configuration) below.

### 3. AI Environment with MCP Support
You need an AI environment that supports the Model Context Protocol (MCP):

- **OpenCode** (recommended) — [Download here](https://github.com/CloudEngineHub/opencode)
- **Claude Code** — [Claude Desktop](https://claude.ai/download)
- Any MCP-compatible AI agent platform

### 4. Playwriter MCP Configuration

**For OpenCode:**
1. Open OpenCode settings
2. Navigate to **MCP Servers** section
3. Add Playwriter MCP:
   ```json
   {
     "playwriter": {
       "command": "npx",
       "args": ["-y", "playwriter@latest", "mcp"]
     }
   }
   ```
4. Restart OpenCode

**For Claude Code:**
1. Open `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
2. Add under `mcpServers`:
   ```json
   {
     "mcpServers": {
       "playwriter": {
         "command": "npx",
         "args": ["-y", "playwriter@latest", "mcp"]
       }
     }
   }
   ```
3. Restart your AI coding tool

## Installing the Grade Skill

### Option 1: Copy to Project Directory
1. Copy `.agents/commands/grade.md` and `.agents/commands/grade-selectors.md` to your AI environment's command folder
   - **OpenCode:** Configure as commands in `opencode.json`
   - **Other MCP tools:** Place in your tool's command directory
2. The skill will be available as `/grade` in any AI conversation in that project

### Option 2: Install Globally (User-Level Commands)
1. Copy both files to your AI environment's global command location
   - See your tool's documentation for global command paths
2. The skill will be available in all projects

## Using the Grading Skill

### First-Time Setup (Per Session)

1. **Open your grading page** in Chrome (e.g., MyOpenMath grading page)
2. **Ensure Playwriter MCP is active** in your AI environment (configured in MCP settings)
3. **Keep the tab open** — the AI will control this tab to extract data and fill grades

### Basic Usage

In your AI chat, invoke the skill:

```
/grade
```

Or provide the URL directly:

```
/grade https://www.myopenmath.com/course/gradeallq2.php?...
```

The AI will:
1. Ask for the grading page URL (if not provided)
2. Check if you want to resume from a previous session
3. Navigate to the page and extract the rubric + all student responses
4. Grade each student based on the rubric
5. Fill scores and feedback in batches of 5
6. Save after each batch automatically

### Resuming a Session

The skill automatically tracks your progress in `grade-state.json`. If you start a new session:

1. Invoke `/grade` with the same URL
2. The AI will detect your previous session:
   > "I found a previous session for this page. Last graded: **Smith, John** (15 students, Feb 8).
   > Resume after Smith, John? Or start fresh?"
3. Choose:
   - **Resume** — continue from where you left off
   - **Start fresh** — grade all ungraded students from the beginning
   - **Type a name** — resume from a specific student

### Skipping Already-Graded Students

The skill automatically skips students who already have feedback. If a student has:
- **Score + feedback** — skipped (already graded)
- **Score only, no feedback** — feedback will be added, score preserved
- **No score, no feedback** — will be graded

### Context Limits

The AI can grade up to **30 students per session**. After 30:
- The session stops automatically
- Progress is saved to `grade-state.json`
- Start a new conversation and invoke `/grade` again with the same URL
- The AI will offer to resume from where you left off

## Grading Philosophy

The skill grades with this philosophy (configurable in `grade.md`):

- **Generous with high school students** — focus on understanding, not polish
- **Substantial partial credit** — correct reasoning with minor errors still earns most points
- **Conceptual vs. minor errors** — distinguish serious misunderstandings from typos
- **Minimum 60% for substantive attempts** — any real engagement with the prompt earns credit

You can customize this in `.agents/commands/grade.md` under "Grading Philosophy".

## Troubleshooting

### "No Playwright pages are available"
**Solution:** Ensure Playwriter MCP is configured and active in your AI environment. Verify Chrome is running with the target tab open.

### "Playwriter not available"
**Solution:** 
1. Verify Playwriter MCP is configured in your AI environment settings
2. Restart your AI environment (OpenCode/Claude Code)
3. Check that Chrome is running

### "Unsupported platform"
**Solution:** Currently, only MyOpenMath (`gradeallq2.php` pages) is supported. Other platforms can be added by extending `grade-selectors.md`.

### Grading seems incorrect
**Solution:** The AI grades based on the extracted rubric. You can:
1. Check the rubric extraction by asking the AI to show it
2. Modify grading philosophy in `grade.md`
3. Provide specific grading criteria when invoking the skill

### Need to stop mid-session
**Solution:** Just stop the conversation. Progress is automatically saved every 5 students to `grade-state.json`. Resume later with `/grade <URL>`.

## Platform Support

### Currently Supported
- **MyOpenMath** (`gradeallq2.php` pages) — full support for rubric extraction, feedback, and scoring

### Adding New Platforms
To add support for other platforms (Canvas, Blackboard, etc.):
1. Edit `.agents/commands/grade-selectors.md`
2. Add platform-specific DOM selectors
3. Document the platform's structure (student sections, rubric location, score inputs, feedback fields)

## Advanced Configuration

### Customizing Grading Criteria
Edit `.agents/commands/grade.md` to customize:
- **Grading Philosophy** (lines 21-28) — how generous/strict to grade
- **Max Score** — auto-extracted, but can be overridden
- **Batch Size** — currently 5 students per save, can be adjusted

### Changing Feedback Format
Math formatting uses LaTeX with `\( ... \)` delimiters for inline math. Example:
```
The sample mean \(\bar{x}\) approximates \(\mu\) as \(n\) increases.
```

Most LMS platforms (MyOpenMath, Canvas, Blackboard) render MathJax automatically.

## Files Involved

| File | Purpose |
|------|---------|
| `.agents/commands/grade.md` | Main skill logic and workflow for AI agents |
| `.agents/commands/grade-selectors.md` | Platform-specific DOM selectors (MyOpenMath currently) |
| `grade-state.json` | Tracks last graded student per URL for resuming |

## Getting Help

If you encounter issues:
1. Verify Playwriter MCP is configured in your AI environment settings
2. Check that Chrome is running with your grading tab open
3. Check `grade-state.json` for session state
4. Review the skill documentation in `.agents/commands/grade.md`

For bugs or feature requests, open an issue on the repository.
