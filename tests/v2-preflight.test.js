// The dry lane before a review: `buildbeat check` reads the run config and
// checks the environment the project requires (requires:), and neither runs
// a worker nor records anything.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { PROJECT_CONFIG, cli, fixture, git, yaml } from "./support/review.js";

const check = (root, extra = []) => cli(["check", "--repo", ".", ...extra], { cwd: root });

function nothingRecorded(root) {
  assert.equal(existsSync(join(root, ".buildbeat")), false, "no ledger, no checkout");
  assert.equal(existsSync(join(root, "delivery", "work", "WORK-A", "runs")), false);
  assert.equal(git(root, ["branch", "--list", "run/*"]), "");
}

test("check reports the environment contract and writes nothing", () => {
  const { root } = fixture({
    prefix: "bb-v2-preflight-",
    projectConfig: PROJECT_CONFIG + yaml([
      "requires:",
      "  - command: git",
      "    min: 1",
      "  - probe: echo redis 7.2.4",
      "    name: redis-version",
      "    expect: redis 7",
    ]),
  });
  const result = check(root, ["--work", "WORK-A"]);
  assert.equal(result.status, 0, result.all);
  assert.match(result.out, /^environment contract \(requires\):$/m);
  assert.match(result.out, /^ {2}git: OK \(\d+\.\d+\.\d+\)$/m);
  assert.match(result.out, /^ {2}redis-version: OK$/m);
  assert.match(result.out, /^ready: commit the change, then buildbeat review --repo \. --work WORK-A$/m);
  // The verifier wants src/feature.txt, which is not there: it was not run.
  nothingRecorded(root);
});

test("check fails on an environment the project requires and does not have, naming every problem", () => {
  const { root } = fixture({
    prefix: "bb-v2-preflight-",
    projectConfig: PROJECT_CONFIG + yaml([
      "requires:",
      "  - command: git",
      "    min: 999",
      "  - command: definitely-not-a-command-xyz",
      "  - command: git",
    ]),
  });
  const result = check(root);
  assert.equal(result.status, 1, result.all);
  assert.match(result.out, /^ {2}PROBLEM git: resolves to \d+\.\d+\.\d+, below required 999$/m);
  assert.match(result.out, /^ {2}PROBLEM definitely-not-a-command-xyz: not runnable in this environment/m);
  assert.match(result.out, /^ {2}git: OK/m);
  assert.doesNotMatch(result.out, /^ready/m);
  nothingRecorded(root);
});

test("check says so when the project declares no environment contract", () => {
  const { root } = fixture({ prefix: "bb-v2-preflight-" });
  const result = check(root);
  assert.equal(result.status, 0, result.all);
  assert.match(result.out, /^environment contract: none declared \(implicit PATH facts stay unchecked\)$/m);
});
