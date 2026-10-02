import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { approveRun } from "../src/v2/runtime/decisions.js";
import { fingerprintFinding } from "../src/v2/runtime/findings.js";
import { nextReply } from "../src/v2/runtime/notify.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { tempDir } from "./support/tmp.js";

const WORKFLOW = loadWorkflow(join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml"));

function fixture(runId, review, extra = {}) {
  const root = tempDir("bb-v2-converge-");
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-qm", "baseline");
  const rounds = review.length;
  const mock = createMockAdapter({
    build: ["succeed"],
    verify: Array(rounds).fill("succeed"),
    fix: Array(rounds).fill("succeed"),
    review: review.map((findings) => ({ behavior: "succeed", envelope: { status: "succeeded", findings } })),
  });
  return {
    repoRoot: root, workflow: WORKFLOW, workflowDigest: "sha256:fixture", workId: `WORK-${runId}`,
    runId, entry: "build", planDigest: "sha256:plan",
    adapters: { builder: mock, verifier: mock, fixer: mock, reviewer: mock },
    ...extra,
  };
}

const p1 = (summary) => ({ severity: "P1", summary });
const requests = (result) =>
  EventLedger.open(result.ledgerPath).events.filter((event) => event.type === "HUMAN_REQUESTED");
const extensions = (result) =>
  EventLedger.open(result.ledgerPath).events.filter((event) => event.type === "BUDGET_EXTENDED");

test("a shrinking set of new blocking findings reaches the merge decision without asking", () => {
  const options = fixture("RUN-C1", [
    [p1("one"), p1("two"), p1("three")],
    [p1("four"), p1("five")],
    [p1("six")],
    [],
  ]);
  const result = startRun(options);
  assert.equal(result.state.steps.review.attempts, 4);
  assert.equal(result.state.pendingHuman.kind, "final-decision");
  assert.equal(requests(result).length, 1);
});

test("a blocking finding that comes back after fix stops before the cap, without a grant", () => {
  const options = fixture("RUN-C2", [[p1("lock is never released")], [p1("lock is never released")], []]);
  const started = startRun(options);
  assert.equal(started.state.steps.review.attempts, 2);
  assert.equal(started.state.steps.fix.attempts, 1);
  assert.equal(started.state.pendingHuman.transition, "enter-fix");
  assert.equal(started.state.pendingHuman.kind, "review-not-converging");
  assert.match(started.state.pendingHuman.reasons[0],
    new RegExp(`review is not converging: 1 blocking finding\\(s\\) came back after fix \\(${fingerprintFinding(p1("lock is never released"))}\\)`));
  assert.equal(requests(started).at(-1).data.grants, undefined);

  assert.equal(approveRun(options.repoRoot, options.runId, { by: "owner", transition: "enter-fix" }).approved, true);
  const resumed = resumeRun(options);
  assert.equal(resumed.state.steps.review.attempts, 3);
  assert.equal(resumed.state.pendingHuman.kind, "final-decision");
  assert.equal(extensions(resumed).length, 0);
});

test("the same problem restated after fix stops before the cap and names both findings", () => {
  const before = p1("完整 diff 包含两个允许范围外的文件: docs/guide.md:73、tests/e2e.test.mjs:293");
  const after = p1("完整 diff 仍包含两个允许范围外的文件: docs/guide.md:75、tests/e2e.test.mjs:296");
  const started = startRun(fixture("RUN-C2B", [[before], [after]]));
  assert.equal(started.state.steps.review.attempts, 2);
  assert.equal(started.state.pendingHuman.kind, "review-not-converging");
  assert.ok(started.state.pendingHuman.reasons[0].includes(
    `${fingerprintFinding(after)} restates round 1 ${fingerprintFinding(before)}`));
});

test("more blocking findings than the last round stops before the cap", () => {
  const started = startRun(fixture("RUN-C3", [[p1("one")], [p1("two"), p1("three")]]));
  assert.equal(started.state.steps.review.attempts, 2);
  assert.equal(started.state.pendingHuman.kind, "review-not-converging");
  assert.match(started.state.pendingHuman.reasons[0], /review is not converging: 2 blocking finding\(s\) this round, 1 last round/);
});

test("non-blocking findings do not count, but a finding fixed two rounds ago coming back does", () => {
  const started = startRun(fixture("RUN-C4", [
    [p1("one"), { severity: "P2", summary: "naming" }],
    [p1("two"), { severity: "P2", summary: "naming" }, { severity: "P2", summary: "style" }],
    [p1("one")],
    [],
  ]));
  assert.equal(started.state.steps.review.attempts, 3);
  assert.equal(started.state.pendingHuman.kind, "review-not-converging");
  assert.match(started.state.pendingHuman.reasons[0], /came back after fix/);
});

test("triage keeps its kind and names the stall; the budget still wins at the cap", () => {
  const options = fixture("RUN-C6", [[p1("one")], [p1("one")]], { reviewTriage: "required" });
  const first = startRun(options);
  assert.equal(first.state.pendingHuman.kind, "finding-triage");
  assert.doesNotMatch(first.state.pendingHuman.reasons.join("\n"), /not converging/);
  approveRun(options.repoRoot, options.runId, { by: "owner", transition: "enter-fix" });
  const second = resumeRun(options);
  assert.equal(second.state.steps.review.attempts, 2);
  assert.equal(second.state.pendingHuman.kind, "finding-triage");
  assert.match(second.state.pendingHuman.reasons[0], /review is not converging/);

  const capped = startRun(fixture("RUN-C7", [[p1("one")], [p1("one")]], { budgets: { maxAttempts: { review: 2 } } }));
  assert.equal(capped.state.pendingHuman.kind, "budget");
  assert.match(capped.state.pendingHuman.reasons[0], /review budget exhausted: 2\/2/);
  assert.match(capped.state.pendingHuman.reasons[1], /review is not converging/);
  assert.deepEqual(requests(capped).at(-1).data.grants, [{ step: "review", scope: "run" }]);
});

test("nextReply offers the findings commands for a review that is not converging", () => {
  const reply = nextReply({
    repoLabel: ".",
    state: { run: { id: "RUN-N", work: "WORK-N" }, pendingHuman: { transition: "enter-fix", kind: "review-not-converging" } },
  });
  assert.match(reply[0], /findings list --repo \. --work WORK-N/);
  assert.match(reply[1], /findings adjudicate .* --action accept\|dismiss/);
  assert.match(reply[2], /approve .* --transition enter-fix/);
});
