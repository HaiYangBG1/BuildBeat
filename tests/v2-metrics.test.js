import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { rejectRun } from "../src/v2/runtime/decisions.js";
import { computeMetrics, renderMetrics } from "../src/v2/runtime/metrics.js";
import { startRun } from "../src/v2/runtime/orchestrator.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

test("metrics derive run counts, rates and waits from ledgers alone", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-met-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);

  const mkRun = (runId, script) =>
    startRun({
      repoRoot: root,
      workflow: WORKFLOW,
      workflowDigest: DIGEST,
      workId: `WORK-${runId}`,
      runId,
      entry: "build",
      stopAt: ["review"],
      adapters: (() => {
        const mock = createMockAdapter(script);
        return { builder: mock, verifier: mock, fixer: mock };
      })(),
    });

  mkRun("RUN-M1", { build: ["succeed"], verify: ["succeed"] }); // waiting at review
  mkRun("RUN-M2", { build: ["fail"] }); // no route for (build, failed): waits for a human (iteration 09)

  let summary = computeMetrics(root);
  assert.equal(summary.runs, 2);
  assert.equal(summary.waitingHuman, 2);
  assert.equal(summary.terminal.FAILED ?? 0, 0);
  assert.equal(summary.autoReachedHumanRate, 1);
  assert.equal(summary.evidenceCompleteness, 1, "every finished step carried evidence");
  assert.deepEqual(summary.fixAttempts, { 0: 2 });
  assert.equal(summary.approvalWaitMs.length, 0);

  rejectRun(root, "RUN-M1", { by: "owner", reason: "metrics test" });
  summary = computeMetrics(root);
  assert.equal(summary.approvalWaitMs.length, 1);
  assert.equal(summary.terminal.CANCELLED, 1);

  const text = renderMetrics(summary);
  assert.match(text, /runs: 2/);
  assert.match(text, /auto-reached WAITING_HUMAN: 100\.0%/);
  assert.match(text, /evidence completeness: 100\.0%/);
});
