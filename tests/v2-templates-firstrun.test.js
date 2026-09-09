import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseYamlSubset } from "../src/v2/engine/yaml-subset.js";

// Deterministic first run through the shipped v2 templates: the run-config
// sample, the worker wrapper and the three prompts must carry a run from
// start to the merge decision with a scripted "agent" standing in for the
// real tool. This proves the packaged paths, config shape, envelope, commit
// mechanics and reviewer envelope connect — not that a real model can do
// the task.

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");
const PRESET = join(ROOT, "src", "v2", "presets", "software-delivery.yaml");
const TEMPLATES = join(ROOT, "templates", "v2");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function cli(args) {
  return execFileSync("node", [CLI, ...args], { encoding: "utf8" });
}

function yamlBlocks(markdown) {
  const out = [];
  const re = /```yaml\n(repo: [\s\S]*?)```/g;
  let match;
  while ((match = re.exec(markdown))) {
    out.push(match[1]);
  }
  return out;
}

test("every documented run-config sample parses with the strict YAML subset", () => {
  const example = parseYamlSubset(readFileSync(join(TEMPLATES, "run-config.example.yaml"), "utf8"));
  assert.deepEqual(Object.keys(example.workers).sort(), ["builder", "fixer", "reviewer", "verifier"]);
  assert.equal(example.envelope.prompts, "../../envelope/prompts");
  for (const relative of ["SKILL.md", "docs/v2/guide/01-quickstart.md"]) {
    const blocks = yamlBlocks(readFileSync(join(ROOT, relative), "utf8"));
    assert.ok(blocks.length > 0, `${relative}: no run-config sample found`);
    for (const block of blocks) {
      const config = parseYamlSubset(block);
      assert.ok(config.workers.fixer, `${relative}: sample must configure a fixer`);
    }
  }
});

