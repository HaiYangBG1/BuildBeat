// One review of one commit through the runtime (reviewCommit): verify, then
// the read-only review, then the run waits for the person. What it records,
// what it leaves behind, and how it ends a review whose process died.

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import { WORKFLOW_DIGEST, WORKFLOW_NAME } from "../src/v2/engine/workflow.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { acquireLock, createWorkspace, releaseLock } from "../src/v2/workspace/workspace-manager.js";
import { addWork, commit, fixture, git, record, reviewWith, worker } from "./support/review.js";

const KERNEL = { kind: "kernel", id: "orchestrator" };
const TS = "2026-08-28T00:00:00.000Z";
const ledgerPath = (root, run) => join(root, ".buildbeat", "runtime", "runs", run, "events.jsonl");

test("verify then review leaves the run waiting; its records hold repo-relative paths and replay from the ledger", () => {
  const { root, base, work } = fixture({ prefix: "bb-v2-orch-" });
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const result = reviewWith(root, work);
  const state = result.state;
  assert.equal(result.runId, "RUN-A-01");
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.pendingHuman.transition, "enter-wait-merge");
  assert.equal(state.steps.verify.status, "SUCCEEDED");
  assert.equal(state.steps.review.status, "SUCCEEDED");
  // The verify command, the review command and the review report.
  assert.deepEqual(state.evidence.map((item) => item.kind), ["command", "command", "review"]);
  assert.ok(state.evidence.every((item) => item.status === "passed"));
  assert.ok(state.evidence.every((item) => item.subject === sha));
  assert.equal(state.workspaces["RUN-A-01"].repo, ".");
  assert.equal(state.workspaces["RUN-A-01"].worktreePath, ".buildbeat/worktrees/RUN-A-01");
  assert.equal(state.workspaces["RUN-A-01"].base, base);
  assert.equal(state.workspaces["RUN-A-01"].candidate, sha);
  assert.ok(
    state.evidence.every((item) => item.ref.startsWith(".buildbeat/runtime/runs/RUN-A-01/")),
  );
  assert.ok(state.evidence.every((item) => existsSync(join(root, item.ref))));
  assert.doesNotMatch(readFileSync(result.ledgerPath, "utf8"), new RegExp(root));
  // The checkout and its branch are gone when the review returns.
  assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-A-01")), false);
  assert.equal(git(root, ["branch", "--list", "run/*"]), "");

  const reopened = EventLedger.open(result.ledgerPath);
  assert.equal(reopened.corruption, null);
  assert.deepEqual(reopened.state, state);
});

test("a verify that leaves the checkout dirty fails the run; nothing is reviewed", () => {
  const { root, work } = fixture({ prefix: "bb-v2-orch-" });
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  let reviewed = false;
  const result = reviewWith(root, work, {
    verifier: worker(({ workspacePath }) => {
      writeFileSync(join(workspacePath, "wip.txt"), "wip\n");
      return {};
    }),
    reviewer: worker(() => {
      reviewed = true;
      return { envelope: { findings: [] } };
    }),
  });
  const state = result.state;
  assert.equal(state.terminal.status, "FAILED");
  assert.match(state.terminal.reason, /step verify left a dirty checkout; verify must leave the commit as it found it/);
  assert.equal(state.pendingHuman, null);
  assert.equal(reviewed, false);
  assert.equal(state.steps.review, undefined);
  assert.equal(state.workspaces["RUN-A-01"].candidate, sha);
  assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-A-01")), false);
});

test("the locks are released when the review returns, however it ended", () => {
  const { root, work } = fixture({ prefix: "bb-v2-orch-" });
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const free = (...ids) => {
    for (const id of ids) {
      acquireLock(root, id);
      releaseLock(root, id);
    }
  };
  const waiting = reviewWith(root, work);
  assert.equal(waiting.state.run.status, "WAITING_HUMAN");
  free("active-run", waiting.runId);

  const failed = reviewWith(root, work, { verifier: worker({ exitCode: 1 }) });
  assert.equal(failed.state.terminal.status, "FAILED");
  free("active-run", failed.runId);

  assert.throws(
    () => reviewWith(root, work, { runId: "RUN-A-09", verifyCheckout: () => { throw new Error("not this checkout"); } }),
    /not this checkout/,
  );
  free("active-run", "RUN-A-09");
});

