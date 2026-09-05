import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
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
  const root = mkdtempSync(join(tmpdir(), "bb-v2-infra-"));
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

for (const [label, behavior] of [
  ["a reviewer timeout", "timeout"],
  ["a reviewer crash", "crash"],
  ["garbage reviewer output", "invalid-output"],
]) {
  test(`${label} is an infrastructure failure: no fixer, no terminal, attempt refunded, rerun on approval`, () => {
    // Real incident: a worker backend outage (review exit 97) and non-JSON
    // reviewer output killed five pilot runs in two days as
    // "no transition for (review, failed)".
    const { root } = fixtureRepo();
    const mock = createMockAdapter({ verify: ["succeed"], review: [behavior, clean()] });
    const adapters = { builder: committingBuilder(), verifier: mock, reviewer: mock, fixer: mock };
    const runId = `RUN-I-${behavior}`;
    const started = startRun(options(root, runId, adapters));
    const state = started.state;
    assert.equal(state.terminal, null);
    assert.equal(state.run.status, "WAITING_HUMAN");
    assert.equal(state.pendingHuman.kind, "infra");
    assert.equal(state.pendingHuman.transition, "resume-review");
    assert.match(state.pendingHuman.reasons[0], /worker infrastructure failure at review/);
    assert.equal(state.steps.review.infraAttempts, 1);
    assert.equal(state.steps.fix, undefined, "no fixer dispatched");
    assert.equal(state.fingerprints.length, 0, "no failure fingerprint recorded");
    assert.equal(state.budgets.attempts.consumed, 2, "build and verify charged, review refunded");

    approveRun(root, runId, { by: "owner", transition: "resume-review" });
    const resumed = resumeRun(options(root, runId, adapters));
    assert.equal(resumed.state.steps.review.attempts, 2);
    assert.equal(resumed.state.budgetExtensions.review, undefined, "refund, not an extension");
    assert.equal(resumed.state.pendingHuman.kind, "final-decision");
  });
}

test("a verifier exiting 75 (environment unavailable) stops for a human instead of dispatching a fixer", () => {
  // Real incidents: rg missing from PATH, a port collision with the owner's
  // dev server, host load average 280 — each burned a fixer on a candidate
  // that was fine.
  const { root } = fixtureRepo();
  const mock = createMockAdapter({ verify: ["env-fail", "succeed"], review: [clean()] });
  const adapters = { builder: committingBuilder(), verifier: mock, reviewer: mock, fixer: mock };
  const started = startRun(options(root, "RUN-I-75", adapters));
  assert.equal(started.state.pendingHuman.kind, "infra");
  assert.equal(started.state.pendingHuman.transition, "resume-verify");
  assert.match(started.state.pendingHuman.reasons[0], /exit 75/);
  assert.equal(started.state.steps.fix, undefined);
  assert.equal(started.state.steps.verify.infraAttempts, 1);

  approveRun(root, "RUN-I-75", { by: "owner", transition: "resume-verify" });
  const resumed = resumeRun(options(root, "RUN-I-75", adapters));
  assert.equal(resumed.state.steps.verify.attempts, 2);
  assert.equal(resumed.state.steps.verify.status, "SUCCEEDED");
  assert.equal(resumed.state.pendingHuman.kind, "final-decision");
});

test("infra attempts do not eat the step's budget", () => {
  const { root } = fixtureRepo();
  // verify budget 1: one env failure, then a real pass must still be allowed.
  const mock = createMockAdapter({ verify: ["env-fail", "succeed"], review: [clean()] });
  const adapters = { builder: committingBuilder(), verifier: mock, reviewer: mock };
  const extra = { budgets: { maxAttempts: { verify: 1 } } };
  startRun(options(root, "RUN-I-B", adapters, extra));
  approveRun(root, "RUN-I-B", { by: "owner", transition: "resume-verify" });
  const resumed = resumeRun(options(root, "RUN-I-B", adapters, extra));
  assert.equal(resumed.state.steps.verify.attempts, 2);
  assert.equal(resumed.state.steps.verify.status, "SUCCEEDED");
  assert.equal(resumed.state.budgetExtensions.verify, undefined);
});

test("a plain non-zero verify failure still routes to fix (infra classification is narrow)", () => {
  const { root } = fixtureRepo();
  const mock = createMockAdapter({ verify: ["fail", "succeed"], fix: ["succeed"], review: [clean()] });
  const adapters = { builder: committingBuilder(), verifier: mock, fixer: mock, reviewer: mock };
  const result = startRun(options(root, "RUN-I-F", adapters));
  assert.equal(result.state.steps.fix.attempts, 1);
  assert.equal(result.state.pendingHuman.kind, "final-decision");
});

test("a fix step that fails with no edge waits for a human rather than ending the run", () => {
  const { root } = fixtureRepo();
  const mock = createMockAdapter({ verify: ["fail"], fix: ["fail"] });
  const adapters = { builder: committingBuilder(), verifier: mock, fixer: mock };
  const result = startRun(options(root, "RUN-I-FIX", adapters));
  assert.equal(result.state.terminal, null);
  assert.equal(result.state.pendingHuman.transition, "resume-fix");
  assert.match(result.state.pendingHuman.reasons[0], /no transition for \(fix, failed\)/);
});
