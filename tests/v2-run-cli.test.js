// What the command line prints and records around a review: the state of a
// run, its history, and nothing that only makes sense on this machine.

import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { cli, commit, decide, fixture, review, reviewWith, yaml } from "./support/review.js";

const WORK = "WORK-A";

// The repository is named by its absolute path and the CLI runs elsewhere,
// which is when a host path is most tempting to print.
function assertNoHostPath(text, root, what) {
  for (const path of new Set([root, realpathSync(root)])) {
    assert.equal(text.includes(path), false, `${what} carries the repository's absolute path`);
  }
}

test("review, status, decide and history never print or record the repository's absolute path", () => {
  const { root } = fixture({ prefix: "bb-v2-cli-" });
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });

  const reviewed = review(root);
  assert.equal(reviewed.status, 0, reviewed.all);
  assert.match(reviewed.out, /status: WAITING_HUMAN/);
  assert.match(reviewed.out, /waiting on human: enter-wait-merge/);
  assert.match(reviewed.out, /candidate (?!\(none\))/);
  // Copyable commands name a placeholder instead.
  assert.match(reviewed.out, /buildbeat decide --repo <repo-path> --work WORK-A --action approve/);
  assertNoHostPath(reviewed.all, root, "review output");

  const status = cli(["status", "--repo", root, "--run", "RUN-A-01"]);
  assert.equal(status.status, 0, status.all);
  assert.match(status.out, /^run: RUN-A-01 \(work WORK-A\)$/m);
  assert.match(status.out, /^status: WAITING_HUMAN$/m);
  assert.match(status.out, /^step verify: SUCCEEDED \(attempts 1\)$/m);
  assert.match(status.out, /^step review: SUCCEEDED \(attempts 1\)$/m);
  assert.match(status.out, /^evidence \[passed\/L2\] command \.buildbeat\/runtime\/runs\/RUN-A-01\/logs\/verify-1\.log$/m);
  assertNoHostPath(status.all, root, "status --run");

  const works = cli(["status", "--repo", realpathSync(root)]);
  assert.equal(works.status, 0, works.all);
  assert.match(works.out, /RUN-A-01 \[final-decision\] enter-wait-merge — waiting /);
  assert.match(works.out, /^ {4}next: buildbeat decide --repo <repo-path> --work WORK-A --action approve /m);
  assertNoHostPath(works.all, root, "status");
  const state = JSON.parse(cli(["status", "--repo", root, "--run", "RUN-A-01", "--json"]).out).state;
  assertNoHostPath(JSON.stringify(state), root, "status --run --json");

  const rejected = decide(root, WORK, ["--action", "reject", "--reason", "test-cancel"]);
  assert.equal(rejected.status, 0, rejected.all);
  assert.match(rejected.out, /RUN-A-01 cancelled and compacted/);
  assertNoHostPath(rejected.all, root, "decide output");
  for (const name of ["decisions.jsonl", "review-findings.jsonl", join("runs", "RUN-A-01", "run-record.json")]) {
    let text;
    try {
      text = readFileSync(join(root, "delivery", "work", WORK, name), "utf8");
    } catch (error) {
      // A review that found nothing writes no findings file.
      assert.equal(name, "review-findings.jsonl", error.message);
      continue;
    }
    assertNoHostPath(text, root, name);
  }
  assertNoHostPath(readFileSync(join(root, ".buildbeat", "runtime", "runs", "RUN-A-01", "events.jsonl"), "utf8"), root, "the run ledger");

  const events = cli(["history", "--repo", root, "--run", "RUN-A-01"]);
  assert.equal(events.status, 0, events.all);
  assert.match(events.out, /^1\t.*\tRUN_CREATED\t/m);
  assert.match(events.out, /\tSTEP_FINISHED\tverify$/m);
  assert.match(events.out, /\tRUN_TERMINAL\tCANCELLED$/m);
  assert.match(events.out, /\tRUN_COMPACTED\t/);
  assertNoHostPath(events.all, root, "history");

  const verified = cli(["history", "--repo", root, "--run", "RUN-A-01", "--verify"]);
  assert.equal(verified.status, 0, verified.all);
  assert.match(verified.out, /^chain OK: \d+ events verified \(digest\/prev\/seq\)$/m);
  assert.match(verified.out, /^terminal: CANCELLED \(rejected by owner: test-cancel\)$/m);
  assert.match(verified.out, /^compacted: delivery\/work\/WORK-A\/runs\/RUN-A-01\/run-record\.json$/m);
  assertNoHostPath(verified.all, root, "history --verify");

  const check = cli(["check", "--repo", root, "--work", WORK]);
  assert.equal(check.status, 0, check.all);
  assert.match(check.out, /^ready: commit the change, then buildbeat review --repo <repo-path> --work WORK-A$/m);
  assertNoHostPath(check.all, root, "check");
});

