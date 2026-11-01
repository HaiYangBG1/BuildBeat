// Deterministic-suite gap fillers (WP5.1): adapter failure shapes end to
// end, the single-active-run repository lock, and changed-path readback.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { OrchestratorError, startRun } from "../src/v2/runtime/orchestrator.js";
import {
  acquireLock,
  createWorkspace,
  listChangedPaths,
  readback,
  releaseLock,
} from "../src/v2/workspace/workspace-manager.js";
import { tempDir } from "./support/tmp.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);
const DIGEST = "sha256:test-workflow";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = tempDir("bb-v2-inv-");
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
    stopAt: ["review"],
    adapters,
    ...overrides,
  });
}

test("a timed-out step is recorded as timeout and fails closed", () => {
  const { root } = fixtureRepo();
  const result = run(
    root,
    "RUN-I1",
    {
      builder: createShellAdapter({ name: "shell:builder", command: "bash", args: ["-c", "sleep 5"] }),
    },
    { stepTimeoutMs: 300 },
  );
  const state = result.state;
  assert.equal(state.steps.build.detail, "timeout");
  // Fails closed: no progress, no fixer; a timeout is a worker-infrastructure
  // failure and stops for a human (iteration 09), not a terminal FAILED.
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.pendingHuman.kind, "infra");
  assert.equal(state.pendingHuman.transition, "resume-build");
  assert.equal(state.workspaces["RUN-I1"].candidate, null, "no candidate pinned");
});

test("an adapter crash leaves a failure fact, never silent progress", () => {
  const { root } = fixtureRepo();
  const result = run(root, "RUN-I2", { builder: createMockAdapter({ build: ["crash"] }) });
  assert.equal(result.state.steps.build.detail, "crashed");
  assert.equal(result.state.run.status, "WAITING_HUMAN");
  assert.equal(result.state.pendingHuman.kind, "infra");
  assert.equal(result.state.steps.build.infraAttempts, 1);
});

test("a spawn error yields unverified evidence and a crashed step", () => {
  const { root } = fixtureRepo();
  const result = run(root, "RUN-I3", {
    builder: createShellAdapter({ name: "shell:builder", command: "definitely-not-a-command-xyz" }),
  });
  const state = result.state;
  assert.equal(state.steps.build.detail, "crashed");
  assert.equal(state.evidence[0].status, "unverified");
});

test("only one run can be active per repository", () => {
  const { root } = fixtureRepo();
  acquireLock(root, "active-run");
  try {
    assert.throws(
      () => run(root, "RUN-I4", { builder: createMockAdapter({ build: ["succeed"] }) }),
      OrchestratorError,
    );
  } finally {
    releaseLock(root, "active-run");
  }
  const result = run(root, "RUN-I4", {
    builder: createMockAdapter({ build: ["succeed"] }),
    verifier: createMockAdapter({ verify: ["succeed"] }),
  });
  assert.equal(result.state.run.status, "WAITING_HUMAN");
});

test("listChangedPaths sees committed and dirty changes relative to base", () => {
  const { root } = fixtureRepo();
  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-I5", base: "HEAD" });
  writeFileSync(join(workspace.worktreePath, "committed.txt"), "a\n");
  git(workspace.worktreePath, ["add", "-A"]);
  git(workspace.worktreePath, ["commit", "-qm", "c"]);
  writeFileSync(join(workspace.worktreePath, "dirty.txt"), "b\n");
  const changed = listChangedPaths(workspace.worktreePath, workspace.base).sort();
  assert.deepEqual(changed, ["committed.txt", "dirty.txt"]);
});

test("listChangedPaths preserves the first dirty tracked path character", () => {
  const { root } = fixtureRepo();
  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-I5A", base: "HEAD" });
  writeFileSync(join(workspace.worktreePath, "README.md"), "changed\n");
  writeFileSync(join(workspace.worktreePath, "z-last.txt"), "dirty\n");
  const changed = listChangedPaths(workspace.worktreePath, workspace.base).sort();
  assert.deepEqual(changed, ["README.md", "z-last.txt"]);
});

test("listChangedPaths reports non-ASCII paths unescaped (real incident: scope check)", () => {
  // git quotepath octal-escapes non-ASCII names by default; the scope check
  // must see the plain UTF-8 path or an in-scope Chinese filename blocks.
  const { root } = fixtureRepo();
  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-I5B", base: "HEAD" });
  const board = join(workspace.worktreePath, "pm");
  mkdirSync(board, { recursive: true });
  writeFileSync(join(board, "登录二期看板.md"), "# 看板\n");
  git(workspace.worktreePath, ["add", "-A"]);
  git(workspace.worktreePath, ["commit", "-qm", "board"]);
  writeFileSync(join(board, "脏文件.md"), "wip\n");
  const changed = listChangedPaths(workspace.worktreePath, workspace.base).sort();
  assert.deepEqual(changed, ["pm/登录二期看板.md", "pm/脏文件.md"]);
  assert.ok(changed.every((path) => path.startsWith("pm/")));
});

// WORK-SCOPE-RENAMES: a move counts on both sides, so a file moved in from
// outside allowedPaths is out of scope; paths are read with -z and whatever
// the user's Git settings say.
function moveFixture(runId) {
  const { root } = fixtureRepo();
  mkdirSync(join(root, "secret"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "secret", "x.txt"), "secret\n");
  writeFileSync(join(root, "src", "y.txt"), "inside\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "files"]);
  return createWorkspace({ repoRoot: root, runId, base: "HEAD" });
}
const changedPaths = (workspace) => listChangedPaths(workspace.worktreePath, workspace.base).sort();

// Runtime Git calls read the global config named here; the empty one is the
// baseline the user's settings must not move.
function withGlobalConfig(text, fn) {
  const saved = process.env.GIT_CONFIG_GLOBAL;
  const path = join(tempDir("bb-v2-gitcfg-"), "config");
  writeFileSync(path, text);
  process.env.GIT_CONFIG_GLOBAL = path;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = saved;
  }
}
const USER_SETTINGS = "[diff]\n\trenames = copies\n[status]\n\trenames = copies\n\tshowUntrackedFiles = no\n";

