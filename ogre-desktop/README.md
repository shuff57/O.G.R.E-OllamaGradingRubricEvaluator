# O.G.R.E Desktop

Native Windows desktop application for AI-powered grading with integrated server management.

## 📥 Download

**[Latest Release](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases/latest)**

Choose your preferred installer:
- **MSI Installer** (`.msi`) — Traditional Windows installer package
- **NSIS Installer** (`.exe`) — Lightweight executable installer

## Features

- 🖥️ **Native Windows Application** — Fast, responsive desktop experience
- 🔄 **Automatic Updates** — Get notified when new versions are available
- ⚙️ **Integrated Grading Server** — Manages the backend server automatically
- 🔒 **Secure** — Cryptographically signed updates
- 🎨 **Modern UI** — Built with Svelte and Tauri for optimal performance

## System Requirements

- **OS:** Windows 10 or later (64-bit)
- **RAM:** 4 GB minimum, 8 GB recommended
- **Disk Space:** 100 MB for application + storage for grading data
- **Internet:** Required for AI provider connections

## Installation

1. Download the installer from the [latest release page](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases/latest)
2. Run the downloaded `.msi` or `.exe` file
3. Follow the installation wizard prompts
4. Launch "O.G.R.E Desktop" from your Start Menu

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or later
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Bun](https://bun.sh/) (for grading-server compilation)

### Setup

```bash
# Clone the repository
git clone https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator.git
cd O.G.R.E-OllamaGradingRubricEvaluator

# Build the grading server sidecar
cd grading-server
bun install
bun build --compile --target=bun-windows-x64 server.js --outfile ../ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe
cd ..

# Install desktop app dependencies
cd ogre-desktop
npm install
```

### Development Mode

```bash
# Run in development mode (hot-reload enabled)
npm run tauri:dev
```

This will:
1. Start the Vite dev server (http://localhost:5173)
2. Launch the Tauri app in development mode
3. Enable hot-reload for frontend changes

### Building for Production

```bash
# Build the production app
npm run tauri:build
```

Installers will be created in:
- `src-tauri/target/release/bundle/msi/` — MSI installer
- `src-tauri/target/release/bundle/nsis/` — NSIS installer

### Project Structure

```
ogre-desktop/
├── src/                    # Svelte frontend source
│   ├── App.svelte         # Main application component
│   └── main.js            # Frontend entry point
├── src-tauri/             # Rust backend
│   ├── src/               # Rust source files
│   ├── binaries/          # External binaries (grading-server)
│   ├── icons/             # App icons
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── public/                # Static assets
├── dist/                  # Build output (generated)
├── package.json           # Node dependencies and scripts
└── vite.config.js         # Vite configuration
```

## Building and Releasing

### Creating a Release

See **[RELEASE.md](../RELEASE.md)** in the root directory for complete instructions.

**Quick reference:**

```bash
# 1. Update version numbers
# Edit package.json and src-tauri/tauri.conf.json

# 2. Commit and tag
git add package.json src-tauri/tauri.conf.json
git commit -m "chore: bump version to 0.2.0"
git push origin desktop

git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0

# 3. GitHub Actions will automatically:
#    - Build installers
#    - Create a GitHub Release
#    - Upload all artifacts
```

### Automatic Updates

The app includes an automatic updater that:
- Checks for new versions on startup
- Downloads updates in the background
- Prompts users to install updates
- Verifies update signatures for security

Update configuration is in `src-tauri/tauri.conf.json`:
```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases/latest/download/latest.json"
      ]
    }
  }
}
```

## Technology Stack

- **Frontend:** Svelte 5 + Vite
- **Backend:** Tauri v2 (Rust)
- **Grading Server:** Bun (compiled to standalone executable)
- **Updates:** Tauri updater plugin with signature verification
- **Build:** GitHub Actions CI/CD

## Troubleshooting

### App Won't Launch

- Check Windows Event Viewer for error details
- Ensure you have the latest Windows updates installed
- Try running as administrator

### Update Fails

- Check your internet connection
- Verify firewall isn't blocking the app
- Try manually downloading the latest version

### Grading Server Issues

- The server runs automatically when the app starts
- Check Task Manager to ensure `grading-server.exe` is running
- Logs are stored in the app data directory

### Build Errors

**Missing sidecar binary:**
```bash
cd grading-server
bun install
bun build --compile --target=bun-windows-x64 server.js --outfile ../ogre-desktop/src-tauri/binaries/grading-server-x86_64-pc-windows-msvc.exe
```

**Rust compilation errors:**
```bash
# Update Rust toolchain
rustup update stable
```

**Node/npm issues:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
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
- 📋 [Release Guide](../RELEASE.md)
