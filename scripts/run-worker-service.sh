#!/usr/bin/env bash
set -euo pipefail
cd /Users/aaron/Desktop/yunyingbotv2
set -a
source .env
set +a
exec pnpm --filter @yunyingbot/worker dev
