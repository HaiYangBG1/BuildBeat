// Two follow-ups from a replay of real runs.
// 1. A review that exits 0 without writing a report ends as a tooling
//    failure. Real incident: a reviewer printed 3 P1, 6 P2 and 4 P3
//    findings to stdout only; the step counted as passed and the gap
//    surfaced only at the merge approval.
// 2. A ledger's waits are split by how they ended. Real data: one work
//    showed 32 minutes of decided waits while 11 hours had passed on a
//    request nobody answered before a new run superseded it.
import assert from "node:assert/strict";
import test from "node:test";

import { ledgerCost } from "../src/runtime/work-cost.js";
import { EventLedger } from "../src/storage/event-ledger.js";
import { commit, fixture, reviewWith, worker } from "./support/review.js";

// Reviews a commit with a reviewer that returns `result` (see worker()).
function reviewOutcome(result) {
  const { root, work } = fixture({ prefix: "bb-replay-followups-" });
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const reviewed = reviewWith(root, work, { reviewer: worker(result) });
  const events = EventLedger.open(reviewed.ledgerPath).events;
  const finished = events.filter((event) => event.type === "STEP_FINISHED" && event.data.step === "review");
  return { state: reviewed.state, events, finished: finished.at(-1) };
}

const MISSING = "the reviewer exited 0 without writing a report to $BUILDBEAT_OUTPUT (stdout is not read)";

test("a review that exits 0 without a report ends as a tooling failure", () => {
  const { state, events, finished } = reviewOutcome({});
  assert.equal(finished.data.status, "invalid-output");
  assert.equal(finished.data.infra, true);
  assert.equal(finished.data.reason, MISSING);
  assert.equal(state.terminal.status, "CANCELLED");
  assert.equal(
    state.terminal.reason,
    `worker infrastructure failure at review: ${MISSING}; not a candidate defect`,
  );
  assert.equal(state.pendingHuman, null, "nothing to approve: the commit was not reviewed");
  assert.equal(events.some((event) => event.type === "EVIDENCE_RECORDED" && event.data.kind === "review"), false,
    "no review evidence for a review that reported nothing");
});

test("a report printed only to stdout is pointed at $BUILDBEAT_OUTPUT", () => {
  const report = JSON.stringify({ findings: [{ severity: "P1", summary: "printed to stdout only" }] });
  const { state, finished } = reviewOutcome({ stdout: report });
  assert.equal(finished.data.status, "invalid-output");
  assert.equal(
    finished.data.reason,
    `${MISSING}; stdout has ${Buffer.byteLength(report)} bytes; write the JSON report to $BUILDBEAT_OUTPUT`,
  );
  assert.equal(state.terminal.status, "CANCELLED");
});

test("a review that hands in an empty report still passes", () => {
  const { state, events, finished } = reviewOutcome({ envelope: { findings: [] } });
  assert.equal(finished.data.status, "succeeded");
  assert.equal(finished.data.reason, undefined);
  assert.equal(state.pendingHuman.kind, "final-decision");
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

  // A request repeated before any decision continues the same wait: one
  // wait of 10 minutes, not two overlapping ones of 15.
  const repeated = ledgerCost(ledgerOf(["HUMAN_REQUESTED", 0], ["HUMAN_REQUESTED", 5], ["DECISION_RECORDED", 10]));
  assert.equal(repeated.humanWaits, 2);
  assert.deepEqual(repeated.waits.decided, { count: 1, ms: 10 * 60000 });
});
