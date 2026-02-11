# O.G.R.E Grading Server

The grading server enables **true cross-student consistency** by grading all students in a single AI context with scoring anchors, outlier detection, and second-pass review.

## Quick Start (For Teachers)

### 1. Download

Download the executable for your system from the latest release:
- **Windows**: `grading-server-win.exe`
- **Mac (Intel)**: `grading-server-mac`
- **Mac (Apple Silicon)**: `grading-server-mac-arm`
- **Linux**: `grading-server-linux`

### 2. Run

**Windows:**
1. Double-click `grading-server-win.exe`
2. If Windows shows a security warning, click "More info" → "Run anyway"

**Mac/Linux:**
1. Open Terminal
2. Make executable: `chmod +x grading-server-mac`
3. Run: `./grading-server-mac`
4. If Mac shows "unverified developer" warning:
   - Open System Settings → Privacy & Security
   - Click "Open Anyway" next to the blocked message

### 3. Keep Running

You'll see this banner when the server starts:

```
╔═══════════════════════════════════════════════════════════════╗
║           O.G.R.E Grading Server v1.0.0                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Status:  RUNNING                                             ║
║  Address: http://localhost:3456                               ║
╠═══════════════════════════════════════════════════════════════╣
║  HOW TO USE:                                                  ║
║  1. Keep this window open while grading                       ║
║  2. Open your grading page in Chrome                          ║
║  3. Use the O.G.R.E extension's "Batch" mode                  ║
║  4. The extension will automatically use this server          ║
╠═══════════════════════════════════════════════════════════════╣
║  TO STOP: Close this window or press Ctrl+C                   ║
╚═══════════════════════════════════════════════════════════════╝
```

**Keep this window open** while grading. You'll see activity logs when the extension uses the server.

### 4. Use the Extension

The O.G.R.E extension automatically detects and uses the server:
- **Server running**: Extension uses batch grading (all students in one AI call)
- **Server not running**: Extension falls back to per-student mode

No configuration needed — it just works!

### 5. Stop

Close the terminal window or press `Ctrl+C` to stop the server.

---

## Why Use the Server?

### Without Server (Per-Student Mode)
- Each student graded individually
- AI has no context from other students
- Scores can drift (similar work gets different scores)
- Example: First student scores 8/10, last student with identical work scores 6/10

### With Server (Batch Mode)
- ✅ All students graded together with **scoring anchors**
- ✅ AI sees all responses at once for **consistent calibration**
- ✅ **Outlier detection** flags suspicious scores for review
- ✅ **Chunking** for large classes (20 students per batch with anchor bridging)
- ✅ Same rubric → same scores for same quality work

**Result**: Fair, consistent grading across all students.

---

## API Reference

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

### `POST /grade`

Grade a batch of students against a rubric.

**Request Body:**
```json
{
  "provider": "ollama|openai|anthropic|gemini",
  "apiUrl": "http://localhost:11434",
  "apiKey": "your-api-key",
  "model": "llama3.2",
  "rubric": {
    "essayPrompt": "Question prompt",
    "checklistItems": [
      {
        "category": "Understanding (5 points)",
        "points": 5,
        "items": ["Shows comprehension", "Uses examples"]
      }
    ],
    "rubricItems": [
      {
        "category": "Key Concepts",
        "items": ["Concept A", "Concept B"]
      }
    ],
    "modelText": "Example perfect answer",
    "maxScore": "10"
  },
  "students": [
    {
      "index": 0,
      "name": "Student Name",
      "response": "Student's answer text"
    }
  ],
  "config": {}
}
```

**Response:**
```json
{
  "results": [
    {
      "studentIndex": 0,
      "score": 8,
      "feedback": "Good understanding, minor gaps in explanation."
    }
  ],
  "anchors": {
    "excellent": 9,
    "adequate": 6,
    "minimal": 3
  },
  "stats": {
    "mean": 7.5,
    "stdDev": 1.2,
    "outliers": 1
  },
  "metadata": {
    "totalStudents": 25,
    "chunks": 2,
    "elapsedSeconds": 12.4
  }
}
```

**Error Response:**
```json
{
  "error": "Missing required field: provider",
  "details": "Additional context"
}
```

---

## Troubleshooting

### "Port 3456 already in use"

Another program is using port 3456.

**Fix:**
1. Stop other instances of the grading server
2. Check if another program uses port 3456:
   - Windows: `netstat -ano | findstr :3456`
   - Mac/Linux: `lsof -i :3456`
3. Kill the process or change the server port (edit `server.js`)

### Extension says "Server not running"

The server isn't reachable at `http://localhost:3456`.

**Fix:**
1. Check server window shows "RUNNING" status
2. Test manually: `curl http://localhost:3456/health`
3. Check firewall isn't blocking localhost connections
4. Restart the server

### "Provider API error: 401"

Your API key is invalid or missing.

**Fix:**
1. Check API key in extension settings
2. Verify key is valid for the selected provider
3. For Ollama: ensure Ollama is running (`ollama serve`)

### Slow grading (30+ students)

Server automatically chunks students into batches of 20.

**What happens:**
- Students 1-20: Graded in first batch
- Students 21-40: Graded in second batch with anchor responses from first batch
- This maintains consistency across chunks

**Performance:**
- 20 students: ~10-15 seconds
- 40 students: ~20-30 seconds
- 60 students: ~30-45 seconds

Depends on AI provider speed and model size.

### Mac: "App can't be opened because it is from an unidentified developer"

Mac Gatekeeper blocks unsigned apps.

**Fix:**
1. Right-click `grading-server-mac` → "Open"
2. Click "Open" in the warning dialog
3. OR: System Settings → Privacy & Security → "Open Anyway"

---

## Developer Guide

### Manual Build

Requires [Bun](https://bun.sh) installed.

```bash
cd grading-server
bun install
bun run build:windows  # Windows .exe
bun run build:mac      # Mac (Intel)
bun run build:mac-arm  # Mac (Apple Silicon)
bun run build:linux    # Linux binary
bun run build          # All platforms
```

Executables created in `dist/` folder.

### Run from Source

```bash
cd grading-server
bun install
bun run start
```

### Run Tests

```bash
cd grading-server
bun test              # Run all tests
bun test --watch      # Watch mode
```

### Project Structure

```
grading-server/
├── server.js          # Main HTTP server (Hono)
├── grading.js         # Core grading logic
├── providers.js       # AI provider adapters
├── test/
│   ├── grading.test.js
│   └── providers.test.js
├── dist/              # Compiled executables (after build)
└── package.json
```

---

## Supported AI Providers

- **Ollama** (local or cloud)
- **OpenAI** (GPT-4, GPT-3.5)
- **Anthropic** (Claude)
- **Google Gemini**

All providers must support chat completion format. The extension handles OAuth tokens for Gemini and GitHub Models.

---

## License

Same as parent O.G.R.E project (MIT).