test("listChangedPaths lists both sides of a committed or a staged move", () => {
  const committed = moveFixture("RUN-I5C");
  git(committed.worktreePath, ["mv", "secret/x.txt", "src/x.txt"]);
  git(committed.worktreePath, ["commit", "-qm", "move in"]);
  assert.deepEqual(withGlobalConfig("", () => changedPaths(committed)), ["secret/x.txt", "src/x.txt"]);
  const staged = moveFixture("RUN-I5D");
  git(staged.worktreePath, ["mv", "secret/x.txt", "src/x.txt"]);
  assert.deepEqual(withGlobalConfig("", () => changedPaths(staged)), ["secret/x.txt", "src/x.txt"]);
});

test("listChangedPaths sees a moved and edited file, a move out of scope and a move inside it", () => {
  const edited = moveFixture("RUN-I5E");
  git(edited.worktreePath, ["mv", "secret/x.txt", "src/x.txt"]);
  writeFileSync(join(edited.worktreePath, "src", "x.txt"), "secret, edited\n");
  assert.deepEqual(withGlobalConfig("", () => changedPaths(edited)), ["secret/x.txt", "src/x.txt"]);
  const out = moveFixture("RUN-I5F");
  git(out.worktreePath, ["mv", "src/y.txt", "secret/y.txt"]);
  assert.deepEqual(withGlobalConfig("", () => changedPaths(out)), ["secret/y.txt", "src/y.txt"]);
  const inside = moveFixture("RUN-I5G");
  git(inside.worktreePath, ["mv", "src/y.txt", "src/z.txt"]);
  git(inside.worktreePath, ["commit", "-qm", "rename inside"]);
  assert.deepEqual(withGlobalConfig("", () => changedPaths(inside)), ["src/y.txt", "src/z.txt"]);
});

test("listChangedPaths and readback read the same whatever the user's rename and untracked settings", () => {
  const workspace = moveFixture("RUN-I5H");
  git(workspace.worktreePath, ["mv", "secret/x.txt", "src/x.txt"]);
  git(workspace.worktreePath, ["commit", "-qm", "move in"]);
  mkdirSync(join(workspace.worktreePath, "newdir", "deep"), { recursive: true });
  writeFileSync(join(workspace.worktreePath, "newdir", "deep", "a.txt"), "new\n");
  writeFileSync(join(workspace.worktreePath, "newdir", "b.txt"), "new\n");
  const plain = withGlobalConfig("", () => ({ paths: changedPaths(workspace), tree: readback(workspace.worktreePath) }));
  // An untracked directory is listed file by file.
  assert.deepEqual(plain.paths, ["newdir/b.txt", "newdir/deep/a.txt", "secret/x.txt", "src/x.txt"]);
  assert.equal(plain.tree.dirty, true);
  assert.deepEqual(withGlobalConfig(USER_SETTINGS, () => changedPaths(workspace)), plain.paths);
  assert.deepEqual(withGlobalConfig(USER_SETTINGS, () => readback(workspace.worktreePath)), plain.tree);

  // A tree whose only change is a new file is not clean under any setting.
  const fresh = moveFixture("RUN-I5I");
  writeFileSync(join(fresh.worktreePath, "new.txt"), "new\n");
  assert.equal(withGlobalConfig(USER_SETTINGS, () => readback(fresh.worktreePath)).dirty, true);
});

test("listChangedPaths keeps names with quotes, tabs, arrows and edge spaces as they are", () => {
  const { root } = fixtureRepo();
  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-I5J", base: "HEAD" });
  mkdirSync(join(workspace.worktreePath, "src"), { recursive: true });
  const committed = ["src/中文.txt", 'src/a"b.txt', "src/tab\there.txt"];
  const untracked = ["src/a -> b.txt", "src/ lead.txt", "src/trail "];
  for (const name of committed) writeFileSync(join(workspace.worktreePath, name), "x\n");
  git(workspace.worktreePath, ["add", "src"]);
  git(workspace.worktreePath, ["commit", "-qm", "odd names"]);
  for (const name of untracked) writeFileSync(join(workspace.worktreePath, name), "x\n");
  assert.deepEqual(withGlobalConfig("", () => changedPaths(workspace)), [...committed, ...untracked].sort());
});

test("a worker that moves a file in from outside the scope stops the run, committed or staged", () => {
  for (const [runId, script] of [
    ["RUN-I5K", "mkdir -p lib && git mv README.md lib/README.md && git commit -qm move"],
    ["RUN-I5L", "mkdir -p lib && git mv README.md lib/README.md"],
  ]) {
    const { root } = fixtureRepo();
    const result = run(
      root,
      runId,
      { builder: createShellAdapter({ name: "shell:builder", command: "bash", args: ["-c", script] }) },
      { allowedPaths: ["lib"] },
    );
    const state = result.state;
    assert.equal(state.run.status, "WAITING_HUMAN", runId);
    assert.match(state.pendingHuman.reasons[0], /outside the allowed scope: README\.md$/, runId);
    assert.equal(state.workspaces[runId].candidate, null, runId);
    assert.ok(state.policyLog.some((row) => row.policy === "workspace.scope" && row.result === "BLOCK"), runId);
  }
});
