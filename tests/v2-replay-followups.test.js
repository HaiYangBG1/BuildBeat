// Two follow-ups from a replay of real runs.
// 1. A review that exits 0 without writing a report stops as an
//    infrastructure failure. Real incident: a reviewer printed 3 P1, 6 P2
//    and 4 P3 findings to stdout only; the step counted as passed and the
//    gap surfaced only at the merge approval.
// 2. The cost splits human waits by how they ended. Real data: one work
//    showed 32 minutes of decided waits while 11 hours had passed on a
//    request nobody answered before a new run superseded it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { startRun } from "../src/v2/runtime/orchestrator.js";
import { computeWorkCost, ledgerCost, renderWorkCost } from "../src/v2/runtime/work-cost.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { tempDir } from "./support/tmp.js";

const workflow = loadWorkflow(new URL("../src/v2/presets/software-delivery.yaml", import.meta.url));

function fixture(reviewerScript) {
  const root = tempDir("bb-replay-followups-");
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgSign", "false");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-qm", "baseline");
  const ok = createShellAdapter({ command: process.execPath, args: ["-e", "process.exit(0)"] });
  const reviewer = createShellAdapter({ command: process.execPath, args: ["-e", reviewerScript] });
  return {
    repoRoot: root, workflow, workflowDigest: "sha256:fixture", workId: "WORK-TEST",
    runId: "RUN-TEST", entry: "build", planDigest: "sha256:plan",
    adapters: { builder: ok, verifier: ok, fixer: ok, reviewer },
  };
}

function reviewOutcome(reviewerScript) {
  const result = startRun(fixture(reviewerScript));
  const events = EventLedger.open(result.ledgerPath).events;
  const finished = events.filter((event) => event.type === "STEP_FINISHED" && event.data.step === "review");
  return { result, events, finished: finished.at(-1) };
}

const MISSING = "the reviewer exited 0 without writing a report to $BUILDBEAT_OUTPUT (stdout is not read)";

test("a review that exits 0 without a report stops as an infrastructure failure", () => {
  const { result, events, finished } = reviewOutcome("process.exit(0)");
  assert.equal(finished.data.status, "invalid-output");
  assert.equal(finished.data.infra, true);
  assert.equal(finished.data.reason, MISSING);
  assert.equal(result.state.pendingHuman.kind, "infra");
  assert.equal(result.state.pendingHuman.transition, "resume-review");
  assert.equal(
    result.state.pendingHuman.reasons[0],
    `worker infrastructure failure at review: ${MISSING}; not a candidate defect, attempt not charged`,
  );
  assert.equal(events.some((event) => event.type === "EVIDENCE_RECORDED" && event.data.kind === "review"), false,
    "no review evidence for a review that reported nothing");
  assert.equal(events.some((event) => event.type === "STEP_STARTED" && event.data.step === "fix"), false,
    "an infrastructure failure never dispatches the fixer");
  const charge = events[events.indexOf(finished) + 1];
  assert.equal(charge.type, "BUDGET_CONSUMED");
  assert.equal(charge.data.amount, 0);
});

test("a report printed only to stdout is pointed at $BUILDBEAT_OUTPUT", () => {
  const report = JSON.stringify({ findings: [{ severity: "P1", summary: "printed to stdout only" }] });
  const { result, finished } = reviewOutcome(`process.stdout.write(${JSON.stringify(report)})`);
  assert.equal(finished.data.status, "invalid-output");
  assert.equal(
    finished.data.reason,
    `${MISSING}; stdout has ${Buffer.byteLength(report)} bytes; write the JSON report to $BUILDBEAT_OUTPUT`,
  );
  assert.equal(result.state.pendingHuman.transition, "resume-review");
});

test("a review that hands in an empty report still passes", () => {
  const { result, events, finished } = reviewOutcome(
    "require('node:fs').writeFileSync(process.env.BUILDBEAT_OUTPUT, JSON.stringify({ findings: [] }))",
  );
  assert.equal(finished.data.status, "succeeded");
  assert.equal(finished.data.reason, undefined);
  assert.equal(result.state.pendingHuman.kind, "final-decision");
  assert.ok(events.some((event) => event.type === "EVIDENCE_RECORDED" && event.data.kind === "review" && event.data.status === "passed"));
});

const START = Date.parse("2026-10-07T00:00:00Z");
const at = (minutes) => new Date(START + minutes * 60000).toISOString();
const ledgerOf = (...events) => ({
  events: events.map(([type, minutes, data = {}]) => ({ type, ts: at(minutes), data })),
});
const counts = (waits) => Object.fromEntries(Object.entries(waits).map(([kind, row]) => [kind, row.count]));

