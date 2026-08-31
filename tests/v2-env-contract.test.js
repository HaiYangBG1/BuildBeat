// Environment contract (requires:): implicit PATH facts burned real runs
// (a vendored-only rg, /bin/bash 3.2, a shell resolving Node 14). The check
// runs before a run starts and reports every problem at once, fail closed.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { checkRequires } from "../src/v2/runtime/env-contract.js";
import { startRun } from "../src/v2/runtime/orchestrator.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);

// The version target is `git` — the one binary this suite already spawns
// everywhere. Freshly-written executable fixtures or heavyweight children
// (node) made the probe itself time out under a loaded host (macOS assesses
// new executables on first exec), which is not what this test is about.
test("checkRequires verifies presence and minimum versions, reporting all problems", () => {
  const result = checkRequires([
    { command: "git", min: "1" },
    { command: "git", min: "999" },
    { command: "definitely-not-a-command-xyz" },
    { command: "true", min: "1.0" },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.checked.length, 1, "only the satisfiable entry passes");
  assert.match(result.checked[0].version, /^\d+\.\d+\.\d+$/);
  assert.equal(result.problems.length, 3);
  assert.match(result.problems[0], /below required 999/);
  assert.match(result.problems[1], /not runnable/);
  assert.match(result.problems[2], /version undetectable.*fail closed/);
});

test("a run refuses to start when the environment contract is not satisfied", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-env-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "pilot@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-q", "-m", "baseline"]);
  assert.throws(
    () =>
      startRun({
        repoRoot: root,
        workflow: WORKFLOW,
        workflowDigest: "sha256:test-workflow",
        workId: "WORK-ENV",
        runId: "RUN-ENV",
        entry: "build",
        requires: [{ command: "definitely-not-a-command-xyz" }],
      }),
    /environment contract not satisfied/,
  );
});
