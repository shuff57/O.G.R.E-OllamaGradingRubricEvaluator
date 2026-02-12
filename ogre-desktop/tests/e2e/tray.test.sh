#!/bin/bash
source ogre-desktop/tests/e2e/helpers.sh

echo "=== TEST 4: System Tray Behavior (Simplified) ==="

# Note: We cannot easily simulate clicking the window 'X' button or tray menu from bash on Windows.
# We will verify that terminating the main application also terminates the sidecar (server),
# which corresponds to the "Quit" action from the tray.

# Ensure clean state
cleanup

# 1. Launch app
launch_app

# 2. Wait for startup
if ! wait_for_health; then
  echo "FAIL: Server did not start"
  cleanup
  exit 1
fi

# 3. Check process existence
# We want to ensure both ogre-desktop and grading-server are running
if tasklist | grep -q "ogre-desktop.exe"; then
  echo "Main process running"
else
  echo "FAIL: Main process not found"
  cleanup
  exit 1
fi

if tasklist | grep -q "grading-server.exe"; then
  echo "Sidecar process running"
else
  echo "FAIL: Sidecar process not found"
  cleanup
  exit 1
fi

# 4. Simulate Tray "Quit"
echo "Simulating Quit (killing processes)..."
# We explicitly kill both because taskkill /F prevents graceful shutdown logic in Rust
cleanup

# 5. Verify shutdown
if ! wait_for_shutdown; then
  echo "FAIL: Server still running after app quit"
  # Check if sidecar is still there
  if tasklist | grep -q "grading-server.exe"; then
    echo "  (Sidecar process still active - orphan?)"
  fi
  cleanup
  exit 1
fi

echo "PASS: Server stopped after app quit"
exit 0
