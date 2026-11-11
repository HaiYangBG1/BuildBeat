// The run config is checked as a whole before anything runs: every problem
// is listed at once, by key, with the closest spelling when there is one.

import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";

import { RunConfigError, loadReviewConfig } from "../src/cli/review-config.js";
import { ROOT, cli, yaml } from "./support/review.js";
import { tempDir } from "./support/tmp.js";

const WORK = "WORK-X";
const WORKERS = ["workers:", "  verifier:", "    command: bash", "    args:", "      - -lc", "      - npm test", "  reviewer:", "    command: sh"];

// A directory with a project run config and, when given, the work's own.
// Loading reads only these files, so no repository is needed.
function project(projectLines, workLines = null) {
  const root = tempDir("bb-run-config-");
  const put = (path, lines) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), yaml(lines));
  };
  if (projectLines) put("delivery/run-config.yaml", projectLines);
  if (workLines) put(`delivery/work/${WORK}/run-config.yaml`, workLines);
  return root;
}

// The problems loading reports; none when the config loads.
function problems(projectLines, workLines = null) {
  try {
    loadReviewConfig(project(projectLines, workLines), workLines ? WORK : null);
    return [];
  } catch (error) {
    assert.ok(error instanceof RunConfigError, error.stack);
    return error.problems;
  }
}
const one = (found, pattern) => {
  assert.equal(found.length, 1, found.join("\n"));
  assert.match(found[0], pattern);
};
// A project config with the verifier given these extra lines.
const verifier = (...lines) => problems(["workers:", "  verifier:", "    command: bash", ...lines.map((line) => `    ${line}`), "  reviewer:", "    command: sh"]);

test("a valid config loads into what a review takes", () => {
  assert.deepEqual(problems(WORKERS), []);
  const options = loadReviewConfig(project(WORKERS, ["allowedPaths:", "  - src", "base: abc1234"]), WORK);
  assert.deepEqual(options.files, ["delivery/run-config.yaml", `delivery/work/${WORK}/run-config.yaml`]);
  assert.equal(options.family, "RUN-X");
  assert.deepEqual(Object.keys(options.adapters), ["verifier", "reviewer"]);
  assert.equal(options.adapters.verifier.envMode, "allowlist");
  assert.deepEqual(options.allowedPaths, ["src"]);
  assert.equal(options.base, "abc1234");
  assert.equal(options.deliveryChecks.maxSeverity, "P2");
  assert.equal(options.deliveryChecks.requireAcceptance, true);
});

test("a missing config and missing workers are named", () => {
  assert.throws(() => loadReviewConfig(project(null)), /no delivery\/run-config\.yaml in this repository: write one that names workers\.verifier and workers\.reviewer/);
  one(problems(["workers:", "  verifier:", "    command: bash"]), /^workers\.reviewer: required and missing/);
  assert.deepEqual(problems(["redact: []"]), ["workers.verifier: required and missing", "workers.reviewer: required and missing"]);
});

test("unknown keys are rejected with the closest spelling", () => {
  one(problems([...WORKERS, "requries: []"]), /^requries: unknown key \(did you mean requires\?\)/);
  one(problems([...WORKERS, "MAXREVIEWSEVERITY: P3"]), /^MAXREVIEWSEVERITY: unknown key \(did you mean maxReviewSeverity\?\)/);
  one(problems([...WORKERS, "zzzz: 1"]), /^zzzz: unknown key; known: workers, envelope, requires, redact, release, requireScreenshot, maxReviewSeverity$/);
  // Edit distance of at most two, or the same letters in another case; no
  // guesses from a shared prefix.
  one(problems([...WORKERS, "redactUnexpected: []"]), /^redactUnexpected: unknown key; known: /);
  one(problems(["workers:", "  reviwer:", "    command: codex", ...WORKERS.slice(1)]), /^workers\.reviwer: unknown key \(did you mean reviewer\?\)/);
});

test("what a work alone may set is unknown in the project config", () => {
  one(problems([...WORKERS, "allowedPaths:", "  - src"]), /^allowedPaths: unknown key/);
  one(problems([...WORKERS, "base: abc1234"]), /^base: unknown key/);
  assert.deepEqual(problems(WORKERS, ["allowedPaths:", "  - src", "base: abc1234"]), []);
});

test("worker fields are checked", () => {
  one(verifier("inheritEnv: yes"), /^workers\.verifier\.inheritEnv: must be true or false, got "yes"/);
  assert.deepEqual(verifier("inheritEnv: true"), []);
  one(verifier("timeoutMs: -5"), /^workers\.verifier\.timeoutMs: must be a positive number/);
  assert.deepEqual(verifier("timeoutMs: 0.5"), []);
  one(verifier("comand: x"), /^workers\.verifier\.comand: unknown key \(did you mean command\?\)/);
  one(verifier("args: npm test"), /^workers\.verifier\.args: must be a list/);
  one(verifier("env:", "  - A=1"), /^workers\.verifier\.env: must be a map/);
  one(problems(["workers:", "  verifier:", "    args:", "      - x", "  reviewer:", "    command: sh"]), /^workers\.verifier\.command: required/);
  one(problems([...WORKERS, "envelope:", "  prompts: p", "  pins: x"]), /^envelope\.pins: unknown key \(did you mean pin\?\)/);
  one(problems([...WORKERS, "release:", "  args:", "    - readback.sh"]), /^release\.command: required/);
});

