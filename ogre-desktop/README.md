# O.G.R.E Desktop

Native desktop application (Linux + Windows) for AI-powered grading with integrated server management.

## 📥 Download

**[Latest Release](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases/latest)**

Choose your preferred installer:
- **AppImage** (`.AppImage`) — Linux portable bundle
- **NSIS Installer** (`.exe`) — Windows lightweight executable installer

## Features

- 🖥️ **Native Desktop Application** — Fast, responsive desktop experience (Linux + Windows)
- 🔄 **Automatic Updates** — Get notified when new versions are available
- ⚙️ **Integrated Grading Server** — Manages the backend server automatically
- 🔒 **Secure** — Cryptographically signed updates
- 🎨 **Modern UI** — Built with Svelte and Electron for optimal performance
- 🌐 **CDP Browser Control** — Consistent, cross-platform browser automation via Chrome DevTools Protocol

## System Requirements

- **Linux:** Ubuntu 18.04+ / Debian 10+ (64-bit) or **Windows 10+** (64-bit)
- **RAM:** 4 GB minimum, 8 GB recommended
- **Disk Space:** 200 MB for application + storage for grading data
- **Internet:** Required for AI provider connections

## Installation

1. Download the installer from the [latest release page](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases/latest)
2. **Linux:** `chmod +x O.G.R.E-Desktop-*.AppImage && ./O.G.R.E-Desktop-*.AppImage`
3. **Windows:** Run the downloaded `.exe` file and follow the installation wizard
4. The app will automatically check for updates on startup

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or later
- npm v10 or later

### Setup

```bash
# Clone the repository
git clone https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator.git
cd O.G.R.E-OllamaGradingRubricEvaluator

# Install desktop app dependencies
cd ogre-desktop
npm install
```

### Development Mode

```bash
# Run in development mode (hot-reload enabled)
npm run electron:dev
```

This will:
1. Start the Vite dev server (http://localhost:5173)
2. Launch the Electron app in development mode
3. Enable hot-reload for frontend changes

### Building for Production

```bash
# Build the production app
npm run electron:build
```

Installers will be created in:
- `dist-electron/` — Compiled Electron main process
- `release/` — AppImage (Linux) and NSIS installer (Windows)

### Project Structure

```
ogre-desktop/
├── src/                        # Svelte frontend source
│   ├── App.svelte             # Main application component
│   ├── lib/                   # Shared libraries (browser, grading, agent loop)
│   └── pages/                 # Page components
├── electron-main/             # Electron main process (Node.js)
│   ├── main.ts                # Entry point, BrowserWindow creation
│   ├── preload.ts             # Secure contextBridge IPC bridge
│   ├── browser-manager.ts     # WebContentsView + CDP management
│   ├── cdp-bridge.ts          # CDP method allowlist + forwarding
│   ├── database.ts            # SQLite via better-sqlite3
│   ├── ipc-handlers.ts        # All IPC channel registrations
│   ├── oauth-server.ts        # Local OAuth callback server
│   ├── server-manager.ts      # Grading server lifecycle
│   └── updater.ts             # electron-updater (auto-update)
├── public/                    # Static assets
├── dist-electron/             # Compiled main process (generated)
├── electron-builder.yml       # electron-builder config (AppImage + NSIS)
├── package.json               # Node dependencies and scripts
└── vite.config.js             # Vite configuration with vite-plugin-electron
```

## Building and Releasing

### Creating a Release

**Quick reference:**

```bash
# 1. Update version number
# Edit package.json version field

# 2. Commit and tag
git add package.json
git commit -m "chore: bump version to 0.2.0"
git push origin desktop

git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0

# 3. GitHub Actions will automatically:
#    - Build AppImage (Linux) + NSIS installer (Windows)
#    - Create a GitHub Release
#    - Upload all artifacts
```

### Automatic Updates

The app includes an automatic updater (electron-updater) that:
- Checks for new versions on startup via GitHub Releases
- Downloads updates in the background
- Prompts users to install updates
- Verifies update signatures for security

Update endpoint is configured in `electron-builder.yml`:
```yaml
publish:
  provider: github
  owner: shuff57
  repo: O.G.R.E-OllamaGradingRubricEvaluator
```

## Technology Stack

- **Frontend:** Svelte 5 + Vite
- **Backend:** Electron (Node.js)
- **Browser Control:** Chrome DevTools Protocol (CDP) via Electron's `webContents.debugger`
- **Database:** SQLite via `better-sqlite3`
- **Grading Server:** Bun/Node.js (spawned as child process)
- **Updates:** `electron-updater` with GitHub Releases
- **Build:** electron-builder + GitHub Actions CI/CD

## Troubleshooting

### App Won't Launch

- **Linux:** Ensure AppImage has execute permission: `chmod +x *.AppImage`
- **Windows:** Check Windows Event Viewer for error details
- Try running from terminal to see error output

### Update Fails

- Check your internet connection
- Verify firewall isn't blocking the app
- Try manually downloading the latest version

### Grading Server Issues

- The server runs automatically when the app starts
- Check your system process list for the grading server process
- Logs are stored in the app data directory (`~/.config/ogre-desktop/` on Linux)

### Build Errors

**Node/npm issues:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**TypeScript errors in electron-main/:**
```bash
cd electron-main
npx tsc --noEmit
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License — see [LICENSE](../LICENSE) file for details.

## Support

- 📖 [Main Documentation](../README.md)
- 🐛 [Report Issues](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/issues)
- 📦 [Latest Releases](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases)
