#!/usr/bin/env bash
# Verifier for WORK-4.0-INTENT-FOLLOWUPS: the full local gate, whitespace
# checked over the whole Work range (not just the working tree), and the
# deterministic 3.3.1 parity scenarios. A missing tool exits 75
# (infrastructure, not a candidate defect).
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
# f308744 is main when this Work started (PR #70 merged).
git diff --check f308744...HEAD
git diff --check
baseline="$(mktemp -d "${TMPDIR:-/tmp}/bb-40-baseline.XXXXXX")"
trap 'rm -rf "$baseline"' EXIT
git archive 9fc8454 | tar -x -C "$baseline"
node delivery/work/WORK-PRODUCT-SIMPLIFY/compare-baseline.mjs "$baseline/bin/buildbeat.js"
