// Findings across the review rounds of a work. Each round is its own run of
// a new commit; the work's findings account is what connects them: a
// finding that comes back is not recorded twice, and one a person dismissed
// is recorded as raised again without blocking.

import assert from "node:assert/strict";
import test from "node:test";

import { adjudicateFinding, fingerprintFinding, readFindingsAccount } from "../src/runtime/findings.js";
import { commit, fixture, reviewWith } from "./support/review.js";

const p1 = (summary) => ({ severity: "P1", summary });
const findingRows = (root, work) => readFindingsAccount(root, work).filter((row) => row.kind === "finding");

test("a finding that comes back blocks again without a second row; once dismissed it is recorded as raised again and does not block", () => {
  const { root, work } = fixture({ prefix: "bb-converge-" });
  const lock = p1("lock is never released");
  const fingerprint = fingerprintFinding(lock);

  commit(root, "add the feature", { "src/feature.txt": "one\n" });
  const first = reviewWith(root, work, { findings: [lock, { severity: "P2", summary: "naming" }] });
  // Only the P1 blocks; both are on the account.
  assert.match(first.state.pendingHuman.reasons[0], /review found 1 blocking finding\(s\)/);
  assert.deepEqual(findingRows(root, work).map((row) => row.run), ["RUN-A-01", "RUN-A-01"]);

  // The next commit did not fix it: the same finding blocks the new round.
  commit(root, "try a fix", { "src/feature.txt": "two\n" });
  const second = reviewWith(root, work, { findings: [lock] });
  assert.equal(second.runId, "RUN-A-02");
  assert.equal(second.state.run.status, "WAITING_HUMAN");
  assert.match(second.state.pendingHuman.reasons[0], /review found 1 blocking finding\(s\)/);
  assert.ok(second.state.pendingHuman.reasons[1].includes(fingerprint));
  assert.equal(second.state.evidence.at(-1).status, "failed");
  assert.equal(findingRows(root, work).length, 2, "an open fingerprint is not recorded twice");

  // A person rules it out; a later reviewer raises it again next to a new one.
  adjudicateFinding(root, work, { fingerprint, action: "dismiss", by: "owner", as: "human" });
  commit(root, "another change", { "src/feature.txt": "three\n" });
  const fresh = p1("timeout is not handled");
  const third = reviewWith(root, work, { findings: [lock, fresh] });
  assert.match(third.state.pendingHuman.reasons[0], /review found 1 blocking finding\(s\)/);
  assert.ok(third.state.pendingHuman.reasons[1].includes(fingerprintFinding(fresh)));
  assert.equal(third.state.pendingHuman.reasons.length, 2);
  assert.deepEqual(third.state.evidence.at(-1).suppressedFingerprints, [fingerprint]);
  const rows = findingRows(root, work);
  assert.equal(rows.length, 4);
  const again = rows.filter((row) => row.fingerprint === fingerprint);
  assert.deepEqual(again.map((row) => [row.run, row.reRaised ?? false]), [["RUN-A-01", false], ["RUN-A-03", true]]);
  assert.equal(rows.at(-1).reRaised, undefined, "a new finding is not a re-raise");
});
