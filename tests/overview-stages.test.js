// Stages that were once reported wrongly.

import assert from "node:assert/strict";
import test from "node:test";

import { rejectReview } from "../src/runtime/decisions.js";
import { computeOverview, renderOverview } from "../src/runtime/overview.js";
import { addWork, commit, emptyRepo, reviewWith, write } from "./support/review.js";

test("a merged commit behind an earlier version's CANCELLED run reads as MERGED; a rejected review of this version does not", () => {
  // Once a run's review budget ran out, the work was finished outside the
  // run, the commit shipped and the run was cancelled: status said the
  // shipped work was STOPPED_CANCELLED. Such runs only exist in records
  // earlier versions wrote (no `pass`).
  const root = emptyRepo("bb-stages-");
  commit(root, "baseline", { ".gitignore": ".buildbeat/\n" });
  addWork(root, "WORK-M", { workConfig: "release:\n  command: \"true\"\n" });
  const candidate = commit(root, "change for WORK-M\n\nWork: WORK-M", { "src/feature.txt": "done\n" });
  write(root, "delivery/work/WORK-M/runs/RUN-M-01/run-record.json", JSON.stringify({
    run: "RUN-M-01",
    work: "WORK-M",
    terminal: { status: "CANCELLED", reason: "rejected by owner: closure done elsewhere" },
    startedAt: "2026-08-28T00:00:00Z",
    finishedAt: "2026-08-28T00:01:00Z",
    attempts: { build: 1, verify: 1, review: 1 },
    workspaces: { "RUN-M-01": { candidate } },
  }));

  const [row] = computeOverview(root, { work: "WORK-M" });
  assert.equal(row.stage, "MERGED");
  assert.equal(row.merged, true);
  assert.equal(row.mergedCandidate, candidate);
  assert.equal(row.latest.status, "CANCELLED");
  assert.match(row.next, /is on main/);
  assert.match(row.next, /ended CANCELLED after the merge/);
  assert.match(renderOverview([row]), /candidate \w{7} \(merged\)/);

  // A commit this version reviewed is on its branch before anyone decides,
  // so being there says nothing: rejected is stopped, not merged.
  addWork(root, "WORK-N");
  commit(root, "change for WORK-N\n\nWork: WORK-N", { "src/other.txt": "done\n" });
  reviewWith(root, "WORK-N");
  rejectReview(root, "WORK-N", { by: "owner", as: "human", reason: "not this way" });
  const [rejected] = computeOverview(root, { work: "WORK-N" });
  assert.equal(rejected.stage, "STOPPED_CANCELLED");
  assert.equal(rejected.merged, false);
  assert.match(rejected.next, /^decide: commit a fix and buildbeat review --repo \. --work WORK-N, or close the work$/);
});

test("unadjudicated findings are not nagged about on settled work", () => {
  const description = { exists: true, accepted: true, stale: false };
  const base = {
    work: "WORK-X",
    intent: description,
    plan: description,
    workArtifact: "work",
    envFacts: false,
    openFindings: 14,
    runs: 4,
    cost: null,
    latest: null,
    merged: true,
    mergedCandidate: null,
    next: "n/a",
  };
  assert.doesNotMatch(renderOverview([{ ...base, stage: "MERGED" }]), /unadjudicated/);
  assert.doesNotMatch(renderOverview([{ ...base, stage: "CLOSED" }]), /unadjudicated/);
  assert.match(renderOverview([{ ...base, stage: "MERGE_READY" }]), /unadjudicated P0\/P1 findings 14/);
});
