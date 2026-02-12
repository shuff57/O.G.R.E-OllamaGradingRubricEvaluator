#!/bin/bash
source ogre-desktop/tests/e2e/helpers.sh

echo "=== TEST 3: Grading History Recording ==="

# Ensure clean state
cleanup
DB_PATH=$(get_db_path)

# 1. Launch app
launch_app

# 2. Wait for sidecar startup
if ! wait_for_health; then
  echo "FAIL: Server did not start"
  cleanup
  exit 1
fi

# 3. POST mock session
# Note: Sending keys in snake_case as expected by ogre-desktop/src-tauri/src/lib.rs
echo "Posting mock session..."
RESPONSE=$(curl -s -X POST "$SERVER_URL/session" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "openai",
    "model": "gpt-4o",
    "student_count": 5,
    "mean_score": 8.2,
    "min_score": 6.0,
    "max_score": 10.0,
    "median_score": 8.5,
    "max_possible_score": 10.0,
    "page_url": "https://test.com"
  }')

echo "Response: $RESPONSE"

if [[ "$RESPONSE" != *'"ok":true'* ]]; then
  echo "FAIL: POST /session failed"
  cleanup
  exit 1
fi

# 4. Wait for database write (async log processing)
echo "Waiting for DB write..."
sleep 3

# 5. Query DB
echo "Querying database..."
if command -v sqlite3 &> /dev/null; then
  COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM grading_sessions;")
  echo "Session count: $COUNT"
  
  if [ "$COUNT" -lt 1 ]; then
    echo "FAIL: No session recorded in DB"
    cleanup
    exit 1
  fi
  
  LATEST=$(sqlite3 "$DB_PATH" "SELECT provider_id, model, student_count FROM grading_sessions ORDER BY id DESC LIMIT 1;")
  echo "Latest record: $LATEST"
  
  if [[ "$LATEST" == *"openai|gpt-4o|5"* ]]; then
    echo "PASS: History recorded correctly"
  else
    echo "FAIL: Record mismatch. Expected 'openai|gpt-4o|5', got '$LATEST'"
    cleanup
    exit 1
  fi
else
  echo "SKIP: sqlite3 command not found (cannot verify DB)"
  cleanup
  exit 0
fi

cleanup
exit 0
