# O.G.R.E - Ollama Grading Review Evaluator

## About
**O.G.R.E** (Ollama Grading Review Evaluator) is a Chrome extension designed to streamline the grading process for educators. By leveraging the power of AI models via the Ollama API (Cloud), it allows teachers to grade student work, including text and images (like math problems or diagrams), directly within the browser side panel. It supports custom rubrics, which can be imported via text or screenshot, and provides detailed feedback based on the selected AI model.

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

*   **Connection Failed**: Check your internet connection and verify your **API URL** and **API Key** are correct.
*   **API Error 401 (Unauthorized)**: Your API Key may be missing or invalid.
*   **API Error 400**: If you included screenshots, ensure the selected model supports vision. Text-only models cannot process images.
