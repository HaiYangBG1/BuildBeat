// The decision on a reviewed commit (src/runtime/decisions.js): an
// approval names the commit that waits for it and is checked again at the
// moment it is recorded; a rejection ends the run; both land in the work's
// decisions.jsonl and in a run record.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DecisionError, approveReview, listInbox, rejectReview } from "../src/runtime/decisions.js";
import { commit, fixture, git, jsonl, reviewWith, write } from "./support/review.js";

// A repository whose work has one commit, reviewed and waiting for the person.
function waiting() {
  const { root, work } = fixture({ prefix: "bb-appr-" });
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const reviewed = reviewWith(root, work);
  return { root, work, sha, reviewed };
}

const stale = (waitingFor, named) => (error) =>
  error instanceof DecisionError &&
  error.message === `approval stale: the commit waiting for a decision is ${waitingFor}, not ${named}`;

test("the final decision is approved: the run succeeds, is compacted and the decision is on record", () => {
  const { root, work, sha, reviewed } = waiting();
  assert.equal(reviewed.runId, "RUN-A-01");
  assert.equal(reviewed.state.run.status, "WAITING_HUMAN");
  assert.equal(reviewed.state.pendingHuman.transition, "enter-wait-merge");
  assert.equal(reviewed.state.pendingHuman.kind, "final-decision");
  assert.equal(reviewed.state.pendingHuman.subject.candidate, sha);

  const last = approveReview(root, work, { candidate: sha, by: "owner" });
  assert.equal(last.runId, "RUN-A-01");
  assert.equal(last.decisionRef, "D-RUN-A-01-1");
  assert.equal(last.transition, "enter-wait-merge");
  assert.equal(last.subject.candidate, sha);
  assert.equal(last.state.terminal.status, "SUCCEEDED");
  assert.ok(last.state.compacted);

  // The acceptance of work.md, then the approval of the commit.
  const lines = jsonl(root, work, "decisions.jsonl");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].transition, "accept-work");
  assert.equal(lines[1].run, "RUN-A-01");
  assert.equal(lines[1].transition, "enter-wait-merge");
  assert.equal(lines[1].decision, "approved");
  assert.equal(lines[1].subject.candidate, sha);
  assert.ok(
    existsSync(join(root, "delivery", "work", work, "runs", "RUN-A-01", "run-record.json")),
  );
});

test("an approval of any commit other than the one waiting is stale", () => {
  const { root, work, sha: first } = waiting();
  // The branch moves on after the review; the request still names the
  // commit that was reviewed, and nothing else can be approved through it.
  const second = commit(root, "polish", { "src/feature.txt": "hello!\n" });
  assert.throws(() => approveReview(root, work, { candidate: second, by: "owner" }), stale(first, second));
  assert.equal(jsonl(root, work, "decisions.jsonl").length, 1, "a stale approval records nothing");
  assert.equal(listInbox(root)[0].subject.candidate, first);

  // The new commit is a new review, which supersedes the waiting one: the
  // old commit cannot be approved any more, the approval binds to the commit
  // that is actually there.
  const again = reviewWith(root, work);
  assert.equal(again.runId, "RUN-A-02");
  assert.deepEqual(again.superseded, ["RUN-A-01"]);
  assert.throws(() => approveReview(root, work, { candidate: first, by: "owner" }), stale(second, first));
  const rebind = approveReview(root, work, { candidate: second, by: "owner" });
  assert.equal(rebind.runId, "RUN-A-02");
  assert.equal(rebind.subject.candidate, git(root, ["rev-parse", "HEAD"]));
});

test("approval re-verifies the subject at decision time and refuses a work.md that changed since the review", () => {
  const { root, work, sha } = waiting();
  const ref = `delivery/work/${work}/work.md`;
  const reviewedText = readFileSync(join(root, ref), "utf8");
  write(root, ref, "# Add two features\n");

  assert.throws(
    () => approveReview(root, work, { candidate: sha, by: "owner" }),
    (error) =>
      error instanceof DecisionError &&
      error.message === "work.md changed since the commit was reviewed; accept the new scope and review again",
  );
  assert.equal(jsonl(root, work, "decisions.jsonl").length, 1, "a refused approval records nothing");
  assert.equal(listInbox(root).length, 1, "the request still waits");

  write(root, ref, reviewedText);
  const second = approveReview(root, work, { candidate: sha, by: "owner" });
  assert.equal(second.subject.candidate, sha);
  assert.equal(second.state.terminal.status, "SUCCEEDED");

  assert.throws(
    () => approveReview(root, work, { candidate: sha, by: "owner" }),
    (error) => error instanceof DecisionError && /no reviewed commit of WORK-A waits for a decision/.test(error.message),
    "no pending request remains after approval",
  );
});

test("reject cancels and compacts the run with the decision on record", () => {
  const { root, work, sha } = waiting();
  const result = rejectReview(root, work, { by: "owner", reason: "not worth shipping" });
  assert.equal(result.runId, "RUN-A-01");
  assert.equal(result.candidate, sha);
  assert.equal(result.state.terminal.status, "CANCELLED");
  assert.ok(result.state.compacted);
  const lines = jsonl(root, work, "decisions.jsonl");
  assert.equal(lines.length, 2);
  assert.equal(lines[1].decision, "rejected");
  assert.equal(lines[1].reason, "not worth shipping");
  assert.throws(
    () => rejectReview(root, work, { by: "owner" }),
    (error) => error instanceof DecisionError && /no reviewed commit of WORK-A waits for a decision/.test(error.message),
  );
});

test("the inbox lists waiting runs and empties after the final decision", () => {
  const { root, work, sha } = waiting();
  const rows = listInbox(root);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].run, "RUN-A-01");
  assert.equal(rows[0].work, work);
  assert.equal(rows[0].transition, "enter-wait-merge");
  assert.equal(rows[0].kind, "final-decision");
  assert.equal(rows[0].subject.candidate, sha);

  rejectReview(root, work, { by: "owner" });
  assert.equal(listInbox(root).length, 0);
});
