# O.G.R.E Desktop E2E Tests

This directory contains end-to-end integration tests for the O.G.R.E Desktop application.

## Prerequisites

1. App must be built in debug mode:
   ```bash
   cd ogre-desktop
   npm run tauri build -- --debug
   ```
2. `sqlite3` must be available in PATH.
3. `curl` must be available in PATH.
4. Windows environment (Git Bash or similar recommended).

## Running Tests

Run all tests:
```bash
npm run test:e2e
```

Or run individual tests:
```bash
bash ogre-desktop/tests/e2e/lifecycle.test.sh
bash ogre-desktop/tests/e2e/config.test.sh
bash ogre-desktop/tests/e2e/history.test.sh
bash ogre-desktop/tests/e2e/tray.test.sh
bash ogre-desktop/tests/e2e/golden-path.test.sh
```

## Test Descriptions

- **lifecycle.test.sh**: Verifies app startup, sidecar server health, and clean shutdown.
- **config.test.sh**: Verifies database persistence of provider configurations across app restarts.
- **history.test.sh**: Verifies that grading sessions logged via the API are correctly persisted to the SQLite database.
- **tray.test.sh**: Verifies that quitting the main application (simulating Tray Quit) correctly stops the background server process.
- **golden-path.test.sh**: Runs the full critical user journey: Launch -> Grade -> Verify Record -> Quit.

## Limitations

- Tray menu interactions (clicking buttons) are not simulated due to platform limitations. We test process lifecycle instead.
- OAuth flows are not tested (requires browser interaction).
- GUI elements (Svelte frontend) are not tested; focus is on Backend/Sidecar integration.
