// Temporary directories for tests. Every directory made here is removed
// when the test file finishes, whatever its assertions did: without this,
// one full `npm test` left ~150 directories (~24 MB, git worktrees
// included) in $TMPDIR. Test files use tempDir() instead of mkdtempSync;
// tests/v2-test-hygiene.test.js keeps it that way.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";

const created = [];

after(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

export function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}
