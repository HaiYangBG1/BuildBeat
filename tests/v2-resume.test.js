import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { OrchestratorError, resumeRun } from "../src/v2/runtime/orchestrator.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { createWorkspace } from "../src/v2/workspace/workspace-manager.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";
const KERNEL = { kind: "kernel", id: "orchestrator" };
const TS = "2026-08-28T00:00:00.000Z";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-resume-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return { root, base: git(root, ["rev-parse", "HEAD"]) };
}

// Simulates a process that died mid-run by writing the ledger prefix a live
// orchestrator would have produced, against a real workspace.
function crashedRun(runId, upTo) {
  const { root, base } = fixtureRepo();
  const workspace = createWorkspace({ repoRoot: root, runId, base });
  const ledger = EventLedger.open(
    join(root, ".buildbeat", "runtime", "runs", runId, "events.jsonl"),
  );
  const append = (type, data) =>
    ledger.append({ type, actor: KERNEL, ts: TS, run: runId, work: `WORK-${runId}`, data });
  append("RUN_CREATED", {
    workflowRef: WORKFLOW.name,
    workflowDigest: DIGEST,
    base,
    riskPreset: "standard",
    entry: "build",
  });
  append("RUN_STARTED", {});
  append("WORKSPACE_BOUND", {
    workspaceId: runId,
    repo: root,
    branch: workspace.branch,
    worktreePath: workspace.worktreePath,
    base,
  });
  if (upTo === "in-flight-build") {
    append("STEP_STARTED", {
      step: "build",
      attempt: 1,
      worker: "builder",
      adapter: "mock",
      workspaceId: runId,
    });
  } else if (upTo === "after-build-checkpoint") {
    append("STEP_STARTED", {
      step: "build",
      attempt: 1,
      worker: "builder",
      adapter: "mock",
      workspaceId: runId,
    });
    append("STEP_FINISHED", { step: "build", attempt: 1, status: "succeeded" });
    append("BUDGET_CONSUMED", { kind: "attempts", amount: 1, remaining: 3 });
    append("POLICY_EVALUATED", {
      policy: "workflow.edge",
      phase: "transition",
      result: "PASS",
      enforcement: "LOCAL_ENFORCED",
      reason: "(build, succeeded) -> verify",
    });
    append("TRANSITION", { from: "build", to: "verify", cause: "outcome:succeeded" });
    append("CHECKPOINT", {
      resumePoint: { step: "verify", attempt: 1 },
      workspaceStates: [{ workspaceId: runId, head: base, dirty: false }],
    });
  }
  return { root, base, workspace, ledger };
}

test("resume closes an in-flight step as crashed and fails closed without a route", () => {
  const { root } = crashedRun("RUN-R1", "in-flight-build");
  const result = resumeRun({ repoRoot: root, workflow: WORKFLOW, workflowDigest: DIGEST, runId: "RUN-R1" });
  assert.equal(result.resumed, true);
  assert.equal(result.state.steps.build.status, "FAILED");
  assert.equal(result.state.steps.build.detail, "crashed");
  assert.equal(result.state.terminal.status, "FAILED");
  assert.ok(
    existsSync(join(root, "delivery", "work", "WORK-RUN-R1", "runs", "RUN-R1", "run-record.json")),
  );
});

test("resume continues from the last checkpoint through the remaining steps", () => {
  const { root } = crashedRun("RUN-R2", "after-build-checkpoint");
  const result = resumeRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    runId: "RUN-R2",
    stopAt: ["review"],
    adapters: { verifier: createMockAdapter({ verify: ["succeed"] }) },
  });
  assert.equal(result.resumed, true);
  assert.equal(result.state.steps.verify.status, "SUCCEEDED");
  assert.equal(result.state.run.status, "WAITING_HUMAN");
  assert.equal(result.state.pendingHuman.transition, "enter-review");
});

test("resume with a dirty tree from an interrupted step asks a human instead of rerunning", () => {
  const { root, workspace } = crashedRun("RUN-R3", "in-flight-build");
  writeFileSync(join(workspace.worktreePath, "half-written.txt"), "??\n");
  const result = resumeRun({ repoRoot: root, workflow: WORKFLOW, workflowDigest: DIGEST, runId: "RUN-R3" });
  assert.equal(result.state.run.status, "WAITING_HUMAN");
  assert.match(result.state.pendingHuman.reasons[0], /dirty/);
  assert.equal(result.state.steps.build.detail, "crashed");
});

test("resume refuses a changed workflow and reports human-waiting runs as not resumable", () => {
  const { root } = crashedRun("RUN-R4", "in-flight-build");
  assert.throws(
    () =>
      resumeRun({
        repoRoot: root,
        workflow: WORKFLOW,
        workflowDigest: "sha256:different",
        runId: "RUN-R4",
      }),
    OrchestratorError,
  );

  const first = resumeRun({ repoRoot: root, workflow: WORKFLOW, workflowDigest: DIGEST, runId: "RUN-R4" });
  assert.equal(first.state.terminal.status, "FAILED");
  const again = resumeRun({ repoRoot: root, workflow: WORKFLOW, workflowDigest: DIGEST, runId: "RUN-R4" });
  assert.equal(again.resumed, false);
  assert.match(again.reason, /terminal/);
});
