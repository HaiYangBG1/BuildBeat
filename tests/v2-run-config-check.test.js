import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { checkRunConfigAgainstWorkflow, checkRunConfigShape, suggest } from "../src/v2/cli/run-config-check.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { parseYamlSubset } from "../src/v2/engine/yaml-subset.js";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");
const PRESET = join(ROOT, "src", "v2", "presets", "software-delivery.yaml");
const workflow = loadWorkflow(PRESET);

const valid = () => ({
  repo: ".",
  work: "WORK-X",
  run: "RUN-X",
  workflow: "workflow.yaml",
  workers: { verifier: { command: "bash", args: ["-lc", "npm test"] } },
});
const shape = (overrides) => checkRunConfigShape({ ...valid(), ...overrides });
const one = (problems, pattern) => {
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], pattern);
};

test("a valid config has no problems", () => {
  assert.deepEqual(checkRunConfigShape(valid()), []);
  assert.deepEqual(checkRunConfigAgainstWorkflow(valid(), workflow), []);
});

test("required keys are named when missing", () => {
  const config = valid();
  delete config.repo;
  one(checkRunConfigShape(config), /^repo: required and missing/);
  const noWorkers = valid();
  delete noWorkers.workers;
  one(checkRunConfigShape(noWorkers), /^workers: required and missing/);
});

test("unknown top-level keys are rejected with the closest spelling", () => {
  one(shape({ stopat: ["review"] }), /^stopat: unknown key \(did you mean stopAt\?\)/);
  one(shape({ reviewtriage: "required" }), /did you mean reviewTriage\?/);
  one(shape({ zzzz: 1 }), /^zzzz: unknown key; known: repo, work, run/);
});

test("worker fields are checked", () => {
  const workers = (spec) => shape({ workers: { verifier: { command: "bash", ...spec } } });
  one(workers({ inheritEnv: "yes" }), /^workers\.verifier\.inheritEnv: must be true or false, got "yes"/);
  assert.deepEqual(workers({ inheritEnv: true }), []);
  one(workers({ timeoutMs: -5 }), /^workers\.verifier\.timeoutMs: must be a positive number/);
  assert.deepEqual(workers({ timeoutMs: 0.5 }), []);
  one(workers({ comand: "x" }), /^workers\.verifier\.comand: unknown key \(did you mean command\?\)/);
  one(workers({ args: "npm test" }), /^workers\.verifier\.args: must be a list/);
  one(workers({ env: ["A=1"] }), /^workers\.verifier\.env: must be a map/);
  one(shape({ workers: { verifier: { args: ["x"] } } }), /^workers\.verifier\.command: required/);
  one(shape({ envelope: { prompts: "p", pins: "x" } }), /^envelope\.pins: unknown key \(did you mean pin\?\)/);
});

