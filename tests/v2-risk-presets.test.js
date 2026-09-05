import assert from "node:assert/strict";
import test from "node:test";

import { loadRiskPreset } from "../src/v2/engine/risk-preset.js";
import { PolicyError } from "../src/v2/policy/policy.js";

test("all four official risk presets load and parse fail-closed", () => {
  const fast = loadRiskPreset("fast");
  assert.deepEqual(fast.stopAt, []);
  assert.deepEqual(
    fast.policies.map((policy) => policy.name),
    ["merge-evidence-floor"],
  );

  const standard = loadRiskPreset("standard");
  assert.deepEqual(standard.stopAt, []);
  assert.ok(standard.policies.some((policy) => policy.name === "plan-accepted"));

  const controlled = loadRiskPreset("controlled");
  assert.ok(controlled.policies.some((policy) => policy.name === "intent-accepted"));
  assert.ok(controlled.policies.some((policy) => policy.name === "plan-accepted"));
  const floor = controlled.policies.find((policy) => policy.name === "merge-evidence-floor");
  assert.equal(floor.rule.all[1]["finding.maxSeverity"].atMost, "P3");

  const legacy = loadRiskPreset("legacy-four-gates");
  assert.deepEqual(legacy.stopAt, ["build", "review"]);
  assert.ok(legacy.policies.some((policy) => policy.name === "intent-accepted"));
});

test("unknown presets and bad names are rejected", () => {
  assert.throws(() => loadRiskPreset("../escape"), PolicyError);
  assert.throws(() => loadRiskPreset("no-such-preset"), Error);
});

test("every preset policy keeps the merge decision human with an evidence floor", () => {
  for (const name of ["fast", "standard", "controlled", "legacy-four-gates"]) {
    const preset = loadRiskPreset(name);
    const floor = preset.policies.find((policy) => policy.appliesTo === "enter-wait-merge");
    assert.ok(floor, `${name} must gate the merge decision`);
    assert.equal(floor.enforcement, "LOCAL_ENFORCED");
  }
});
