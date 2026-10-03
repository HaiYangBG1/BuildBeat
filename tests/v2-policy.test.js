import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  artifactAccepted,
  deliveryChecks,
  evaluatePolicies,
  evidencePresent,
  reviewClear,
  sha256Text,
  PolicyError,
} from "../src/v2/policy/policy.js";
import { acceptArtifact } from "../src/v2/runtime/decisions.js";
import { fingerprintFinding } from "../src/v2/runtime/findings.js";
import { tempDir } from "./support/tmp.js";
function ctx(extra = {}) {
  return {
    workDir: tempDir("bb-fixed-gates-"),
    state: { evidence: [] },
    candidate: "current",
    ...extra,
  };
}
test("fixed work acceptance binds the digest and becomes stale after edits", () => {
  const repo = tempDir("bb-fixed-work-");
  const workDir = join(repo, "delivery", "work", "W");
  mkdirSync(workDir, { recursive: true });
  const c = ctx({ workDir });
  assert.equal(artifactAccepted("work", c).ok, "unverified");
  writeFileSync(join(workDir, "work.md"), "goal and plan");
  assert.equal(artifactAccepted("work", c).ok, false);
  assert.equal(
    acceptArtifact(repo, "W", "work", { by: "owner" }).digest,
    sha256Text("goal and plan"),
  );
  assert.equal(artifactAccepted("work", c).ok, true);
  writeFileSync(join(workDir, "work.md"), "changed scope");
  assert.equal(artifactAccepted("work", c).ok, false);
});
test("command evidence must be passed, correctly graded and for the current candidate", () => {
  const c = ctx({
    state: {
      evidence: [
        { kind: "command", status: "passed", grade: "L4", subject: "old" },
        { kind: "command", status: "failed", grade: "L4", subject: "current" },
      ],
    },
  });
  assert.equal(evidencePresent({}, c).ok, false);
  c.state.evidence.push({
    kind: "command",
    status: "passed",
    grade: "L2",
    subject: "current",
  });
  assert.equal(evidencePresent({}, c).ok, true);
  assert.equal(evidencePresent({ minGrade: "L3" }, c).ok, false);
  assert.equal(evidencePresent({ minGrade: "bad" }, c).ok, "unverified");
});
test("the final floor requires verifier evidence and independent review, not only a successful builder", () => {
  const c = ctx({
    state: {
      evidence: [
        {
          kind: "command",
          subject: "current",
          status: "passed",
          grade: "L2",
          ref: "runs/R/logs/build-1.log",
        },
      ],
    },
  });
  const gates = deliveryChecks({ requireAcceptance: false });
  const evaluate = () =>
    evaluatePolicies(
      gates,
      { type: "transition", appliesTo: "enter-wait-merge" },
      c,
    )[0];
  assert.notEqual(evaluate().result, "PASS");
  c.state.evidence.push({
    kind: "command",
    subject: "current",
    status: "passed",
    grade: "L2",
    ref: "runs/R/logs/verify-1.log",
  });
  assert.equal(evaluate().result, "UNVERIFIED");
  c.state.evidence.push({
    kind: "review",
    subject: "current",
    status: "passed",
    grade: "L2",
    findings: [],
  });
  assert.equal(evaluate().result, "PASS");
});
test("superseded candidate findings cannot poison the current review; missing review remains unverified", () => {
  const c = ctx();
  assert.equal(reviewClear("P2", c).ok, "unverified");
  c.state.evidence.push(
    {
      kind: "review",
      subject: "old",
      findings: [{ severity: "P0", summary: "old" }],
    },
    {
      kind: "review",
      subject: "current",
      findings: [{ severity: "P2", summary: "minor" }],
    },
  );
  assert.equal(reviewClear("P2", c).ok, true);
  assert.equal(reviewClear("P3", c).ok, false);
});
test("unrecognized custom rules are refused rather than ignored", () => {
  assert.throws(
    () =>
      evaluatePolicies(
        [{ type: "pre", appliesTo: "build", rule: { all: [] } }],
        { type: "pre", appliesTo: "build" },
        ctx(),
      ),
    PolicyError,
  );
});

test("a newer accept reopens a previously suppressed finding", () => {
  const finding = { severity: "P1", summary: "same issue" };
  const fingerprint = fingerprintFinding(finding);
  const c = ctx({
    state: {
      evidence: [
        {
          kind: "review",
          subject: "current",
          findings: [finding],
          suppressedFingerprints: [fingerprint],
        },
      ],
    },
  });
  const account = join(c.workDir, "review-findings.jsonl");
  const dismiss = { kind: "adjudication", fingerprint, action: "dismiss" };
  writeFileSync(account, JSON.stringify(dismiss) + "\n");
  assert.equal(reviewClear("P2", c).ok, true);
  writeFileSync(
    account,
    JSON.stringify(dismiss) +
      "\n" +
      JSON.stringify({ ...dismiss, action: "accept" }) +
      "\n",
  );
  assert.equal(reviewClear("P2", c).ok, false);
});
