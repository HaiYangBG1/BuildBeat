// A worker that hangs or cannot start: the shell adapter says so, and the
// review ends CANCELLED, which is no verdict on the commit.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { formatMs } from "../src/v2/runtime/hints.js";
import { commit, fixture, record, reviewWith, statusRow, worker } from "./support/review.js";
import { tempDir } from "./support/tmp.js";

test("the shell adapter returns the worker's exit code, stdout and stderr", () => {
  const root = tempDir("bb-v2-live-");
  const adapter = createShellAdapter({ command: "bash", args: ["-lc", "echo plain; echo warn >&2; exit 3"] });
  const result = adapter.execute({ step: "verify", worker: "verifier", workspacePath: root, input: {} });
  assert.equal(result.exitCode, 3);
  assert.equal(result.stdout.trim(), "plain");
  assert.equal(result.stderr.trim(), "warn");
  assert.equal(result.timedOut, false);
  assert.equal(result.spawnError, null);
});

test("the shell adapter reports a worker that outlives its timeout, and one that cannot start", () => {
  const root = tempDir("bb-v2-live-");
  const slow = createShellAdapter({ command: process.execPath, args: ["-e", "setTimeout(() => {}, 20000)"], timeoutMs: 300 });
  const hung = slow.execute({ step: "verify", worker: "verifier", workspacePath: root, input: {} });
  assert.equal(hung.timedOut, true);
  assert.equal(hung.spawnError, null);
  const missing = createShellAdapter({ command: "no-such-command-bb-test" });
  const failed = missing.execute({ step: "verify", worker: "verifier", workspacePath: root, input: {} });
  assert.equal(failed.timedOut, false);
  assert.match(failed.spawnError, /ENOENT/);
});

test("a worker that times out or crashes ends the review CANCELLED, not FAILED", async (t) => {
  const cases = {
    "the verifier times out": {
      workers: { verifier: worker({ exitCode: null, signal: "SIGTERM", timedOut: true }) },
      reason: /worker infrastructure failure at verify: timeout; not a candidate defect/,
    },
    "the verifier cannot be started": {
      workers: { verifier: worker({ exitCode: null, spawnError: "spawn nope ENOENT" }) },
      reason: /worker infrastructure failure at verify: crashed; not a candidate defect/,
    },
    "the verifier is killed by a signal": {
      workers: { verifier: worker({ exitCode: null, signal: "SIGKILL" }) },
      reason: /worker infrastructure failure at verify: crashed; not a candidate defect/,
    },
    "the reviewer times out": {
      workers: { reviewer: worker({ exitCode: null, signal: "SIGTERM", timedOut: true }) },
      reason: /worker infrastructure failure at review: timeout; not a candidate defect/,
    },
  };
  for (const [name, { workers, reason }] of Object.entries(cases)) {
    await t.test(name, () => {
      const { root, work } = fixture();
      commit(root, "add the feature", { "src/feature.txt": "hello\n" });
      const result = reviewWith(root, work, workers);
      assert.equal(result.state.terminal.status, "CANCELLED");
      assert.match(result.state.terminal.reason, reason);
      assert.equal(result.state.pendingHuman, null);
      assert.equal(record(root, work, result.runId).terminal.status, "CANCELLED");
      assert.equal(existsSync(join(root, ".buildbeat", "worktrees", result.runId)), false);
    });
  }
});

test("a plain non-zero verify is a failure of the commit, not tool trouble", () => {
  const { root, work } = fixture();
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const result = reviewWith(root, work, { verifier: worker({ exitCode: 1, stderr: "1 test failed" }) });
  assert.equal(result.state.terminal.status, "FAILED");
  assert.equal(result.state.steps.review, undefined);
});

test("after a timed-out review the same commit can be reviewed again", () => {
  const { root, work } = fixture();
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const first = reviewWith(root, work, { verifier: worker({ exitCode: null, signal: "SIGTERM", timedOut: true }) });
  assert.equal(first.state.terminal.status, "CANCELLED");
  const second = reviewWith(root, work);
  assert.notEqual(second.runId, first.runId);
  assert.equal(second.state.run.status, "WAITING_HUMAN");
  const row = statusRow(root, work);
  assert.equal(row.latest.id, second.runId);
  assert.equal(row.stage, "MERGE_DECISION");
});

test("formatMs renders human durations", () => {
  assert.equal(formatMs(0), "0s");
  assert.equal(formatMs(59_000), "59s");
  assert.equal(formatMs(61_000), "1m");
  assert.equal(formatMs(3_600_000), "1h");
  assert.equal(formatMs(3_900_000), "1h05m");
  assert.equal(formatMs(null), "?");
});
