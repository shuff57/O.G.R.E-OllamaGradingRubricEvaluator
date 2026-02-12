#!/bin/bash
source ogre-desktop/tests/e2e/helpers.sh

echo "=== TEST 2: Provider Config Persistence ==="

# Ensure clean state
cleanup
DB_PATH=$(get_db_path)
echo "DB Path: $DB_PATH"

# 1. Clean database (if exists)
if [ -f "$DB_PATH" ]; then
  echo "Removing existing DB..."
  rm "$DB_PATH"
fi

# 2. Launch app (this should create the DB and tables via migration)
launch_app

# 3. Wait for initialization (sidecar health check is a good proxy for app being ready)
if ! wait_for_health; then
  echo "FAIL: App failed to initialize"
  cleanup
  exit 1
fi

# 4. Insert test provider config via SQL
# Note: In WAL mode, we can write while app is open, but might need to be careful.
echo "Inserting test config..."
if command -v sqlite3 &> /dev/null; then
  sqlite3 "$DB_PATH" "INSERT INTO provider_configs (id, api_key, model, is_active) VALUES ('test-openai', 'sk-test123', 'gpt-4o', 1);"
  if [ $? -ne 0 ]; then
    echo "FAIL: Failed to insert config via sqlite3"
    cleanup
    exit 1
  fi
else
  echo "SKIP: sqlite3 command not found (cannot verify DB)"
  cleanup
  exit 0
fi

# 5. Kill app
echo "Restarting app..."
cleanup

# 6. Relaunch app
launch_app
if ! wait_for_health; then
  echo "FAIL: App failed to restart"
  cleanup
  exit 1
fi

# 7. Query to verify persistence
echo "Verifying config persistence..."
RESULT=$(sqlite3 "$DB_PATH" "SELECT api_key, model FROM provider_configs WHERE id='test-openai';")
echo "Query Result: $RESULT"

if [[ "$RESULT" == *"sk-test123|gpt-4o"* ]]; then
  echo "PASS: Config persisted successfully"
else
  echo "FAIL: Config not found or incorrect. Expected 'sk-test123|gpt-4o', got '$RESULT'"
  cleanup
  exit 1
fi

cleanup
exit 0
