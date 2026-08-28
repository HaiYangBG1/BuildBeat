// Minimal workflow parser per docs/v2/RFC-0003-workflow-policy.md §1.
// The kernel is phase-agnostic: business steps come entirely from the
// workflow file. Movement combines the declared step order (each step chains
// to the next on "succeeded") with explicit transitions, which override the
// default edge for the same (from, on) pair. Unknown fields are rejected.

import { readFileSync } from "node:fs";

import { parseYamlSubset } from "./yaml-subset.js";

export class WorkflowError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkflowError";
  }
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const TOP_FIELDS = new Set([
  "kind",
  "version",
  "name",
  "entry",
  "steps",
  "transitions",
  "terminal",
  "policies",
  "budgets",
]);
const STEP_FIELDS = new Set(["id", "worker", "optional", "requiredWhen", "readonly"]);
const TRANSITION_FIELDS = new Set(["from", "on", "to"]);

function rejectUnknownFields(object, allowed, where) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new WorkflowError(`unknown field "${key}" in ${where}`);
    }
  }
}

function requireId(value, where) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new WorkflowError(`${where} must be a lowercase id, got: ${JSON.stringify(value)}`);
  }
  return value;
}

export function parseWorkflow(text) {
  const doc = parseYamlSubset(text);
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new WorkflowError("workflow document must be a map");
  }
  rejectUnknownFields(doc, TOP_FIELDS, "workflow");
  if (doc.kind !== "workflow") {
    throw new WorkflowError(`kind must be "workflow", got: ${JSON.stringify(doc.kind)}`);
  }
  if (doc.version !== 1) {
    throw new WorkflowError(`unsupported workflow version: ${JSON.stringify(doc.version)}`);
  }
  const name = requireId(doc.name, "name");
  if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
    throw new WorkflowError("steps must be a non-empty list");
  }

  const steps = [];
  const stepIds = new Set();
  for (const raw of doc.steps) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new WorkflowError("each step must be a map");
    }
    rejectUnknownFields(raw, STEP_FIELDS, `step ${JSON.stringify(raw.id)}`);
    const id = requireId(raw.id, "step id");
    if (stepIds.has(id)) {
      throw new WorkflowError(`duplicate step id: ${id}`);
    }
    if (raw.worker !== undefined) {
      requireId(raw.worker, `step ${id} worker`);
    }
    if (raw.optional !== undefined && typeof raw.optional !== "boolean") {
      throw new WorkflowError(`step ${id} optional must be a boolean`);
    }
    if (raw.readonly !== undefined && typeof raw.readonly !== "boolean") {
      throw new WorkflowError(`step ${id} readonly must be a boolean`);
    }
    stepIds.add(id);
    steps.push({
      id,
      worker: raw.worker ?? null,
      optional: raw.optional ?? false,
      requiredWhen: raw.requiredWhen ?? null,
      readonly: raw.readonly ?? false,
    });
  }

  const entry = requireId(doc.entry, "entry");
  if (!stepIds.has(entry)) {
    throw new WorkflowError(`entry references unknown step: ${entry}`);
  }
  if (!Array.isArray(doc.terminal) || doc.terminal.length === 0) {
    throw new WorkflowError("terminal must be a non-empty list");
  }
  const terminal = new Set();
  for (const id of doc.terminal) {
    if (!stepIds.has(id)) {
      throw new WorkflowError(`terminal references unknown step: ${id}`);
    }
    terminal.add(id);
  }

  const edges = new Map();
  const explicit = doc.transitions ?? [];
  if (!Array.isArray(explicit)) {
    throw new WorkflowError("transitions must be a list");
  }
  for (const raw of explicit) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new WorkflowError("each transition must be a map");
    }
    rejectUnknownFields(raw, TRANSITION_FIELDS, "transition");
    const from = requireId(raw.from, "transition from");
    const to = requireId(raw.to, "transition to");
    if (!stepIds.has(from) || !stepIds.has(to)) {
      throw new WorkflowError(`transition references unknown step: ${from} -> ${to}`);
    }
    if (typeof raw.on !== "string" || raw.on.length === 0) {
      throw new WorkflowError(`transition ${from} -> ${to} needs a non-empty "on"`);
    }
    const key = `${from}|${raw.on}`;
    if (edges.has(key)) {
      throw new WorkflowError(`duplicate transition for (${from}, ${raw.on})`);
    }
    edges.set(key, to);
  }

  for (const [index, step] of steps.entries()) {
    const key = `${step.id}|succeeded`;
    if (terminal.has(step.id) || edges.has(key)) {
      continue;
    }
    const next = steps[index + 1];
    if (next) {
      edges.set(key, next.id);
    }
  }

  const outgoing = new Map();
  for (const [key, to] of edges) {
    const from = key.split("|")[0];
    if (!outgoing.has(from)) {
      outgoing.set(from, []);
    }
    outgoing.get(from).push(to);
  }

  const reachable = new Set([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const to of outgoing.get(current) ?? []) {
      if (!reachable.has(to)) {
        reachable.add(to);
        queue.push(to);
      }
    }
  }
  const reachesTerminal = new Set(terminal);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [from, targets] of outgoing) {
      if (!reachesTerminal.has(from) && targets.some((to) => reachesTerminal.has(to))) {
        reachesTerminal.add(from);
        grew = true;
      }
    }
  }
  for (const id of reachable) {
    if (!reachesTerminal.has(id)) {
      throw new WorkflowError(`step "${id}" has no path to a terminal step`);
    }
  }

  return {
    name,
    entry,
    steps,
    stepIds,
    terminal,
    edges,
    policies: doc.policies ?? [],
    budgets: doc.budgets ?? {},
  };
}

export function loadWorkflow(filePath) {
  return parseWorkflow(readFileSync(filePath, "utf8"));
}

export function nextStep(workflow, from, outcome) {
  return workflow.edges.get(`${from}|${outcome}`) ?? null;
}