test("numbers, lists and ids are checked", () => {
  one(shape({ stepTimeoutMs: "10m" }), /^stepTimeoutMs: must be a positive integer/);
  one(shape({ maxAttemptsPerStep: 0 }), /^maxAttemptsPerStep: must be a positive integer/);
  one(shape({ stopAt: "review" }), /^stopAt: must be a list/);
  one(shape({ allowedPaths: ["src", ""] }), /^allowedPaths\[1\]: must be a non-empty path/);
  one(shape({ run: 7 }), /^run: must be a string, got 7 \(quote it/);
  one(shape({ work: "WORK X" }), /^work: "WORK X" may only use letters, digits/);
  one(shape({ run: "RUN..X" }), /contain no "\.\."/);
  one(shape({ run: "../escape" }), /^run: "\.\.\/escape" may only use/);
});

test("names are checked against the workflow", () => {
  const typo = { ...valid(), workers: { reviwer: { command: "codex" } } };
  one(checkRunConfigAgainstWorkflow(typo, workflow), /^workers\.reviwer: no step of the workflow uses this worker \(did you mean reviewer\?\)/);
  one(checkRunConfigAgainstWorkflow({ ...valid(), stopAt: ["reveiw"] }, workflow), /^stopAt: "reveiw" is not a step of the workflow \(did you mean review\?\)/);
  one(checkRunConfigAgainstWorkflow({ ...valid(), entry: "biuld" }, workflow), /^entry: "biuld" is not a step of the workflow \(did you mean build\?\)/);
});

test("every problem is listed at once", () => {
  const problems = checkRunConfigShape({ work: "WORK X", run: 7, stopat: [], workers: { verifier: { command: "x", inheritEnv: "yes" } } });
  assert.ok(problems.length >= 5, problems.join("\n"));
  for (const expected of [/^repo: required/, /^workflow: required/, /^stopat: unknown key/, /^run: must be a string/, /inheritEnv: must be true or false/]) {
    assert.ok(problems.some((problem) => expected.test(problem)), `${expected} not in:\n${problems.join("\n")}`);
  }
});

test("suggestions only fire for plausible typos", () => {
  assert.equal(suggest("STOPAT", ["stopAt", "entry"]), "stopAt");
  assert.equal(suggest("reviwer", ["reviewer", "verifier"]), "reviewer");
  assert.equal(suggest("completely-different", ["reviewer"]), null);
  // Case-insensitive equality or edit distance <= 2 only; no prefix guesses.
  assert.equal(suggest("runUnexpected", ["run", "repo"]), null);
});

test("an explicit null is reported, not treated as the default", () => {
  one(shape({ base: null }), /^base: has no value; remove the line to use the default/);
  one(shape({ entry: null }), /^entry: has no value/);
  one(shape({ riskPreset: null }), /^riskPreset: has no value/);
});

test("the CLI reports the problem list instead of an internal error", (t) => {
  const root = mkdtempSync(join(tmpdir(), "bb-run-config-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, "run-config.yaml");
  writeFileSync(config, ["work: WORK-X", "run: RUN-X", `workflow: ${PRESET}`, "stopat:", "  - review", "workers:", "  reviwer:", "    command: codex", "    inheritEnv: yes"].join("\n"));
  const doctor = spawnSync(process.execPath, [CLI, "doctor", "--config", config], { encoding: "utf8" });
  assert.notEqual(doctor.status, 0);
  assert.match(doctor.stderr, /run config .*run-config\.yaml has 4 problem\(s\):/);
  assert.match(doctor.stderr, /  - repo: required and missing/);
  assert.match(doctor.stderr, /  - stopat: unknown key \(did you mean stopAt\?\)/);
  assert.match(doctor.stderr, /  - workers\.reviwer\.inheritEnv: must be true or false/);
  assert.doesNotMatch(doctor.stderr, /paths\[1\]/);
  const start = spawnSync(process.execPath, [CLI, "start", "--config", config], { encoding: "utf8" });
  assert.notEqual(start.status, 0);
  assert.match(start.stderr, /has 4 problem\(s\)/);
});

// Every run config shipped in this repository must pass unchanged.
function shippedConfigs() {
  const found = [join(ROOT, "templates", "v2", "run-config.example.yaml")];
  for (const base of [join(ROOT, "delivery", "work"), join(ROOT, "example", "delivery", "work")]) {
    if (!existsSync(base)) {
      continue;
    }
    for (const work of readdirSync(base)) {
      const path = join(base, work, "run-config.yaml");
      if (existsSync(path)) {
        found.push(path);
      }
    }
  }
  return found;
}

// The template names workflow.yaml because users copy the preset next to
// it (as its header says); it is the only config checked against a stand-in.
const TEMPLATE_WORKFLOW = { [join(ROOT, "templates", "v2", "run-config.example.yaml")]: PRESET };

test("every run config in this repository passes against the workflow it names", () => {
  const configs = shippedConfigs();
  assert.ok(configs.length >= 3);
  for (const path of configs) {
    const config = parseYamlSubset(readFileSync(path, "utf8"));
    assert.deepEqual(checkRunConfigShape(config), [], path);
    const workflowPath = TEMPLATE_WORKFLOW[path] ?? resolve(dirname(path), config.workflow);
    assert.ok(existsSync(workflowPath), `${path} names a workflow that does not exist: ${config.workflow}`);
    assert.deepEqual(checkRunConfigAgainstWorkflow(config, loadWorkflow(workflowPath)), [], path);
  }
});
