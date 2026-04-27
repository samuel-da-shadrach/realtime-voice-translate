#!/usr/bin/env bash
set -euo pipefail

source /root/all_tokens.sh
cd /root/eleven-scribe-last5
exec node server.js
