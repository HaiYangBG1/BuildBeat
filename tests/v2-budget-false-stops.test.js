import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { applyEvent, initialState, reduceEvents } from "../src/v2/engine/reducer.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { adoptCandidate, approveRun, rejectRun } from "../src/v2/runtime/decisions.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { tempDir } from "./support/tmp.js";

const workflow = loadWorkflow(new URL("../src/v2/presets/software-delivery.yaml", import.meta.url));
const release = loadWorkflow(new URL("../src/v2/presets/release-readback.yaml", import.meta.url));
function fixture(extra = {}, script = {}) {
  const root = tempDir("bb-false-stops-");
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-qm", "baseline");
  const worker = createShellAdapter({
    command: process.execPath,
    args: ["-e", `
      const input = JSON.parse(process.env.BUILDBEAT_INPUT);
      const script = ${JSON.stringify(script)};
      const row = script[input.step]?.[input.attempt - 1] ?? {};
      if (row.finding) require('node:fs').writeFileSync(process.env.BUILDBEAT_OUTPUT,
        JSON.stringify({findings: [{severity: 'P1', summary: row.finding}]}));
      if (row.error) process.stderr.write(row.error);
      process.exit(row.code ?? 0);
    `],
  });
  return {
    repoRoot: root, workflow, workflowDigest: "sha256:fixture", workId: "WORK-TEST",
    runId: "RUN-TEST", entry: "build", planDigest: "sha256:plan",
    adapters: { builder: worker, verifier: worker, fixer: worker, reviewer: worker, readback: worker },
    ...extra,
  };
}
const findings = { review: [{ finding: "one" }, { finding: "two" }, { finding: "three" }] };
const twoFindings = { review: findings.review.slice(0, 2) };
const twoRounds = { review: 2 };
const events = (result) => EventLedger.open(result.ledgerPath).events;
const requests = (result) => events(result).filter((event) => event.type === "HUMAN_REQUESTED");
function approve(options, result) {
  assert.equal(approveRun(options.repoRoot, options.runId, {
    by: "owner", transition: result.state.pendingHuman.transition,
  }).approved, true);
  return resumeRun(options);
}

test("A: three blocking review rounds never charge successful verify or fix attempts", () => {
  const options = fixture({ budgets: { maxAttempts: { review: 4, verify: 2, fix: 1 } } }, findings);
  const result = startRun(options);
  assert.equal(result.state.pendingHuman.kind, "final-decision");
  assert.equal(result.state.steps.verify.attempts, 4);
  assert.equal(result.state.steps.verify.freeAttempts, 4);
  assert.equal(result.state.steps.fix.freeAttempts, 3);
  assert.equal(result.state.steps.review.freeAttempts, undefined);
  assert.equal(result.state.budgets.attempts.consumed, 4);
  assert.equal(requests(result).length, 1);
  for (const [index, event] of events(result).entries()) {
    if (event.type === "STEP_FINISHED" && event.data.step !== "review") {
      assert.equal(event.data.free, true);
      assert.equal(events(result)[index + 1].data.amount, 0);
    }
  }
});

for (const triage of ["required", undefined]) {
  test(`${triage ? "B" : "C"}: exhausted review stops before fix and grants the complete next round`, () => {
    const options = fixture({ reviewTriage: triage, budgets: { maxAttempts: twoRounds, reviewRoundsPerWork: 2 } }, twoFindings);
    let result = startRun(options);
    if (triage) {
      assert.equal(requests(result)[0].data.grants, undefined);
      result = approve(options, result);
    }
    assert.equal(result.state.steps.review.attempts, 2);
    assert.equal(result.state.steps.fix.attempts, 1);
    assert.equal(result.state.pendingHuman.transition, "enter-fix");
    assert.equal(result.state.pendingHuman.kind, triage ? "finding-triage" : "budget");
    assert.deepEqual(requests(result).at(-1).data.grants, [
      { step: "review", scope: "run" }, { step: "review", scope: "work" },
    ]);
    assert.match(result.state.pendingHuman.reasons[0], /review budget exhausted: 2\/2 review round\(s\)/);
    result = approve(options, result);
    assert.equal(result.state.pendingHuman.kind, "final-decision");
    assert.equal(result.state.steps.review.attempts, 3);
    assert.equal(result.state.budgetExtensions.review, 1);
    assert.equal(result.state.workReviewGrants, 1);
    assert.equal(requests(result).length, triage ? 3 : 2);
  });
}

