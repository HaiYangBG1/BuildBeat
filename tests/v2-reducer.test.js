import assert from "node:assert/strict";
import test from "node:test";

import { IllegalEventError, applyEvent, initialState, reduceEvents } from "../src/v2/engine/reducer.js";

const KERNEL = { kind: "kernel", id: "orchestrator" };
const HUMAN = { kind: "human", id: "owner" };
const TS = "2026-08-28T00:00:00.000Z";

function ev(seq, type, data, actor = KERNEL) {
  return {
    v: 1,
    seq,
    ts: TS,
    run: "RUN-001",
    work: "WORK-001",
    type,
    actor,
    data,
    prev: "sha256:unchecked-by-reducer",
    digest: "sha256:unchecked-by-reducer",
  };
}

const SUBJECT = { candidate: "def5678", planDigest: "sha256:p", evidenceDigest: "sha256:e" };

function happyPath() {
  return [
    ev(1, "RUN_CREATED", {
      workflowRef: "software-delivery",
      workflowDigest: "sha256:wf",
      base: "abc1234",
      riskPreset: "standard",
    }),
    ev(2, "RUN_STARTED", {}),
    ev(3, "WORKSPACE_BOUND", {
      workspaceId: "main",
      repo: ".",
      branch: "run/RUN-001",
      worktreePath: ".buildbeat/worktrees/RUN-001",
      base: "abc1234",
    }),
    ev(4, "STEP_STARTED", { step: "build", attempt: 1, worker: "builder", adapter: "shell", workspaceId: "main" }),
    ev(5, "STEP_FINISHED", { step: "build", attempt: 1, status: "succeeded" }),
    ev(6, "CANDIDATE_PINNED", { workspaceId: "main", base: "abc1234", candidate: "def5678" }),
    ev(7, "STEP_STARTED", { step: "verify", attempt: 1, worker: "verifier", adapter: "shell", workspaceId: "main" }),
    ev(8, "STEP_FINISHED", { step: "verify", attempt: 1, status: "failed", exitCode: 1 }),
    ev(9, "FAILURE_FINGERPRINT", {
      step: "verify",
      command: "npm test",
      exitCode: 1,
      errorDigest: "sha256:err1",
      diffDigest: "sha256:diff1",
    }),
    ev(10, "POLICY_EVALUATED", {
      policy: "default.verify-failed",
      phase: "transition",
      result: "RETRY",
      enforcement: "LOCAL_ENFORCED",
      reason: "verify failed, attempts 1/4",
    }),
    ev(11, "TRANSITION", { from: "verify", to: "fix", cause: "policy:default.verify-failed" }),
    ev(12, "BUDGET_CONSUMED", { kind: "attempts", amount: 1, remaining: 3 }),
    ev(13, "STEP_STARTED", { step: "fix", attempt: 1, worker: "fixer", adapter: "shell", workspaceId: "main" }),
    ev(14, "STEP_FINISHED", { step: "fix", attempt: 1, status: "succeeded" }),
    ev(15, "STEP_STARTED", { step: "verify", attempt: 2, worker: "verifier", adapter: "shell", workspaceId: "main" }),
    ev(16, "STEP_FINISHED", { step: "verify", attempt: 2, status: "succeeded" }),
    ev(17, "EVIDENCE_RECORDED", {
      evidenceRef: "evidence/verify-2.json",
      kind: "test",
      subject: "def5678",
      digest: "sha256:ev2",
      status: "passed",
      grade: "L3",
    }),
    ev(18, "HUMAN_REQUESTED", {
      transition: "review-to-ready-for-merge",
      subject: SUBJECT,
      reasons: ["merge decision is human-only"],
    }),
    ev(19, "DECISION_RECORDED", {
      decision: "approved",
      transition: "review-to-ready-for-merge",
      subject: SUBJECT,
      decisionRef: "decisions/D-001",
    }, HUMAN),
    ev(20, "RUN_TERMINAL", { status: "SUCCEEDED", reason: "merge-ready" }),
    ev(21, "RUN_COMPACTED", { runRecordRef: "runs/RUN-001/run-record.json", runRecordDigest: "sha256:rr" }),
  ];
}

test("full delivery loop reduces to the expected state", () => {
  const state = reduceEvents(happyPath());
  assert.equal(state.seq, 21);
  assert.equal(state.run.status, "SUCCEEDED");
  assert.deepEqual(state.terminal, { status: "SUCCEEDED", reason: "merge-ready" });
  assert.equal(state.steps.build.status, "SUCCEEDED");
  assert.equal(state.steps.verify.status, "SUCCEEDED");
  assert.equal(state.steps.verify.attempts, 2);
  assert.equal(state.workspaces.main.candidate, "def5678");
  assert.equal(state.position, "fix");
  assert.deepEqual(state.budgets.attempts, { consumed: 1, remaining: 3 });
  assert.equal(state.evidence.length, 1);
  assert.equal(state.evidence[0].grade, "L3");
  assert.equal(state.pendingHuman, null);
  assert.equal(state.approvals.length, 1);
  assert.equal(state.approvals[0].stale, false);
  assert.ok(state.compacted);
});

