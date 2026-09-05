// Risk presets per docs/v2/RFC-0003-workflow-policy.md §7: fast / standard /
// controlled plus the legacy-four-gates migration preset. A preset is data —
// human boundaries (stopAt) and a policy set — never kernel-fixed gates.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PolicyError, parsePolicyDoc } from "../policy/policy.js";
import { parseYamlSubset } from "./yaml-subset.js";

const PRESET_DIR = fileURLToPath(new URL("../presets/risk/", import.meta.url));
const PRESET_FIELDS = new Set(["kind", "version", "name", "stopAt", "policies"]);

export function parseRiskPreset(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new PolicyError("risk preset must be a map");
  }
  for (const key of Object.keys(doc)) {
    if (!PRESET_FIELDS.has(key)) {
      throw new PolicyError(`unknown field "${key}" in risk preset ${doc.name ?? "(unnamed)"}`);
    }
  }
  if (doc.kind !== "risk-preset" || doc.version !== 1) {
    throw new PolicyError("risk preset requires kind: risk-preset and version: 1");
  }
  if (typeof doc.name !== "string" || doc.name.length === 0) {
    throw new PolicyError("risk preset needs a name");
  }
  const stopAt = doc.stopAt ?? [];
  if (!Array.isArray(stopAt) || stopAt.some((step) => typeof step !== "string")) {
    throw new PolicyError(`risk preset ${doc.name}: stopAt must be a list of step ids`);
  }
  const policies = (doc.policies ?? []).map((policy) => parsePolicyDoc(policy));
  return { name: doc.name, stopAt, policies };
}

export function loadRiskPreset(name) {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new PolicyError(`invalid risk preset name: ${name}`);
  }
  const text = readFileSync(join(PRESET_DIR, `${name}.yaml`), "utf8");
  const preset = parseRiskPreset(parseYamlSubset(text));
  if (preset.name !== name) {
    throw new PolicyError(`risk preset file ${name}.yaml declares name ${preset.name}`);
  }
  return preset;
}
