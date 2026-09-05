import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { DecisionError, approveRun, listInbox, rejectRun } from "../src/v2/runtime/decisions.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-appr-"));
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
    args: ["-lc", "echo done > feature.txt && git add -A && git commit -qm candidate"],
  });

function startToReviewBoundary(root, runId, reviewerMock) {
  return startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    workId: `WORK-${runId}`,
    runId,
    entry: "build",
    stopAt: ["review"],
    adapters: {
      builder: committingBuilder(),
      verifier: createMockAdapter({ verify: ["succeed"] }),
      reviewer: reviewerMock,
    },
  });
}

const cleanReviewer = () =>
  createMockAdapter({
    review: [{ behavior: "succeed", envelope: { status: "succeeded", findings: [] } }],
  });

test("approve at a boundary, resume through review, approve the final decision", () => {
  const { root } = fixtureRepo();
  const started = startToReviewBoundary(root, "RUN-A1", cleanReviewer());
  assert.equal(started.state.pendingHuman.transition, "enter-review");
  assert.equal(started.state.pendingHuman.kind, "boundary");

  const first = approveRun(root, "RUN-A1", { by: "owner", transition: "enter-review" });
  assert.equal(first.approved, true);
  assert.equal(first.terminal, false);

  const resumed = resumeRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    runId: "RUN-A1",
    stopAt: ["review"],
    adapters: { reviewer: cleanReviewer() },
  });
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.state.run.status, "WAITING_HUMAN");
  assert.equal(resumed.state.pendingHuman.kind, "final-decision");

  const last = approveRun(root, "RUN-A1", { by: "owner", transition: "enter-wait-merge" });
  assert.equal(last.approved, true);
  assert.equal(last.terminal, true);
  assert.equal(last.state.terminal.status, "SUCCEEDED");
  assert.ok(last.state.compacted);

  const decisionsFile = join(root, "delivery", "work", "WORK-RUN-A1", "decisions.jsonl");
  const lines = readFileSync(decisionsFile, "utf8").split("\n").filter(Boolean);
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).decision, "approved");
  assert.ok(
    existsSync(join(root, "delivery", "work", "WORK-RUN-A1", "runs", "RUN-A1", "run-record.json")),
  );
});

test("an approval goes stale when the candidate moves after approval (F6)", () => {
  const { root } = fixtureRepo();
  const started = startToReviewBoundary(root, "RUN-A2", cleanReviewer());
  const approved = approveRun(root, "RUN-A2", { by: "owner", transition: "enter-review" });
  assert.equal(approved.approved, true);

  const worktree = started.workspace.worktreePath;
  writeFileSync(join(worktree, "sneaky.txt"), "moved after approval\n");
  git(worktree, ["add", "-A"]);
  git(worktree, ["commit", "-qm", "moved-after-approval"]);

  const resumed = resumeRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    runId: "RUN-A2",
    adapters: { reviewer: cleanReviewer() },
  });
  assert.equal(resumed.stale, true);
  assert.equal(resumed.state.approvals[0].stale, true);
  assert.deepEqual(resumed.state.approvals[0].changed, ["candidate"]);
  assert.equal(resumed.state.run.status, "WAITING_HUMAN");
  assert.deepEqual(resumed.state.pendingHuman.reasons, ["APPROVAL_STALE"]);

  // Re-approving the stale request first refreshes the subject to the new
  // candidate, then a second approval binds to what is actually on disk.
  const refresh = approveRun(root, "RUN-A2", { by: "owner", transition: "enter-review" });
  assert.equal(refresh.approved, false);
  assert.equal(refresh.refreshed, true);
  const rebind = approveRun(root, "RUN-A2", { by: "owner", transition: "enter-review" });
  assert.equal(rebind.approved, true);
  assert.equal(rebind.subject.candidate, git(worktree, ["rev-parse", "HEAD"]));
});

test("approval re-verifies the subject at decision time and refuses a moved target", () => {
  const { root } = fixtureRepo();
  const started = startToReviewBoundary(root, "RUN-A3", cleanReviewer());
  const worktree = started.workspace.worktreePath;
  writeFileSync(join(worktree, "late-change.txt"), "changed before approve\n");
  git(worktree, ["add", "-A"]);
  git(worktree, ["commit", "-qm", "late-change"]);

  const first = approveRun(root, "RUN-A3", { by: "owner", transition: "enter-review" });
  assert.equal(first.approved, false);
  assert.equal(first.refreshed, true);
  assert.equal(first.subject.candidate, git(worktree, ["rev-parse", "HEAD"]));

  const second = approveRun(root, "RUN-A3", { by: "owner", transition: "enter-review" });
  assert.equal(second.approved, true);

  assert.throws(
    () => approveRun(root, "RUN-A3", { by: "owner", transition: "enter-review" }),
    DecisionError,
    "no pending request remains after approval",
  );
});

test("reject cancels and compacts the run with the decision on record", () => {
  const { root } = fixtureRepo();
  startToReviewBoundary(root, "RUN-A4", cleanReviewer());
  const result = rejectRun(root, "RUN-A4", { by: "owner", reason: "not worth shipping" });
  assert.equal(result.rejected, true);
  assert.equal(result.state.terminal.status, "CANCELLED");
  assert.ok(result.state.compacted);
  const lines = readFileSync(
    join(root, "delivery", "work", "WORK-RUN-A4", "decisions.jsonl"),
    "utf8",
  )
    .split("\n")
    .filter(Boolean);
  assert.equal(JSON.parse(lines[0]).decision, "rejected");
});

test("the inbox lists waiting runs and empties after the final decision", () => {
  const { root } = fixtureRepo();
  startToReviewBoundary(root, "RUN-A5", cleanReviewer());
  const rows = listInbox(root);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].run, "RUN-A5");
  assert.equal(rows[0].transition, "enter-review");

  rejectRun(root, "RUN-A5", { by: "owner" });
  assert.equal(listInbox(root).length, 0);
});