// A legacy loop can already be waiting after fix/verify. Exercise both old
// request shapes, without requiring a new writer to produce the old stop.
for (const [kind, transition] of [["work-review-cap", "enter-review"], ["boundary", "resume-review"]]) {
  test(`D: legacy ${transition} approval lifts both exhausted review caps`, () => {
    const options = fixture({ budgets: { maxAttempts: { review: 3 } } }, twoFindings);
    const started = startRun(options);
    const ledger = EventLedger.open(started.ledgerPath);
    ledger.append({ type: "HUMAN_REQUESTED", actor: { kind: "kernel", id: "test" }, data: {
      kind, transition, subject: started.state.pendingHuman.subject, reasons: ["legacy cap"],
    } });
    const result = approve({ ...options, budgets: { maxAttempts: { review: 3 }, reviewRoundsPerWork: 3 } }, { state: ledger.state });
    assert.equal(result.state.steps.review.attempts, 4);
    assert.equal(result.state.budgetExtensions.review, 1);
    assert.equal(result.state.workReviewGrants, 1);
    assert.equal(result.state.pendingHuman.kind, "final-decision");
  });
}

for (const scope of ["run", "work"]) {
  test(`only the exhausted ${scope} review cap receives a grant`, () => {
    const budgets = { maxAttempts: { review: scope === "run" ? 2 : 4 },
      reviewRoundsPerWork: scope === "work" ? 2 : 4 };
    const options = fixture({ budgets }, twoFindings);
    const started = startRun(options);
    assert.deepEqual(requests(started).at(-1).data.grants, [{ step: "review", scope }]);
    const resumed = approve(options, started);
    assert.equal(resumed.state.pendingHuman.kind, "final-decision");
    assert.equal(resumed.state.budgetExtensions.review ?? 0, scope === "run" ? 1 : 0);
    assert.equal(resumed.state.workReviewGrants, scope === "work" ? 1 : 0);
  });
}

test("successful verification between failures does not spend the remaining failure budget", () => {
  const options = fixture({ budgets: { maxAttempts: { verify: 2 } } }, {
    verify: [{ code: 1, error: "first" }, {}, { code: 1, error: "second" }],
    review: [{ finding: "repair" }],
  });
  const result = startRun(options);
  assert.equal(result.state.steps.verify.attempts, 3);
  assert.equal(result.state.steps.verify.freeAttempts, 1);
  assert.match(result.state.pendingHuman.reasons[0], /verify budget exhausted: 2\/2 charged attempt\(s\) used, 2 real failure\(s\)/);
  assert.match(result.state.pendingHuman.reasons[0], /\(successful attempts are not charged\)/);
});

test("resuming after a partially recorded combined grant does not grant twice", () => {
  const options = fixture({ budgets: { maxAttempts: twoRounds, reviewRoundsPerWork: 2 } }, twoFindings);
  const started = startRun(options);
  const approved = approveRun(options.repoRoot, options.runId, { transition: "enter-fix" });
  const ledger = EventLedger.open(started.ledgerPath);
  ledger.append({ type: "BUDGET_EXTENDED", actor: { kind: "kernel", id: "test" }, data: {
    step: "review", amount: 1, maxAttempts: 3, approvalRef: approved.decisionRef,
  } });
  const resumed = resumeRun(options);
  assert.equal(resumed.state.pendingHuman.kind, "final-decision");
  assert.equal(resumed.state.budgetExtensions.review, 1);
  assert.equal(resumed.state.workReviewGrants, 1);
});

test("a crash between the run and work grants of one approval replays the pinned plan", () => {
  const script = { review: [{ finding: "one" }, { code: 1, error: "reviewer crashed" }] };
  const options = fixture({ budgets: { maxAttempts: twoRounds, reviewRoundsPerWork: 2 } }, script);
  const started = startRun(options);
  assert.equal(started.state.pendingHuman.transition, "resume-review");
  assert.deepEqual(requests(started).at(-1).data.grants, [
    { step: "review", scope: "run" },
    { step: "review", scope: "work" },
  ]);
  approveRun(options.repoRoot, options.runId, { by: "owner", transition: "resume-review" });
  const append = EventLedger.prototype.append;
  let granted = 0;
  EventLedger.prototype.append = function (event) {
    if (event.type === "BUDGET_EXTENDED" && ++granted === 2) {
      throw new Error("simulated host kill between grants");
    }
    return append.call(this, event);
  };
  try {
    assert.throws(() => resumeRun(options), /simulated host kill/);
  } finally {
    EventLedger.prototype.append = append;
  }
  const partial = EventLedger.open(started.ledgerPath).state;
  assert.equal(partial.budgetExtensions.review, 1);
  assert.equal(partial.workReviewGrants ?? 0, 0);
  const resumed = resumeRun(options);
  assert.equal(resumed.state.pendingHuman.kind, "final-decision");
  assert.equal(resumed.state.budgetExtensions.review, 1);
  assert.equal(resumed.state.workReviewGrants, 1);
  assert.equal(requests(started).filter((event) => event.data.transition === "enter-review").length, 0);
});

