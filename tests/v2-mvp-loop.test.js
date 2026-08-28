// The MVP promise, end to end on a real test project: given an approved goal
// and plan, BuildBeat runs Build–Verify–Fix–Review automatically and stops
// with full evidence before the merge decision. The builder plants a real
// bug; a real test run catches it; the fixer repairs it; a read-only
// reviewer passes it; a human approves the final decision.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { approveRun } from "../src/v2/runtime/decisions.js";
import { startRun } from "../src/v2/runtime/orchestrator.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function sha256(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

test("planted bug: build red, auto-fix green, read-only review, stop before merge", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-mvp-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(
    join(root, "test", "calc.test.js"),
    [
      'import assert from "node:assert/strict";',
      'import test from "node:test";',
      'import { add } from "../lib.js";',
      'test("add", () => { assert.equal(add(2, 2), 4); });',
      "",
    ].join("\n"),
  );
  const workDir = join(root, "delivery", "work", "WORK-MVP");
  mkdirSync(workDir, { recursive: true });
  const intentText = "# Intent: implement add()\n";
  const planText = "# Plan: add lib.js exporting add(a, b)\n";
  writeFileSync(join(workDir, "intent.md"), intentText);
  writeFileSync(join(workDir, "plan.md"), planText);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline with accepted intent and plan"]);

  const adapters = {
    builder: createShellAdapter({
      name: "shell:builder",
      command: "bash",
      // Plants a real bug: add() subtracts.
      args: [
        "-lc",
        "printf 'export function add(a, b) { return a - b; }\\n' > lib.js && git add -A && git commit -qm buggy-candidate",
      ],
    }),
    verifier: createShellAdapter({
      name: "shell:verifier",
      command: "bash",
      // NODE_TEST_CONTEXT is unset because this test itself runs under
      // node --test; an inherited test-runner context would make the child
      // runner report to the parent harness and exit 0 on failure.
      args: ["-lc", "unset NODE_TEST_CONTEXT; node --test test/calc.test.js"],
    }),
    fixer: createShellAdapter({
      name: "shell:fixer",
      command: "bash",
      args: [
        "-lc",
        "printf 'export function add(a, b) { return a + b; }\\n' > lib.js && git add -A && git commit -qm fixed-candidate",
      ],
    }),
    reviewer: createShellAdapter({
      name: "shell:reviewer",
      command: "bash",
      args: [
        "-lc",
        'printf \'{"status":"succeeded","findings":[]}\' > "$BUILDBEAT_OUTPUT"',
      ],
    }),
  };

  const result = startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: DIGEST,
    workId: "WORK-MVP",
    runId: "RUN-MVP",
    entry: "build",
    adapters,
    planDigest: sha256(planText),
    intentDigest: sha256(intentText),
  });
  const state = result.state;

  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.pendingHuman.kind, "final-decision");
  assert.equal(state.steps.build.attempts, 1);
  assert.equal(state.steps.verify.attempts, 2, "verify ran red then green");
  assert.equal(state.steps.fix.attempts, 1);
  assert.equal(state.steps.review.attempts, 1);
  assert.equal(state.fingerprints.length, 1, "the red verify left a failure fingerprint");

  const candidate = state.workspaces["RUN-MVP"].candidate;
  assert.equal(candidate, git(result.workspace.worktreePath, ["rev-parse", "HEAD"]));
  assert.match(git(result.workspace.worktreePath, ["log", "-1", "--format=%s"]), /fixed-candidate/);

  assert.equal(state.run.planDigest, sha256(planText), "the accepted plan is pinned");
  assert.equal(state.pendingHuman.subject.planDigest, sha256(planText));
  assert.equal(state.pendingHuman.subject.candidate, candidate);

  const commandEvidence = state.evidence.filter((item) => item.kind === "command");
  assert.equal(commandEvidence.length, 5, "build, verify x2, fix, review commands read back");
  const failedVerify = commandEvidence.filter((item) => item.status === "failed");
  assert.equal(failedVerify.length, 1);
  assert.equal(state.evidence.filter((item) => item.kind === "review").length, 1);

  const approvedResult = approveRun(root, "RUN-MVP", {
    by: "owner",
    transition: "enter-wait-merge",
  });
  assert.equal(approvedResult.approved, true);
  assert.equal(approvedResult.terminal, true);
  assert.equal(approvedResult.state.terminal.status, "SUCCEEDED");
  assert.ok(approvedResult.state.compacted);
  assert.ok(
    existsSync(join(root, "delivery", "work", "WORK-MVP", "runs", "RUN-MVP", "run-record.json")),
  );

  // The whole story replays deterministically from the ledger alone.
  const reopened = EventLedger.open(result.ledgerPath);
  assert.equal(reopened.corruption, null);
  assert.deepEqual(reopened.state, approvedResult.state);

  // No merge happened: main still lacks lib.js.
  assert.equal(existsSync(join(root, "lib.js")), false);
});
