// Findings account, anchored review and the finding-triage gate (absorbed
// from the 30-run deploy campaign): findings land in a per-Work Git-plane
// account, dismissed fingerprints stop blocking and reach later reviewers as
// an anchor, and reviewTriage: required puts a human between review findings
// and the fixer.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { approveRun } from "../src/v2/runtime/decisions.js";
import {
  FindingsError,
  adjudicateFinding,
  fingerprintFinding,
  readFindingsAccount,
  recordReviewFindings,
} from "../src/v2/runtime/findings.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-findings-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return { root };
}

function capture(inner, calls) {
  return {
    name: inner.name,
    execute(request) {
      calls.push({ step: request.step, input: request.input });
      return inner.execute(request);
    },
  };
}

test("fingerprints normalize whitespace/case and carry severity as identity", () => {
  const a = fingerprintFinding({ severity: "P1", summary: "Unsafe  single-stage   rollout" });
  const b = fingerprintFinding({ severity: "P1", summary: "unsafe single-stage rollout" });
  const escalated = fingerprintFinding({ severity: "P0", summary: "unsafe single-stage rollout" });
  assert.equal(a, b);
  assert.notEqual(a, escalated, "an escalated severity is a new verdict, not a suppressed repeat");
});

test("the account deduplicates fingerprints and marks re-raises of dismissed verdicts", () => {
  const { root } = fixtureRepo();
  const finding = { severity: "P1", summary: "unsafe rollout" };
  const first = recordReviewFindings(root, "WORK-A", {
    run: "RUN-A",
    step: "review",
    attempt: 1,
    findings: [finding],
    ts: "2026-08-31T00:00:00.000Z",
  });
  assert.equal(first.length, 1);
  const again = recordReviewFindings(root, "WORK-A", {
    run: "RUN-A",
    step: "review",
    attempt: 2,
    findings: [finding],
    ts: "2026-08-31T00:01:00.000Z",
  });
  assert.equal(again.length, 0, "an open fingerprint is not duplicated");
  adjudicateFinding(root, "WORK-A", { fingerprint: first[0].fingerprint, action: "dismiss", by: "haiyang" });
  const reRaised = recordReviewFindings(root, "WORK-A", {
    run: "RUN-B",
    step: "review",
    attempt: 1,
    findings: [finding],
    ts: "2026-08-31T00:02:00.000Z",
  });
  assert.equal(reRaised[0].reRaised, true, "re-litigating a dismissed verdict is recorded, visibly");
  const rows = readFindingsAccount(root, "WORK-A");
  assert.equal(rows.filter((row) => row.kind === "finding").length, 2);
  assert.equal(rows.filter((row) => row.kind === "adjudication").length, 1);
});

test("adjudications bind to recorded findings only", () => {
  const { root } = fixtureRepo();
  assert.throws(
    () => adjudicateFinding(root, "WORK-A", { fingerprint: "deadbeefdeadbeef", action: "dismiss" }),
    FindingsError,
  );
});

