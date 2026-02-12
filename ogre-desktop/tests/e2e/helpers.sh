#!/bin/bash

# Configuration
APP_ID="com.ogre.desktop"
SERVER_PORT=3456
SERVER_URL="http://localhost:$SERVER_PORT"
# Use relative path from project root (assuming tests run from project root or ogre-desktop root)
# We will standardize on running from project root
APP_EXECUTABLE_REL="ogre-desktop/src-tauri/target/debug/ogre-desktop.exe"

get_project_root() {
  # If we are in ogre-desktop/tests/e2e, go up 3 levels
  # If we are in root, stay here
  if [ -d "ogre-desktop" ]; then
    echo "$(pwd)"
  elif [ -d "src-tauri" ]; then
    echo "$(pwd)/.."
  else
    echo "$(git rev-parse --show-toplevel)"
  fi
}

PROJECT_ROOT=$(get_project_root)
APP_PATH="$PROJECT_ROOT/$APP_EXECUTABLE_REL"

get_db_path() {
  # Try to find APPDATA
  if [ -z "$APPDATA" ]; then
    # Fallback for Git Bash if APPDATA not set
    USER_PROFILE=$(wmic useraccount where name="'$USERNAME'" get sid | tail -n 1) 
    # Actually just assume standard layout if APPDATA missing
    echo "$USERPROFILE/AppData/Roaming/$APP_ID/ogre.db"
  else
    echo "$APPDATA/$APP_ID/ogre.db"
  fi
}

wait_for_health() {
  local retries=20
  local wait_time=0.5
  
  echo "Waiting for server at $SERVER_URL..."
  for ((i=1; i<=retries; i++)); do
    if curl -s "$SERVER_URL/health" | grep -q '"status":"ok"'; then
      echo "Server is healthy!"
      return 0
    fi
    sleep $wait_time
  done
  
  echo "Timeout waiting for server health"
  return 1
}

wait_for_shutdown() {
  local retries=10
  local wait_time=0.5
  
  echo "Waiting for server shutdown..."
  for ((i=1; i<=retries; i++)); do
    if ! curl -s "$SERVER_URL/health" > /dev/null; then
      echo "Server is down (connection refused)"
      return 0
    fi
    sleep $wait_time
  done
  
  echo "Server still running!"
  return 1
}

cleanup() {
  echo "Cleaning up..."
  # Kill ogre-desktop.exe
  taskkill //F //IM ogre-desktop.exe > /dev/null 2>&1 || true
  # Kill grading-server.exe (sidecar)
  taskkill //F //IM grading-server.exe > /dev/null 2>&1 || true
  # Also try pkill just in case
  pkill -f ogre-desktop > /dev/null 2>&1 || true
}

launch_app() {
  echo "Launching app from $APP_PATH..."
  if [ ! -f "$APP_PATH" ]; then
    echo "Error: App executable not found at $APP_PATH"
    echo "Please build the app first: npm run tauri build -- --debug"
    return 1
  fi
  
  # Launch in background
  "$APP_PATH" > /dev/null 2>&1 &
  APP_PID=$!
  echo "App launched with PID $APP_PID"
}
