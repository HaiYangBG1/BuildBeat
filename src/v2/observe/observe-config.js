// observe.yaml loader per docs/v2/RFC-0003-workflow-policy.md §8 (frozen
// shape, block form — the strict YAML subset rejects inline {}/[]). Fail
// closed: any shape violation is an error, never a default.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import {
  OBSERVE_BAND_LEVELS,
  OBSERVE_SEVERITIES,
  TRIAGE_ACTIONS,
} from "../domain/model.js";
import { parseYamlSubset } from "../engine/yaml-subset.js";

export class ObserveConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ObserveConfigError";
  }
}

const WHEN_PATTERN = /^severity\s*>=\s*(info|warn|error|critical)$/;

export function severityRank(severity) {
  const rank = OBSERVE_SEVERITIES.indexOf(severity);
  if (rank === -1) {
    throw new ObserveConfigError(`unknown severity: ${severity}`);
  }
  return rank;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ObserveConfigError(`${label} must be a non-empty string`);
  }
  return value;
}

function parseSeverityMap(raw, providerId) {
  const map = { failed: "error", unverified: "warn" };
  if (raw === undefined) {
    return map;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ObserveConfigError(`provider ${providerId}: severity must be a map`);
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key !== "failed" && key !== "unverified") {
      throw new ObserveConfigError(`provider ${providerId}: severity.${key} is not a known key`);
    }
    if (!OBSERVE_SEVERITIES.includes(value)) {
      throw new ObserveConfigError(
        `provider ${providerId}: severity.${key} must be one of ${OBSERVE_SEVERITIES.join("|")}`,
      );
    }
    map[key] = value;
  }
  return map;
}

function parseProvider(raw, index) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ObserveConfigError(`providers[${index}] must be a map`);
  }
  const id = requireString(raw.id, `providers[${index}].id`);
  const command = requireString(raw.command, `provider ${id}: command`);
  const args = raw.args ?? [];
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string" && typeof arg !== "number")) {
    throw new ObserveConfigError(`provider ${id}: args must be a list of scalars`);
  }
  if (raw.evidence === null || typeof raw.evidence !== "object" || Array.isArray(raw.evidence)) {
    throw new ObserveConfigError(`provider ${id}: evidence must be a map with kind and subject`);
  }
  const evidence = {
    kind: requireString(raw.evidence.kind, `provider ${id}: evidence.kind`),
    subject: requireString(raw.evidence.subject, `provider ${id}: evidence.subject`),
  };
  let diagnose = null;
  if (raw.diagnose !== undefined) {
    if (raw.diagnose === null || typeof raw.diagnose !== "object" || Array.isArray(raw.diagnose)) {
      throw new ObserveConfigError(`provider ${id}: diagnose must be a map with command`);
    }
    const diagnoseArgs = raw.diagnose.args ?? [];
    if (!Array.isArray(diagnoseArgs)) {
      throw new ObserveConfigError(`provider ${id}: diagnose.args must be a list`);
    }
    diagnose = {
      command: requireString(raw.diagnose.command, `provider ${id}: diagnose.command`),
      args: diagnoseArgs.map((arg) => String(arg)),
      timeoutMs: raw.diagnose.timeoutMs,
    };
  }
  return {
    id,
    command,
    args: args.map((arg) => String(arg)),
    schedule: raw.schedule === undefined ? "manual" : String(raw.schedule),
    evidence,
    severity: parseSeverityMap(raw.severity, id),
    diagnose,
    timeoutMs: raw.timeoutMs,
  };
}

function parseBands(raw) {
  if (!Array.isArray(raw) || raw.length !== OBSERVE_BAND_LEVELS.length) {
    throw new ObserveConfigError(
      `bands must list exactly the three levels ${OBSERVE_BAND_LEVELS.join(", ")} in order`,
    );
  }
  return raw.map((band, index) => {
    const expectedLevel = OBSERVE_BAND_LEVELS[index];
    if (band === null || typeof band !== "object" || Array.isArray(band)) {
      throw new ObserveConfigError(`bands[${index}] must be a map`);
    }
    if (band.level !== expectedLevel) {
      throw new ObserveConfigError(
        `bands[${index}].level must be ${expectedLevel} (levels are fixed), got: ${band.level}`,
      );
    }
    const when = requireString(band.when, `band ${expectedLevel}: when`);
    const match = WHEN_PATTERN.exec(when.trim());
    if (!match) {
      throw new ObserveConfigError(
        `band ${expectedLevel}: when must match "severity >= <level>", got: ${when}`,
      );
    }
    return { level: expectedLevel, minSeverity: match[1] };
  });
}

function parseTriage(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ObserveConfigError("triage must be a map");
  }
  const actions = raw.actions;
  if (
    !Array.isArray(actions) ||
    actions.length !== TRIAGE_ACTIONS.length ||
    TRIAGE_ACTIONS.some((action, index) => actions[index] !== action)
  ) {
    throw new ObserveConfigError(
      `triage.actions must be exactly [${TRIAGE_ACTIONS.join(", ")}] (closed set)`,
    );
  }
  if (raw.dismissFeedback !== "bands") {
    throw new ObserveConfigError('triage.dismissFeedback must be "bands"');
  }
  return { actions: [...TRIAGE_ACTIONS], dismissFeedback: "bands" };
}

export function loadObserveConfig(configPath) {
  const absolutePath = resolve(configPath);
  const text = readFileSync(absolutePath, "utf8");
  const raw = parseYamlSubset(text);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ObserveConfigError("observe config must be a YAML map");
  }
  if (raw.kind !== "workflow") {
    throw new ObserveConfigError(`kind must be workflow, got: ${raw.kind}`);
  }
  if (raw.version !== 1) {
    throw new ObserveConfigError(`unsupported observe config version: ${raw.version}`);
  }
  if (raw.name !== "observe") {
    throw new ObserveConfigError(`name must be observe, got: ${raw.name}`);
  }
  if (!Array.isArray(raw.providers) || raw.providers.length === 0) {
    throw new ObserveConfigError("providers must be a non-empty list");
  }
  const providers = raw.providers.map((provider, index) => parseProvider(provider, index));
  const ids = new Set();
  for (const provider of providers) {
    if (ids.has(provider.id)) {
      throw new ObserveConfigError(`duplicate provider id: ${provider.id}`);
    }
    ids.add(provider.id);
  }
  const configDir = dirname(absolutePath);
  const repoRoot = raw.repo
    ? resolve(configDir, String(raw.repo))
    : basename(configDir) === ".buildbeat"
      ? dirname(configDir)
      : configDir;
  return {
    configPath: absolutePath,
    configDigest: `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`,
    repoRoot,
    providers,
    bands: parseBands(raw.bands),
    triage: parseTriage(raw.triage),
  };
}
