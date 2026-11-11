// Failure shapes of a real command end to end, one review per repository at
// a time, and what counts as a changed path.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { OrchestratorError } from "../src/v2/runtime/orchestrator.js";
import {
  acquireLock,
  createWorkspace,
  listChangedPaths,
  readback,
  releaseLock,
} from "../src/v2/workspace/workspace-manager.js";
import { commit, emptyRepo, fixture, git, reviewWith } from "./support/review.js";
import { tempDir } from "./support/tmp.js";

function fixtureRepo() {
  const root = emptyRepo("bb-v2-inv-");
  commit(root, "baseline", { "README.md": "fixture\n" });
  return { root };
}

function reviewed({ verifier, allowedPaths = null, files = { "src/feature.txt": "hello\n" } }) {
  const { root, work } = fixture({ prefix: "bb-v2-inv-" });
  const sha = commit(root, "add the feature", files);
  const result = reviewWith(root, work, { verifier, allowedPaths });
  return { root, sha, ...result };
}

test("a verifier that times out is recorded as timeout and ends the run without a verdict", () => {
  const { state } = reviewed({
    verifier: createShellAdapter({ name: "shell:verifier", command: "bash", args: ["-c", "sleep 5"], timeoutMs: 300 }),
  });
  assert.equal(state.steps.verify.detail, "timeout");
  assert.equal(state.terminal.status, "CANCELLED");
  assert.match(state.terminal.reason, /worker infrastructure failure at verify: timeout; not a candidate defect/);
  assert.equal(state.steps.review, undefined, "nothing was reviewed");
  assert.equal(state.evidence[0].status, "failed");
});

test("a verifier that cannot be started leaves unverified evidence and a crashed step", () => {
  const { state } = reviewed({
    verifier: createShellAdapter({ name: "shell:verifier", command: "definitely-not-a-command-xyz" }),
  });
  assert.equal(state.steps.verify.detail, "crashed");
  assert.equal(state.evidence[0].status, "unverified");
  assert.equal(state.terminal.status, "CANCELLED");
  assert.equal(state.steps.review, undefined);
});

test("only one review runs in a repository at a time", () => {
  const { root, work } = fixture({ prefix: "bb-v2-inv-" });
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  acquireLock(root, "active-run");
  try {
    assert.throws(
      () => reviewWith(root, work),
      (error) => error instanceof OrchestratorError && /another review is running in this repository/.test(error.message),
    );
  } finally {
    releaseLock(root, "active-run");
  }
  // The refused review recorded nothing, so the run id is still free.
  const result = reviewWith(root, work);
  assert.equal(result.runId, "RUN-A-01");
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

// A move counts on both sides, so a file moved in from outside allowedPaths
// is out of scope; paths are read with -z and whatever the user's Git
// settings say.
function moveFixture(runId) {
  const { root } = fixtureRepo();
  commit(root, "files", { "secret/x.txt": "secret\n", "src/y.txt": "inside\n" });
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

test("a file moved in from outside the scope fails the review, moved by the commit or staged by the verifier", () => {
  const scopeFailure = (state) => {
    assert.equal(state.terminal.status, "FAILED");
    assert.match(state.terminal.reason, /outside the allowed scope: tools\/reviewer\.sh$/);
    assert.ok(state.policyLog.some((row) => row.policy === "workspace.scope" && row.result === "BLOCK"));
    assert.equal(state.steps.review, undefined, "nothing was reviewed");
    assert.equal(state.pendingHuman, null);
  };
  // The commit itself moves tools/reviewer.sh into src/.
  const { root, work } = fixture({ prefix: "bb-v2-inv-" });
  mkdirSync(join(root, "src"));
  git(root, ["mv", "tools/reviewer.sh", "src/reviewer.sh"]);
  commit(root, "move in");
  scopeFailure(reviewWith(root, work, { allowedPaths: ["src"] }).state);

  // The commit is in scope; the verifier stages the move in the checkout.
  const staged = reviewed({
    allowedPaths: ["src"],
    verifier: createShellAdapter({ name: "shell:verifier", command: "bash", args: ["-c", "git mv tools/reviewer.sh src/reviewer.sh"] }),
  });
  scopeFailure(staged.state);
  assert.equal(git(staged.root, ["rev-parse", "HEAD"]), staged.sha);
});