test("lists, switches and the work's own keys are checked", () => {
  one(problems([...WORKERS, "requires: node"]), /^requires: must be a list \(one "- item" per line\), got "node"/);
  one(problems([...WORKERS, "redact: token"]), /^redact: must be a list/);
  one(problems([...WORKERS, "requireScreenshot: yes"]), /^requireScreenshot: must be true or false, got "yes"/);
  one(problems([...WORKERS, "maxReviewSeverity: P1"]), /^maxReviewSeverity: must be P2 or P3/);
  one(problems(WORKERS, ["allowedPaths: src"]), /^allowedPaths: must be a list/);
  one(problems(WORKERS, ["allowedPaths:", "  - src", '  - ""']), /^allowedPaths\[1\]: must be a non-empty path/);
  one(problems(WORKERS, ['base: ""']), /^base: must name a commit, got ""/);
});

test("a key without a value is reported, not treated as the default", () => {
  one(problems(WORKERS, ["base:"]), /key "base" has no value: give it a value/);
  one(problems([...WORKERS, "requires:"]), /key "requires" has no value: give it a value, write requires: \[\] for an empty list/);
  one(problems(WORKERS, ["base: null"]), /^base: must name a commit, got null/);
});

test("every problem is listed at once, and the file at fault is named", () => {
  const root = project(
    ["stopAt:", "  - review", "requires: node", "workers:", "  verifier:", "    command: bash", "    inheritEnv: yes", "  builder:", "    command: codex", "  reviewer:", "    command: sh"],
    ["run: RUN-X"],
  );
  assert.throws(() => loadReviewConfig(root, WORK), (error) => {
    assert.match(error.message, /^run config delivery\/run-config\.yaml has 4 problem\(s\):\n  - /);
    for (const expected of [/^stopAt: unknown key/, /^requires: must be a list/, /^workers\.verifier\.inheritEnv: must be true or false/, /^workers\.builder: unknown key/]) {
      assert.ok(error.problems.some((problem) => expected.test(problem)), `${expected} not in:\n${error.problems.join("\n")}`);
    }
    return true;
  });
  // The project file is fine here; the work's is not.
  assert.throws(() => loadReviewConfig(project(WORKERS, ["run: RUN-X"]), WORK), /^RunConfigError: run config delivery\/work\/WORK-X\/run-config\.yaml has 1 problem\(s\):\n  - run: unknown key/);
});

test("a redact pattern and a worker's env names are checked on load", () => {
  assert.throws(() => loadReviewConfig(project([...WORKERS, "redact:", '  - "(unclosed"'])), /redact pattern is not a valid regular expression: \(unclosed/);
  assert.throws(
    () => loadReviewConfig(project(["workers:", "  verifier:", "    command: bash", "    env:", "      BAD-NAME: 1", "  reviewer:", "    command: sh"])),
    /workers\.verifier\.env: invalid variable name BAD-NAME/,
  );
});

test("the CLI reports the problem list instead of an internal error", () => {
  const root = project(["stopat:", "  - review", "workers:", "  reviwer:", "    command: codex", "  verifier:", "    command: bash", "    inheritEnv: yes"]);
  const check = cli(["check", "--repo", root]);
  assert.equal(check.status, 1, check.all);
  assert.match(check.err, /run config delivery\/run-config\.yaml has 3 problem\(s\):/);
  assert.match(check.err, /  - stopat: unknown key/);
  assert.match(check.err, /  - workers\.reviwer: unknown key \(did you mean reviewer\?\)/);
  assert.match(check.err, /  - workers\.verifier\.inheritEnv: must be true or false/);
  assert.doesNotMatch(check.all, /\n\s+at .*\.js:\d+/);

  const fine = cli(["check", "--repo", project(WORKERS)]);
  assert.equal(fine.status, 0, fine.all);
  assert.match(fine.out, /^run config: delivery\/run-config\.yaml\n  verifier: bash -lc npm test\n/);
  assert.match(fine.out, /\nready\n$/);
});

test("every run config shipped in this repository loads unchanged", () => {
  // The template, the way its header says to use it: copied to
  // delivery/run-config.yaml next to the envelope templates.
  const copied = tempDir("bb-run-config-template-");
  mkdirSync(join(copied, "delivery"), { recursive: true });
  cpSync(join(ROOT, "templates", "run-config.example.yaml"), join(copied, "delivery", "run-config.yaml"));
  cpSync(join(ROOT, "templates", "envelope"), join(copied, "delivery", "envelope"), { recursive: true });
  const template = loadReviewConfig(copied);
  assert.deepEqual(template.files, ["delivery/run-config.yaml"]);
  assert.ok(template.envelope);

  // The example project, with the work that overrides its allowed paths.
  const example = loadReviewConfig(join(ROOT, "example"), "WORK-EXPORT-DATE-FILTER");
  assert.equal(example.files.length, 2);
  assert.deepEqual(example.allowedPaths, ["src", "tests"]);

  // This repository's own, once it has one.
  if (existsSync(join(ROOT, "delivery", "run-config.yaml"))) {
    assert.deepEqual(loadReviewConfig(ROOT).files, ["delivery/run-config.yaml"]);
  }
});
