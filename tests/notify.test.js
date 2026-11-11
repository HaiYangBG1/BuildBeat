// Nothing is pushed to a channel any more. What is left of "tell the person
// what to do next" is nextReply: the commands to copy for a waiting review.

import assert from "node:assert/strict";
import test from "node:test";

import { nextReply } from "../src/runtime/hints.js";

function waitingState({ review = "passed", pass = true } = {}) {
  return {
    run: { id: "RUN-N-01", work: "WORK-N", status: "WAITING_HUMAN", ...(pass ? { pass: true } : {}), deliveryChecks: { artifact: "work" } },
    pendingHuman: { transition: "enter-wait-merge", reasons: [], kind: "final-decision", subject: { candidate: "abc1234" } },
    evidence: [
      { kind: "verify", status: "passed" },
      { kind: "review", status: review },
    ],
    terminal: null,
  };
}

test("nextReply spells out the copyable commands for a waiting review", () => {
  const clean = nextReply({ repoLabel: "sub", state: waitingState() });
  assert.deepEqual(clean, [
    "buildbeat decide --repo sub --work WORK-N --action approve --candidate abc1234 --by <you>",
    "buildbeat decide --repo sub --work WORK-N --action reject --reason <why> --by <you>",
  ]);

  const blocked = nextReply({ repoLabel: ".", state: waitingState({ review: "failed" }) });
  assert.equal(blocked.length, 4);
  assert.match(blocked[0], /^buildbeat review --repo \. --work WORK-N   # after committing a fix/);
  assert.match(blocked[1], /^buildbeat decide --repo \. --work WORK-N --fingerprint <fp> --action accept\|dismiss --by <you>$/);
  assert.match(blocked[2], /--action approve --candidate abc1234 --by <you>   # refused while a blocking finding stands$/);
  assert.match(blocked[3], /--action reject --reason <why>/);

  assert.deepEqual(nextReply({ repoLabel: ".", state: { run: null, pendingHuman: null } }), []);
  assert.deepEqual(nextReply({ repoLabel: ".", state: { ...waitingState(), pendingHuman: null } }), []);
});

test("nextReply sends a run of an earlier version back to that version instead of offering decide", () => {
  const legacy = nextReply({ repoLabel: ".", state: waitingState({ pass: false }) });
  assert.equal(legacy.length, 1);
  assert.match(legacy[0], /^RUN-N-01 was started by an earlier BuildBeat: finish or stop it with that version, then review the commit with buildbeat review --repo \. --work WORK-N$/);
  assert.ok(!legacy[0].includes("decide"));
});