test("a refreshed request cannot reuse grants from the previous request", () => {
  const options = fixture({ budgets: { maxAttempts: twoRounds } }, twoFindings);
  const started = startRun(options);
  const dirtyFile = join(started.workspace.worktreePath, "dirty.txt");
  writeFileSync(dirtyFile, "changed subject");
  const refreshed = approveRun(options.repoRoot, options.runId, { transition: "enter-fix" });
  assert.equal(refreshed.refreshed, true);
  rmSync(dirtyFile);
  assert.equal(requests(started).at(-1).data.grants, undefined);
  const resumed = approve(options, started);
  assert.deepEqual(resumed.state.budgetExtensions, {});
  assert.equal(resumed.state.pendingHuman.transition, "resume-review");
});

test("E: real verify failures still exhaust their budget before another fix", () => {
  const options = fixture({ budgets: { maxAttempts: { verify: 2 } } }, {
    verify: [{ code: 1, error: "first" }, { code: 1, error: "second" }],
  });
  const result = startRun(options);
  assert.equal(result.state.pendingHuman.transition, "resume-verify");
  assert.match(result.state.pendingHuman.reasons[0], /verify budget exhausted: 2\/2 charged attempt\(s\) used, 2 real failure\(s\)/);
  assert.equal(result.state.steps.fix.attempts, 1);
  assert.equal(result.state.budgets.attempts.consumed, 2);
  const resumed = approve(options, result);
  assert.equal(resumed.state.pendingHuman.kind, "final-decision");
});

test("E: repeated fingerprints still stop before exhausting the budget", () => {
  const result = startRun(fixture({}, { verify: [{ code: 1, error: "same" }, { code: 1, error: "same" }] }));
  assert.equal(result.state.steps.verify.attempts, 2);
  assert.match(result.state.pendingHuman.reasons[0], /same failure fingerprint/);
});

test("E: release readback still stops on its first real failure", () => {
  const result = startRun(fixture({ workflow: release, entry: "preflight", riskPreset: "release" }, {
    preflight: [{ code: 1, error: "failed readback" }],
  }));
  assert.equal(result.state.pendingHuman.transition, "resume-preflight");
  assert.equal(result.state.steps.preflight.attempts, 1);
  assert.equal(result.state.steps.preflight.freeAttempts, undefined);
  assert.match(result.state.pendingHuman.reasons[0], /\(each round is charged\)/);
  assert.doesNotMatch(result.state.pendingHuman.reasons[0], /successful attempts are not charged/);
});

test("successful self-loop has a finite total-attempt safeguard and can be extended", () => {
  const looping = structuredClone(workflow);
  looping.edges.set("verify|succeeded", "verify");
  const options = fixture({ workflow: looping, budgets: { maxAttempts: { verify: 1 } } });
  const result = startRun(options);
  assert.equal(result.state.pendingHuman.kind, "budget");
  assert.equal(result.state.steps.verify.attempts, 3);
  assert.match(result.state.pendingHuman.reasons[0], /budget exhausted \(runaway safeguard\): 3\/3 total attempt/);
  const resumed = approve(options, result);
  assert.equal(resumed.state.budgetExtensions.verify, 1);
  assert.equal(resumed.state.steps.verify.attempts, 6);
});

test("stale plan approval cannot grant another review round", () => {
  const options = fixture({ budgets: { maxAttempts: twoRounds } }, twoFindings);
  const started = startRun(options);
  approveRun(options.repoRoot, options.runId, { transition: "enter-fix" });
  const stale = resumeRun({ ...options, planDigest: "sha256:changed" });
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.state.budgetExtensions, {});
  assert.equal(stale.state.workReviewGrants, 0);
  // Reapproving the stale request does not reuse grants from the earlier request.
  approveRun(options.repoRoot, options.runId, { transition: "enter-fix" });
  const resumed = resumeRun(options);
  assert.deepEqual(resumed.state.budgetExtensions, {});
  assert.equal(resumed.state.pendingHuman.transition, "resume-review");
  assert.equal(events(started).filter((e) => e.type === "BUDGET_EXTENDED").length, 0);
});

