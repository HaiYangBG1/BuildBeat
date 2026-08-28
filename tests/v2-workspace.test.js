import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  WorkspaceError,
  acquireLock,
  createWorkspace,
  pinCandidate,
  readback,
  releaseLock,
  removeWorkspace,
} from "../src/v2/workspace/workspace-manager.js";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-ws-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return { root, base: git(root, ["rev-parse", "HEAD"]) };
}

test("createWorkspace makes an isolated worktree pinned to base", () => {
  const { root, base } = fixtureRepo();
  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-001", base });
  assert.equal(workspace.base, base);
  assert.equal(workspace.branch, "run/RUN-001");
  const state = readback(workspace.worktreePath);
  assert.equal(state.head, base);
  assert.equal(state.dirty, false);
  assert.throws(() => createWorkspace({ repoRoot: root, runId: "RUN-001", base }), WorkspaceError);
});

test("locks are exclusive until released", () => {
  const { root } = fixtureRepo();
  acquireLock(root, "RUN-001");
  assert.throws(() => acquireLock(root, "RUN-001"), WorkspaceError);
  releaseLock(root, "RUN-001");
  acquireLock(root, "RUN-001");
});

test("candidates come from git readback and require a clean tree", () => {
  const { root, base } = fixtureRepo();
  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-002", base });

  writeFileSync(join(workspace.worktreePath, "feature.txt"), "change\n");
  assert.throws(() => pinCandidate(workspace), WorkspaceError, "dirty tree cannot be a candidate");

  git(workspace.worktreePath, ["add", "."]);
  git(workspace.worktreePath, ["commit", "-q", "-m", "candidate"]);
  const candidate = pinCandidate(workspace);
  assert.notEqual(candidate, base);
  assert.equal(candidate, git(workspace.worktreePath, ["rev-parse", "HEAD"]));
});

test("removeWorkspace refuses to destroy a dirty debug state unless forced", () => {
  const { root, base } = fixtureRepo();
  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-003", base });
  writeFileSync(join(workspace.worktreePath, "wip.txt"), "wip\n");
  assert.throws(() => removeWorkspace(workspace), WorkspaceError);
  removeWorkspace(workspace, { force: true });
  assert.equal(existsSync(workspace.worktreePath), false);
  const branches = git(root, ["branch", "--list", "run/RUN-003"]);
  assert.notEqual(branches, "", "run branch is kept so the candidate stays reachable");
});
