import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

import { tempDir } from "./support/tmp.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
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
  const gc = run(["gc", "--apply", "--repo", root]);
  assert.equal(gc.status, 0, gc.stderr);
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
