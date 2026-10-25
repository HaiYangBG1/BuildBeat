#!/usr/bin/env bash
# Verifier for WORK-TEAM-ENTRY: the full local gate and whitespace over the
# whole Work range. A missing tool exits 75 (infrastructure, not a candidate
# defect).
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
# 61a7f3b is main when this Work started.
git diff --check 61a7f3b...HEAD
git diff --check