test("rejecting the combined request ends the run without grants or another fix", () => {
  const options = fixture({ budgets: { maxAttempts: twoRounds } }, twoFindings);
  const started = startRun(options);
  const rejected = rejectRun(options.repoRoot, options.runId, { transition: "enter-fix" });
  assert.equal(rejected.state.terminal.status, "CANCELLED");
  assert.deepEqual(rejected.state.budgetExtensions, {});
  assert.equal(started.state.steps.fix.attempts, 1);
});

function legacyEvents() {
  return [
    ["RUN_CREATED", { workflowRef: "workflow", workflowDigest: "sha256:w", base: "abc", riskPreset: "standard" }],
    ["WORKSPACE_BOUND", { workspaceId: "main", repo: ".", branch: "run/test", worktreePath: "tree", base: "abc" }],
    ["RUN_STARTED", {}],
    ["STEP_STARTED", { step: "verify", attempt: 1, workspaceId: "main" }],
    ["STEP_FINISHED", { step: "verify", attempt: 1, status: "succeeded" }],
    ["BUDGET_CONSUMED", { kind: "attempts", amount: 1, remaining: 3 }],
    ["HUMAN_REQUESTED", { transition: "enter-review", subject: { candidate: "abc" }, reasons: ["boundary"] }],
  ].map(([type, data], index) => ({ seq: index + 1, run: "RUN-OLD", work: "WORK-OLD", type, data }));
}

test("F: old events with no free/grants reproduce the complete legacy state", () => {
  assert.deepEqual(reduceEvents(legacyEvents()), {
    ...initialState(), seq: 7,
    run: { id: "RUN-OLD", work: "WORK-OLD", status: "WAITING_HUMAN", workflowRef: "workflow",
      workflowDigest: "sha256:w", base: "abc", riskPreset: "standard", entry: null,
      planDigest: "UNVERIFIED", intentDigest: "UNVERIFIED" },
    workspaces: { main: { repo: ".", branch: "run/test", worktreePath: "tree", base: "abc", candidate: null } },
    steps: { verify: { status: "SUCCEEDED", attempts: 1, detail: "succeeded", infraAttempts: 0 } },
    budgets: { attempts: { consumed: 1, remaining: 3 } },
    pendingHuman: { transition: "enter-review", subject: { candidate: "abc" }, reasons: ["boundary"], kind: "boundary" },
  });
});

test("free attempts survive subsequent STEP_STARTED events", () => {
  const input = legacyEvents().slice(0, 5);
  input[4].data.free = true;
  let state = reduceEvents(input);
  state = applyEvent(state, { seq: 6, type: "STEP_STARTED", data: { step: "verify", attempt: 2, workspaceId: "main" } });
  assert.equal(state.steps.verify.freeAttempts, 1);
});

test("an adopted hand fix answering a budget request keeps the round's grants", () => {
  // Real incident: after the second review round the run stopped at
  // enter-fix with a grant; the session fixed by hand and adopted the
  // commit, and the run stopped again at resume-review for the same round.
  const options = fixture({ reviewTriage: "required", budgets: { maxAttempts: twoRounds } }, twoFindings);
  const started = startRun(options);
  assert.equal(started.state.pendingHuman.transition, "enter-fix");
  const second = approve(options, started);
  assert.equal(second.state.pendingHuman.transition, "enter-fix");
  assert.deepEqual(requests(started).at(-1).data.grants, [{ step: "review", scope: "run" }]);

  const worktree = started.workspace.worktreePath;
  writeFileSync(join(worktree, "hand-fix.txt"), "fixed by the session\n");
  execFileSync("git", ["-C", worktree, "add", "hand-fix.txt"]);
  execFileSync("git", ["-C", worktree, "commit", "-qm", "hand fix"]);
  const sha = execFileSync("git", ["-C", worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const adopted = adoptCandidate(options.repoRoot, options.runId, { sha, by: "session", resumeAt: "verify" });

  const resumed = resumeRun(options);
  assert.equal(resumed.state.pendingHuman.kind, "final-decision");
  assert.equal(resumed.state.steps.review.attempts, 3);
  const grants = events(started).filter((event) => event.type === "BUDGET_EXTENDED");
  assert.equal(grants.length, 1);
  assert.equal(grants[0].data.step, "review");
  assert.equal(grants[0].data.approvalRef, adopted.decisionRef);
  assert.equal(requests(started).filter((event) => event.data.transition === "resume-review").length, 0);
});