test("replay is deterministic", () => {
  assert.deepEqual(reduceEvents(happyPath()), reduceEvents(happyPath()));
});

test("consecutive identical failure fingerprints are counted, different ones reset", () => {
  const prefix = happyPath().slice(0, 9);
  const fp = (seq, errorDigest) =>
    ev(seq, "FAILURE_FINGERPRINT", {
      step: "verify",
      command: "npm test",
      exitCode: 1,
      errorDigest,
      diffDigest: "sha256:d",
    });
  const same = reduceEvents([...prefix, fp(10, "sha256:err1")]);
  assert.equal(same.consecutiveSameFailure, 2);
  const reset = reduceEvents([...prefix, fp(10, "sha256:err2")]);
  assert.equal(reset.consecutiveSameFailure, 1);
});

test("approval goes stale when its subject changes and the run waits for a human again", () => {
  const events = happyPath().slice(0, 19);
  let state = reduceEvents(events);
  assert.equal(state.approvals[0].stale, false);

  state = applyEvent(
    state,
    ev(20, "APPROVAL_STALE", { approvalRef: "decisions/D-001", changed: ["candidate"] }),
  );
  assert.equal(state.approvals[0].stale, true);
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.deepEqual(state.pendingHuman.reasons, ["APPROVAL_STALE"]);

  assert.throws(() => applyEvent(state, ev(21, "RUN_STARTED", {})), IllegalEventError);

  state = applyEvent(
    state,
    ev(21, "DECISION_RECORDED", {
      decision: "approved",
      transition: "review-to-ready-for-merge",
      subject: { ...SUBJECT, candidate: "aaa9999" },
      decisionRef: "decisions/D-002",
    }, HUMAN),
  );
  state = applyEvent(state, ev(22, "RUN_STARTED", {}));
  assert.equal(state.run.status, "RUNNING");
});

test("illegal sequences are rejected, not repaired", () => {
  const base = happyPath();

  assert.throws(() => reduceEvents([base[1]]), IllegalEventError, "first event must be RUN_CREATED");
  assert.throws(() => reduceEvents([base[0], { ...base[0], seq: 2 }]), IllegalEventError, "duplicate RUN_CREATED");

  const created = reduceEvents(base.slice(0, 3));
  assert.throws(
    () =>
      applyEvent(
        created,
        ev(4, "STEP_STARTED", { step: "build", attempt: 2, worker: "b", adapter: "shell", workspaceId: "main" }),
      ),
    IllegalEventError,
    "attempt numbering is enforced",
  );
  assert.throws(
    () => applyEvent(created, ev(4, "STEP_FINISHED", { step: "build", attempt: 1, status: "succeeded" })),
    IllegalEventError,
    "cannot finish a step that never started",
  );
  assert.throws(
    () =>
      applyEvent(
        created,
        ev(4, "RUN_COMPACTED", { runRecordRef: "r", runRecordDigest: "sha256:x" }),
      ),
    IllegalEventError,
    "compaction requires a terminal run",
  );
  assert.throws(
    () =>
      applyEvent(
        created,
        ev(4, "DECISION_RECORDED", {
          decision: "approved",
          transition: "nope",
          subject: SUBJECT,
          decisionRef: "decisions/D-009",
        }, HUMAN),
      ),
    IllegalEventError,
    "decision requires a matching pending request",
  );
  assert.throws(
    () => applyEvent(created, ev(5, "RUN_INTERRUPTED", { cause: "SIGTERM" })),
    IllegalEventError,
    "sequence gaps are rejected",
  );

  const terminal = reduceEvents(happyPath());
  assert.throws(
    () => applyEvent(terminal, ev(22, "RUN_STARTED", {})),
    IllegalEventError,
    "terminal runs cannot be reopened",
  );
});

test("checkpoints and interruptions are recorded for recovery", () => {
  const prefix = happyPath().slice(0, 8);
  let state = reduceEvents(prefix);
  state = applyEvent(
    state,
    ev(9, "CHECKPOINT", {
      resumePoint: { step: "verify", attempt: 1 },
      workspaceStates: [{ workspaceId: "main", candidate: "def5678", dirty: false }],
    }),
  );
  state = applyEvent(state, ev(10, "RUN_INTERRUPTED", { cause: "SIGTERM" }));
  assert.deepEqual(state.lastCheckpoint.resumePoint, { step: "verify", attempt: 1 });
  assert.equal(state.lastCheckpoint.seq, 9);
  assert.equal(state.interrupted.cause, "SIGTERM");
});

test("initialState is inert", () => {
  const state = initialState();
  assert.equal(state.seq, 0);
  assert.equal(state.run, null);
  assert.equal(state.terminal, null);
});
