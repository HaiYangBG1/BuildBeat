import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const TESTS = import.meta.dirname;

// One full `npm test` used to leave ~150 directories (~24 MB, git worktrees
// included) in $TMPDIR. Test files make temporary directories only through
// tests/support/tmp.js, which removes them when the file finishes.
test("test files create temporary directories only through tempDir()", () => {
  const offenders = readdirSync(TESTS)
    .filter((name) => name.endsWith(".test.js"))
    .filter((name) => /\bmkdtempSync\s*\(/.test(readFileSync(join(TESTS, name), "utf8")));
  assert.deepEqual(offenders, [], "use tempDir() from tests/support/tmp.js instead of mkdtempSync");
});