test("waits are split by how they ended", () => {
  const decided = ledgerCost(ledgerOf(["HUMAN_REQUESTED", 0], ["DECISION_RECORDED", 10]));
  assert.deepEqual(decided.waits.decided, { count: 1, ms: 10 * 60000 });

  const superseded = ledgerCost(ledgerOf(["HUMAN_REQUESTED", 0], ["RUN_TERMINAL", 120, { status: "SUPERSEDED" }]));
  assert.deepEqual(superseded.waits.superseded, { count: 1, ms: 120 * 60000 });
  assert.deepEqual(counts(superseded.waits), { decided: 0, superseded: 1, stopped: 0, open: 0 });

  const stopped = ledgerCost(ledgerOf(["HUMAN_REQUESTED", 0], ["RUN_TERMINAL", 5, { status: "CANCELLED" }]));
  assert.deepEqual(stopped.waits.stopped, { count: 1, ms: 5 * 60000 });

  // A rejection records its decision before the run ends: decided, not stopped.
  const rejected = ledgerCost(ledgerOf(
    ["HUMAN_REQUESTED", 0], ["DECISION_RECORDED", 3], ["RUN_TERMINAL", 3, { status: "CANCELLED" }],
  ));
  assert.deepEqual(counts(rejected.waits), { decided: 1, superseded: 0, stopped: 0, open: 0 });

  const open = ledgerCost(ledgerOf(["HUMAN_REQUESTED", 0]), { now: START + 4 * 60000 });
  assert.deepEqual(open.waits.open, { count: 1, ms: 4 * 60000 });

  // A request repeated before any decision (a resumed run asking again for
  // the same decision) continues the same wait: one wait of 10 minutes,
  // not two overlapping ones of 15.
  const repeated = ledgerCost(ledgerOf(["HUMAN_REQUESTED", 0], ["HUMAN_REQUESTED", 5], ["DECISION_RECORDED", 10]));
  assert.equal(repeated.humanWaits, 2);
  assert.deepEqual(repeated.waits.decided, { count: 1, ms: 10 * 60000 });
});

test("the cost line lists only the wait kinds that occurred", () => {
  const base = { reviewRounds: 1, findings: 0, infraFailures: 0, workerMs: 120000 };
  const none = { decided: { count: 0, ms: 0 }, superseded: { count: 0, ms: 0 }, stopped: { count: 0, ms: 0 }, open: { count: 0, ms: 0 } };
  assert.equal(renderWorkCost({ ...base, humanWaits: 0, waits: none }),
    "review rounds 1 · findings 0 · human waits 0 · worker 2m");
  assert.equal(renderWorkCost({ ...base, humanWaits: 0 }),
    "review rounds 1 · findings 0 · human waits 0 · worker 2m", "a cost without waits renders as before");
  const waits = {
    decided: { count: 2, ms: 32 * 60000 },
    superseded: { count: 1, ms: (11 * 60 + 21) * 60000 },
    stopped: { count: 0, ms: 0 },
    open: { count: 1, ms: 4 * 60000 },
  };
  assert.equal(renderWorkCost({ ...base, humanWaits: 4, waits }),
    "review rounds 1 · findings 0 · human waits 4 (decided 32m · superseded 11h21m · open 4m) · worker 2m");
});

test("work cost adds run-record waits and tolerates records written before them", () => {
  const root = tempDir("bb-replay-waits-");
  const runs = join(root, "delivery", "work", "WORK-W", "runs");
  const record = (id, cost) => {
    mkdirSync(join(runs, id), { recursive: true });
    writeFileSync(join(runs, id, "run-record.json"), JSON.stringify({
      startedAt: at(0), finishedAt: at(200), terminal: { status: "SUPERSEDED" }, cost,
    }));
  };
  record("RUN-NEW", {
    reviewRounds: 1, humanWaits: 1, infraFailures: 0, workerMs: 0,
    waits: { decided: { count: 0, ms: 0 }, superseded: { count: 1, ms: 680 * 60000 }, stopped: { count: 0, ms: 0 }, open: { count: 0, ms: 0 } },
  });
  record("RUN-OLD", { reviewRounds: 1, humanWaits: 2, infraFailures: 0, workerMs: 0 });
  const cost = computeWorkCost(root, "WORK-W");
  assert.equal(cost.runs, 2);
  assert.equal(cost.humanWaits, 3);
  assert.deepEqual(cost.waits.superseded, { count: 1, ms: 680 * 60000 });
  assert.deepEqual(counts(cost.waits), { decided: 0, superseded: 1, stopped: 0, open: 0 },
    "an old record adds no wait durations");
});
