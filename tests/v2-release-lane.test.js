import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { loadRiskPreset } from "../src/v2/engine/risk-preset.js";
import { loadWorkflow, parseWorkflow } from "../src/v2/engine/workflow.js";
import { approveRun } from "../src/v2/runtime/decisions.js";
import { checkRequires } from "../src/v2/runtime/env-contract.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "release-readback.yaml");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-release-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return root;
}

test("release-readback preset: human pause before apply, L4 evidence, any failed readback stops for a human", () => {
  const workflow = loadWorkflow(PRESET_PATH);
  assert.deepEqual(workflow.steps.map((step) => [step.id, step.grade, step.readonly]), [
    ["preflight", "L4", true],
    ["apply-readback", "L4", true],
    ["observe", "L4", true],
    ["wait-close", "L2", false],
  ]);
  const preset = loadRiskPreset("release");
  assert.deepEqual(preset.stopAt, ["apply-readback"]);
  assert.throws(() => parseWorkflow("kind: workflow\nversion: 1\nname: x\nentry: a\nsteps:\n  - id: a\n    grade: L9\nterminal:\n  - a\n"), /grade must be one of L0-L4/);

  const root = fixtureRepo();
  const readback = createMockAdapter({ preflight: ["succeed"], "apply-readback": ["succeed"] });
  const observe = createMockAdapter({ observe: ["succeed"] });
  const base = {
    repoRoot: root,
    workflow,
    workflowDigest: "sha256:release",
    workId: "WORK-REL",
    runId: "RUN-REL",
    riskPreset: preset.name,
    policies: preset.policies,
    stopAt: preset.stopAt,
    adapters: { readback, observe },
    supersede: "off",
  };
  const started = startRun(base);
  assert.equal(started.state.steps.preflight.status, "SUCCEEDED");
  assert.equal(started.state.pendingHuman.transition, "enter-apply-readback");
  assert.match(started.state.pendingHuman.reasons[0], /automation boundary/);
  assert.equal(started.state.evidence[0].grade, "L4");

  // The human performs the production action, then approves the readback.
  approveRun(root, "RUN-REL", { by: "owner", transition: "enter-apply-readback" });
  const resumed = resumeRun(base);
  assert.equal(resumed.state.steps["apply-readback"].status, "SUCCEEDED");
  assert.equal(resumed.state.steps.observe.status, "SUCCEEDED");
  assert.equal(resumed.state.pendingHuman.transition, "enter-wait-close");
  assert.equal(resumed.state.pendingHuman.kind, "final-decision");
  assert.ok(resumed.state.evidence.every((item) => item.grade === "L4"));
  const closed = approveRun(root, "RUN-REL", { by: "owner", transition: "enter-wait-close", policies: preset.policies });
  assert.equal(closed.terminal, true);

  // A failing readback: maxAttempts 1 → straight to a human, no fix edge.
  const root2 = fixtureRepo();
  const failing = startRun({
    ...base,
    repoRoot: root2,
    runId: "RUN-REL-FAIL",
    adapters: { readback: createMockAdapter({ preflight: ["fail"] }), observe },
  });
  assert.equal(failing.state.run.status, "WAITING_HUMAN");
  assert.equal(failing.state.pendingHuman.transition, "resume-preflight");
  assert.match(failing.state.pendingHuman.reasons[0], /budget exhausted: preflight failed its final attempt/);
});

test("requires probes check environment facts, not just binary versions", () => {
  const ok = checkRequires([
    { probe: "echo redis 7.2.4", expect: "redis 7\\.[0-9]+", name: "redis-version" },
    { probe: "true", name: "reachable" },
  ]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.checked.map((row) => row.command), ["redis-version", "reachable"]);
  const bad = checkRequires([
    { probe: "echo redis 6.2.0", expect: "redis 7\\.", name: "redis-version" },
    { probe: "exit 3", name: "port" },
    { probe: "echo x", expect: "(" , name: "regex" },
  ]);
  assert.equal(bad.ok, false);
  assert.match(bad.problems[0], /redis-version: probe output does not match/);
  assert.match(bad.problems[1], /port: probe exited 3/);
  assert.match(bad.problems[2], /regex: expect .* not a valid regular expression/);
});