// The ledger a review leaves when its process dies while verify runs: the
// run is RUNNING, its step started, its checkout and branch still there.
// Without a checkout, the process died before it made one.
function interruptedReview(root, work, runId, { base, sha, checkout = true }) {
  const workspace = checkout ? createWorkspace({ repoRoot: root, runId, base, at: sha }) : null;
  const ledger = EventLedger.open(ledgerPath(root, runId));
  const append = (type, data) =>
    ledger.append({ type, actor: KERNEL, ts: TS, run: runId, work, data });
  append("RUN_CREATED", {
    pass: true,
    workflowRef: WORKFLOW_NAME,
    workflowDigest: WORKFLOW_DIGEST,
    base,
    riskPreset: "standard",
    entry: "verify",
  });
  append("RUN_STARTED", {});
  if (workspace) {
    append("WORKSPACE_BOUND", {
      workspaceId: runId,
      repo: ".",
      branch: workspace.branch,
      worktreePath: relative(root, workspace.worktreePath),
      base,
    });
    append("CANDIDATE_PINNED", { workspaceId: runId, base, candidate: sha });
    append("STEP_STARTED", { step: "verify", attempt: 1, worker: "verifier", adapter: "test", workspaceId: runId });
  }
  return workspace;
}

test("a review left running by a process that is gone is ended CANCELLED by the next review of the work", () => {
  const { root, base, work } = fixture({ prefix: "bb-v2-orch-" });
  const otherBase = addWork(root, "WORK-B");
  const first = commit(root, "add the feature", { "src/feature.txt": "helo\n" });
  const workspace = interruptedReview(root, work, "RUN-A-01", { base, sha: first });
  interruptedReview(root, "WORK-B", "RUN-B-01", { base: otherBase, sha: first, checkout: false });
  assert.equal(EventLedger.open(ledgerPath(root, "RUN-A-01")).state.run.status, "RUNNING");

  const second = commit(root, "fix the text", { "src/feature.txt": "hello\n" });
  const result = reviewWith(root, work);
  assert.equal(result.runId, "RUN-A-02");
  assert.deepEqual(result.interrupted, ["RUN-A-01"]);
  assert.deepEqual(result.superseded, []);
  assert.equal(result.state.run.status, "WAITING_HUMAN");
  assert.equal(result.state.pendingHuman.subject.candidate, second);

  // The lost step is closed as a tooling failure, not as a verdict on the
  // commit, and the run ends without anything to resume.
  const ended = EventLedger.open(ledgerPath(root, "RUN-A-01"));
  assert.equal(ended.corruption, null);
  assert.ok(ended.events.some((event) => event.type === "RUN_INTERRUPTED"));
  const crashed = ended.events.find((event) => event.type === "STEP_FINISHED");
  assert.equal(crashed.data.step, "verify");
  assert.equal(crashed.data.attempt, 1);
  assert.equal(crashed.data.status, "crashed");
  assert.equal(crashed.data.infra, true);
  assert.equal(ended.state.terminal.status, "CANCELLED");
  assert.match(ended.state.terminal.reason, /interrupted: the process that ran this review is gone; superseded by RUN-A-02/);
  const kept = record(root, work, "RUN-A-01");
  assert.equal(kept.terminal.status, "CANCELLED");
  assert.equal(kept.workspaces["RUN-A-01"].candidate, first);
  assert.equal(kept.workspaces["RUN-A-01"].worktreePath, ".buildbeat/worktrees/RUN-A-01");
  // Its checkout and branch went with it.
  assert.equal(existsSync(workspace.worktreePath), false);
  assert.equal(git(root, ["branch", "--list", "run/*"]), "");

  // Another work's interrupted review is left for that work's next review.
  const other = EventLedger.open(ledgerPath(root, "RUN-B-01")).state;
  assert.equal(other.terminal, null);
  assert.equal(other.run.status, "RUNNING");
});
