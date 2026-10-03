#!/usr/bin/env bash
# Verifier for WORK-PR70-REVIEW: the full local gate plus the deterministic
# 3.3.1 parity scenarios. A missing tool exits 75 (infrastructure, not a
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
git diff --check
baseline="$(mktemp -d "${TMPDIR:-/tmp}/bb-pr70-baseline.XXXXXX")"
trap 'rm -rf "$baseline"' EXIT
git archive 9fc8454 | tar -x -C "$baseline"
node delivery/work/WORK-PRODUCT-SIMPLIFY/compare-baseline.mjs "$baseline/bin/buildbeat.js"
