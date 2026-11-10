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
import { DELIVERY_TEXT, deliveryWorkflow } from "../engine/workflow.js";
import { parseYamlSubset } from "../engine/yaml-subset.js";
import { deliveryChecks } from "../policy/policy.js";
import { loadEnvelope } from "../runtime/envelope.js";
import { PROJECT_CONFIG } from "../runtime/overview-repos.js";
import {
  RunConfigError,
  checkCommandSpec,
  suggest,
  workerEnvOverrides,
} from "./run-config-check.js";

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

export const workConfigRef = (workId) => `delivery/work/${workId}/run-config.yaml`;

const sha256 = (text) =>
  `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

function isMap(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
// project's reviewer.
export function loadPassConfig(repoRoot, workId) {
  const project = readConfig(repoRoot, PROJECT_CONFIG, PROJECT_KEYS);
  const work = readConfig(repoRoot, workConfigRef(workId), WORK_KEYS);
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
  const description = join(repoRoot, "delivery", "work", workId, "work.md");
  return {
    repoRoot,
    workId,
    // RUN-<work id without its WORK- prefix>; the runtime numbers each review.
    family: `RUN-${workId.replace(/^WORK-/, "")}`,
    workflow: deliveryWorkflow(),
    workflowDigest: sha256(DELIVERY_TEXT),
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
    policies: deliveryChecks(checks),
    riskPreset: "standard",
    planDigest: existsSync(description)
      ? sha256(readFileSync(description, "utf8"))
      : null,
  };
}