test("finding-triage gate stops before fix; dismissal suppresses and anchors later workers", () => {
  const { root } = fixtureRepo();
  const finding = { severity: "P1", summary: "unsafe single-stage rollout" };
  const calls = [];
  const first = startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    workId: "WORK-F1",
    runId: "RUN-F1",
    entry: "build",
    reviewTriage: "required",
    adapters: {
      builder: createMockAdapter({ build: ["succeed"] }),
      verifier: createMockAdapter({ verify: ["succeed"] }),
      reviewer: createMockAdapter({
        review: [{ behavior: "succeed", envelope: { status: "succeeded", findings: [finding] } }],
      }),
    },
  });
  const state = first.state;
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.pendingHuman.kind, "finding-triage");
  assert.equal(state.pendingHuman.transition, "enter-fix");
  const fingerprint = fingerprintFinding(finding);
  assert.ok(
    state.pendingHuman.reasons.some((reason) => reason.includes(fingerprint)),
    "the request names the fingerprint to adjudicate",
  );
  const account = readFindingsAccount(root, "WORK-F1");
  assert.equal(account.filter((row) => row.kind === "finding").length, 1);

  // Owner dismisses the prescription, then approves the pending transition.
  adjudicateFinding(root, "WORK-F1", { fingerprint, action: "dismiss", by: "haiyang" });
  const approved = approveRun(root, "RUN-F1", { transition: "enter-fix", by: "haiyang" });
  assert.equal(approved.approved, true);

  const resumed = resumeRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    runId: "RUN-F1",
    reviewTriage: "required",
    adapters: {
      fixer: capture(createMockAdapter({ fix: ["succeed"] }), calls),
      verifier: createMockAdapter({ verify: ["succeed"] }),
      reviewer: capture(
        createMockAdapter({
          review: [{ behavior: "succeed", envelope: { status: "succeeded", findings: [finding] } }],
        }),
        calls,
      ),
    },
  });
  const after = resumed.state;
  // The re-raised finding is suppressed: the run reaches the merge decision.
  assert.equal(after.pendingHuman.kind, "final-decision");
  const reviews = after.evidence.filter((item) => item.kind === "review");
  assert.deepEqual(reviews[reviews.length - 1].suppressedFingerprints, [fingerprint]);

  // The fixer received the adjudicated worklist; the fresh reviewer got the
  // anchor with the settled verdict.
  const fixCall = calls.find((call) => call.step === "fix");
  assert.equal(fixCall.input.findings[0].adjudication, "dismiss");
  const reviewCall = calls.find((call) => call.step === "review");
  assert.equal(reviewCall.input.anchor.findings[0].adjudication, "dismiss");
  assert.match(reviewCall.input.anchor.account, /review-findings\.jsonl$/);
});

test("without reviewTriage the findings route stays fully automatic", () => {
  const { root } = fixtureRepo();
  const mock = createMockAdapter({
    build: ["succeed"],
    verify: ["succeed", "succeed"],
    fix: ["succeed"],
    review: [
      {
        behavior: "succeed",
        envelope: { status: "succeeded", findings: [{ severity: "P1", summary: "one issue" }] },
      },
      { behavior: "succeed", envelope: { status: "succeeded", findings: [] } },
    ],
  });
  const result = startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    workId: "WORK-F2",
    runId: "RUN-F2",
    entry: "build",
    adapters: { builder: mock, verifier: mock, fixer: mock, reviewer: mock },
  });
  assert.equal(result.state.pendingHuman.kind, "final-decision");
  assert.equal(result.state.steps.fix.attempts, 1);
});

test("findings CLI lists and adjudicates from the Git plane", () => {
  const { root } = fixtureRepo();
  const finding = { severity: "P2", summary: "docs drift" };
  recordReviewFindings(root, "WORK-CLI", {
    run: "RUN-C",
    step: "review",
    attempt: 1,
    findings: [finding],
    ts: "2026-08-31T00:00:00.000Z",
  });
  const CLI = join(import.meta.dirname, "..", "bin", "buildbeat-v2.js");
  const fingerprint = fingerprintFinding(finding);
  const listed = execFileSync("node", [CLI, "findings", "list", "--repo", root, "--work", "WORK-CLI"], {
    encoding: "utf8",
  });
  assert.match(listed, new RegExp(`\\[P2 ${fingerprint}\\] \\(open\\)`));
  const adjudicated = execFileSync(
    "node",
    [
      CLI,
      "findings",
      "adjudicate",
      "--repo",
      root,
      "--work",
      "WORK-CLI",
      "--fingerprint",
      fingerprint,
      "--action",
      "dismiss",
      "--by",
      "haiyang",
    ],
    { encoding: "utf8" },
  );
  assert.match(adjudicated, /-> dismiss/);
  const after = execFileSync("node", [CLI, "findings", "list", "--repo", root, "--work", "WORK-CLI"], {
    encoding: "utf8",
  });
  assert.match(after, /\(dismiss by haiyang\)/);
  const raw = readFileSync(join(root, "delivery", "work", "WORK-CLI", "review-findings.jsonl"), "utf8");
  assert.equal(raw.trim().split("\n").length, 2);
});
