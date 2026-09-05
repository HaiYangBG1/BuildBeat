import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { approveRun, rejectRun } from "../src/v2/runtime/decisions.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";
import { computeOverview, renderOverview } from "../src/v2/runtime/overview.js";
import { computeWorkCost, formatWorkerMs, renderWorkCost } from "../src/v2/runtime/work-cost.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-cost-"));
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
    args: ["-lc", "echo done >> feature.txt && git add -A && git commit -qm candidate"],
  });
const blocking = (summary) => ({
  behavior: "succeed",
  envelope: { status: "succeeded", findings: [{ severity: "P1", summary }] },
});
const clean = () => ({ behavior: "succeed", envelope: { status: "succeeded", findings: [] } });

function options(root, runId, workId, adapters, extra = {}) {
  return {
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    workId,
    runId,
    entry: "build",
    adapters,
    ...extra,
  };
}

test("work cost accumulates review rounds, findings, waits and worker time across superseded runs", () => {
  // Real incident: a pilot work ran 21 runs and 9 review rounds while the
  // per-run cap of two never fired, because every round was a new run.
  const { root } = fixtureRepo();
  const work = "WORK-COST";
  const first = createMockAdapter({ verify: ["succeed", "succeed"], fix: ["succeed"], review: [blocking("one"), clean()] });
  startRun(options(root, "RUN-COST-01", work, { builder: committingBuilder(), verifier: first, fixer: first, reviewer: first }));
  // A second run supersedes the first (still waiting at the merge decision).
  const second = createMockAdapter({ verify: ["succeed"], review: [clean()] });
  startRun(options(root, "RUN-COST-02", work, { builder: committingBuilder(), verifier: second, reviewer: second }));

  const cost = computeWorkCost(root, work);
  assert.equal(cost.runs, 2);
  assert.equal(cost.reviewRounds, 3);
  assert.equal(cost.findings, 1);
  assert.equal(cost.humanWaits, 2, "one merge decision per run");
  assert.ok(cost.workerMs >= 0);
  assert.ok(cost.firstAt && cost.lastAt && cost.firstAt <= cost.lastAt);

  const rows = computeOverview(root, { work });
  assert.equal(rows[0].runs, 2);
  assert.equal(rows[0].cost.reviewRounds, 3);
  const text = renderOverview(rows);
  assert.match(text, /cost: review rounds 3 · findings 1 · human waits 2 · worker/);

  // The superseded run's record carries the cost block for when the
  // runtime directory is gone.
  const record = JSON.parse(readFileSync(join(root, "delivery", "work", work, "runs", "RUN-COST-01", "run-record.json"), "utf8"));
  assert.equal(record.cost.reviewRounds, 2);
  assert.equal(record.cost.humanWaits, 1);
});

test("budgets.reviewRoundsPerWork stops a new run before its review once the work has spent the rounds", () => {
  const { root } = fixtureRepo();
  const work = "WORK-CAP";
  const extra = { budgets: { reviewRoundsPerWork: 2 } };
  const first = createMockAdapter({ verify: ["succeed", "succeed"], fix: ["succeed"], review: [blocking("one"), clean()] });
  const started = startRun(options(root, "RUN-CAP-01", work, { builder: committingBuilder(), verifier: first, fixer: first, reviewer: first }, extra));
  assert.equal(started.state.pendingHuman.kind, "final-decision");
  rejectRun(root, "RUN-CAP-01", { by: "owner", reason: "try once more" });

  const second = createMockAdapter({ verify: ["succeed"], review: [clean()] });
  const adapters = { builder: committingBuilder(), verifier: second, reviewer: second };
  const capped = startRun(options(root, "RUN-CAP-02", work, adapters, extra));
  assert.equal(capped.state.run.status, "WAITING_HUMAN");
  assert.equal(capped.state.pendingHuman.kind, "work-review-cap");
  assert.equal(capped.state.pendingHuman.transition, "enter-review");
  assert.match(capped.state.pendingHuman.reasons[0], /work review cap reached: 2 review round\(s\) across 2 run\(s\)/);
  assert.equal(capped.state.steps.review, undefined, "review did not run");

  approveRun(root, "RUN-CAP-02", { by: "owner", transition: "enter-review" });
  const resumed = resumeRun(options(root, "RUN-CAP-02", work, adapters, extra));
  assert.equal(resumed.state.workReviewGrants, 1);
  assert.equal(resumed.state.steps.review.attempts, 1);
  assert.equal(resumed.state.pendingHuman.kind, "final-decision");
});

test("no cap configured means no work-level stop", () => {
  const { root } = fixtureRepo();
  const work = "WORK-NOCAP";
  for (const id of ["RUN-NC-01", "RUN-NC-02", "RUN-NC-03"]) {
    const mock = createMockAdapter({ verify: ["succeed"], review: [clean()] });
    const result = startRun(options(root, id, work, { builder: committingBuilder(), verifier: mock, reviewer: mock }));
    assert.equal(result.state.pendingHuman.kind, "final-decision");
  }
  assert.equal(computeWorkCost(root, work).reviewRounds, 3);
});

test("worker time renders in human units", () => {
  assert.equal(formatWorkerMs(0), "0s");
  assert.equal(formatWorkerMs(45_000), "45s");
  assert.equal(formatWorkerMs(5 * 60_000), "5m");
  assert.equal(formatWorkerMs(3 * 3_600_000 + 40 * 60_000), "3h40m");
  assert.match(renderWorkCost({ reviewRounds: 9, findings: 22, humanWaits: 12, infraFailures: 2, workerMs: 0 }), /infra failures 2/);
});
