// Configuration for `buildbeat review` (WORK-CLEAN-START). One file for the
// project, delivery/run-config.yaml, says how a commit is verified and
// reviewed. A work that needs something different writes only that in
// delivery/work/<ID>/run-config.yaml, where it may also narrow the paths the
// work may change (allowedPaths) and name the commit it starts from (base).
// Nothing here drives an agent: there is no builder, fixer, budget, retry or
// stop boundary to configure, and those keys are reported as unknown.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createShellAdapter } from "../adapters/shell.js";
import { parseYamlSubset } from "../engine/yaml-subset.js";
import { loadEnvelope } from "../runtime/envelope.js";
import { PROJECT_CONFIG, workConfigRef } from "../runtime/overview-repos.js";

const PROJECT_KEYS = [
  "workers",
  "envelope",
  "requires",
  "redact",
  "release",
  "requireScreenshot",
  "maxReviewSeverity",
];
const WORK_KEYS = [...PROJECT_KEYS, "allowedPaths", "base"];
const WORKERS = ["verifier", "reviewer"];
const ENVELOPE_KEYS = ["prompts", "vars", "pin"];
const LISTS = ["requires", "redact", "allowedPaths"];

const sha256 = (text) =>
  `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

function isMap(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

export class RunConfigError extends Error {
  constructor(label, problems) {
    super(
      `run config ${label} has ${problems.length} problem(s):\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
    );
    this.name = "RunConfigError";
    this.problems = problems;
  }
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const kept = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = kept;
    }
  }
  return row[b.length];
}

// The closest known name, if it is plausibly what was meant.
function suggest(name, known) {
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

const WORKER_KEYS = ["command", "args", "timeoutMs", "inheritEnv", "env"];

function checkCommandSpec(where, spec) {
  const problems = [];
  if (!isMap(spec)) {
    return [`${where}: must be a map with at least a command`];
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
  if (
    spec.timeoutMs !== undefined &&
    !(typeof spec.timeoutMs === "number" && spec.timeoutMs > 0)
  ) {
    problems.push(
      `${where}.timeoutMs: must be a positive number, got ${JSON.stringify(spec.timeoutMs)}`,
    );
  }
  if (spec.inheritEnv !== undefined && typeof spec.inheritEnv !== "boolean") {
    problems.push(
      `${where}.inheritEnv: must be true or false, got ${JSON.stringify(spec.inheritEnv)} (anything else used to mean false silently)`,
    );
  }
  if (spec.env !== undefined && !isMap(spec.env)) {
    problems.push(`${where}.env: must be a map of NAME -> value`);
  }
  return problems;
}

// `env:` of a worker or of the release readback: variable names mapped to
// scalar values, handed to the command on top of the allowlisted environment.
function workerEnvOverrides(worker, env) {
  if (env === undefined || env === null) {
    return {};
  }
  if (typeof env !== "object" || Array.isArray(env)) {
    throw new Error(
      `workers.${worker}.env must be a mapping of variable names to scalar values`,
    );
  }
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`workers.${worker}.env: invalid variable name ${key}`);
    }
    if (value === null || typeof value === "object") {
      throw new Error(`workers.${worker}.env.${key} must be a scalar`);
    }
    out[key] = String(value);
  }
  return out;
}

function unknownKey(where, key, known) {
  const guess = suggest(key, known);
  return `${where}${key}: unknown key${guess ? ` (did you mean ${guess}?)` : `; known: ${known.join(", ")}`}`;
}

