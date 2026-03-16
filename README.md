# O.G.R.E - Ollama Grading Review Evaluator

![GitHub Release](https://img.shields.io/github/v/release/shuff57/O.G.R.E-OllamaGradingRubricEvaluator?label=Desktop%20App)
[![Download Latest](https://img.shields.io/badge/Download-Latest%20Release-blue?logo=windows)](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases/latest)
![Build Status](https://img.shields.io/github/actions/workflow/status/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/desktop-build.yml?branch=desktop)

## About
**O.G.R.E** is a collection of AI-powered grading tools for educators:

1. **Desktop App** — Native Windows application with integrated grading server for the ultimate grading experience
2. **Autonomous Grading Skill** (`/grade`) — AI agent that automatically grades batches of students on web-based platforms (MyOpenMath, etc.)

This repository contains both tools. Choose the one that fits your workflow:
- **Desktop App** → Full-featured native application with auto-updates (Windows)
- **`/grade` skill** → Fully autonomous batch grading (30+ students in one session)

---

## 🖥️ Desktop App

### Quick Start

**[📥 Download for Windows](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases/latest)**

Choose your installer:
- **MSI Installer** (Recommended) — Traditional Windows installer
- **NSIS Installer** — Lightweight executable installer

### Features
- ✅ Native Windows application
- ✅ Integrated grading server management
- ✅ Automatic updates when new versions are released
- ✅ Full-featured grading interface with integrated AI model support
- ✅ Secure, cryptographically signed updates

### System Requirements
- Windows 10 or later (64-bit)
- 100 MB free disk space
- Internet connection for AI providers

### Installation
1. Download the installer from the [latest release](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases/latest)
2. Run the `.msi` or `.exe` file
3. Follow the installation wizard
4. The app will automatically check for updates on startup

---

## Troubleshooting

### `/grade` Skill
See **[SETUP.md](SETUP.md#troubleshooting)** for grading skill troubleshooting.

---

## Autonomous Grading Skill

### Overview
The `/grade` skill is an AI agent command that automates batch grading on web-based platforms:
- Extracts rubrics and student responses automatically
- Grades 30+ students per session based on the rubric
- Fills scores and feedback directly on the grading page
- Saves progress automatically and supports resuming

**Currently supported:** MyOpenMath (`gradeallq2.php` pages)

### Quick Start
1. Configure **Playwriter MCP** in your AI environment (OpenCode/Claude Code) — see [SETUP.md](SETUP.md#playwriter-mcp-configuration)
2. Copy `.agents/commands/grade.md` and `.agents/commands/grade-selectors.md` to your AI environment's command folder
3. Open your grading page in Chrome with Playwriter MCP active
4. In your AI chat: `/grade https://your-grading-page-url`

### Full Setup Guide
See **[SETUP.md](SETUP.md)** for complete installation, configuration, and usage instructions.

### Key Features
- **Batch extraction** — all students in one browser call
- **Intelligent grading** — AI evaluates based on rubric, no external API needed
- **Resume capability** — tracks progress in `grade-state.json`, resume anytime
- **Configurable grading philosophy** — customize strictness, partial credit, feedback style
- **Automatic save** — saves every 5 students, prevents data loss
- **Context-aware** — handles up to 30 students per session, auto-resumes for larger classes

---

## Contributing
Contributions are welcome! To add support for new grading platforms (Canvas, Blackboard, etc.), see the [SETUP.md](SETUP.md#adding-new-platforms) guide.

## License
MIT License — see LICENSE file for details.
