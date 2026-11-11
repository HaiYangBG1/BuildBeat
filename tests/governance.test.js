// What a worker is not given: the host's environment, and a way to push.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { createShellAdapter } from "../src/adapters/shell.js";
import { createWorkspace } from "../src/workspace/workspace-manager.js";
import { commit, emptyRepo, git } from "./support/review.js";
import { tempDir } from "./support/tmp.js";

test("workers get an env allowlist by default; inherit is an explicit opt-in", () => {
  process.env.BB_TEST_SECRET = "s3cret-token";
  try {
    const workspace = tempDir("bb-env-");
    const probe = (config) =>
      createShellAdapter({ name: "probe", command: "bash", ...config }).execute({
        step: "verify",
        worker: "verifier",
        workspacePath: workspace,
        input: {},
      });

    const isolated = probe({ args: ["-c", 'printf "%s" "${BB_TEST_SECRET:-ABSENT}"'] });
    assert.equal(isolated.stdout, "ABSENT", "host secret must not reach the worker");

    const inherited = probe({
      args: ["-c", 'printf "%s" "${BB_TEST_SECRET:-ABSENT}"'],
      inheritEnv: true,
    });
    assert.equal(inherited.stdout, "s3cret-token", "inherit is available but explicit");

    const input = probe({ args: ["-c", 'printf "%s" "$BUILDBEAT_INPUT"'] });
    assert.match(input.stdout, /\{\}/, "BUILDBEAT_INPUT is always provided");
  } finally {
    delete process.env.BB_TEST_SECRET;
  }
});

test("a worker cannot push from the workspace; the main checkout still can", () => {
  const root = emptyRepo("bb-gov-");
  commit(root, "baseline", { "README.md": "fixture\n" });
  const bare = tempDir("bb-remote-");
  execFileSync("git", ["init", "-q", "--bare", bare]);
  git(root, ["remote", "add", "origin", bare]);

  const workspace = createWorkspace({ repoRoot: root, runId: "RUN-G4", base: "HEAD" });
  assert.deepEqual(workspace.protectedRemotes, ["origin"]);

  assert.throws(
    () => git(workspace.worktreePath, ["push", "origin", "HEAD"]),
    /protected|does not appear|unable/i,
    "push from inside the workspace is capability-blocked",
  );
  git(root, ["push", "-q", "origin", "main"]);
  assert.equal(git(bare, ["rev-parse", "main"]), git(root, ["rev-parse", "main"]));
});
