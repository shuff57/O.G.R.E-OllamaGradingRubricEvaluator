# Release Guide for O.G.R.E Desktop

This guide covers how to create and publish new releases of the O.G.R.E Desktop application.

## Overview

The O.G.R.E Desktop app uses an automated CI/CD pipeline with GitHub Actions that:
- Builds Windows installers (MSI and NSIS)
- Generates update artifacts with cryptographic signatures
- Creates GitHub Releases automatically when version tags are pushed
- Enables automatic updates for installed applications

## Prerequisites

### Required GitHub Secrets

The following secrets must be configured in your GitHub repository settings (`Settings → Secrets and variables → Actions`):

1. **`TAURI_SIGNING_PRIVATE_KEY`** - The private key for signing update artifacts
2. **`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`** - Password for the private key

#### Generating Signing Keys (First Time Only)

If you haven't generated signing keys yet:

```bash
# Install Tauri CLI if not already installed
npm install -g @tauri-apps/cli

# Generate a new key pair
tauri signer generate -w ~/.tauri/myapp.key

# This creates:
# - Private key: ~/.tauri/myapp.key (keep this SECRET)
# - Public key: printed to console (already in tauri.conf.json)
```

**Important:**
- The **private key** and **password** go into GitHub Secrets
- The **public key** is already in `ogre-desktop/src-tauri/tauri.conf.json` (pubkey field)
- **Never commit the private key to the repository**

To add secrets to GitHub:
1. Go to your repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add `TAURI_SIGNING_PRIVATE_KEY` with the entire contents of your `.key` file
4. Add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` with the password you used

---

## Release Process

### 1. Update Version Number

Edit `ogre-desktop/package.json` and `ogre-desktop/src-tauri/tauri.conf.json`:

```json
// ogre-desktop/package.json
{
  "version": "0.2.0"  // Update this
}

// ogre-desktop/src-tauri/tauri.conf.json
{
  "version": "0.2.0"  // Update this to match
}
```

**Version Format:** Use semantic versioning (`MAJOR.MINOR.PATCH`)
- `MAJOR`: Breaking changes
- `MINOR`: New features (backward compatible)
- `PATCH`: Bug fixes

### 2. Update Changelog (Optional but Recommended)

Create or update `CHANGELOG.md` with release notes:

```markdown
## [0.2.0] - 2026-02-14

### Added
- OAuth device flow for GitHub, OpenAI, and Anthropic
- Collapsible UI sections for better UX

### Fixed
- Build script issue in package.json

### Changed
- Improved provider authentication flow
```

### 3. Commit Version Changes

```bash
git add ogre-desktop/package.json ogre-desktop/src-tauri/tauri.conf.json CHANGELOG.md
git commit -m "chore: bump version to 0.2.0"
git push origin desktop
```

### 4. Create and Push Git Tag

```bash
# Create an annotated tag (recommended)
git tag -a v0.2.0 -m "Release v0.2.0: OAuth flows and UI improvements"

# Push the tag to GitHub
git push origin v0.2.0
```

**Important:** The tag **must** start with `v` (e.g., `v0.2.0`, `v1.0.0`) to trigger the release workflow.

### 5. Monitor the Build

1. Go to `https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/actions`
2. Watch the "Build O.G.R.E Desktop" workflow
3. The workflow will:
   - Build the grading-server sidecar binary
   - Build the Tauri desktop app
   - Create installers (MSI and NSIS)
   - Create a GitHub Release with all artifacts attached

### 6. Verify the Release

Once the workflow completes (usually 5-10 minutes):

1. Go to `https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases`
2. Verify the new release appears with:
   - Windows MSI installer (`.msi`)
   - Windows NSIS installer (`.exe`)
   - Update manifest (`latest.json`)
   - Signature files (`.sig`)
3. Download and test the installer on a clean Windows machine

---

## What Happens After Release

### Automatic Updates

Once users install your app:
1. The app checks for updates using the endpoint in `tauri.conf.json`:
   ```
   https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases/latest/download/latest.json
   ```
2. When a new version is released, users are prompted to update
3. Updates are downloaded and verified using the signature
4. Users can install the update with one click

### User Installation

Users can download installers from:
- **Latest Release:** `https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases/latest`
- **All Releases:** `https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases`

**MSI vs NSIS:**
- **MSI**: Traditional Windows installer (recommended for most users)
- **NSIS**: Lightweight executable installer

---

## Troubleshooting

### Build Fails with "Sidecar binary not found"

The grading-server binary wasn't compiled. Check:
- `grading-server/` directory exists
- Bun is installed in the GitHub Actions runner
- Build command in workflow is correct

### Build Fails with "Tauri build error"

Check:
- `npm run tauri:build` script exists in `ogre-desktop/package.json`
- All dependencies are in `package.json` and `Cargo.toml`
- No syntax errors in `tauri.conf.json`

### Release Not Created

The release job only runs for tags starting with `v`. Check:
- Tag format is `v0.2.0` (not `0.2.0` or `release-0.2.0`)
- Tag was pushed to GitHub: `git push origin v0.2.0`
- Workflow permissions allow creating releases (requires `contents: write`)

### Updater Not Working

Check:
- Public key in `tauri.conf.json` matches the private key used for signing
- `TAURI_SIGNING_PRIVATE_KEY` secret is set correctly in GitHub
- Update endpoint URL is correct
- `latest.json` is accessible at the endpoint URL

---

## Release Checklist

- [ ] Update version in `package.json`
- [ ] Update version in `tauri.conf.json`
- [ ] Update `CHANGELOG.md` with release notes
- [ ] Commit version changes
- [ ] Create annotated git tag (`v*.*.*`)
- [ ] Push tag to GitHub
- [ ] Monitor GitHub Actions workflow
- [ ] Verify release artifacts on GitHub
- [ ] Test installer on clean Windows machine
- [ ] Update README.md download links if needed
- [ ] Announce release to users

---

## Quick Reference

```bash
# Complete release workflow
cd ogre-desktop
# 1. Update versions in package.json and tauri.conf.json
# 2. Update CHANGELOG.md
git add package.json src-tauri/tauri.conf.json ../CHANGELOG.md
git commit -m "chore: bump version to 0.2.0"
git push origin desktop

# 3. Create and push tag
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0

# 4. Wait for GitHub Actions, then verify at:
# https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/releases
```

---

## Advanced: Pre-releases and Beta Testing

To create a pre-release (not marked as "latest"):

```bash
# Create a pre-release tag
git tag -a v0.2.0-beta.1 -m "Beta release v0.2.0-beta.1"
git push origin v0.2.0-beta.1
```

Then manually mark the GitHub Release as "Pre-release" in the GitHub UI.

---

## Support

For issues with the release process:
1. Check [GitHub Actions logs](https://github.com/shuff57/O.G.R.E-OllamaGradingRubricEvaluator/actions)
2. Review [Tauri documentation](https://tauri.app/v1/guides/distribution/)
3. Open an issue in this repository
