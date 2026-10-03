import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  DELIVERY_TEXT,
  WorkflowError,
  loadWorkflow,
  nextStep,
  parseWorkflow,
} from "../src/v2/engine/workflow.js";
import {
  YamlSubsetError,
  parseYamlSubset,
} from "../src/v2/engine/yaml-subset.js";

const PRESET_PATH = join(
  import.meta.dirname,
  "..",
  "src",
  "v2",
  "presets",
  "software-delivery.yaml",
);

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
  assert.equal(workflow.entry, "build");
  assert.ok(workflow.terminal.has("wait-merge"));

  assert.equal(nextStep(workflow, "build", "succeeded"), "verify");
  assert.equal(nextStep(workflow, "verify", "succeeded"), "review");
  assert.equal(nextStep(workflow, "verify", "failed"), "fix");
  assert.equal(nextStep(workflow, "fix", "succeeded"), "verify");
  assert.equal(nextStep(workflow, "review", "findings-blocking"), "fix");
  assert.equal(nextStep(workflow, "review", "succeeded"), "wait-merge");
  assert.equal(nextStep(workflow, "wait-merge", "succeeded"), null);

  assert.deepEqual(
    workflow.steps.map((step) => step.id),
    ["build", "verify", "review", "wait-merge", "fix"],
  );
});

// Each case changes exactly one thing in the accepted fixed workflow, so a
// rejection proves the check it names (a fixture the parser rejects for an
// unrelated reason would pass every case without exercising any of them).
function mutated(from, to) {
  assert.equal(
    DELIVERY_TEXT.split(from).length,
    2,
    `fixture fragment must occur once: ${from}`,
  );
  return DELIVERY_TEXT.replace(from, to);
}

test("workflow validation rejects each change to the fixed delivery workflow for its own reason", () => {
  assert.equal(parseWorkflow(DELIVERY_TEXT).name, "software-delivery");
  const cases = [
    [DELIVERY_TEXT + "extra: field\n", /unknown workflow field extra/],
    [mutated("version: 1", "version: 2"), /expected the fixed software-delivery workflow/],
    [mutated("name: software-delivery", "name: t"), /expected the fixed software-delivery workflow/],
    [mutated("entry: build", "entry: verify"), /workflow entry changed/],
    [mutated("  - id: review\n", "  - id: verify\n"), /delivery step order changed/],
    [mutated("    worker: reviewer\n", "    worker: builder\n"), /delivery role or safeguard changed at review/],
    [mutated("    readonly: true\n", ""), /delivery role or safeguard changed at review/],
    [mutated("    worker: builder\n", "    worker: builder\n    extra: x\n"), /unknown step field extra/],
    [mutated("    worker: verifier\n", "    worker: verifier\n    grade: L9\n"), /grade must be one of L0-L4/],
    [mutated("terminal:\n  - wait-merge\n", "terminal:\n  - review\n"), /delivery terminal changed/],
    [mutated("    on: failed\n    to: fix\n", "    on: failed\n    to: nope\n"), /delivery transitions changed/],
    [mutated("    on: succeeded\n    to: verify\n", "    on: succeeded\n    to: build\n"), /delivery transitions changed/],
    [
      mutated("terminal:\n", "  - from: verify\n    on: failed\n    to: fix\nterminal:\n"),
      /delivery transitions changed/,
    ],
  ];
  for (const [text, reason] of cases) {
    assert.throws(() => parseWorkflow(text), (error) => {
      assert.ok(error instanceof WorkflowError, String(error));
      assert.match(error.message, reason);
      return true;
    });
  }
});

test("fixed workflows reject hidden policies and malformed budgets instead of dropping them", () => {
  assert.throws(
    () => parseWorkflow(DELIVERY_TEXT + "policies:\n  hidden: true\n"),
    /policies are unsupported/,
  );
  assert.throws(
    () =>
      parseWorkflow(
        DELIVERY_TEXT + "budgets:\n  maxAttempts:\n    review: never\n",
      ),
    /invalid workflow attempt budget/,
  );
  const strict = parseWorkflow(
    DELIVERY_TEXT + "budgets:\n  maxAttempts:\n    review: 2\n",
  );
  assert.equal(strict.budgets.maxAttempts.review, 2);
});
