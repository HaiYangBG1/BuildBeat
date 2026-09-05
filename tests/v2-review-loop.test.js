import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { parseEnvelope, startRun } from "../src/v2/runtime/orchestrator.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-review-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return { root };
}

function run(root, runId, adapters, overrides = {}) {
  return startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    workId: `WORK-${runId}`,
    runId,
    entry: "build",
    adapters,
    ...overrides,
  });
}

test("blocking review findings route to fix, a clean re-review reaches the merge decision", () => {
  const { root } = fixtureRepo();
  const mock = createMockAdapter({
    build: ["succeed"],
    verify: ["succeed", "succeed"],
    fix: ["succeed"],
    review: [
      {
        behavior: "succeed",
        envelope: {
          status: "succeeded",
          findings: [{ severity: "P1", summary: "unsafe single-stage rollout" }],
        },
      },
      { behavior: "succeed", envelope: { status: "succeeded", findings: [] } },
    ],
  });
  const result = run(root, "RUN-RL1", {
    builder: mock,
    verifier: mock,
    fixer: mock,
    reviewer: mock,
  });
  const state = result.state;
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.pendingHuman.kind, "final-decision");
  assert.equal(state.pendingHuman.transition, "enter-wait-merge");
  assert.equal(state.steps.review.attempts, 2);
  assert.equal(state.steps.fix.attempts, 1);
  assert.equal(state.steps.verify.attempts, 2);
  const reviewEvidence = state.evidence.filter((item) => item.kind === "review");
  assert.equal(reviewEvidence.length, 2);
  assert.equal(reviewEvidence[0].status, "failed");
  assert.equal(reviewEvidence[1].status, "passed");
  assert.ok(state.policyLog.some((entry) => entry.result === "ROUTE"));
});

test("the preset caps review at two rounds; the third stops for a human", () => {
  // Deploy-campaign charter, now a native budget: two review rounds per run,
  // then a human — endless fresh-review loops burned four rounds before a
  // person stopped them.
  const { root } = fixtureRepo();
  const mock = createMockAdapter({
    build: ["succeed"],
    verify: ["succeed", "succeed", "succeed"],
    fix: ["succeed", "succeed"],
    review: [
      {
        behavior: "succeed",
        envelope: { status: "succeeded", findings: [{ severity: "P0", summary: "issue one" }] },
      },
      {
        behavior: "succeed",
        envelope: { status: "succeeded", findings: [{ severity: "P0", summary: "issue two" }] },
      },
    ],
  });
  const result = run(root, "RUN-RL4", {
    builder: mock,
    verifier: mock,
    fixer: mock,
    reviewer: mock,
  });
  const state = result.state;
  assert.equal(state.steps.review.attempts, 2);
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.match(state.pendingHuman.reasons[0], /budget exhausted: review would exceed maxAttempts=2/);
});

test("a reviewer that writes to the workspace is blocked, not merged", () => {
  const { root } = fixtureRepo();
  const mock = createMockAdapter({ build: ["succeed"], verify: ["succeed"] });
  const result = run(root, "RUN-RL2", {
    builder: mock,
    verifier: mock,
    reviewer: createShellAdapter({
      name: "shell:reviewer",
      command: "bash",
      args: ["-lc", "echo hack > hacked.txt"],
    }),
  });
  const state = result.state;
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.match(state.pendingHuman.reasons[0], /read-only/);
  assert.equal(state.steps.review.detail, "blocked");
  assert.ok(
    state.policyLog.some((entry) => entry.result === "BLOCK" && entry.phase === "action"),
  );
});

test("parseEnvelope tolerates one markdown fence but stays strict inside", () => {
  const fenced = parseEnvelope('```json\n{"status":"succeeded","findings":[]}\n```');
  assert.equal(fenced.error, null);
  assert.deepEqual(fenced.envelope.findings, []);
  const bad = parseEnvelope("```json\nnot json\n```");
  assert.match(bad.error, /not valid JSON/);
});

test("an invalid worker envelope is invalid-output and fails closed", () => {
  const { root } = fixtureRepo();
  const mock = createMockAdapter({ build: ["succeed"], verify: ["succeed"] });
  const result = run(root, "RUN-RL3", {
    builder: mock,
    verifier: mock,
    reviewer: createShellAdapter({
      name: "shell:reviewer",
      command: "bash",
      args: ["-lc", 'echo not-json > "$BUILDBEAT_OUTPUT"'],
    }),
  });
  const state = result.state;
  assert.equal(state.steps.review.detail, "invalid-output");
  // Garbage output is a worker-infrastructure failure: no fixer, no terminal
  // FAILED, the attempt is refunded and a human decides when to rerun.
  assert.equal(state.terminal, null);
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.pendingHuman.kind, "infra");
  assert.equal(state.pendingHuman.transition, "resume-review");
  assert.equal(state.steps.review.infraAttempts, 1);
});
