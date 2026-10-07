#!/usr/bin/env bash
# Verifier for WORK-README-REDESIGN: the full local gate, whitespace over the
# whole Work range, and PNG screenshots of both READMEs rendered by GitHub's
# markdown API in headless Chrome. A missing tool, no network or a browser
# failure exits 75 (infrastructure, not a candidate defect).
set -uo pipefail
for tool in node npm git tar gh curl perl; do
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
# 28b8db8 is main (4.2.1 closeout) when this Work started.
git diff --check 28b8db8...HEAD
git diff --check
node delivery/work/WORK-README-REDESIGN/render-readme.mjs "${BUILDBEAT_SCREENSHOT_DIR:?}"
