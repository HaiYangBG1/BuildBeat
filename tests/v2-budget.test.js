import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { applyEvent, initialState } from "../src/v2/engine/reducer.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { approveRun } from "../src/v2/runtime/decisions.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-budget-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return { root };
}

const committingBuilder = () =>
  createShellAdapter({
    name: "shell:builder",
    command: "bash",
    args: ["-lc", "echo done > feature.txt && git add -A && git commit -qm candidate"],
  });

const blocking = (summary) => ({
  behavior: "succeed",
  envelope: { status: "succeeded", findings: [{ severity: "P0", summary }] },
});
const clean = () => ({ behavior: "succeed", envelope: { status: "succeeded", findings: [] } });

function options(root, runId, adapters, extra = {}) {
  return {
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    workId: `WORK-${runId}`,
    runId,
    entry: "build",
    adapters,
    ...extra,
  };
}

test("approving resume-review after the budget ran out grants one more round instead of re-asking", () => {
  // Real incident: the preset's two review rounds ran out, the human
  // approved resume-review, and the kernel immediately filed the same
  // request again. The run was cancelled while its candidate shipped.
  const { root } = fixtureRepo();
  const mock = createMockAdapter({
    verify: ["succeed", "succeed", "succeed"],
    fix: ["succeed", "succeed"],
    review: [blocking("issue one"), blocking("issue two"), clean()],
  });
  const adapters = { builder: committingBuilder(), verifier: mock, fixer: mock, reviewer: mock };
  const started = startRun(options(root, "RUN-B1", adapters));
  assert.equal(started.state.run.status, "WAITING_HUMAN");
  assert.equal(started.state.pendingHuman.transition, "resume-review");
  assert.match(started.state.pendingHuman.reasons[0], /budget exhausted: review would exceed maxAttempts=2/);
  assert.match(started.state.pendingHuman.reasons[1], /approving resume-review grants one more attempt/);

  const approval = approveRun(root, "RUN-B1", { by: "owner", transition: "resume-review" });
  assert.equal(approval.approved, true);
  const resumed = resumeRun(options(root, "RUN-B1", adapters));
  assert.equal(resumed.resumed, true);
  const state = resumed.state;
  assert.equal(state.budgetExtensions.review, 1);
  assert.equal(state.steps.review.attempts, 3);
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.pendingHuman.kind, "final-decision");
  assert.equal(state.pendingHuman.transition, "enter-wait-merge");
});

test("run-config budgets override the preset's review cap", () => {
  const { root } = fixtureRepo();
  const mock = createMockAdapter({
    verify: ["succeed", "succeed", "succeed"],
    fix: ["succeed", "succeed"],
    review: [blocking("issue one"), blocking("issue two"), clean()],
  });
  const adapters = { builder: committingBuilder(), verifier: mock, fixer: mock, reviewer: mock };
  const result = startRun(
    options(root, "RUN-B2", adapters, { budgets: { maxAttempts: { review: 3 } } }),
  );
  assert.equal(result.state.steps.review.attempts, 3);
  assert.equal(result.state.pendingHuman.kind, "final-decision");
});

test("a final-attempt failure also becomes one more attempt on approval, not a fixer", () => {
  const { root } = fixtureRepo();
  const mock = createMockAdapter({
    build: ["fail", "succeed"],
    verify: ["succeed"],
    review: [clean()],
  });
  const adapters = { builder: mock, verifier: mock, reviewer: mock };
  const started = startRun(options(root, "RUN-B3", adapters, { maxAttemptsPerStep: 1 }));
  assert.equal(started.state.pendingHuman.transition, "resume-build");
  assert.match(started.state.pendingHuman.reasons[0], /budget exhausted: build failed its final attempt/);
  approveRun(root, "RUN-B3", { by: "owner", transition: "resume-build" });
  const resumed = resumeRun(options(root, "RUN-B3", adapters, { maxAttemptsPerStep: 1 }));
  assert.equal(resumed.state.budgetExtensions.build, 1);
  assert.equal(resumed.state.steps.build.attempts, 2);
  assert.equal(resumed.state.steps.build.status, "SUCCEEDED");
});

test("BUDGET_EXTENDED reduces deterministically and survives unknown-to-older-readers", () => {
  let state = initialState();
  const base = { v: 1, ts: "2026-09-05T00:00:00.000Z", run: "RUN-1", work: "WORK-1", actor: { kind: "kernel", id: "orchestrator" }, prev: "sha256:x", digest: "sha256:y" };
  state = applyEvent(state, { ...base, seq: 1, type: "RUN_CREATED", data: { workflowRef: "wf", workflowDigest: "sha256:wf", base: "abc", riskPreset: "standard" } });
  state = applyEvent(state, { ...base, seq: 2, type: "BUDGET_EXTENDED", data: { step: "review", amount: 1, maxAttempts: 3, approvalRef: "D-1" } });
  state = applyEvent(state, { ...base, seq: 3, type: "BUDGET_EXTENDED", data: { step: "review", amount: 1, maxAttempts: 4, approvalRef: "D-2" } });
  assert.deepEqual(state.budgetExtensions, { review: 2 });
});
