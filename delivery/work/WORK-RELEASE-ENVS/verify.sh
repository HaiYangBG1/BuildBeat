#!/usr/bin/env bash
# Verifier for WORK-RELEASE-ENVS: the full local gate and whitespace over
# the whole Work range. A missing tool exits 75 (infrastructure, not a
# candidate defect).
set -uo pipefail
for tool in node npm git tar; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "verify.sh: $tool not in PATH" >&2
    exit 75
  fi
done
set -e
npm test
npm run check:docs
npm run test:envelope
npm run test:plugin
npm run test:pack-firstrun
# 1be6ff7 is main when this Work was drafted.
git diff --check 1be6ff7...HEAD
git diff --check
