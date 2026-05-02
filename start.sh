#!/usr/bin/env bash
set -euo pipefail

source /root/all_tokens.sh
cd /root/realtime-voice-translate
exec node server.js
