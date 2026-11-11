// A new review of a work supersedes the review of that work that was still
// waiting for a decision: nobody should approve a commit that has a
// successor. Other works are not touched.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { listInbox } from "../src/v2/runtime/decisions.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { addWork, commit, fixture, reviewWith } from "./support/review.js";

test("a new review of the same work supersedes the one still waiting; another work's review is left alone", () => {
  const { root } = fixture({ prefix: "bb-v2-supersede-", work: "WORK-S" });
  addWork(root, "WORK-OTHER");
  commit(root, "add the feature", { "src/feature.txt": "helo\n" });
  const first = reviewWith(root, "WORK-S");
  assert.equal(first.runId, "RUN-S-01");
  assert.equal(first.state.run.status, "WAITING_HUMAN");
  const other = reviewWith(root, "WORK-OTHER");
  assert.equal(other.state.run.status, "WAITING_HUMAN");
  assert.deepEqual(other.superseded, []);

  commit(root, "fix the text", { "src/feature.txt": "hello\n" });
  const second = reviewWith(root, "WORK-S");
  assert.equal(second.runId, "RUN-S-02");
  assert.deepEqual(second.superseded, ["RUN-S-01"]);
  assert.deepEqual(second.supersedeSkipped, []);
  assert.equal(second.state.run.status, "WAITING_HUMAN");

  const firstLedger = EventLedger.open(first.ledgerPath);
  assert.equal(firstLedger.corruption, null);
  assert.equal(firstLedger.state.terminal.status, "SUPERSEDED");
  assert.match(firstLedger.state.terminal.reason, /superseded by RUN-S-02 \(same work WORK-S\)/);
  assert.ok(firstLedger.state.compacted, "the superseded run is compacted into a run record");
  assert.ok(existsSync(join(root, "delivery", "work", "WORK-S", "runs", "RUN-S-01", "run-record.json")));

  const created = EventLedger.open(second.ledgerPath).events[0];
  assert.deepEqual(created.data.supersedes, ["RUN-S-01"]);

  // What waits for a person now is exactly the two live reviews.
  const inbox = listInbox(root).map((row) => row.run).sort();
  assert.deepEqual(inbox, [other.runId, "RUN-S-02"].sort());
});
