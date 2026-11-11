// How the command line reads flags: switches, values, and what is missing.

import assert from "node:assert/strict";
import test from "node:test";

import { cli, emptyRepo } from "./support/review.js";

test("switches may stand alone or take an explicit true/false", () => {
  const root = emptyRepo("bb-flags-");
  const bare = cli(["status", "--repo", root, "--json"]);
  const explicit = cli(["status", "--repo", root, "--json", "true"]);
  assert.equal(bare.status, 0, bare.err);
  assert.equal(bare.out, explicit.out);
  assert.doesNotThrow(() => JSON.parse(bare.out));
  const off = cli(["status", "--repo", root, "--json", "false"]);
  assert.equal(off.status, 0, off.err);
  assert.throws(() => JSON.parse(off.out));
});

test("a switch may be followed by another flag", () => {
  const root = emptyRepo("bb-flags-");
  const result = cli(["status", "--json", "--repo", root]);
  assert.equal(result.status, 0, result.err);
  assert.doesNotThrow(() => JSON.parse(result.out));
});

test("a flag without its value is named", () => {
  const missing = cli(["check", "--repo"]);
  assert.equal(missing.status, 1);
  assert.match(missing.err, /--repo needs a value/);
  const swallowed = cli(["status", "--repo", "--json"]);
  assert.equal(swallowed.status, 1);
  assert.match(swallowed.err, /--repo needs a value/);
  const stray = cli(["status", "stray"]);
  assert.equal(stray.status, 1);
  assert.match(stray.err, /unexpected argument: stray/);
});
