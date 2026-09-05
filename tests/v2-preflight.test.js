// Preflight lane: run one step's worker command in the main checkout with no
// worktree, no ledger and no evidence — the minute-level dry loop that turned
// the deploy campaign's idle phase around, productized without blurring the
// evidence boundary.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat-v2.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-preflight-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "pilot@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-q", "-m", "baseline"]);
  writeFileSync(
    join(root, "run-config.yaml"),
    [
      "repo: .",
      "work: WORK-PF",
      "run: RUN-PF",
      `workflow: ${PRESET}`,
      "requires:",
      "  - command: bash",
      "workers:",
      "  verifier:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - test -f feature.txt",
    ].join("\n"),
  );
  return root;
}

test("preflight runs the step command against the main checkout and writes nothing", () => {
  const root = fixtureRepo();
  const failing = spawnSync(
    "node",
    [CLI, "preflight", "--config", join(root, "run-config.yaml"), "--step", "verify"],
    { encoding: "utf8" },
  );
  assert.equal(failing.status, 1, "the worker's exit code passes through");
  assert.match(failing.stdout, /PREFLIGHT \(dry signal, never evidence\)/);
  assert.match(failing.stdout, /a Run must reproduce this/);
  assert.equal(existsSync(join(root, ".buildbeat", "runtime")), false, "no ledger, no runtime");
  assert.equal(existsSync(join(root, ".buildbeat", "worktrees")), false, "no worktree");

  writeFileSync(join(root, "feature.txt"), "present\n");
  const passing = spawnSync(
    "node",
    [CLI, "preflight", "--config", join(root, "run-config.yaml"), "--step", "verify"],
    { encoding: "utf8" },
  );
  assert.equal(passing.status, 0);
  assert.match(passing.stdout, /preflight exit=0/);
});

test("preflight refuses a step without a configured worker command", () => {
  const root = fixtureRepo();
  const result = spawnSync(
    "node",
    [CLI, "preflight", "--config", join(root, "run-config.yaml"), "--step", "build"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no configured worker command/);
});
