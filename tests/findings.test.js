// Findings account and anchored review (absorbed from the 30-run deploy
// campaign): findings land in a per-Work Git-plane account, a person rules
// on a fingerprint through `decide`, and a dismissed fingerprint stops
// blocking and reaches later reviewers as an anchor.

import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  FindingsError,
  adjudicateFinding,
  fingerprintFinding,
  readFindingsAccount,
  recordReviewFindings,
} from "../src/runtime/findings.js";
import { approveReview } from "../src/runtime/decisions.js";
import { cli, commit, emptyRepo, fixture, reviewWith, statusRow, worker } from "./support/review.js";

test("fingerprints normalize whitespace/case and carry severity as identity", () => {
  const a = fingerprintFinding({ severity: "P1", summary: "Unsafe  single-stage   rollout" });
  const b = fingerprintFinding({ severity: "P1", summary: "unsafe single-stage rollout" });
  const escalated = fingerprintFinding({ severity: "P0", summary: "unsafe single-stage rollout" });
  assert.equal(a, b);
  assert.notEqual(a, escalated, "an escalated severity is a new verdict, not a suppressed repeat");
});

// Fingerprints are exact: nothing merges a reworded finding with the one it
// restates, so a ruling binds to the words it was given for.
test("a restatement citing the same files at other lines is another fingerprint", () => {
  const before = { severity: "P1", summary: "完整 diff 包含两个允许范围外的文件: docs/guide.md:73、tests/e2e.test.mjs:293：base 1a2b3c4" };
  const after = { severity: "P1", summary: "完整 diff 包含本次允许范围之外的改动: docs/guide.md:80、tests/e2e.test.mjs:301：1a2b3c4..5d6e7f8" };
  assert.notEqual(fingerprintFinding(before), fingerprintFinding(after));
});

test("the account deduplicates fingerprints and marks re-raises of dismissed verdicts", () => {
  const root = emptyRepo("bb-findings-");
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
  const root = emptyRepo("bb-findings-");
  assert.throws(
    () => adjudicateFinding(root, "WORK-A", { fingerprint: "deadbeefdeadbeef", action: "dismiss" }),
    FindingsError,
  );
});

test("the request names a blocking finding; dismissal suppresses it and anchors the next reviewer", () => {
  const { root, work } = fixture({ prefix: "bb-findings-" });
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const finding = { severity: "P1", summary: "unsafe single-stage rollout" };
  const first = reviewWith(root, work, { findings: [finding] });
  const state = first.state;
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.pendingHuman.kind, "final-decision");
  assert.equal(state.pendingHuman.transition, "enter-wait-merge");
  assert.match(state.pendingHuman.reasons[0], /review found 1 blocking finding\(s\)/);
  const fingerprint = fingerprintFinding(finding);
  assert.ok(
    state.pendingHuman.reasons.some((reason) => reason.includes(fingerprint)),
    "the request names the fingerprint to adjudicate",
  );
  const account = readFindingsAccount(root, work);
  assert.equal(account.filter((row) => row.kind === "finding").length, 1);

  // Owner dismisses the prescription; a fresh reviewer raises it again.
  adjudicateFinding(root, work, { fingerprint, action: "dismiss", by: "haiyang" });
  const calls = [];
  const second = reviewWith(root, work, {
    reviewer: worker(({ step, input }) => {
      calls.push({ step, input });
      return { envelope: { findings: [finding] } };
    }),
  });
  const after = second.state;
  // The re-raised finding is suppressed: nothing blocks the merge decision.
  assert.equal(after.pendingHuman.kind, "final-decision");
  assert.deepEqual(after.pendingHuman.reasons, [
    "verified and reviewed with no blocking finding; the decision on this commit is the person's",
  ]);
  const reviews = after.evidence.filter((item) => item.kind === "review");
  assert.equal(reviews[reviews.length - 1].status, "passed");
  assert.deepEqual(reviews[reviews.length - 1].suppressedFingerprints, [fingerprint]);

  // The fresh reviewer got the anchor with the settled verdict.
  const reviewCall = calls.find((call) => call.step === "review");
  assert.equal(reviewCall.input.anchor.findings[0].adjudication, "dismiss");
  assert.match(reviewCall.input.anchor.account, /review-findings\.jsonl$/);
});

