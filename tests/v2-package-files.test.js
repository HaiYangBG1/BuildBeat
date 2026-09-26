import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(import.meta.dirname, "..");

// The package ships docs/ by whitelist (docs/history and docs/releases stay
// in the repository). The expected list is the published 3.1.0 package plus
// the SKILL.md reference files under docs/v2/skill/. A change here is a
// release decision: regenerate tests/support/package-files.txt on purpose
// (npm pack --dry-run --json) and say why in the Changelog.
test("the packed file list is exactly the expected list", () => {
  const packed = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
  )[0].files.map((file) => file.path).sort();
  const expected = readFileSync(join(ROOT, "tests", "support", "package-files.txt"), "utf8").trim().split("\n");
  const missing = expected.filter((path) => !packed.includes(path));
  const extra = packed.filter((path) => !expected.includes(path));
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] });
});
