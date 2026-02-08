# O.G.R.E - Ollama Grading Review Evaluator

## About
**O.G.R.E** is a collection of AI-powered grading tools for educators:

1. **Chrome Extension** — Grade student work (text and images) using Ollama Cloud API via a browser side panel with custom rubrics
2. **Autonomous Grading Skill** (`/grade`) — AI agent that automatically grades batches of students on web-based platforms (MyOpenMath, etc.)

This repository contains both tools. Choose the one that fits your workflow:
- **Extension** → Manual grading with AI assistance, one student at a time
- **`/grade` skill** → Fully autonomous batch grading (30+ students in one session)

---

## Chrome Extension

### About
The Chrome extension allows teachers to grade student work, including text and images (like math problems or diagrams), directly within the browser side panel. By leveraging the power of AI models via the Ollama API (Cloud), it supports custom rubrics, which can be imported via text or screenshot, and provides detailed feedback based on the selected AI model.

## Prerequisites

1.  **API Access**: You will need access to an Ollama-compatible API endpoint (e.g., Ollama Cloud).
2.  **API Key**: Ensure you have your API Key ready.
3.  **No Local Setup Required**: You do **not** need to install Ollama locally or pull models manually. The extension uses remote cloud models.

## Installation

1.  Clone or download this repository to a folder on your computer.
2.  Open Google Chrome (or any Chromium-based browser like Edge/Brave).
3.  Navigate to `chrome://extensions/` in the address bar.
4.  Toggle **Developer mode** on in the top right corner.
5.  Click the **Load unpacked** button that appears.
6.  Select the folder containing these files (the folder with `manifest.json`).

## Usage

1.  Click the extension icon in your browser toolbar (or open the Side Panel via the browser menu).
2.  **Config**:
    *   **Ollama URL**: Enter your Cloud API Endpoint (e.g., `https://api.ollama.com` or your provider's URL).
    *   **API Key**: Enter your API Key in the designated field.
    *   **Model**: Select a model from the dropdown (fetched from the cloud).
3.  **Rubric**:
    *   **Text**: Paste rubric text directly.
    *   **Screenshot**: Click "Screenshot Area" to capture a rubric from your screen, then "Import Rubric from Screenshot" to parse it into the table automatically.
    *   *(Note: Rubric import uses a specific high-capacity cloud model automatically).*
4.  **Student Work**:
    *   **Text**: Highlight text on any webpage and click "Get Highlighted Text".
    *   **Images**: Click "Screenshot Area" to capture student work (diagrams, math, etc.).
5.  Click **Run Assessment** to generate feedback based on the rubric.

## Troubleshooting

### Chrome Extension
*   **Connection Failed**: Check your internet connection and verify your **API URL** and **API Key** are correct.
*   **API Error 401 (Unauthorized)**: Your API Key may be missing or invalid.
*   **API Error 400**: If you included screenshots, ensure the selected model supports vision. Text-only models cannot process images.

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
1. Install **[Playwriter Chrome extension](https://chromewebstore.google.com/detail/playwriter/dladdjplhmhnilafldonddlgllbbgelk)**
2. Configure **Playwriter MCP** in your AI environment (OpenCode/Claude Code)
3. Copy `.claude/commands/grade.md` and `.claude/commands/grade-selectors.md` to your project
4. Open your grading page in Chrome and enable Playwriter extension (click icon → turns green)
5. In your AI chat: `/grade https://your-grading-page-url`

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