test("status lists the findings of a work and decide rules on one, from the Git plane", () => {
  const { root } = fixture({ prefix: "bb-findings-", work: "WORK-CLI" });
  const finding = { severity: "P2", summary: "docs drift" };
  recordReviewFindings(root, "WORK-CLI", {
    run: "RUN-C",
    step: "review",
    attempt: 1,
    findings: [finding],
    ts: "2026-08-31T00:00:00.000Z",
  });
  const fingerprint = fingerprintFinding(finding);
  const status = () => cli(["status", "--repo", root, "--work", "WORK-CLI"]);
  const listed = status();
  assert.equal(listed.status, 0, listed.all);
  assert.match(listed.out, new RegExp(`\\[P2 ${fingerprint}\\] \\(open\\) docs drift`));
  const adjudicated = cli([
    "decide",
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
  ]);
  assert.equal(adjudicated.status, 0, adjudicated.all);
  const ruling = JSON.parse(adjudicated.out);
  assert.equal(ruling.kind, "adjudication");
  assert.equal(ruling.fingerprint, fingerprint);
  assert.equal(ruling.action, "dismiss");
  assert.equal(ruling.summary, "docs drift");
  const after = status();
  assert.equal(after.status, 0, after.all);
  assert.match(after.out, /\(dismiss by haiyang \(person\)\)/);
  const raw = readFileSync(join(root, "delivery", "work", "WORK-CLI", "review-findings.jsonl"), "utf8");
  assert.equal(raw.trim().split("\n").length, 2);
});

// WORK-STALE-FINDINGS: a work reviewed for eight rounds listed nine findings
// as (open) at its last decision, every one fixed rounds earlier, while the
// approval looked only at the review of the commit being approved.
test("status calls a finding open only while the latest review that happened still raises it", () => {
  const { root, work } = fixture({ prefix: "bb-stale-findings-" });
  const A = { severity: "P1", summary: "the export drops the header" };
  const B = { severity: "P1", summary: "commas are not quoted" };
  const C = { severity: "P2", summary: "naming could be clearer" };
  const fp = fingerprintFinding;
  const text = () => cli(["status", "--repo", root, "--work", work]).out;
  const standing = () => Object.fromEntries(statusRow(root, work, ["--work", work]).findings.map((item) => [item.fingerprint, item.adjudication]));
  const round = (content, options) => {
    commit(root, `round\n\nWork: ${work}`, { "src/feature.txt": content });
    return reviewWith(root, work, options);
  };

  round("one\n", { findings: [A, B, C] });
  assert.match(text(), /unadjudicated P0\/P1 findings 2/);
  assert.deepEqual(standing(), { [fp(A)]: "open", [fp(B)]: "open", [fp(C)]: "open" });

  // The next review still raises A; B and C are not raised again.
  round("two\n", { findings: [A] });
  assert.match(text(), new RegExp(`^  \\[P1 ${fp(A)}\\] \\(open\\) the export drops the header$`, "m"));
  assert.match(text(), new RegExp(`^  \\[P1 ${fp(B)}\\] \\(not raised again\\) commas are not quoted$`, "m"));
  assert.match(text(), /unadjudicated P0\/P1 findings 1/);
  assert.deepEqual(standing(), { [fp(A)]: "open", [fp(B)]: "not raised again", [fp(C)]: "not raised again" });
  assert.equal(statusRow(root, work).openFindings, 1);

  // A later commit that fails verify was never reviewed: nothing changes.
  assert.equal(round("three\n", { verifier: worker({ exitCode: 1 }) }).state.terminal.status, "FAILED");
  assert.match(text(), /unadjudicated P0\/P1 findings 1/);
  assert.deepEqual(standing(), { [fp(A)]: "open", [fp(B)]: "not raised again", [fp(C)]: "not raised again" });

  // A clean review answers the rest; a ruling is shown as the ruling.
  const clean = round("four\n");
  assert.doesNotMatch(text(), /unadjudicated|\(open\)/);
  adjudicateFinding(root, work, { fingerprint: fp(B), action: "dismiss", by: "owner", as: "human", note: "by design" });
  const final = { [fp(A)]: "not raised again", [fp(B)]: "dismiss", [fp(C)]: "not raised again" };
  assert.deepEqual(standing(), final);
  assert.match(text(), new RegExp(`\\[P1 ${fp(B)}\\] \\(dismiss by owner \\(person\\)\\)`));

  // From the run records alone the answer is the same.
  approveReview(root, work, { candidate: clean.state.pendingHuman.subject.candidate, by: "owner", as: "human" });
  rmSync(join(root, ".buildbeat", "runtime"), { recursive: true, force: true });
  assert.deepEqual(standing(), final);
});

test("with no review on record a finding nobody ruled on stays open", () => {
  const root = emptyRepo("bb-stale-findings-");
  commit(root, "baseline", { "README.md": "x\n", "delivery/work/WORK-A/work.md": "# A\n" });
  recordReviewFindings(root, "WORK-A", { run: "RUN-A-01", step: "review", attempt: 1, findings: [{ severity: "P1", summary: "left over" }], ts: "2026-11-11T00:00:00.000Z" });
  const row = statusRow(root, "WORK-A");
  assert.equal(row.openFindings, 1);
  assert.equal(row.findings[0].adjudication, "open");
});
