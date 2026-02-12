#!/bin/bash

# Source helpers
source ogre-desktop/tests/e2e/helpers.sh

echo "=========================================="
echo "RUNNING ALL E2E TESTS"
echo "=========================================="

cleanup

FAIL=0

echo "Running Lifecycle Test..."
bash ogre-desktop/tests/e2e/lifecycle.test.sh
if [ $? -ne 0 ]; then
  echo "✗ Lifecycle Test FAILED"
  FAIL=1
else
  echo "✓ Lifecycle Test PASSED"
fi

echo "Running Config Test..."
bash ogre-desktop/tests/e2e/config.test.sh
if [ $? -ne 0 ]; then
  echo "✗ Config Test FAILED"
  FAIL=1
else
  echo "✓ Config Test PASSED"
fi

echo "Running History Test..."
bash ogre-desktop/tests/e2e/history.test.sh
if [ $? -ne 0 ]; then
  echo "✗ History Test FAILED"
  FAIL=1
else
  echo "✓ History Test PASSED"
fi

echo "Running Tray Test..."
bash ogre-desktop/tests/e2e/tray.test.sh
if [ $? -ne 0 ]; then
  echo "✗ Tray Test FAILED"
  FAIL=1
else
  echo "✓ Tray Test PASSED"
fi

echo "Running Golden Path Test..."
bash ogre-desktop/tests/e2e/golden-path.test.sh
if [ $? -ne 0 ]; then
  echo "✗ Golden Path Test FAILED"
  FAIL=1
else
  echo "✓ Golden Path Test PASSED"
fi

cleanup

echo "=========================================="
if [ $FAIL -eq 0 ]; then
  echo "ALL TESTS PASSED"
  exit 0
else
  echo "SOME TESTS FAILED"
  exit 1
fi
