#!/usr/bin/env bash
# Verifier for WORK-CLEAN-START. Usage: verify.sh <stage>, stage 1, 2 or 3
# (work.md, "范围"). Every stage runs the full local gate and the baseline
# check; later stages add the acceptance checks of the stages before them.
# A missing tool exits 75 (infrastructure, not a candidate defect).
set -uo pipefail
stage="${1:-}"
case "$stage" in
  1|2|3) ;;
  *) echo "verify.sh: stage must be 1, 2 or 3" >&2; exit 75 ;;
esac
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
npm run pack:check

# Closed works stay closed, and code written by old-format works still traces
# to the same works with the same line counts (baseline.json was recorded with
# runtime 5.5.0 on 2e0d984, before any change). From stage 2 on, the one work
# that had no description shows as LEGACY.
STAGE="$stage" node - <<'NODE'
const { execFileSync } = require("node:child_process");
const baseline = require("./delivery/work/WORK-CLEAN-START/baseline.json");
const stage = Number(process.env.STAGE);
const run = (args) =>
  JSON.parse(execFileSync("node", ["bin/buildbeat.js", ...args], { encoding: "utf8", maxBuffer: 1 << 26 }));
const problems = [];
const now = Object.fromEntries(run(["status", "--repo", ".", "--json"]).works.map((w) => [w.work, w.stage]));
for (const [work, was] of Object.entries(baseline.stages)) {
  const expected = was === "NO_INTENT" && stage >= 2 ? "LEGACY" : was;
  if (now[work] !== expected) problems.push(`status: ${work} is ${now[work]}, expected ${expected}`);
}
// A file this work has not touched must trace exactly as before. One it
// rewrote keeps fewer old lines: every work it still traces to must be one
// of the baseline's, with no more lines than then (lines this work wrote
// trace to this work). One it deleted has nothing left to trace.
let exact = 0, changed = 0, gone = 0;
for (const [file, expected] of Object.entries(baseline.history)) {
  if (!require("node:fs").existsSync(file)) { gone += 1; continue; }
  const h = run(["history", "--repo", ".", "--path", file, "--json"]);
  const works = Object.fromEntries(h.works.map((w) => [w.work, w.lines]));
  let untouched = true;
  try { execFileSync("git", ["diff", "--quiet", "2e0d984", "HEAD", "--", file]); } catch { untouched = false; }
  if (untouched) {
    exact += 1;
    if (JSON.stringify(Object.entries(works).sort()) !== JSON.stringify(Object.entries(expected.works).sort()))
      problems.push(`history: ${file} traces to ${JSON.stringify(works)}, expected ${JSON.stringify(expected.works)}`);
    const untraced = h.untraced ? h.untraced.lines : 0;
    if (untraced !== expected.untraced) problems.push(`history: ${file} has ${untraced} untraced lines, expected ${expected.untraced}`);
    continue;
  }
  changed += 1;
  for (const [work, lines] of Object.entries(works)) {
    if (work === "WORK-CLEAN-START") continue;
    if (!(work in expected.works)) problems.push(`history: ${file} now traces to ${work}, which it did not before`);
    else if (lines > expected.works[work]) problems.push(`history: ${file} traces ${lines} lines to ${work}, more than the ${expected.works[work]} before`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`baseline holds: ${Object.keys(baseline.stages).length} works; history of ${exact} untouched, ${changed} rewritten, ${gone} deleted files`);
NODE

if [ "$stage" -ge 2 ]; then
  # Removed commands are unknown commands.
  for old in run stop gc watch start resume overview inbox metrics approve reject findings doctor preflight events replay observe; do
    if node bin/buildbeat.js "$old" --repo . >/dev/null 2>&1; then
      echo "verify.sh: the removed command '$old' still succeeds" >&2
      exit 1
    fi
  done
  lines=$(find src -name '*.js' -o -name '*.yaml' | xargs cat | wc -l | tr -d ' ')
  if [ "$lines" -gt 8000 ]; then
    echo "verify.sh: src has $lines lines, more than 8000" >&2
    exit 1
  fi
fi

if [ "$stage" -ge 3 ]; then
  if grep -rnE "3\.3\.1|MIGRATION\.md|intent\.md|plan\.md" src bin SKILL.md; then
    echo "verify.sh: old-version wording is still present (lines above)" >&2
    exit 1
  fi
  if npm pack --dry-run 2>&1 | grep -q "docs/MIGRATION.md"; then
    echo "verify.sh: docs/MIGRATION.md is still in the package" >&2
    exit 1
  fi
  size=$(wc -c < SKILL.md | tr -d ' ')
  if [ "$size" -gt 10240 ]; then
    echo "verify.sh: SKILL.md is $size bytes, more than 10 KB" >&2
    exit 1
  fi
fi

# 2e0d984 is main when this Work was drafted.
git diff --check 2e0d984...HEAD
git diff --check
