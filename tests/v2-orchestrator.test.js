import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { startRun } from "../src/v2/runtime/orchestrator.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { acquireLock, releaseLock } from "../src/v2/workspace/workspace-manager.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-orch-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return { root, base: git(root, ["rev-parse", "HEAD"]) };
}

function mockAdapters(script) {
  const adapter = createMockAdapter(script);
  return { builder: adapter, verifier: adapter, fixer: adapter };
}

function run(root, runId, adapters, overrides = {}) {
  return startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    workId: `WORK-${runId}`,
    runId,
    entry: "build",
    stopAt: ["review"],
    adapters,
    ...overrides,
  });
}

test("build then verify reaches the review boundary and waits for a human", () => {
  const { root } = fixtureRepo();
  const result = run(root, "RUN-T1", mockAdapters({ build: ["succeed"], verify: ["succeed"] }));
  const state = result.state;
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.pendingHuman.transition, "enter-review");
  assert.equal(state.steps.build.status, "SUCCEEDED");
  assert.equal(state.steps.verify.status, "SUCCEEDED");
  assert.equal(state.evidence.length, 2);
  assert.ok(state.evidence.every((item) => item.status === "passed"));
  assert.ok(state.lastCheckpoint);
  assert.equal(state.workspaces["RUN-T1"].repo, ".");
  assert.equal(state.workspaces["RUN-T1"].worktreePath, ".buildbeat/worktrees/RUN-T1");
  assert.ok(
    state.evidence.every((item) => item.ref.startsWith(".buildbeat/runtime/runs/RUN-T1/")),
  );
  assert.doesNotMatch(readFileSync(result.ledgerPath, "utf8"), new RegExp(root));

  const reopened = EventLedger.open(result.ledgerPath);
  assert.equal(reopened.corruption, null);
  assert.deepEqual(reopened.state, state);
});

test("a failing verify routes through fix and back to verify", () => {
  const { root } = fixtureRepo();
  const result = run(
    root,
    "RUN-T2",
    mockAdapters({ build: ["succeed"], verify: ["fail", "succeed"], fix: ["succeed"] }),
  );
  const state = result.state;
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.steps.verify.attempts, 2);
  assert.equal(state.steps.fix.attempts, 1);
  assert.equal(state.fingerprints.length, 1);
  assert.ok(state.policyLog.some((entry) => entry.result === "RETRY"));
});

test("two identical failures in a row stop the loop for a human", () => {
  const { root } = fixtureRepo();
  const result = run(
    root,
    "RUN-T3",
    mockAdapters({ build: ["succeed"], verify: ["fail", "fail"], fix: ["succeed"] }),
  );
  const state = result.state;
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.consecutiveSameFailure, 2);
  assert.match(state.pendingHuman.reasons[0], /fingerprint/);
});

test("a failure with no transition terminates and compacts the run", () => {
  const { root } = fixtureRepo();
  const result = run(root, "RUN-T4", mockAdapters({ build: ["fail"] }));
  const state = result.state;
  assert.equal(state.terminal.status, "FAILED");
  assert.match(state.terminal.reason, /no transition/);
  assert.ok(state.compacted);
  const recordPath = join(root, "delivery", "work", "WORK-RUN-T4", "runs", "RUN-T4", "run-record.json");
  assert.ok(existsSync(recordPath));
});

test("a verify failure on its final attempt stops for a human instead of starting fix", () => {
  const { root } = fixtureRepo();
  const result = run(
    root,
    "RUN-T4B",
    mockAdapters({ build: ["succeed"], verify: ["fail"], fix: ["succeed"] }),
    { maxAttemptsPerStep: 1 },
  );
  const state = result.state;
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.steps.verify.attempts, 1);
  assert.equal(state.steps.fix, undefined, "fix never started");
  assert.match(state.pendingHuman.reasons[0], /budget exhausted/);
});

test("shell adapters drive a real build and verify with read-back evidence", () => {
  const { root, base } = fixtureRepo();
  const adapters = {
    builder: createShellAdapter({
      name: "shell:builder",
      command: "bash",
      args: ["-lc", "echo done > feature.txt && git add -A && git commit -qm candidate"],
    }),
    verifier: createShellAdapter({
      name: "shell:verifier",
      command: "bash",
      args: ["-lc", "test -f feature.txt"],
    }),
  };
  const result = run(root, "RUN-T5", adapters);
  const state = result.state;
  assert.equal(state.run.status, "WAITING_HUMAN");
  const workspace = state.workspaces["RUN-T5"];
  assert.ok(workspace.candidate);
  assert.notEqual(workspace.candidate, base);
  assert.equal(workspace.candidate, git(result.workspace.worktreePath, ["rev-parse", "HEAD"]));
  assert.equal(state.evidence.length, 2);
  assert.ok(state.evidence.every((item) => item.status === "passed"));
  assert.ok(state.evidence.every((item) => existsSync(join(root, item.ref))));
});

test("a successful step that leaves the tree dirty is a human stop, not a candidate", () => {
  const { root } = fixtureRepo();
  const adapters = {
    builder: createShellAdapter({
      name: "shell:builder",
      command: "bash",
      args: ["-lc", "echo wip > feature.txt"],
    }),
  };
  const result = run(root, "RUN-T6", adapters);
  const state = result.state;
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.match(state.pendingHuman.reasons[0], /dirty/);
  assert.equal(state.workspaces["RUN-T6"].candidate, null);
});

test("the run lock is released when the run stops", () => {
  const { root } = fixtureRepo();
  run(root, "RUN-T7", mockAdapters({ build: ["succeed"], verify: ["succeed"] }));
  acquireLock(root, "RUN-T7");
  releaseLock(root, "RUN-T7");
});
