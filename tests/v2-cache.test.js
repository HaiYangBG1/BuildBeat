import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { lastReviewedCandidate } from "../src/v2/runtime/cache.js";
import { startRun } from "../src/v2/runtime/orchestrator.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat-v2.js");
const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-cache-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return root;
}

// A verifier that counts how many times it really ran.
function countingVerifier(root) {
  return createShellAdapter({
    command: "bash",
    args: ["-lc", `echo run >> ${join(root, "verify-count.txt")} && true`],
  });
}

function runWith(root, runId, workId, { builder, verifier, cache }) {
  return startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: "sha256:test",
    workId,
    runId,
    entry: "build",
    stopAt: ["review"],
    adapters: { builder, verifier },
    adapterConfigs: { verifier: { command: "bash", args: ["-lc", "npm test"] } },
    cache,
    supersede: "off",
  });
}

test("verify is reused across runs on an identical tree, never on a different tree or after a failure", () => {
  const root = fixtureRepo();
  const cache = { verify: "tree" };
  const sameTreeBuilder = () =>
    createShellAdapter({ command: "bash", args: ["-lc", "echo same > out.txt && git add -A && git commit -qm candidate"] });

  const first = runWith(root, "RUN-C1", "WORK-C", { builder: sameTreeBuilder(), verifier: countingVerifier(root), cache });
  assert.equal(first.state.run.status, "WAITING_HUMAN");
  const firstLedger = EventLedger.open(first.ledgerPath);
  const firstVerify = firstLedger.state.evidence.find((item) => item.ref.includes("verify-1"));
  assert.match(firstVerify.cacheKey, /^sha256:/);
  assert.equal(firstVerify.reused, undefined);

  // Second run: builder produces the same tree (different commit, same
  // content) → verify is reused, the shell verifier does not run again.
  const second = runWith(root, "RUN-C2", "WORK-C", { builder: sameTreeBuilder(), verifier: countingVerifier(root), cache });
  const secondLedger = EventLedger.open(second.ledgerPath);
  const secondVerify = secondLedger.state.evidence.find((item) => item.ref.includes("verify-1"));
  assert.equal(secondVerify.status, "passed");
  assert.equal(secondVerify.cacheKey, firstVerify.cacheKey);
  assert.equal(secondVerify.reused.run, "RUN-C1");
  assert.equal(readFileSync(join(root, "verify-count.txt"), "utf8").trim(), "run", "verifier ran exactly once across both runs");
  assert.match(readFileSync(join(root, secondVerify.ref), "utf8"), /REUSED: identical tree/);
  const statusOut = execFileSync("node", [CLI, "status", "--repo", root, "--run", "RUN-C2"], { encoding: "utf8" });
  assert.match(statusOut, /verify-1\.log \(reused from RUN-C1\)/);

  // A different tree is verified for real.
  const otherBuilder = createShellAdapter({ command: "bash", args: ["-lc", "echo other > out.txt && git add -A && git commit -qm candidate2"] });
  runWith(root, "RUN-C3", "WORK-C", { builder: otherBuilder, verifier: countingVerifier(root), cache });
  assert.equal(readFileSync(join(root, "verify-count.txt"), "utf8").trim().split("\n").length, 2);

  // A failed verify is never reused: the next identical tree runs again
  // (a third tree, so RUN-C3's pass cannot serve it either).
  const thirdBuilder = createShellAdapter({ command: "bash", args: ["-lc", "echo third > out.txt && git add -A && git commit -qm candidate3"] });
  const failingVerifier = createMockAdapter({ verify: ["fail", "fail"] });
  const failed = runWith(root, "RUN-C4", "WORK-C", { builder: thirdBuilder, verifier: failingVerifier, cache });
  assert.notEqual(failed.state.run.status, "SUCCEEDED");
  runWith(root, "RUN-C5", "WORK-C", { builder: thirdBuilder, verifier: countingVerifier(root), cache });
  assert.equal(readFileSync(join(root, "verify-count.txt"), "utf8").trim().split("\n").length, 3);

  // Without cache configured nothing is reused.
  const plain = runWith(root, "RUN-C6", "WORK-C", { builder: sameTreeBuilder(), verifier: countingVerifier(root), cache: {} });
  const plainVerify = EventLedger.open(plain.ledgerPath).state.evidence.find((item) => item.ref.includes("verify-1"));
  assert.equal(plainVerify.cacheKey, undefined);
  assert.equal(readFileSync(join(root, "verify-count.txt"), "utf8").trim().split("\n").length, 4);
});

test("a reviewer learns the last reviewed ancestor candidate for an incremental review", () => {
  const root = fixtureRepo();
  const builder = createShellAdapter({ command: "bash", args: ["-lc", "echo v1 > f.txt && git add -A && git commit -qm c1"] });
  const verifier = createMockAdapter({ verify: ["succeed"] });
  const seen = [];
  const reviewer = {
    name: "spy-reviewer",
    execute({ input }) {
      seen.push(input);
      const at = new Date().toISOString();
      return { adapter: "spy", command: "spy", exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false, spawnError: null, startedAt: at, finishedAt: at, envelope: { findings: [] } };
    },
  };
  const first = startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: "sha256:test",
    workId: "WORK-R",
    runId: "RUN-R1",
    entry: "build",
    adapters: { builder, verifier, reviewer },
    supersede: "off",
  });
  assert.equal(first.state.pendingHuman.transition, "enter-wait-merge");
  assert.equal(seen[0].lastReviewed, undefined, "first review has no anchor");
  const firstCandidate = first.state.workspaces["RUN-R1"].candidate;

  // Second run builds on top of the reviewed candidate.
  const builder2 = createShellAdapter({ command: "bash", args: ["-lc", `git merge -q --ff-only ${firstCandidate} && echo v2 >> f.txt && git add -A && git commit -qm c2`] });
  const second = startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: "sha256:test",
    workId: "WORK-R",
    runId: "RUN-R2",
    entry: "build",
    adapters: { builder: builder2, verifier: createMockAdapter({ verify: ["succeed"] }), reviewer },
    supersede: "off",
  });
  assert.equal(second.state.pendingHuman.transition, "enter-wait-merge");
  assert.equal(seen[1].lastReviewed.candidate, firstCandidate);
  assert.equal(seen[1].lastReviewed.run, "RUN-R1");
  assert.equal(seen[1].lastReviewed.range, `${firstCandidate}..${second.state.workspaces["RUN-R2"].candidate}`);
  assert.equal(
    lastReviewedCandidate(root, "WORK-R", join(root, ".buildbeat", "worktrees", "RUN-R2"), second.state.workspaces["RUN-R2"].candidate).run,
    "RUN-R1",
  );
  // An unrelated work sees nothing.
  assert.equal(lastReviewedCandidate(root, "WORK-OTHER", join(root, ".buildbeat", "worktrees", "RUN-R2"), second.state.workspaces["RUN-R2"].candidate), null);
  mkdirSync(join(root, "unused"), { recursive: true });
});
