// Deterministic-suite gap fillers (WP5.1): adapter failure shapes end to
// end, the single-active-run repository lock, and changed-path readback.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { OrchestratorError, startRun } from "../src/v2/runtime/orchestrator.js";
import {
  acquireLock,
  createWorkspace,
  listChangedPaths,
  releaseLock,
} from "../src/v2/workspace/workspace-manager.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-inv-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return { root };
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

test("a timed-out step is recorded as timeout and fails closed", () => {
  const { root } = fixtureRepo();
  const result = run(
    root,
    "RUN-I1",
    {
      builder: createShellAdapter({ name: "shell:builder", command: "bash", args: ["-c", "sleep 5"] }),
    },
    { stepTimeoutMs: 300 },
  );
  const state = result.state;
  assert.equal(state.steps.build.detail, "timeout");
  assert.equal(state.terminal.status, "FAILED", "build has no failure route in the preset");
});

test("an adapter crash leaves a failure fact, never silent progress", () => {
  const { root } = fixtureRepo();
  const result = run(root, "RUN-I2", { builder: createMockAdapter({ build: ["crash"] }) });
  assert.equal(result.state.steps.build.detail, "crashed");
  assert.equal(result.state.terminal.status, "FAILED");
});

test("a spawn error yields unverified evidence and a crashed step", () => {
  const { root } = fixtureRepo();
  const result = run(root, "RUN-I3", {
    builder: createShellAdapter({ name: "shell:builder", command: "definitely-not-a-command-xyz" }),
  });
  const state = result.state;
  assert.equal(state.steps.build.detail, "crashed");
  assert.equal(state.evidence[0].status, "unverified");
});

test("only one run can be active per repository", () => {
  const { root } = fixtureRepo();
  acquireLock(root, "active-run");
  try {
    assert.throws(
      () => run(root, "RUN-I4", { builder: createMockAdapter({ build: ["succeed"] }) }),
      OrchestratorError,
    );
  } finally {
    releaseLock(root, "active-run");
  }
  const result = run(root, "RUN-I4", {
    builder: createMockAdapter({ build: ["succeed"] }),
    verifier: createMockAdapter({ verify: ["succeed"] }),
  });
  assert.equal(result.state.run.status, "WAITING_HUMAN");
});

test("listChangedPaths sees committed and dirty changes relative to base", () => {
  const { root } = fixtureRepo();
  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-I5", base: "HEAD" });
  writeFileSync(join(workspace.worktreePath, "committed.txt"), "a\n");
  git(workspace.worktreePath, ["add", "-A"]);
  git(workspace.worktreePath, ["commit", "-qm", "c"]);
  writeFileSync(join(workspace.worktreePath, "dirty.txt"), "b\n");
  const changed = listChangedPaths(workspace.worktreePath, workspace.base).sort();
  assert.deepEqual(changed, ["committed.txt", "dirty.txt"]);
});
