import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadRiskPreset } from "../src/v2/engine/risk-preset.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { DecisionError, acceptArtifact, approveRun } from "../src/v2/runtime/decisions.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { createWorkspace } from "../src/v2/workspace/workspace-manager.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";
const KERNEL = { kind: "kernel", id: "orchestrator" };

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-gov-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return { root };
}

function mockAdapters(script) {
  const adapter = createMockAdapter(script);
  return { builder: adapter, verifier: adapter, fixer: adapter, reviewer: adapter };
}

test("a pre policy gates build until the plan is an accepted, digest-bound artifact", () => {
  const { root } = fixtureRepo();
  const workDir = join(root, "delivery", "work", "WORK-G1");
  mkdirSync(workDir, { recursive: true });
  writeFileSync(join(workDir, "plan.md"), "the plan\n");
  const policies = loadRiskPreset("standard").policies;

  const started = startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    workId: "WORK-G1",
    runId: "RUN-G1",
    entry: "build",
    stopAt: ["review"],
    adapters: mockAdapters({ build: ["succeed"], verify: ["succeed"] }),
    policies,
  });
  assert.equal(started.state.run.status, "WAITING_HUMAN");
  assert.equal(started.state.steps.build, undefined, "build never started");
  assert.match(started.state.pendingHuman.reasons[0], /plan-accepted/);
  assert.ok(
    started.state.policyLog.some(
      (row) => row.policy === "plan-accepted" && row.result === "WAIT_HUMAN",
    ),
  );

  acceptArtifact(root, "WORK-G1", "plan", { by: "owner" });
  const approved = approveRun(root, "RUN-G1", { by: "owner", transition: "resume-build" });
  assert.equal(approved.approved, true);

  const resumed = resumeRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    runId: "RUN-G1",
    stopAt: ["review"],
    adapters: mockAdapters({ build: ["succeed"], verify: ["succeed"] }),
    policies,
  });
  assert.equal(resumed.state.steps.build.status, "SUCCEEDED");
  assert.equal(resumed.state.steps.verify.status, "SUCCEEDED");
  assert.equal(resumed.state.pendingHuman.transition, "enter-review");
});

test("a transition policy refuses the stamp until required evidence exists", () => {
  const { root } = fixtureRepo();
  const started = startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    workId: "WORK-G2",
    runId: "RUN-G2",
    entry: "build",
    stopAt: ["review"],
    adapters: mockAdapters({ build: ["succeed"], verify: ["succeed"] }),
  });
  assert.equal(started.state.pendingHuman.transition, "enter-review");

  const screenshotGate = {
    name: "ui-render-gate-review",
    type: "transition",
    appliesTo: "enter-review",
    enforcement: "LOCAL_ENFORCED",
    onFail: "WAIT_HUMAN",
    rule: { "evidence.exists": { kind: "screenshot", minGrade: "L2" } },
  };
  assert.throws(
    () =>
      approveRun(root, "RUN-G2", {
        by: "owner",
        transition: "enter-review",
        policies: [screenshotGate],
      }),
    DecisionError,
    "no screenshot evidence yet",
  );

  const ledger = EventLedger.open(
    join(root, ".buildbeat", "runtime", "runs", "RUN-G2", "events.jsonl"),
  );
  ledger.append({
    type: "EVIDENCE_RECORDED",
    actor: KERNEL,
    data: {
      evidenceRef: "evidence/spec-render.png",
      kind: "screenshot",
      subject: started.state.pendingHuman.subject.candidate,
      digest: "sha256:render",
      status: "passed",
      grade: "L2",
    },
  });
  const approved = approveRun(root, "RUN-G2", {
    by: "owner",
    transition: "enter-review",
    policies: [screenshotGate],
  });
  assert.equal(approved.approved, true);
});

test("workers get an env allowlist by default; inherit is an explicit opt-in", () => {
  process.env.BB_TEST_SECRET = "s3cret-token";
  try {
    const workspace = mkdtempSync(join(tmpdir(), "bb-v2-env-"));
    const probe = (config) =>
      createShellAdapter({ name: "probe", command: "bash", ...config }).execute({
        step: "build",
        worker: "builder",
        workspacePath: workspace,
        input: {},
      });

    const isolated = probe({ args: ["-c", 'printf "%s" "${BB_TEST_SECRET:-ABSENT}"'] });
    assert.equal(isolated.stdout, "ABSENT", "host secret must not reach the worker");

    const inherited = probe({
      args: ["-c", 'printf "%s" "${BB_TEST_SECRET:-ABSENT}"'],
      inheritEnv: true,
    });
    assert.equal(inherited.stdout, "s3cret-token", "inherit is available but explicit");

    const input = probe({ args: ["-c", 'printf "%s" "$BUILDBEAT_INPUT"'] });
    assert.match(input.stdout, /\{\}/, "BUILDBEAT_INPUT is always provided");
  } finally {
    delete process.env.BB_TEST_SECRET;
  }
});

test("a worker cannot push from the workspace; the main checkout still can", () => {
  const { root } = fixtureRepo();
  const bare = mkdtempSync(join(tmpdir(), "bb-v2-remote-"));
  execFileSync("git", ["init", "-q", "--bare", bare]);
  git(root, ["remote", "add", "origin", bare]);

  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-G4", base: "HEAD" });
  assert.deepEqual(workspace.protectedRemotes, ["origin"]);

  assert.throws(
    () => git(workspace.worktreePath, ["push", "origin", "HEAD"]),
    /protected|does not appear|unable/i,
    "push from inside the workspace is capability-blocked",
  );
  git(root, ["push", "-q", "origin", "main"]);
  assert.equal(git(bare, ["rev-parse", "main"]), git(root, ["rev-parse", "main"]));
});
