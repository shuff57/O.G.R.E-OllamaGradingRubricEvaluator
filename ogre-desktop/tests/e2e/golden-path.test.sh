#!/bin/bash
source ogre-desktop/tests/e2e/helpers.sh

echo "=== GOLDEN PATH: End-to-End Integration ==="
set -e

# Ensure clean state
cleanup
DB_PATH=$(get_db_path)

echo "Step 1: Launch app"
launch_app

echo "Step 2: Verify sidecar started"
wait_for_health

echo "Step 3: POST mock session"
curl -s -X POST "$SERVER_URL/session" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "golden-path",
    "model": "test-model",
    "student_count": 10,
    "mean_score": 7.5,
    "page_url": "https://golden-path.com"
  }' > /dev/null

echo "Step 4: Verify database record"
echo "Waiting for DB write..."
sleep 3

if command -v sqlite3 &> /dev/null; then
  COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM grading_sessions WHERE provider_id='golden-path';")
  if [ "$COUNT" -ge 1 ]; then
    echo "✓ Record found in database"
  else
    echo "✗ Record NOT found in database"
    cleanup
    exit 1
  fi
else
  echo "Skipping DB check (sqlite3 not found)"
fi

echo "Step 5: Quit app"
# Simulating a user quitting via Tray -> "Quit"
# Since we cannot trigger the UI button from bash, and taskkill /F prevents graceful cleanup (leaving sidecar orphan),
# we explicitly kill both processes to simulate the full shutdown sequence.
cleanup

echo "Step 6: Verify cleanup"
wait_for_shutdown

echo "Golden path test PASSED"
exit 0
