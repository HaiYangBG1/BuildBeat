// The whole round on a real test project, with shell workers: the session's
// first commit carries a bug and a real test run fails it; the session's fix
// is a second commit, which the same test run passes and a read-only
// reviewer reads; a person approves that commit. Nothing is merged.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { approveReview } from "../src/v2/runtime/decisions.js";
import { sha256Text } from "../src/v2/policy/policy.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { addWork, commit, emptyRepo, git, record, reviewWith } from "./support/review.js";

test("a planted bug fails verify; the fixed commit is verified, reviewed and approved", () => {
  const root = emptyRepo("bb-v2-mvp-");
  commit(root, "baseline", {
    ".gitignore": ".buildbeat/\n",
    "test/calc.test.js": [
      'import assert from "node:assert/strict";',
      'import test from "node:test";',
      'import { add } from "../lib.js";',
      'test("add", () => { assert.equal(add(2, 2), 4); });',
      "",
    ].join("\n"),
  });
  const work = "WORK-MVP";
  const base = addWork(root, work, { text: "# Implement add()\n\n## Goal\nlib.js exports add(a, b).\n" });
  const planDigest = sha256Text(readFileSync(join(root, "delivery", "work", work, "work.md"), "utf8"));
  const workers = {
    verifier: createShellAdapter({
      name: "shell:verifier",
      command: "bash",
      // NODE_TEST_CONTEXT is unset because this test itself runs under
      // node --test; an inherited test-runner context would make the child
      // runner report to the parent harness and exit 0 on failure.
      args: ["-lc", "unset NODE_TEST_CONTEXT; node --test test/calc.test.js"],
    }),
    reviewer: createShellAdapter({
      name: "shell:reviewer",
      command: "bash",
      args: ["-lc", 'printf \'{"findings":[]}\' > "$BUILDBEAT_OUTPUT"'],
    }),
  };

  // add() subtracts.
  const buggy = commit(root, "add lib.js", { "lib.js": "export function add(a, b) { return a - b; }\n" });
  const red = reviewWith(root, work, workers);
  assert.equal(red.runId, "RUN-MVP-01");
  assert.equal(red.state.terminal.status, "FAILED");
  assert.match(red.state.terminal.reason, /^verify failed \(exit 1\)$/);
  assert.equal(red.state.steps.review, undefined, "a commit that fails verify is not reviewed");
  assert.deepEqual(red.state.evidence.map((item) => [item.kind, item.status, item.subject]), [["command", "failed", buggy]]);
  assert.equal(record(root, work, "RUN-MVP-01").terminal.status, "FAILED");

  const fixed = commit(root, "fix add()", { "lib.js": "export function add(a, b) { return a + b; }\n" });
  const green = reviewWith(root, work, workers);
  const state = green.state;
  assert.equal(green.runId, "RUN-MVP-02");
  assert.equal(state.run.status, "WAITING_HUMAN");
  assert.equal(state.pendingHuman.kind, "final-decision");
  assert.equal(state.steps.verify.attempts, 1);
  assert.equal(state.steps.review.attempts, 1);
  assert.equal(state.workspaces["RUN-MVP-02"].base, base);
  assert.equal(state.workspaces["RUN-MVP-02"].candidate, fixed);
  assert.equal(state.run.planDigest, planDigest, "the accepted work.md is pinned");
  assert.equal(state.pendingHuman.subject.planDigest, planDigest);
  assert.equal(state.pendingHuman.subject.candidate, fixed);
  assert.deepEqual(
    state.evidence.map((item) => [item.kind, item.status, item.subject]),
    [["command", "passed", fixed], ["command", "passed", fixed], ["review", "passed", fixed]],
  );

  const approved = approveReview(root, work, { candidate: fixed, by: "owner", as: "human" });
  assert.equal(approved.runId, "RUN-MVP-02");
  assert.equal(approved.state.terminal.status, "SUCCEEDED");
  assert.ok(approved.state.compacted);
  assert.ok(existsSync(join(root, "delivery", "work", work, "runs", "RUN-MVP-02", "run-record.json")));

  // The whole story replays deterministically from the ledger alone.
  const reopened = EventLedger.open(green.ledgerPath);
  assert.equal(reopened.corruption, null);
  assert.deepEqual(reopened.state, approved.state);

  // Nothing was merged or moved: the branch is where the session left it.
  assert.equal(git(root, ["rev-parse", "HEAD"]), fixed);
  assert.equal(git(root, ["branch", "--list", "run/*"]), "");
});
