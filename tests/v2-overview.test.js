import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { acceptArtifact, approveRun } from "../src/v2/runtime/decisions.js";
import { startRun } from "../src/v2/runtime/orchestrator.js";
import { computeOverview } from "../src/v2/runtime/overview.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat-v2.js");
const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-overview-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return root;
}

function work(root, id, { intent = true, plan = true } = {}) {
  const dir = join(root, "delivery", "work", id);
  mkdirSync(dir, { recursive: true });
  if (intent) {
    writeFileSync(join(dir, "intent.md"), `# ${id}\n`);
  }
  if (plan) {
    writeFileSync(join(dir, "plan.md"), `# plan ${id}\n`);
  }
  return dir;
}

function byWork(rows) {
  return Object.fromEntries(rows.map((row) => [row.work, row]));
}

test("overview derives each work's stage and next move from the Git and runtime planes", () => {
  const root = fixtureRepo();
  work(root, "WORK-A", { plan: false });
  work(root, "WORK-B");
  acceptArtifact(root, "WORK-B", "intent", { by: "owner" });
  const dirC = work(root, "WORK-C");
  acceptArtifact(root, "WORK-C", "intent", { by: "owner" });
  acceptArtifact(root, "WORK-C", "plan", { by: "owner" });
  writeFileSync(join(dirC, "plan.md"), "# plan WORK-C edited after acceptance\n");
  const dirH = work(root, "WORK-H");
  acceptArtifact(root, "WORK-H", "intent", { by: "owner" });
  acceptArtifact(root, "WORK-H", "plan", { by: "owner" });
  writeFileSync(
    join(dirH, "decisions.jsonl"),
    readFileSync(join(dirH, "decisions.jsonl"), "utf8") +
      JSON.stringify({ ts: "2026-09-03T12:34:05Z", decision: "closed", transition: "close-work", subject: { result: "doc-only work shipped via main" }, by: "owner" }) +
      "\n",
  );
  const dirI = work(root, "WORK-I");
  acceptArtifact(root, "WORK-I", "intent", { by: "owner" });
  writeFileSync(
    join(dirI, "decisions.jsonl"),
    readFileSync(join(dirI, "decisions.jsonl"), "utf8") +
      JSON.stringify({ ts: "2026-09-05T04:05:00Z", decision: "cancelled", transition: "close-work", subject: { result: "cost > benefit" }, by: "owner" }) +
      "\n",
  );
  work(root, "WORK-D");
  acceptArtifact(root, "WORK-D", "intent", { by: "owner" });
  acceptArtifact(root, "WORK-D", "plan", { by: "owner" });
  writeFileSync(join(root, "delivery", "work", "WORK-D", "env-facts.md"), "- redis >= 7\n");

  // WORK-E: a run waiting at the merge decision.
  work(root, "WORK-E");
  const builder = createShellAdapter({ command: "bash", args: ["-lc", "echo e > e.txt && git add -A && git commit -qm e"] });
  const mock = createMockAdapter({ verify: ["succeed"], review: [{ behavior: "succeed", envelope: { findings: [] } }] });
  const runE = startRun({ repoRoot: root, workflow: WORKFLOW, workflowDigest: "sha256:t", workId: "WORK-E", runId: "RUN-E1", entry: "build", adapters: { builder, verifier: mock, reviewer: mock }, supersede: "off" });
  assert.equal(runE.state.pendingHuman.kind, "final-decision");

  // WORK-F: approved (SUCCEEDED) but not merged; WORK-G: approved and merged.
  for (const [id, merge] of [["WORK-F", false], ["WORK-G", true]]) {
    work(root, id);
    acceptArtifact(root, id, "intent", { by: "owner" });
    acceptArtifact(root, id, "plan", { by: "owner" });
    const b = createShellAdapter({ command: "bash", args: ["-lc", `echo ${id} > ${id}.txt && git add -A && git commit -qm ${id}`] });
    const m = createMockAdapter({ verify: ["succeed"], review: [{ behavior: "succeed", envelope: { findings: [] } }] });
    const run = startRun({ repoRoot: root, workflow: WORKFLOW, workflowDigest: "sha256:t", workId: id, runId: `RUN-${id}`, entry: "build", adapters: { builder: b, verifier: m, reviewer: m }, supersede: "off" });
    approveRun(root, `RUN-${id}`, { by: "owner", transition: "enter-wait-merge" });
    if (merge) {
      git(root, ["merge", "-q", "--no-ff", "-m", `merge ${id}`, `run/RUN-${id}`]);
    }
    assert.ok(run.state.workspaces[`RUN-${id}`].candidate);
  }

  const rows = byWork(computeOverview(root, { repoLabel: "." }));
  assert.equal(rows["WORK-A"].stage, "INTENT_DRAFT");
  assert.match(rows["WORK-A"].next, /accept --repo \. --work WORK-A --artifact intent/);
  assert.equal(rows["WORK-B"].stage, "PLAN_DRAFT");
  assert.match(rows["WORK-B"].next, /--artifact plan/);
  assert.equal(rows["WORK-C"].stage, "PLAN_STALE");
  assert.equal(rows["WORK-C"].plan.stale, true);
  assert.equal(rows["WORK-D"].stage, "READY_TO_RUN");
  assert.match(rows["WORK-D"].next, /close it with a decisions.jsonl row/);
  assert.equal(rows["WORK-H"].stage, "CLOSED");
  assert.match(rows["WORK-H"].next, /^closed @ 2026-09-03T12:34:05Z: doc-only work shipped via main$/);
  assert.equal(rows["WORK-I"].stage, "CANCELLED");
  assert.match(rows["WORK-I"].next, /^cancelled @ .*cost > benefit$/);
  assert.equal(rows["WORK-D"].envFacts, true);
  assert.equal(rows["WORK-E"].stage, "MERGE_DECISION");
  assert.match(rows["WORK-E"].next, /approve --repo \. --run RUN-E1 --transition enter-wait-merge/);
  assert.equal(rows["WORK-F"].stage, "MERGE_READY");
  assert.match(rows["WORK-F"].next, /merge [0-9a-f]{7} \(run\/RUN-WORK-F\) into main/);
  assert.equal(rows["WORK-G"].stage, "MERGED");
  assert.equal(rows["WORK-G"].merged, true);

  // Runtime wiped: run-records in the Git plane still tell the story.
  rmSync(join(root, ".buildbeat", "runtime"), { recursive: true, force: true });
  const after = byWork(computeOverview(root, { repoLabel: "." }));
  assert.equal(after["WORK-G"].stage, "MERGED");
  assert.equal(after["WORK-G"].latest.source, "run-record");
  assert.equal(after["WORK-F"].stage, "MERGE_READY");

  const out = execFileSync("node", [CLI, "overview", "--repo", root], { encoding: "utf8" });
  assert.match(out, /WORK-G  MERGED/);
  assert.match(out, /WORK-H  CLOSED/);
  assert.match(out, /intent ✓ · plan ✓ · runs 1/);
  assert.match(out, /next: candidate \w{7} \(RUN-[A-Z0-9-]+\) is on main; release\/deploy stays a human action/);
  assert.doesNotMatch(out, new RegExp(root));
  const one = execFileSync("node", [CLI, "overview", "--repo", root, "--work", "WORK-A", "--json", "true"], { encoding: "utf8" });
  assert.equal(JSON.parse(one).length, 1);
});
