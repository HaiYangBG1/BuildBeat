// One review runs in a repository at a time. A review that finds the
// repository busy says who holds it and records nothing.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { OrchestratorError } from "../src/v2/runtime/orchestrator.js";
import { acquireLock, releaseLock } from "../src/v2/workspace/workspace-manager.js";
import { commit, fixture, git, reviewWith } from "./support/review.js";

test("a review blocked by the repository lock names the process that holds it", () => {
  // Real incident: a session waited 3h23m behind another work's run with
  // only "another run is active" to go on.
  const { root, work } = fixture({ prefix: "bb-v2-lock-" });
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  acquireLock(root, "active-run");
  try {
    assert.throws(
      () => reviewWith(root, work),
      (error) =>
        error instanceof OrchestratorError &&
        /^another review is running in this repository; held by pid \d+ on \S+, acquired \S+.*; that process is still running: wait for it, or end it once you are sure it is stuck$/.test(error.message) &&
        error.message.includes(`pid ${process.pid} `) &&
        !error.message.includes(root),
    );
    // Nothing was recorded and no checkout was made.
    assert.equal(existsSync(join(root, ".buildbeat", "runtime", "runs")), false);
    assert.equal(existsSync(join(root, ".buildbeat", "worktrees")), false);
    assert.equal(git(root, ["branch", "--list", "run/*"]), "");
  } finally {
    releaseLock(root, "active-run");
  }
  // Once the holder is done the same review goes through.
  assert.equal(reviewWith(root, work).state.run.status, "WAITING_HUMAN");
});
