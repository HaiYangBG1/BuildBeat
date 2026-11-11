import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  REVIEW_STEPS,
  WORKFLOW_DIGEST,
  WORKFLOW_NAME,
  WORKFLOW_TEXT,
} from "../src/engine/workflow.js";
import {
  YamlSubsetError,
  parseYamlSubset,
} from "../src/engine/yaml-subset.js";
import { commit, fixture, reviewWith } from "./support/review.js";

test("yaml subset parses maps, lists, and scalar types", () => {
  const doc = parseYamlSubset(
    [
      "kind: workflow",
      "version: 1",
      "flag: true",
      "nothing: null",
      'quoted: "a: b"',
      "nested:",
      "  inner: value",
      "items:",
      "  - plain",
      "  - id: one",
      "    count: 2",
      "scripts:",
      "  - 'echo a: b && run: c'",
    ].join("\n"),
  );
  assert.deepEqual(doc, {
    kind: "workflow",
    version: 1,
    flag: true,
    nothing: null,
    quoted: "a: b",
    nested: { inner: "value" },
    items: ["plain", { id: "one", count: 2 }],
    scripts: ["echo a: b && run: c"],
  });
});

test("yaml subset fails closed on unsupported syntax", () => {
  const bad = [
    "a:\tb",
    "a: &anchor",
    "a: [1, 2]",
    "a: |",
    "a: 1\na: 2",
    "a: 1 # trailing",
    "---\na: 1",
  ];
  for (const text of bad) {
    assert.throws(() => parseYamlSubset(text), YamlSubsetError, text);
  }
});

test("the fixed workflow is verify, a read-only review, then the person's decision", () => {
  assert.deepEqual(parseYamlSubset(WORKFLOW_TEXT), {
    kind: "workflow",
    version: 2,
    name: WORKFLOW_NAME,
    steps: [
      { id: "verify", worker: "verifier" },
      { id: "review", worker: "reviewer", readonly: true },
      { id: "wait-merge" },
    ],
  });
  assert.equal(WORKFLOW_NAME, "software-delivery");
  // The steps a run executes are the steps the text names, in that order.
  assert.deepEqual(
    REVIEW_STEPS.map(({ id, worker, readonly }) => ({ id, worker, readonly })),
    [
      { id: "verify", worker: "verifier", readonly: false },
      { id: "review", worker: "reviewer", readonly: true },
    ],
  );
  assert.equal(
    WORKFLOW_DIGEST,
    `sha256:${createHash("sha256").update(WORKFLOW_TEXT, "utf8").digest("hex")}`,
  );
});

test("a run pins the fixed workflow by name and digest and walks its steps in order", () => {
  const { root } = fixture({ prefix: "bb-workflow-" });
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const seen = [];
  const { state } = reviewWith(root, "WORK-A", {
    verifier: { name: "v", envMode: "allowlist", execute: (args) => (seen.push(args.step), ok()) },
    reviewer: { name: "r", envMode: "allowlist", execute: (args) => (seen.push(args.step), { ...ok(), envelope: { findings: [] } }) },
  });
  assert.deepEqual(seen, ["verify", "review"]);
  assert.equal(state.run.workflowRef, WORKFLOW_NAME);
  assert.equal(state.run.workflowDigest, WORKFLOW_DIGEST);
  assert.equal(state.run.entry, "verify");
  assert.equal(state.position, "wait-merge");
  assert.equal(state.pendingHuman.transition, "enter-wait-merge");
});

function ok() {
  const at = new Date().toISOString();
  return { adapter: "t", command: "t", exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false, spawnError: null, startedAt: at, finishedAt: at };
}