function shapeProblems(config, keys) {
  if (!isMap(config)) {
    return [`the file must be a map of keys (${keys.join(", ")})`];
  }
  const problems = [];
  for (const key of Object.keys(config)) {
    if (!keys.includes(key)) {
      problems.push(unknownKey("", key, keys));
    }
  }
  if (config.workers !== undefined) {
    if (!isMap(config.workers)) {
      problems.push("workers: must be a map of worker name -> { command, args, ... }");
    } else {
      for (const [name, spec] of Object.entries(config.workers)) {
        if (!WORKERS.includes(name)) {
          problems.push(unknownKey("workers.", name, WORKERS));
        } else {
          problems.push(...checkCommandSpec(`workers.${name}`, spec));
        }
      }
    }
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
  for (const key of LISTS) {
    if (config[key] !== undefined && !Array.isArray(config[key])) {
      problems.push(
        `${key}: must be a list (one "- item" per line), got ${JSON.stringify(config[key])}`,
      );
    }
  }
  if (Array.isArray(config.allowedPaths)) {
    config.allowedPaths.forEach((entry, index) => {
      if (typeof entry !== "string" || entry.trim() === "") {
        problems.push(
          `allowedPaths[${index}]: must be a non-empty path, got ${JSON.stringify(entry)}`,
        );
      }
    });
  }
  if (config.release !== undefined) {
    problems.push(...checkCommandSpec("release", config.release));
  }
  if (
    config.requireScreenshot !== undefined &&
    typeof config.requireScreenshot !== "boolean"
  ) {
    problems.push(
      `requireScreenshot: must be true or false, got ${JSON.stringify(config.requireScreenshot)}`,
    );
  }
  if (
    config.maxReviewSeverity !== undefined &&
    !["P2", "P3"].includes(config.maxReviewSeverity)
  ) {
    problems.push("maxReviewSeverity: must be P2 or P3");
  }
  if (
    config.base !== undefined &&
    (typeof config.base !== "string" || config.base.trim() === "")
  ) {
    problems.push(`base: must name a commit, got ${JSON.stringify(config.base)}`);
  }
  return problems;
}

function readConfig(repoRoot, ref, keys) {
  const path = join(repoRoot, ref);
  if (!existsSync(path)) {
    return null;
  }
  let doc;
  try {
    doc = parseYamlSubset(readFileSync(path, "utf8"));
  } catch (error) {
    throw new RunConfigError(ref, [error.message]);
  }
  const problems = shapeProblems(doc, keys);
  if (problems.length > 0) {
    throw new RunConfigError(ref, problems);
  }
  return { doc, dir: dirname(path) };
}

// The project config with the work's overrides applied, as the options the
// runtime takes. A key the work sets replaces the project's; workers are
// replaced one by one, so a work can swap its verifier and keep the
// project's reviewer. Without a work, the project config alone.
export function loadReviewConfig(repoRoot, workId = null) {
  const project = readConfig(repoRoot, PROJECT_CONFIG, PROJECT_KEYS);
  const work = workId ? readConfig(repoRoot, workConfigRef(workId), WORK_KEYS) : null;
  if (!project && !work) {
    throw new Error(
      `no ${PROJECT_CONFIG} in this repository: write one that names workers.verifier and workers.reviewer`,
    );
  }
  const config = {};
  let envelopeDir = null;
  for (const layer of [project, work]) {
    if (!layer) {
      continue;
    }
    const workers = { ...(config.workers ?? {}), ...(layer.doc.workers ?? {}) };
    Object.assign(config, layer.doc, { workers });
    if (layer.doc.envelope !== undefined) {
      envelopeDir = layer.dir;
    }
  }
  const missing = WORKERS.filter((name) => !config.workers[name]);
  if (missing.length > 0) {
    throw new RunConfigError(
      work && !project ? workConfigRef(workId) : PROJECT_CONFIG,
      missing.map((name) => `workers.${name}: required and missing`),
    );
  }

  const adapters = {};
  for (const name of WORKERS) {
    const spec = config.workers[name];
    adapters[name] = createShellAdapter({
      name: `shell:${name}`,
      command: spec.command,
      args: spec.args ?? [],
      timeoutMs: spec.timeoutMs,
      inheritEnv: spec.inheritEnv === true,
      env: workerEnvOverrides(name, spec.env),
    });
  }
  const redact = (config.redact ?? []).map((pattern) => {
    try {
      return new RegExp(String(pattern), "g");
    } catch {
      throw new Error(
        `redact pattern is not a valid regular expression: ${pattern}`,
      );
    }
  });
  // The same frozen checks a run has always carried: an accepted work.md,
  // passed verify evidence on the candidate, no undismissed finding above
  // the floor, screenshots when the work asks for them.
  const checks = {
    artifact: "work",
    requireAcceptance: true,
    requireIntent: false,
    maxSeverity: config.maxReviewSeverity ?? "P2",
    ...(config.requireScreenshot === true ? { requireScreenshot: true } : {}),
  };
  const description = workId ? join(repoRoot, "delivery", "work", workId, "work.md") : null;
  return {
    repoRoot,
    workId,
    // Which files the options came from, for `check` to name.
    files: [project && PROJECT_CONFIG, work && workConfigRef(workId)].filter(Boolean),
    // RUN-<work id without its WORK- prefix>; the runtime numbers each review.
    family: workId ? `RUN-${workId.replace(/^WORK-/, "")}` : null,
    adapters,
    adapterConfigs: config.workers,
    envelope: envelopeDir ? loadEnvelope(config, envelopeDir, WORKERS) : null,
    redact,
    requires: config.requires ?? [],
    release: config.release
      ? { ...config.release, env: workerEnvOverrides("release", config.release.env) }
      : null,
    allowedPaths: config.allowedPaths ?? null,
    base: config.base ?? null,
    deliveryChecks: checks,
    planDigest: description && existsSync(description)
      ? sha256(readFileSync(description, "utf8"))
      : null,
  };
}
