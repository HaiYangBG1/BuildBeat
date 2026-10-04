// Compatibility names translate to fixed safeguards. No preset DSL is loaded.
import { PolicyError, deliveryChecks } from "../policy/policy.js";
export function loadRiskPreset(name, { artifact = "plan" } = {}) {
  if (!["fast", "standard", "controlled"].includes(name))
    throw new PolicyError(
      `unsupported risk preset ${name}; release/custom presets are retired; see docs/MIGRATION.md`,
    );
  const checks = {
    artifact,
    requireAcceptance: name !== "fast",
    requireIntent: name === "controlled",
    maxSeverity: name === "controlled" ? "P3" : "P2",
  };
  return { name, stopAt: [], checks, policies: deliveryChecks(checks) };
}
