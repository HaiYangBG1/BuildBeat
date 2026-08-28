import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { WorkflowError, loadWorkflow, nextStep, parseWorkflow } from "../src/v2/engine/workflow.js";
import { YamlSubsetError, parseYamlSubset } from "../src/v2/engine/yaml-subset.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

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

test("the official software-delivery preset loads with the expected graph", () => {
  const workflow = loadWorkflow(PRESET_PATH);
  assert.equal(workflow.name, "software-delivery");
  assert.equal(workflow.entry, "intent");
  assert.ok(workflow.terminal.has("wait-merge"));

  assert.equal(nextStep(workflow, "build", "succeeded"), "verify");
  assert.equal(nextStep(workflow, "verify", "succeeded"), "review");
  assert.equal(nextStep(workflow, "verify", "failed"), "fix");
  assert.equal(nextStep(workflow, "fix", "succeeded"), "verify");
  assert.equal(nextStep(workflow, "review", "findings-blocking"), "fix");
  assert.equal(nextStep(workflow, "review", "succeeded"), "wait-merge");
  assert.equal(nextStep(workflow, "wait-merge", "succeeded"), null);

  const spec = workflow.steps.find((step) => step.id === "spec");
  assert.equal(spec.optional, true);
  assert.equal(spec.requiredWhen, "ui-delivery");
});

function minimalDoc(overrides = "") {
  return [
    "kind: workflow",
    "version: 1",
    "name: t",
    "entry: a",
    "steps:",
    "  - id: a",
    "    worker: w",
    "  - id: b",
    "terminal:",
    "  - b",
    overrides,
  ]
    .filter(Boolean)
    .join("\n");
}

test("workflow validation rejects malformed documents", () => {
  assert.throws(() => parseWorkflow(minimalDoc("extra: field")), WorkflowError, "unknown field");
  assert.throws(
    () => parseWorkflow(minimalDoc().replace("version: 1", "version: 2")),
    WorkflowError,
    "unsupported version",
  );
  assert.throws(
    () => parseWorkflow(minimalDoc().replace("entry: a", "entry: nope")),
    WorkflowError,
    "unknown entry",
  );
  assert.throws(
    () => parseWorkflow(minimalDoc().replace("  - id: b", "  - id: a")),
    WorkflowError,
    "duplicate step id",
  );
  assert.throws(
    () =>
      parseWorkflow(
        minimalDoc(["transitions:", "  - from: a", "    on: failed", "    to: nope"].join("\n")),
      ),
    WorkflowError,
    "unknown transition target",
  );
  assert.throws(
    () =>
      parseWorkflow(
        minimalDoc(
          [
            "transitions:",
            "  - from: a",
            "    on: failed",
            "    to: b",
            "  - from: a",
            "    on: failed",
            "    to: b",
          ].join("\n"),
        ),
      ),
    WorkflowError,
    "duplicate (from, on)",
  );
});

test("a cycle with no path to terminal is rejected", () => {
  const doc = [
    "kind: workflow",
    "version: 1",
    "name: t",
    "entry: a",
    "steps:",
    "  - id: a",
    "  - id: b",
    "  - id: c",
    "transitions:",
    "  - from: a",
    "    on: succeeded",
    "    to: b",
    "  - from: b",
    "    on: succeeded",
    "    to: a",
    "terminal:",
    "  - c",
  ].join("\n");
  assert.throws(() => parseWorkflow(doc), WorkflowError);
});
