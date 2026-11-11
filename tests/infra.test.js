// Tool trouble is not a verdict on the commit: a reviewer that times out,
// crashes or reports garbage ends the run CANCELLED, and nothing it said is
// recorded. (A verifier exiting 75, a reviewer exiting non-zero and a
// reviewer that leaves no report are in review-commit.test.js.)

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DecisionError, approveReview } from "../src/runtime/decisions.js";
import { commit, fixture, record, reviewWith, worker } from "./support/review.js";

// Real incident: a worker backend outage and non-JSON reviewer output ended
// five runs in two days as failures of the candidate.
for (const [label, result, detail, cause] of [
  ["a reviewer timeout", { exitCode: null, timedOut: true }, "timeout", /at review: timeout; not a candidate defect/],
  ["a reviewer crash", { exitCode: null, signal: "SIGKILL" }, "crashed", /at review: crashed; not a candidate defect/],
  ["garbage reviewer output", { envelope: "LGTM, no JSON here" }, "invalid-output", /at review: output is not a worker envelope; not a candidate defect/],
  ["findings without a severity", { envelope: { findings: [{ summary: "something" }] } }, "invalid-output", /at review: output is not a worker envelope/],
]) {
  test(`${label} ends the run CANCELLED: no verdict, no finding, nothing to approve`, () => {
    const { root, work } = fixture({ prefix: "bb-infra-" });
    const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
    const { state, runId } = reviewWith(root, work, { reviewer: worker(result) });
    assert.equal(state.run.status, "CANCELLED");
    assert.equal(state.terminal.status, "CANCELLED");
    assert.match(state.terminal.reason, /worker infrastructure failure/);
    assert.match(state.terminal.reason, cause);
    assert.equal(state.steps.verify.detail, "succeeded");
    assert.equal(state.steps.review.detail, detail);
    assert.equal(state.pendingHuman, null);
    assert.equal(state.evidence.some((item) => item.kind === "review"), false);
    assert.equal(existsSync(join(root, "delivery", "work", work, "review-findings.jsonl")), false);
    assert.equal(record(root, work, runId).terminal.status, "CANCELLED");
    assert.throws(
      () => approveReview(root, work, { candidate: sha, by: "owner", as: "human" }),
      (error) => error instanceof DecisionError && /no reviewed commit of WORK-A waits for a decision/.test(error.message),
    );

    // The same commit, once the tooling works again, is a new run.
    const again = reviewWith(root, work);
    assert.equal(again.runId, "RUN-A-02");
    assert.equal(again.state.run.status, "WAITING_HUMAN");
    assert.equal(again.state.pendingHuman.subject.candidate, sha);
  });
}
