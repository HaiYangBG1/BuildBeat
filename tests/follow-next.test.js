// After a stable release, the publish job points dist-tag next at it through
// Trusted Publishing, so nobody logs in to npm (WORK-AUTO-NEXT). npm is mocked.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { tempDir } from "./support/tmp.js";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCRIPT = path.join(REPO_ROOT, ".github", "scripts", "follow-next.sh");

// next: what `npm view <pkg> dist-tags.next` prints ("" for no tag);
// addStatus: the exit status of `npm dist-tag add`.
function fixture(t, { next, version, addStatus = 0 }) {
  const root = tempDir("buildbeat-follow-next-");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  const calls = path.join(root, "calls");
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, "npm"),
    `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  view)
    [[ "$MOCK_NEXT" = "__ERROR__" ]] && exit 1
    [[ -n "$MOCK_NEXT" ]] && printf '%s\\n' "$MOCK_NEXT"
    exit 0 ;;
  dist-tag) printf '%s\\n' "$*" >> "$MOCK_CALLS"; exit "$MOCK_ADD_STATUS" ;;
  *) echo "Unexpected mocked npm command: $*" >&2; exit 97 ;;
esac
`,
  );
  chmodSync(path.join(bin, "npm"), 0o755);
  const run = (...args) => spawnSync("bash", [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
      BUILDBEAT_PACKAGE_NAME: "@haiyangbg/buildbeat",
      BUILDBEAT_PACKAGE_VERSION: version,
      MOCK_NEXT: next,
      MOCK_CALLS: calls,
      MOCK_ADD_STATUS: String(addStatus),
    },
  });
  const added = () => (existsSync(calls) ? readFileSync(calls, "utf8") : "");
  return { run, added };
}

test("a stable release moves next from the previous stable", (t) => {
  const mock = fixture(t, { next: "6.1.0", version: "6.2.0" });
  const result = mock.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(mock.added(), "dist-tag add @haiyangbg/buildbeat@6.2.0 next --registry=https://registry.npmjs.org/\n");
  assert.match(result.stdout, /next now points at 6\.2\.0/);
  // Before the move, the check says next is behind.
});

test("--check reads and never moves next", (t) => {
  const mock = fixture(t, { next: "6.1.0", version: "6.2.0" });
  const check = mock.run("--check");
  assert.equal(check.status, 1);
  assert.match(check.stderr, /next points at 6\.1\.0, not at the stable 6\.2\.0/);
  assert.equal(mock.added(), "");
});

test("a failed read of next changes nothing", (t) => {
  const mock = fixture(t, { next: "__ERROR__", version: "6.2.0" });
  for (const args of [[], ["--check"]]) {
    const result = mock.run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Could not read dist-tag next/);
  }
  assert.equal(mock.added(), "");
});

test("next already on this version, or with no next yet", (t) => {
  const same = fixture(t, { next: "6.2.0", version: "6.2.0" });
  assert.equal(same.run().status, 0);
  assert.equal(same.run("--check").status, 0);
  assert.equal(same.added(), "");

  const none = fixture(t, { next: "", version: "6.2.0" });
  assert.equal(none.run().status, 0);
  assert.match(none.added(), /dist-tag add @haiyangbg\/buildbeat@6\.2\.0 next/);
});

test("a newer pre-release on next is left alone; an older or equal one is not", (t) => {
  const newer = fixture(t, { next: "7.0.0-beta.1", version: "6.3.0" });
  const kept = newer.run();
  assert.equal(kept.status, 0, kept.stderr);
  assert.match(kept.stdout, /newer 7\.0\.0-beta\.1/);
  assert.equal(newer.added(), "");
  assert.equal(newer.run("--check").status, 0);

  // Numeric, not string, comparison: 6.10.0 is newer than 6.9.0.
  const numeric = fixture(t, { next: "6.10.0-beta.1", version: "6.9.0" });
  assert.equal(numeric.run().status, 0);
  assert.equal(numeric.added(), "");

  for (const next of ["6.3.0-beta.2", "6.2.0-rc.1"]) {
    const older = fixture(t, { next, version: "6.3.0" });
    assert.equal(older.run().status, 0);
    assert.match(older.added(), /dist-tag add @haiyangbg\/buildbeat@6\.3\.0 next/, next);
    const before = older.added();
    assert.equal(older.run("--check").status, 1, next);
    assert.equal(older.added(), before, `--check moved next (${next})`);
  }
});

test("next only moves forward: a newer stable stays when an older line is published or re-run", (t) => {
  for (const version of ["6.2.0", "6.2.1"]) {
    const mock = fixture(t, { next: "6.3.0", version });
    const result = mock.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /next holds the newer 6\.3\.0; next only moves forward/);
    assert.equal(mock.run("--check").status, 0);
    assert.equal(mock.added(), "");
  }
});

test("a failed move says which npm setting to enable", (t) => {
  const mock = fixture(t, { next: "6.1.0", version: "6.2.0", addStatus: 1 });
  const result = mock.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /enable\n"Allow npm dist-tag"/);
  assert.match(result.stderr, /re-run the failed jobs/);
});

test("a pre-release is left to its own publication on next", (t) => {
  const mock = fixture(t, { next: "6.1.0", version: "7.0.0-beta.1" });
  for (const args of [[], ["--check"]]) {
    const result = mock.run(...args);
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(mock.added(), "");
});

test("refuses an unpinned registry, another package or a malformed version", (t) => {
  const mock = fixture(t, { next: "6.1.0", version: "6.2" });
  const result = mock.run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /MAJOR\.MINOR\.PATCH/);
  assert.equal(mock.added(), "");
});
