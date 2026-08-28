import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PolicyError,
  evaluateRule,
  parsePolicyDoc,
  sha256Text,
} from "../src/v2/policy/policy.js";
import { acceptArtifact } from "../src/v2/runtime/decisions.js";

function ctx(overrides = {}) {
  return {
    state: { evidence: [], steps: {}, budgets: {}, approvals: [] },
    workDir: mkdtempSync(join(tmpdir(), "bb-v2-pol-")),
    worktreePath: null,
    readWorktree: () => null,
    ...overrides,
  };
}

test("policy parsing fails closed", () => {
  const base = {
    kind: "policy",
    version: 1,
    name: "p",
    type: "pre",
    appliesTo: "build",
    enforcement: "LOCAL_ENFORCED",
    rule: { "candidate.clean": {} },
  };
  parsePolicyDoc(base);
  assert.throws(() => parsePolicyDoc({ ...base, rule: { "made.up": {} } }), PolicyError);
  assert.throws(
    () => parsePolicyDoc({ ...base, rule: { "candidate.clean": {}, all: [] } }),
    PolicyError,
  );
  assert.throws(() => parsePolicyDoc({ ...base, enforcement: "HARD" }), PolicyError);
  assert.throws(() => parsePolicyDoc({ ...base, extra: 1 }), PolicyError);
  assert.throws(() => parsePolicyDoc({ ...base, type: "sideways" }), PolicyError);
  assert.equal(parsePolicyDoc(base).onFail, "WAIT_HUMAN");
});

test("evidence.exists honours kind, status and the grade floor", () => {
  const evidence = [
    { kind: "test", status: "passed", grade: "L2" },
    { kind: "screenshot", status: "failed", grade: "L4" },
  ];
  const c = ctx({ state: { evidence, steps: {}, budgets: {}, approvals: [] } });
  assert.equal(evaluateRule({ "evidence.exists": { kind: "test" } }, c).ok, true);
  assert.equal(
    evaluateRule({ "evidence.exists": { kind: "test", minGrade: "L3" } }, c).ok,
    false,
  );
  assert.equal(
    evaluateRule({ "evidence.exists": { kind: "screenshot" } }, c).ok,
    false,
    "failed evidence never satisfies the rule",
  );
});

test("finding.maxSeverity is unverified without review evidence and strict with it", () => {
  const empty = ctx();
  assert.equal(evaluateRule({ "finding.maxSeverity": { atMost: "P2" } }, empty).ok, "unverified");

  const withP1 = ctx({
    state: {
      evidence: [
        { kind: "review", status: "failed", grade: "L2", findings: [{ severity: "P1", summary: "x" }] },
      ],
      steps: {},
      budgets: {},
      approvals: [],
    },
  });
  assert.equal(evaluateRule({ "finding.maxSeverity": { atMost: "P2" } }, withP1).ok, false);
  assert.equal(evaluateRule({ "finding.maxSeverity": { atMost: "P1" } }, withP1).ok, true);
});

test("candidate-scoped gates ignore findings and evidence of superseded candidates", () => {
  const history = ctx({
    state: {
      evidence: [
        { kind: "review", subject: "old-sha", status: "failed", grade: "L2", findings: [{ severity: "P1", summary: "fixed later" }] },
        { kind: "review", subject: "new-sha", status: "passed", grade: "L2", findings: [] },
        { kind: "command", subject: "old-sha", status: "passed", grade: "L2" },
      ],
      steps: {},
      budgets: {},
      approvals: [],
    },
    candidate: "new-sha",
  });
  assert.equal(
    evaluateRule({ "finding.maxSeverity": { atMost: "P2" } }, history).ok,
    true,
    "the blocked-then-fixed round must not poison the final candidate",
  );
  assert.equal(
    evaluateRule({ "evidence.exists": { kind: "command", minGrade: "L2" } }, history).ok,
    false,
    "evidence about a superseded candidate does not satisfy the current one",
  );
  const unscoped = { ...history, candidate: null };
  assert.equal(evaluateRule({ "finding.maxSeverity": { atMost: "P2" } }, unscoped).ok, false);
});

test("artifact.accepted binds to the digest and goes stale on edits", () => {
  const repo = mkdtempSync(join(tmpdir(), "bb-v2-acc-"));
  const workDir = join(repo, "delivery", "work", "W");
  mkdirSync(workDir, { recursive: true });
  const c = ctx({ workDir });
  const rule = { "artifact.accepted": { artifact: "plan" } };

  assert.equal(evaluateRule(rule, c).ok, "unverified", "missing file is unverified");
  writeFileSync(join(workDir, "plan.md"), "v1\n");
  assert.equal(evaluateRule(rule, c).ok, false, "never accepted");

  const accepted = acceptArtifact(repo, "W", "plan", { by: "owner", ts: "2026-08-28T00:00:00Z" });
  assert.equal(accepted.digest, sha256Text("v1\n"));
  assert.equal(evaluateRule(rule, c).ok, true);

  writeFileSync(join(workDir, "plan.md"), "v2 edited after acceptance\n");
  const stale = evaluateRule(rule, c);
  assert.equal(stale.ok, false);
  assert.match(stale.why, /stale/);

  acceptArtifact(repo, "W", "plan", { by: "owner" });
  assert.equal(evaluateRule(rule, c).ok, true, "re-acceptance rebinds the new digest");
});

test("three-valued combinators never let unverified pass", () => {
  const c = ctx();
  const unverified = { "candidate.clean": {} }; // no worktree -> unverified
  const truthy = { "budget.remaining": { kind: "attempts" } }; // untouched -> true

  assert.equal(evaluateRule({ all: [truthy, unverified] }, c).ok, "unverified");
  assert.equal(evaluateRule({ any: [truthy, unverified] }, c).ok, true);
  assert.equal(evaluateRule({ any: [unverified, unverified] }, c).ok, "unverified");
  assert.equal(evaluateRule({ not: unverified }, c).ok, "unverified");
  assert.equal(evaluateRule({ not: truthy }, c).ok, false);
});

test("attempts, budgets and human.approved read derived state", () => {
  const c = ctx({
    state: {
      evidence: [],
      steps: { fix: { attempts: 2 } },
      budgets: { attempts: { consumed: 4, remaining: 0 } },
      approvals: [
        { transition: "enter-review", stale: true },
        { transition: "enter-review", stale: false },
      ],
    },
  });
  assert.equal(evaluateRule({ "attempts.lt": { step: "fix", max: 4 } }, c).ok, true);
  assert.equal(evaluateRule({ "attempts.lt": { step: "fix", max: 2 } }, c).ok, false);
  assert.equal(evaluateRule({ "budget.remaining": { kind: "attempts" } }, c).ok, false);
  assert.equal(
    evaluateRule({ "human.approved": { transition: "enter-review" } }, c).ok,
    true,
    "a non-stale approval counts",
  );
  assert.equal(
    evaluateRule({ "human.approved": { transition: "enter-merge" } }, c).ok,
    false,
  );
});
