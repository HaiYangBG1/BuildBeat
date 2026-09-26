import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { tempDir } from "./support/tmp.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

function repo() {
  const root = tempDir("bb-flags-");
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  return root;
}

test("switches may stand alone or take an explicit true/false", () => {
  const root = repo();
  const bare = run(["metrics", "--repo", root, "--json"]);
  const explicit = run(["metrics", "--repo", root, "--json", "true"]);
  assert.equal(bare.status, 0, bare.stderr);
  assert.equal(bare.stdout, explicit.stdout);
  assert.doesNotThrow(() => JSON.parse(bare.stdout));
  const off = run(["metrics", "--repo", root, "--json", "false"]);
  assert.equal(off.status, 0, off.stderr);
  assert.throws(() => JSON.parse(off.stdout));
});

test("a switch may be followed by another flag", () => {
  const root = repo();
  const result = run(["overview", "--json", "--repo", root]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotThrow(() => JSON.parse(result.stdout));
});

test("a bare --apply really applies the gc plan", () => {
  const root = repo();
  execFileSync("git", ["-C", root, "-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "base"]);
  const envelope = '      - \'require("node:fs").writeFileSync(process.env.BUILDBEAT_OUTPUT, JSON.stringify({status: "succeeded", findings: []}))\'';
  const config = join(root, "run-config.yaml");
  writeFileSync(config, [
    "repo: .", "work: WORK-G", "run: RUN-G", `workflow: ${PRESET}`, "riskPreset: fast", "entry: build",
    "stopAt:", "  - review", "workers:",
    "  builder:", `    command: ${process.execPath}`, "    args:", "      - -e", envelope,
    "  verifier:", `    command: ${process.execPath}`, "    args:", "      - -e", "      - '0'",
    "  reviewer:", `    command: ${process.execPath}`, "    args:", "      - -e", envelope,
  ].join("\n"));
  assert.equal(run(["start", "--config", config, "--attempt", "new"]).status, 0);
  assert.equal(run(["stop", "--repo", root, "--run", "RUN-G-01", "--reason", "done with it"]).status, 0);
  const worktree = join(root, ".buildbeat", "worktrees", "RUN-G-01");
  assert.equal(existsSync(worktree), true);

  const plan = run(["gc", "--repo", root]);
  assert.match(plan.stdout, /plan only: .*rerun with --apply to execute/);
  assert.equal(existsSync(worktree), true, "a plan without --apply must not remove anything");

  const applied = run(["gc", "--repo", root, "--apply"]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /gc applied: \d+\/\d+ action\(s\)/);
  assert.equal(existsSync(worktree), false, "a bare --apply removes the terminal run's worktree");
});

test("a flag without its value is named", () => {
  const missing = run(["doctor", "--config"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /--config needs a value/);
  const swallowed = run(["overview", "--repo", "--json"]);
  assert.match(swallowed.stderr, /--repo needs a value/);
  const stray = run(["overview", "stray"]);
  assert.match(stray.stderr, /unexpected argument: stray/);
});
