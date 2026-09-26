// Run-config validation. The loader used to accept almost anything: a
// missing `repo` surfaced as Node's "paths[1] must be of type string", a
// misspelled key (`stopat`) or worker (`reviwer`) was silently ignored, and
// `inheritEnv: yes` quietly meant false. Run configs are mostly written by
// AI sessions, so every problem is reported at once, naming the key, what is
// wrong and the closest valid spelling, before anything runs.

const TOP_KEYS = [
  "repo",
  "work",
  "run",
  "workflow",
  "riskPreset",
  "base",
  "entry",
  "stopAt",
  "stepTimeoutMs",
  "maxAttemptsPerStep",
  "allowedPaths",
  "budgets",
  "cache",
  "envelope",
  "requires",
  "workers",
  "policies",
  "redact",
  "reviewTriage",
  "supersede",
  "stallAfterMs",
  "parallel",
];
const REQUIRED = ["repo", "work", "run", "workflow"];
const NULL_REPORTED = ["base", "entry", "riskPreset", "stepTimeoutMs", "maxAttemptsPerStep"];
const WORKER_KEYS = ["command", "args", "timeoutMs", "inheritEnv", "env"];
const ENVELOPE_KEYS = ["prompts", "vars", "pin"];
const LISTS = ["stopAt", "allowedPaths", "policies", "redact", "requires"];
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class RunConfigError extends Error {
  constructor(label, problems) {
    super(`run config ${label} has ${problems.length} problem(s):\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "RunConfigError";
    this.problems = problems;
  }
}

function isMap(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const kept = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = kept;
    }
  }
  return row[b.length];
}

// The closest known name, if it is plausibly what was meant.
export function suggest(name, known) {
  const lower = String(name).toLowerCase();
  const exact = known.find((candidate) => candidate.toLowerCase() === lower);
  if (exact) {
    return exact;
  }
  let best = null;
  let bestDistance = 3;
  for (const candidate of known) {
    const d = distance(lower, candidate.toLowerCase());
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

function unknownKey(where, key, known) {
  const guess = suggest(key, known);
  return `${where}${key}: unknown key${guess ? ` (did you mean ${guess}?)` : `; known: ${known.join(", ")}`}`;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

// First pass: everything that does not need the workflow. Runs right after
// parsing, so a missing `repo` is reported by name instead of crashing path
// resolution.
export function checkRunConfigShape(config) {
  if (!isMap(config)) {
    return ["the file must be a map of keys (repo, work, run, workflow, workers, ...)"];
  }
  const problems = [];
  for (const key of Object.keys(config)) {
    if (!TOP_KEYS.includes(key)) {
      problems.push(unknownKey("", key, TOP_KEYS));
    }
  }
  for (const key of REQUIRED) {
    if (config[key] === undefined || config[key] === null) {
      problems.push(`${key}: required and missing`);
    }
  }
  // An explicit null on a scalar key (base: null, entry: ~) would silently
  // fall back to the default: say so. Other keys keep their own handling
  // (cache: null has always meant no cache; lists must be lists).
  for (const key of NULL_REPORTED) {
    if (Object.hasOwn(config, key) && config[key] === null) {
      problems.push(`${key}: has no value; remove the line to use the default, or give it a value`);
    }
  }
  for (const key of ["repo", "workflow", "riskPreset", "base", "entry"]) {
    const value = config[key];
    if (value !== undefined && value !== null && !nonEmptyString(value)) {
      problems.push(`${key}: must be a non-empty string, got ${JSON.stringify(value)}`);
    }
  }
  for (const key of ["work", "run"]) {
    const value = config[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value !== "string") {
      problems.push(`${key}: must be a string, got ${JSON.stringify(value)} (quote it, e.g. ${key}: "${value}")`);
    } else if (!ID.test(value) || value.includes("..") || value.length > 100) {
      problems.push(`${key}: "${value}" may only use letters, digits, ".", "_" and "-", start with a letter or digit, contain no "..", and be at most 100 characters (it becomes part of paths and branch names)`);
    }
  }
  if (config.parallel !== undefined && typeof config.parallel !== "boolean") {
    problems.push(`parallel: must be true or false, got ${JSON.stringify(config.parallel)}`);
  }
  for (const key of ["stepTimeoutMs", "maxAttemptsPerStep"]) {
    if (config[key] !== undefined && !positiveInteger(config[key])) {
      problems.push(`${key}: must be a positive integer, got ${JSON.stringify(config[key])}`);
    }
  }
  for (const key of LISTS) {
    if (config[key] !== undefined && !Array.isArray(config[key])) {
      problems.push(`${key}: must be a list (one "- item" per line), got ${JSON.stringify(config[key])}`);
    }
  }
  if (Array.isArray(config.allowedPaths)) {
    config.allowedPaths.forEach((entry, index) => {
      if (!nonEmptyString(entry)) {
        problems.push(`allowedPaths[${index}]: must be a non-empty path, got ${JSON.stringify(entry)}`);
      }
    });
  }
  if (config.envelope !== undefined) {
    if (!isMap(config.envelope)) {
      problems.push("envelope: must be a map (prompts, vars, pin)");
    } else {
      for (const key of Object.keys(config.envelope)) {
        if (!ENVELOPE_KEYS.includes(key)) {
          problems.push(unknownKey("envelope.", key, ENVELOPE_KEYS));
        }
      }
    }
  }
  if (config.workers === undefined || config.workers === null) {
    problems.push("workers: required and missing (at least the verifier; see templates/v2/run-config.example.yaml)");
  } else if (!isMap(config.workers)) {
    problems.push("workers: must be a map of worker name -> { command, args, ... }");
  } else {
    for (const [name, spec] of Object.entries(config.workers)) {
      const where = `workers.${name}`;
      if (!isMap(spec)) {
        problems.push(`${where}: must be a map with at least a command`);
        continue;
      }
      for (const key of Object.keys(spec)) {
        if (!WORKER_KEYS.includes(key)) {
          problems.push(unknownKey(`${where}.`, key, WORKER_KEYS));
        }
      }
      if (!nonEmptyString(spec.command)) {
        problems.push(`${where}.command: required, a non-empty string`);
      }
      if (spec.args !== undefined && !Array.isArray(spec.args)) {
        problems.push(`${where}.args: must be a list (one "- arg" per line)`);
      }
      if (spec.timeoutMs !== undefined && !(typeof spec.timeoutMs === "number" && spec.timeoutMs > 0)) {
        problems.push(`${where}.timeoutMs: must be a positive number, got ${JSON.stringify(spec.timeoutMs)}`);
      }
      if (spec.inheritEnv !== undefined && typeof spec.inheritEnv !== "boolean") {
        problems.push(`${where}.inheritEnv: must be true or false, got ${JSON.stringify(spec.inheritEnv)} (anything else used to mean false silently)`);
      }
      if (spec.env !== undefined && !isMap(spec.env)) {
        problems.push(`${where}.env: must be a map of NAME -> value`);
      }
    }
  }
  return problems;
}

// Second pass, once the workflow is loaded: names that must exist in it.
export function checkRunConfigAgainstWorkflow(config, workflow) {
  const problems = [];
  const steps = [...workflow.stepIds];
  const workers = [...new Set(workflow.steps.map((step) => step.worker).filter(Boolean))];
  for (const name of Object.keys(isMap(config.workers) ? config.workers : {})) {
    if (!workers.includes(name)) {
      const guess = suggest(name, workers);
      problems.push(`workers.${name}: no step of the workflow uses this worker${guess ? ` (did you mean ${guess}?)` : ""}; workers in this workflow: ${workers.join(", ")}`);
    }
  }
  for (const step of Array.isArray(config.stopAt) ? config.stopAt : []) {
    if (!workflow.stepIds.has(step)) {
      const guess = suggest(step, steps);
      problems.push(`stopAt: "${step}" is not a step of the workflow${guess ? ` (did you mean ${guess}?)` : ""}; steps: ${steps.join(", ")}`);
    }
  }
  if (config.entry !== undefined && config.entry !== null && !workflow.stepIds.has(config.entry)) {
    const guess = suggest(config.entry, steps);
    problems.push(`entry: "${config.entry}" is not a step of the workflow${guess ? ` (did you mean ${guess}?)` : ""}; steps: ${steps.join(", ")}`);
  }
  return problems;
}
