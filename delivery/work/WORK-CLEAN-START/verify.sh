#!/usr/bin/env bash
# Verifier for WORK-CLEAN-START: the full local gate, then the acceptance
# checks from work.md. A missing tool exits 75 (infrastructure, not a
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
npm run pack:check

# Nothing in the runtime or the Skill still speaks about the old versions.
if grep -rnE "3\.3\.1|MIGRATION\.md|intent\.md|plan\.md" src bin SKILL.md; then
  echo "verify.sh: old-version wording is still present (lines above)" >&2
  exit 1
fi

# An old command name is an unknown command.
if node bin/buildbeat.js overview --repo . >/dev/null 2>&1; then
  echo "verify.sh: the old 'overview' spelling still succeeds" >&2
  exit 1
fi

# The migration guide no longer ships.
if npm pack --dry-run 2>&1 | grep -q "docs/MIGRATION.md"; then
  echo "verify.sh: docs/MIGRATION.md is still in the package" >&2
  exit 1
fi

# Closed works stay closed, and code written by old-format works still traces
# to the same works with the same line counts (baseline.json was recorded with
# runtime 5.5.0 on 2e0d984, before any change).
node - <<'NODE'
const { execFileSync } = require("node:child_process");
const baseline = require("./delivery/work/WORK-CLEAN-START/baseline.json");
const run = (args) =>
  JSON.parse(execFileSync("node", ["bin/buildbeat.js", ...args], { encoding: "utf8", maxBuffer: 1 << 26 }));
const problems = [];
const now = Object.fromEntries(run(["status", "--repo", ".", "--json"]).works.map((w) => [w.work, w.stage]));
for (const [work, stage] of Object.entries(baseline.stages)) {
  const expected = stage === "NO_INTENT" ? "LEGACY" : stage;
  if (now[work] !== expected) problems.push(`status: ${work} is ${now[work]}, expected ${expected}`);
}
for (const [file, expected] of Object.entries(baseline.history)) {
  const h = run(["history", "--repo", ".", "--path", file, "--json"]);
  const works = Object.fromEntries(h.works.map((w) => [w.work, w.lines]));
  if (JSON.stringify(Object.entries(works).sort()) !== JSON.stringify(Object.entries(expected.works).sort()))
    problems.push(`history: ${file} traces to ${JSON.stringify(works)}, expected ${JSON.stringify(expected.works)}`);
  const untraced = h.untraced ? h.untraced.lines : 0;
  if (untraced !== expected.untraced) problems.push(`history: ${file} has ${untraced} untraced lines, expected ${expected.untraced}`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`baseline holds: ${Object.keys(baseline.stages).length} works, ${Object.keys(baseline.history).length} files`);
NODE

# 2e0d984 is main when this Work was drafted.
git diff --check 2e0d984...HEAD
git diff --check
