#!/bin/bash
source ogre-desktop/tests/e2e/helpers.sh

echo "=== TEST 1: Full App Lifecycle ==="

# Ensure clean state
cleanup

# 1. Launch app
launch_app

# 2. Wait for sidecar startup
if ! wait_for_health; then
  echo "FAIL: Server did not start"
  cleanup
  exit 1
fi

# 3. Verify sidecar health
STATUS=$(curl -s "$SERVER_URL/health")
if [[ "$STATUS" == *'"status":"ok"'* ]]; then
  echo "PASS: /health returned ok"
else
  echo "FAIL: /health returned $STATUS"
  cleanup
  exit 1
fi

# 4. Kill app process
echo "Killing app..."
cleanup

# 5. Verify shutdown
if ! wait_for_shutdown; then
  echo "FAIL: Server did not stop after app kill"
  exit 1
fi

echo "PASS: Lifecycle test completed successfully"
exit 0
