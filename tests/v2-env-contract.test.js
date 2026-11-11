// Environment contract (requires:): implicit PATH facts burned real runs
// (a vendored-only rg, /bin/bash 3.2, a shell resolving Node 14). The check
// runs before a review starts and reports every problem at once, fail closed.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { checkRequires } from "../src/v2/runtime/env-contract.js";
import { commit, fixture, git, reviewWith } from "./support/review.js";

// The version target is `git` — the one binary this suite already spawns
// everywhere. Freshly-written executable fixtures or heavyweight children
// (node) made the probe itself time out under a loaded host (macOS assesses
// new executables on first exec), which is not what this test is about.
// The undetectable case probes `git rev-parse` (silent, exit 0 in a repo):
// GNU `true --version` prints a version on Linux, BSD true does not.
test("checkRequires verifies presence and minimum versions, reporting all problems", () => {
  const result = checkRequires([
    { command: "git", min: "1" },
    { command: "git", min: "999" },
    { command: "definitely-not-a-command-xyz" },
    { command: "git", versionFlag: "rev-parse", min: "1.0" },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.checked.length, 1, "only the satisfiable entry passes");
  assert.match(result.checked[0].version, /^\d+\.\d+\.\d+$/);
  assert.equal(result.problems.length, 3);
  assert.match(result.problems[0], /below required 999/);
  assert.match(result.problems[1], /not runnable/);
  assert.match(result.problems[2], /version undetectable.*fail closed/);
});

test("a review refuses to start when the environment contract is not satisfied", () => {
  const { root, work } = fixture({ prefix: "bb-v2-env-" });
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  assert.throws(
    () => reviewWith(root, work, { requires: [{ command: "definitely-not-a-command-xyz" }] }),
    /environment contract not satisfied/,
  );
  // Refused before anything was recorded or checked out.
  assert.equal(existsSync(join(root, ".buildbeat")), false);
  assert.equal(existsSync(join(root, "delivery", "work", work, "runs")), false);
  assert.equal(git(root, ["branch", "--list", "run/*"]), "");
});

test("requires probes check environment facts, not just binary versions", () => {
  const ok = checkRequires([
    { probe: "echo redis 7.2.4", expect: "redis 7\\.[0-9]+", name: "redis-version" },
    { probe: "true", name: "reachable" },
  ]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.checked.map((row) => row.command), ["redis-version", "reachable"]);
  const bad = checkRequires([
    { probe: "echo redis 6.2.0", expect: "redis 7\\.", name: "redis-version" },
    { probe: "exit 3", name: "port" },
    { probe: "echo x", expect: "(", name: "regex" },
  ]);
  assert.equal(bad.ok, false);
  assert.match(bad.problems[0], /redis-version: probe output does not match/);
  assert.match(bad.problems[1], /port: probe exited 3/);
  assert.match(bad.problems[2], /regex: expect .* not a valid regular expression/);
});
