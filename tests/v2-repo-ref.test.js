import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  normalizeRepoRef,
  resolveRepoRef,
  toRepoRef,
} from "../src/v2/runtime/repo-ref.js";

test("repo refs are stable and repository-relative", () => {
  const root = resolve("/tmp/buildbeat-repo-ref");
  const target = join(root, ".buildbeat", "runtime", "runs", "RUN-1", "events.jsonl");
  assert.equal(toRepoRef(root, root), ".");
  assert.equal(
    toRepoRef(root, target),
    ".buildbeat/runtime/runs/RUN-1/events.jsonl",
  );
  assert.equal(resolveRepoRef(root, ".buildbeat/worktrees/RUN-1"), join(root, ".buildbeat", "worktrees", "RUN-1"));
});

test("legacy absolute refs inside the repository normalize without leaking the host root", () => {
  const root = resolve("/tmp/buildbeat-repo-ref-legacy");
  const legacy = join(root, ".buildbeat", "runtime", "runs", "RUN-OLD", "logs", "verify-1.log");
  assert.equal(
    normalizeRepoRef(root, legacy),
    ".buildbeat/runtime/runs/RUN-OLD/logs/verify-1.log",
  );
  assert.equal(resolveRepoRef(root, legacy), legacy);
});

test("repo refs fail closed on traversal or external absolute paths", () => {
  const root = resolve("/tmp/buildbeat-repo-ref-closed");
  assert.throws(() => toRepoRef(root, "../outside.log"), /outside the repository/);
  assert.throws(() => toRepoRef(root, resolve(root, "..", "outside.log")), /outside the repository/);
  assert.throws(() => resolveRepoRef(root, "../outside.log"), /outside the repository/);
  assert.throws(
    () => resolveRepoRef(root, resolve(root, "..", "outside.log")),
    /outside the repository/,
  );
  assert.throws(() => resolveRepoRef(root, ""), /non-empty string/);
});