test("templates/v2 envelope drives a run to the merge decision with a scripted agent", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-templates-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);

  // Project skeleton the way SKILL §8.3 lays it out.
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "tests"), { recursive: true });
  mkdirSync(join(root, "tools"), { recursive: true });
  // Empty directories are not tracked, so they would not exist in the worktree.
  writeFileSync(join(root, "src", ".gitkeep"), "");
  writeFileSync(join(root, "tests", ".gitkeep"), "");
  const work = join(root, "delivery", "work", "WORK-T");
  mkdirSync(work, { recursive: true });
  cpSync(join(TEMPLATES, "envelope"), join(root, "delivery", "envelope"), { recursive: true });
  cpSync(PRESET, join(work, "workflow.yaml"));
  writeFileSync(join(work, "intent.md"), "# intent\nadd feature. stop-loss: 2 runs\n");
  writeFileSync(join(work, "plan.md"), "# plan\n1. write src/feature.txt\n");
  writeFileSync(join(root, "README.md"), "fixture\n");

  // Scripted agent: role comes from the wrapper's tool args, the prompt
  // arrives as the final positional argument exactly like codex/claude.
  writeFileSync(
    join(root, "tools", "fake-agent.sh"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "role=$1",
      "prompt=${@: -1}",
      "case \"$role\" in",
      "  build) [ -n \"$prompt\" ] || exit 9; echo feature > src/feature.txt ;;",
      "  fix) [ -n \"$prompt\" ] || exit 9; echo fixed > src/fixed.txt ;;",
      "  review) [ -n \"$prompt\" ] || exit 9; echo '```json'; echo '{\"status\":\"succeeded\",\"findings\":[{\"severity\":\"P2\",\"summary\":\"naming could be clearer\"}]}'; echo '```' ;;",
      "esac",
    ].join("\n"),
  );

  // The sample config with the codex commands swapped for the scripted agent
  // and the verifier made to fail once (fix path) then pass.
  const sample = readFileSync(join(TEMPLATES, "run-config.example.yaml"), "utf8")
    .replace("work: WORK-X", "work: WORK-T")
    .replace("run: RUN-X", "run: RUN-T")
    .replace("reviewTriage: required", "reviewTriage: off")
    .replace(/      - codex\n      - exec\n      - -s\n      - workspace-write\n/, "      - bash\n      - tools/fake-agent.sh\n      - build\n")
    .replace(/      - codex\n      - exec\n      - -s\n      - read-only\n/, "      - bash\n      - tools/fake-agent.sh\n      - review\n")
    .replace(/      - codex\n      - exec\n      - -s\n      - workspace-write\n/, "      - bash\n      - tools/fake-agent.sh\n      - fix\n")
    .replace("      - npm test\n", "      - test -f src/feature.txt && test -f src/fixed.txt\n");
  assert.doesNotMatch(sample, /^\s+- codex$/m);
  writeFileSync(join(work, "run-config.yaml"), sample);

  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);

  const acceptOut = cli(["accept", "--repo", root, "--work", "WORK-T", "--artifact", "plan", "--by", "owner"]);
  assert.match(acceptOut, /accepted plan as A-WORK-T-\d+/);

  const doctorOut = cli(["doctor", "--config", join(work, "run-config.yaml")]);
  assert.match(doctorOut, /risk preset: standard/);
  assert.match(doctorOut, /builder: env allowlist/);
  assert.match(doctorOut, /plan\.md: accepted/);

  const startOut = cli(["start", "--config", join(work, "run-config.yaml"), "--attempt", "new"]);
  assert.match(startOut, /status: WAITING_HUMAN/);
  assert.match(startOut, /waiting on human: enter-wait-merge/);

  const statusOut = cli(["status", "--repo", root, "--run", "RUN-T-01"]);
  assert.match(statusOut, /step build: SUCCEEDED \(attempts 1\)/);
  assert.match(statusOut, /step verify: SUCCEEDED \(attempts 2\)/); // first verify failed: fixed.txt missing
  assert.match(statusOut, /step fix: SUCCEEDED \(attempts 1\)/);
  assert.match(statusOut, /step review: SUCCEEDED \(attempts 1\)/);
  assert.match(statusOut, /evidence \[failed\/L2\] command .*verify-1\.log/);
  assert.match(statusOut, /evidence \[passed\/L2\] command .*verify-2\.log/);
  assert.match(statusOut, /evidence \[passed\/L2\] review .*review-1\.json/);
  assert.doesNotMatch(statusOut, /invalid-output|infra/);
  // The wrapper hands the tool's stdout over verbatim; a ```json fence is
  // tolerated by the kernel's parser, so strip it the same way here.
  const rawEnvelope = readFileSync(
    join(root, ".buildbeat", "runtime", "runs", "RUN-T-01", "outputs", "review-1.json"),
    "utf8",
  ).trim();
  const reviewEnvelope = JSON.parse(rawEnvelope.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/)?.[1] ?? rawEnvelope);
  assert.equal(reviewEnvelope.status, "succeeded");
  assert.deepEqual(reviewEnvelope.findings, [{ severity: "P2", summary: "naming could be clearer" }]);

  // The wrapper committed for the workers; the candidate carries both files.
  const candidate = statusOut.match(/candidate ([0-9a-f]{7,40})/)?.[1];
  assert.ok(candidate, "candidate sha missing from status");
  const tree = git(root, ["ls-tree", "-r", "--name-only", candidate]);
  assert.match(tree, /src\/feature\.txt/);
  assert.match(tree, /src\/fixed\.txt/);
  const log = git(root, ["log", "--format=%s", `main..${candidate}`]);
  assert.match(log, /fixer: RUN-T-01 attempt \d+/);
  assert.match(log, /builder: RUN-T-01 attempt \d+/);
});

test("worker.sh reports a missing tool as infrastructure (exit 75)", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-wrapper-"));
  execFileSync("git", ["init", "-q", root]);
  let code = 0;
  try {
    execFileSync("bash", [join(TEMPLATES, "envelope", "worker.sh"), "builder", "--", "definitely-not-a-tool-xyz"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    code = error.status;
  }
  assert.equal(code, 75);
});