test("the pending list of status names a placeholder when the repository is reached through a symlink", () => {
  const { root } = fixture({ prefix: "bb-v2-cli-" });
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  assert.equal(reviewWith(root, WORK).state.run.status, "WAITING_HUMAN");
  const works = cli(["status", "--repo", root]);
  assert.equal(works.status, 0, works.all);
  assert.match(works.out, /^ {4}next: buildbeat decide --repo <repo-path> --work WORK-A --action approve /m);
  assertNoHostPath(works.all, root, "status");
});

test("status of a run asks for one target and says when a run has no ledger here", () => {
  const { root } = fixture({ prefix: "bb-v2-cli-" });
  const unknown = cli(["status", "--repo", root, "--run", "RUN-A-01"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.err, /^error: no runtime ledger for RUN-A-01; use status --work to read archived records$/m);
  const both = cli(["status", "--repo", root, "--run", "RUN-A-01", "--work", WORK]);
  assert.equal(both.status, 1);
  assert.match(both.err, /status: choose --run or --work/);
  const noRepo = cli(["status"]);
  assert.equal(noRepo.status, 1);
  assert.match(noRepo.err, /status requires --repo/);
  const badWork = cli(["decide", "--repo", root, "--work", "../escape", "--action", "close"]);
  assert.equal(badWork.status, 1);
  assert.match(badWork.err, /--work \.\.\/escape is not a work id/);
  const noAction = cli(["decide", "--repo", root, "--work", WORK]);
  assert.equal(noAction.status, 1);
  assert.match(noAction.err, /decide requires --action approve\|reject, accept\|dismiss with --fingerprint, or close/);
});

// Real incident class: the guide documented `env:` and `inheritEnv`, the
// check reported them, but the loader dropped both before the worker saw
// them, so the run had a different environment than the check described.
test("a worker's env: and inheritEnv reach it as check describes them", async (t) => {
  const hostEnv = { BB_HOST_SECRET: "must-not-leak" };
  const verifier = (lines) => yaml(["workers:", "  verifier:", "    command: bash", ...lines]);
  const run = (root, args) => cli(args, { env: hostEnv, cwd: root });

  await t.test("env: adds variables to the allowlist; host variables stay out", () => {
    const { root } = fixture({
      prefix: "bb-v2-cli-env-",
      workConfig: verifier([
        "    env:", "      BB_PROBE: hello", "      BB_PORT: 8080",
        "    args:", "      - -lc",
        "      - 'test \"$BB_PROBE\" = hello && test \"$BB_PORT\" = 8080 && test -z \"$BB_HOST_SECRET\"'",
      ]),
    });
    commit(root, "add the feature", { "src/feature.txt": "hello\n" });
    const check = run(root, ["check", "--repo", ".", "--work", WORK]);
    assert.equal(check.status, 0, check.all);
    assert.match(check.out, /^ {2}verifier: bash -lc .*\n {4}environment: allowlist; host credentials withheld, plus BB_PROBE, BB_PORT$/m);
    const reviewed = run(root, ["review", "--repo", ".", "--work", WORK]);
    assert.equal(reviewed.status, 0, reviewed.all);
    assert.match(reviewed.out, /step verify: SUCCEEDED/);
    assert.match(reviewed.out, /status: WAITING_HUMAN/);
  });

  await t.test("inheritEnv: true hands over the host's environment, and check says so", () => {
    const { root } = fixture({
      prefix: "bb-v2-cli-env-inherit-",
      workConfig: verifier([
        "    inheritEnv: true",
        "    args:", "      - -lc", "      - 'test \"$BB_HOST_SECRET\" = must-not-leak'",
      ]),
    });
    commit(root, "add the feature", { "src/feature.txt": "hello\n" });
    const check = run(root, ["check", "--repo", ".", "--work", WORK]);
    assert.equal(check.status, 0, check.all);
    assert.match(check.out, /^ {2}verifier: bash -lc .*\n {4}environment: the host's \(inheritEnv: true\)$/m);
    const reviewed = run(root, ["review", "--repo", ".", "--work", WORK]);
    assert.equal(reviewed.status, 0, reviewed.all);
    assert.match(reviewed.out, /step verify: SUCCEEDED/);
  });

  await t.test("a name that is not a variable name is refused", () => {
    const { root } = fixture({
      prefix: "bb-v2-cli-env-bad-",
      workConfig: verifier(["    env:", "      bad-name: x"]),
    });
    const check = run(root, ["check", "--repo", ".", "--work", WORK]);
    assert.equal(check.status, 1);
    assert.match(check.err, /workers\.verifier\.env: invalid variable name bad-name/);
  });
});
