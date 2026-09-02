import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { rejectRun } from "../src/v2/runtime/decisions.js";
import { applyGc, planGc } from "../src/v2/runtime/gc.js";
import { startRun } from "../src/v2/runtime/orchestrator.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat-v2.js");
const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function cli(args) {
  return execFileSync("node", [CLI, ...args], { encoding: "utf8" });
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-gc-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return root;
}

function committingRun(root, runId, workId) {
  const builder = createShellAdapter({
    command: "bash",
    args: ["-lc", `echo ${runId} > ${runId}.txt && git add -A && git commit -qm candidate-${runId}`],
  });
  const verifier = createMockAdapter({ verify: ["succeed"] });
  return startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: "sha256:test",
    workId,
    runId,
    entry: "build",
    stopAt: ["review"],
    adapters: { builder, verifier },
  });
}

test("gc removes worktrees of compacted runs, deletes branches only when the candidate lives elsewhere, and never touches live runs", () => {
  const root = fixtureRepo();

  // RUN-M: candidate later merged into main → worktree + branch collectable.
  const merged = committingRun(root, "RUN-M", "WORK-GC");
  rejectRun(root, "RUN-M", { by: "owner", reason: "superseded manually" });
  git(root, ["merge", "-q", "--no-ff", "-m", "merge RUN-M", "run/RUN-M"]);

  // RUN-E: candidate only on its run branch → worktree goes, branch stays.
  const evidenceOnly = committingRun(root, "RUN-E", "WORK-GC");
  rejectRun(root, "RUN-E", { by: "owner", reason: "not merging" });

  // RUN-D: terminal but with a dirty worktree → refused without --force.
  committingRun(root, "RUN-D", "WORK-GC");
  rejectRun(root, "RUN-D", { by: "owner", reason: "dirty" });
  writeFileSync(join(root, ".buildbeat", "worktrees", "RUN-D", "scratch.txt"), "wip\n");

  // RUN-L: still waiting on a human → untouched.
  committingRun(root, "RUN-L", "WORK-GC");

  // A stale per-run lock for a terminal run is collected too.
  mkdirSync(join(root, ".buildbeat", "runtime", "locks", "RUN-M.lock"), { recursive: true });

  const plan = planGc(root);
  const byRun = Object.fromEntries(plan.map((row) => [row.run, row]));
  assert.deepEqual(
    byRun["RUN-M"].actions.map((action) => action.kind).sort(),
    ["delete-branch", "remove-lock", "remove-worktree"],
  );
  assert.match(byRun["RUN-M"].actions.find((action) => action.kind === "delete-branch").reason, /refs\/heads\/main/);
  assert.deepEqual(byRun["RUN-E"].actions.map((action) => action.kind), ["remove-worktree"]);
  assert.match(byRun["RUN-E"].keep[0], /kept: candidate .* reachable only there/);
  assert.equal(byRun["RUN-D"].actions.find((action) => action.kind === "remove-worktree").dirty, true);
  assert.deepEqual(byRun["RUN-L"].actions, []);
  assert.match(byRun["RUN-L"].keep[0], /not terminal \(WAITING_HUMAN\)/);

  // Plan only: nothing changes.
  const planOut = cli(["gc", "--repo", root]);
  assert.match(planOut, /RUN-M \[SUPERSEDED|CANCELLED\]/);
  assert.match(planOut, /plan only: \d+ action\(s\)/);
  assert.ok(existsSync(join(root, ".buildbeat", "worktrees", "RUN-M")));

  const results = applyGc(root, plan);
  const failed = results.filter((row) => !row.done);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].run, "RUN-D");
  assert.match(failed[0].error, /dirty/);

  assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-M")), false);
  assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-E")), false);
  assert.equal(existsSync(join(root, ".buildbeat", "runtime", "locks", "RUN-M.lock")), false);
  assert.ok(existsSync(join(root, ".buildbeat", "worktrees", "RUN-L")));
  assert.ok(existsSync(join(root, ".buildbeat", "worktrees", "RUN-D")));
  const branches = git(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads/run/"]).split("\n").filter(Boolean).sort();
  assert.deepEqual(branches, ["run/RUN-D", "run/RUN-E", "run/RUN-L"]);
  // The evidence candidate is still reachable through its kept branch.
  assert.equal(git(root, ["rev-parse", "run/RUN-E"]), evidenceOnly.state.workspaces["RUN-E"].candidate);
  assert.equal(git(root, ["merge-base", "--is-ancestor", merged.state.workspaces["RUN-M"].candidate, "main"]), "");

  // --force discards the dirty worktree; the ledger was never touched.
  const forced = cli(["gc", "--repo", root, "--apply", "true", "--force", "true"]);
  assert.match(forced, /remove-worktree .*RUN-D: done/);
  assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-D")), false);
  assert.match(cli(["replay", "--repo", root, "--run", "RUN-M"]), /chain OK/);
});
