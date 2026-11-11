// The temporary checkout a review runs in, and the locks around it.

import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  WorkspaceError,
  acquireLock,
  createWorkspace,
  discardWorkspace,
  readback,
  releaseLock,
} from "../src/v2/workspace/workspace-manager.js";
import { commit, emptyRepo, git } from "./support/review.js";

function fixtureRepo() {
  const root = emptyRepo("bb-v2-ws-");
  const base = commit(root, "baseline", { "README.md": "fixture\n" });
  return { root, base };
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

test("a workspace for a review is checked out at the commit, which must come after base", () => {
  const { root, base } = fixtureRepo();
  const sha = commit(root, "change", { "feature.txt": "change\n" });
  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-002", base, at: sha });
  assert.equal(workspace.base, base);
  assert.equal(readback(workspace.worktreePath).head, sha);
  // The main checkout stays where it was.
  assert.equal(git(root, ["rev-parse", "--abbrev-ref", "HEAD"]), "main");

  assert.throws(
    () => createWorkspace({ repoRoot: root, runId: "RUN-003", base, at: base }),
    /nothing to review: \w{7} is the base itself/,
  );
  assert.throws(
    () => createWorkspace({ repoRoot: root, runId: "RUN-004", base: sha, at: base }),
    /does not come after base/,
  );
  assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-003")), false);
  assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-004")), false);
});

test("locks are exclusive until released", () => {
  const { root } = fixtureRepo();
  acquireLock(root, "RUN-001");
  assert.throws(() => acquireLock(root, "RUN-001"), WorkspaceError);
  releaseLock(root, "RUN-001");
  acquireLock(root, "RUN-001");
});

test("readback reports a new file as a dirty tree", () => {
  const { root, base } = fixtureRepo();
  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-005", base });
  writeFileSync(join(workspace.worktreePath, "feature.txt"), "change\n");
  assert.deepEqual(readback(workspace.worktreePath), { head: base, dirty: true });
});

test("discardWorkspace removes the checkout and its branch, dirty or not, so the run id is free again", () => {
  const { root, base } = fixtureRepo();
  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-006", base });
  writeFileSync(join(workspace.worktreePath, "wip.txt"), "wip\n");
  discardWorkspace(workspace);
  assert.equal(existsSync(workspace.worktreePath), false);
  assert.equal(git(root, ["branch", "--list", "run/RUN-006"]), "");
  createWorkspace({ repoRoot: root, runId: "RUN-006", base });
});
