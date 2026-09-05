import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadRiskPreset } from "../src/v2/engine/risk-preset.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { approveRun, rejectRun } from "../src/v2/runtime/decisions.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";
import { computeOverview, renderOverview } from "../src/v2/runtime/overview.js";

const DELIVERY = loadWorkflow(join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml"));
const RELEASE = loadWorkflow(join(import.meta.dirname, "..", "src", "v2", "presets", "release-readback.yaml"));

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-stages-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return root;
}

function work(root, id) {
  const dir = join(root, "delivery", "work", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "intent.md"), `# ${id}\n`);
  writeFileSync(join(dir, "plan.md"), `# plan ${id}\n`);
  return dir;
}

const committingBuilder = () =>
  createShellAdapter({
    name: "shell:builder",
    command: "bash",
    args: ["-lc", "echo done > feature.txt && git add -A && git commit -qm candidate"],
  });
const clean = () => ({ behavior: "succeed", envelope: { status: "succeeded", findings: [] } });

test("a merged candidate behind a CANCELLED run reads as MERGED, not STOPPED_CANCELLED", () => {
  // Real incident: the run's review budget ran out, closure happened outside
  // the run, the candidate shipped, the run was cancelled — and overview
  // told the owner the shipped work was STOPPED_CANCELLED with next: retry.
  const root = fixtureRepo();
  work(root, "WORK-M");
  const mock = createMockAdapter({ verify: ["succeed"], review: [clean()] });
  const started = startRun({
    repoRoot: root,
    workflow: DELIVERY,
    workflowDigest: "sha256:wf",
    workId: "WORK-M",
    runId: "RUN-M-01",
    entry: "build",
    adapters: { builder: committingBuilder(), verifier: mock, reviewer: mock },
  });
  const candidate = started.state.workspaces["RUN-M-01"].candidate;
  git(root, ["merge", "-q", "--ff-only", "run/RUN-M-01"]);
  rejectRun(root, "RUN-M-01", { by: "owner", reason: "closure done elsewhere" });

  const [row] = computeOverview(root, { work: "WORK-M" });
  assert.equal(row.stage, "MERGED");
  assert.equal(row.merged, true);
  assert.equal(row.mergedCandidate, candidate);
  assert.equal(row.latest.status, "CANCELLED");
  assert.match(row.next, /is on main/);
  assert.match(row.next, /ended CANCELLED after the merge/);
  assert.match(renderOverview([row]), /candidate \w{7} \(merged\)/);
});

test("a closed release-readback lane reads as RELEASED, not 'nothing to merge'", () => {
  const root = fixtureRepo();
  work(root, "WORK-R");
  const preset = loadRiskPreset("release");
  const readback = createMockAdapter({ preflight: ["succeed"], "apply-readback": ["succeed"] });
  const observe = createMockAdapter({ observe: ["succeed"] });
  const base = {
    repoRoot: root,
    workflow: RELEASE,
    workflowDigest: "sha256:release",
    workId: "WORK-R",
    runId: "RUN-R-RELEASE-01",
    riskPreset: preset.name,
    policies: preset.policies,
    stopAt: preset.stopAt,
    adapters: { readback, observe },
  };
  startRun(base);
  approveRun(root, "RUN-R-RELEASE-01", { by: "owner", transition: "enter-apply-readback" });
  resumeRun(base);
  approveRun(root, "RUN-R-RELEASE-01", { by: "owner", transition: "enter-wait-close", policies: preset.policies });

  const [row] = computeOverview(root, { work: "WORK-R" });
  assert.equal(row.stage, "RELEASED");
  assert.match(row.next, /release window closed by RUN-R-RELEASE-01/);
  assert.doesNotMatch(renderOverview([row]), /nothing to merge/);
});

test("unadjudicated findings are not nagged about on settled work", () => {
  const base = {
    work: "WORK-X",
    intent: { exists: true, accepted: true, stale: false },
    plan: { exists: true, accepted: true, stale: false },
    envFacts: false,
    openFindings: 14,
    runs: 4,
    cost: null,
    latest: null,
    merged: true,
    mergedCandidate: null,
    next: "n/a",
  };
  assert.doesNotMatch(renderOverview([{ ...base, stage: "MERGED" }]), /unadjudicated/);
  assert.doesNotMatch(renderOverview([{ ...base, stage: "RELEASED" }]), /unadjudicated/);
  assert.match(renderOverview([{ ...base, stage: "MERGE_READY" }]), /unadjudicated P0\/P1 findings 14/);
});
