// Fixed delivery graph. Legacy official files are decoded only to preserve
// their exact pinned digest and safeguards; arbitrary workflow authoring is retired.
import { readFileSync } from "node:fs";
import { parseYamlSubset } from "./yaml-subset.js";

export class WorkflowError extends Error {}
export const DELIVERY_TEXT = `kind: workflow
version: 1
name: software-delivery
entry: build
steps:
  - id: build
    worker: builder
  - id: verify
    worker: verifier
  - id: review
    worker: reviewer
    readonly: true
  - id: wait-merge
  - id: fix
    worker: fixer
transitions:
  - from: verify
    on: failed
    to: fix
  - from: fix
    on: succeeded
    to: verify
  - from: review
    on: findings-blocking
    to: fix
terminal:
  - wait-merge
`;
const CORE = ["build", "verify", "review", "wait-merge", "fix"];
const LEGACY = ["intent", "spec", "plan", ...CORE];
const ROLES = {
  intent: "planner",
  spec: "planner",
  plan: "planner",
  build: "builder",
  verify: "verifier",
  review: "reviewer",
  fix: "fixer",
};
const EDGES = new Map([
  ["build|succeeded", "verify"],
  ["verify|succeeded", "review"],
  ["verify|failed", "fix"],
  ["review|succeeded", "wait-merge"],
  ["review|findings-blocking", "fix"],
  ["fix|succeeded", "verify"],
]);
const RETIRED =
  "custom workflows and the release lane are retired; finish active runs with 3.3.1, then migrate using docs/MIGRATION.md";
function reject(detail) {
  throw new WorkflowError(`${detail}; ${RETIRED}`);
}
export function parseWorkflow(text) {
  const doc = parseYamlSubset(text);
  if (
    !doc ||
    doc.kind !== "workflow" ||
    doc.version !== 1 ||
    doc.name !== "software-delivery"
  )
    reject("expected the fixed software-delivery workflow");
  for (const key of Object.keys(doc))
    if (
      ![
        "kind",
        "version",
        "name",
        "entry",
        "steps",
        "transitions",
        "terminal",
        "budgets",
        "policies",
      ].includes(key)
    )
      reject(`unknown workflow field ${key}`);
  if (!Array.isArray(doc.steps)) reject("steps must be a list");
  const ids = doc.steps.map((step) => step?.id);
  const legacy = JSON.stringify(ids) === JSON.stringify(LEGACY);
  if (!legacy && JSON.stringify(ids) !== JSON.stringify(CORE))
    reject("delivery step order changed");
  if (doc.entry !== (legacy ? "intent" : "build"))
    reject("workflow entry changed");
  if (JSON.stringify(doc.terminal) !== '["wait-merge"]')
    reject("delivery terminal changed");
  if (
    doc.policies !== undefined &&
    (!Array.isArray(doc.policies) || doc.policies.length)
  )
    reject("workflow policies are unsupported");
  if (doc.budgets !== undefined) {
    if (
      !doc.budgets ||
      typeof doc.budgets !== "object" ||
      Array.isArray(doc.budgets) ||
      Object.keys(doc.budgets).some((key) => key !== "maxAttempts")
    )
      reject("unsupported workflow budget");
    const attempts = doc.budgets.maxAttempts ?? {};
    if (
      !attempts ||
      typeof attempts !== "object" ||
      Array.isArray(attempts) ||
      Object.entries(attempts).some(
        ([step, value]) =>
          !ids.includes(step) || !Number.isInteger(value) || value < 1,
      )
    )
      reject("invalid workflow attempt budget");
  }
  const steps = doc.steps.map((raw) => {
    for (const key of Object.keys(raw))
      if (
        ![
          "id",
          "worker",
          "readonly",
          "optional",
          "requiredWhen",
          "grade",
        ].includes(key)
      )
        reject(`unknown step field ${key}`);
    const spec = legacy && raw.id === "spec";
    if (
      (raw.worker ?? null) !== (ROLES[raw.id] ?? null) ||
      (raw.readonly ?? false) !== (raw.id === "review") ||
      (raw.optional ?? false) !== spec ||
      (raw.requiredWhen ?? null) !== (spec ? "ui-delivery" : null)
    )
      reject(`delivery role or safeguard changed at ${raw.id}`);
    if (
      raw.grade !== undefined &&
      !["L0", "L1", "L2", "L3", "L4"].includes(raw.grade)
    )
      reject("grade must be one of L0-L4");
    return {
      id: raw.id,
      worker: raw.worker ?? null,
      readonly: raw.id === "review",
      optional: spec,
      requiredWhen: raw.requiredWhen ?? null,
      grade: raw.grade ?? "L2",
    };
  });
  const expected = new Map([
    ["verify|failed", "fix"],
    ["fix|succeeded", "verify"],
    ["review|findings-blocking", "fix"],
  ]);
  if (
    !Array.isArray(doc.transitions) ||
    doc.transitions.length !== expected.size
  )
    reject("delivery transitions changed");
  const seen = new Set();
  for (const row of doc.transitions) {
    if (!row || typeof row !== "object" || Array.isArray(row))
      reject("invalid delivery transition");
    const key = `${row.from}|${row.on}`;
    if (
      Object.keys(row).some((key) => !["from", "on", "to"].includes(key)) ||
      expected.get(key) !== row.to ||
      seen.has(key)
    )
      reject("delivery transitions changed");
    seen.add(key);
  }
  const edges = new Map(EDGES);
  if (legacy) {
    edges.set("intent|succeeded", "spec");
    edges.set("spec|succeeded", "plan");
    edges.set("plan|succeeded", "build");
  }
  return {
    name: doc.name,
    entry: doc.entry,
    steps,
    stepIds: new Set(ids),
    terminal: new Set(["wait-merge"]),
    edges,
    policies: [],
    budgets: doc.budgets ?? {},
  };
}
export function loadWorkflow(filePath) {
  return parseWorkflow(readFileSync(filePath, "utf8"));
}
export function deliveryWorkflow() {
  return parseWorkflow(DELIVERY_TEXT);
}
export function nextStep(workflow, from, outcome) {
  return workflow.edges.get(`${from}|${outcome}`) ?? null;
}
