#!/usr/bin/env bash
set -euo pipefail

PLIST_PATH="$HOME/Library/LaunchAgents/com.yunyingbot.worker.plist"

launchctl bootout "gui/$(id -u)" com.yunyingbot.worker >/dev/null 2>&1 || true
launchctl disable "gui/$(id -u)/com.yunyingbot.worker" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "Removed com.yunyingbot.worker launch agent"
