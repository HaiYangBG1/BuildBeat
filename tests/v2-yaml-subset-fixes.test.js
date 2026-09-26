import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import { parseYamlSubset, YamlSubsetError } from "../src/v2/engine/yaml-subset.js";
import { parseYamlSubset as parseV1 } from "./support/yaml-subset-v1.js";

const ROOT = join(import.meta.dirname, "..");
const rejects = (text, pattern) => assert.throws(() => parseYamlSubset(text), (error) => error instanceof YamlSubsetError && pattern.test(error.message));

test("a byte-order mark is not content", () => {
  assert.deepEqual(parseYamlSubset("\uFEFFrepo: .\nwork: WORK-X\n"), { repo: ".", work: "WORK-X" });
});

test("empty inline [] and {} are allowed; anything inside them is not", () => {
  assert.deepEqual(parseYamlSubset("stopAt: []\nvars: {}\nspaced: [ ]\n"), { stopAt: [], vars: {}, spaced: [] });
  rejects("stopAt: [review]", /inline lists\/maps are not supported except \[\] and \{\}; write one "- item" per line/);
  rejects("vars: {a: 1}", /inline lists\/maps are not supported/);
});

test("a list may sit at its key's own indentation", () => {
  const indented = "workers:\n  verifier:\n    args:\n      - -lc\n      - npm test\nnext: 1\n";
  const compact = "workers:\n  verifier:\n    args:\n    - -lc\n    - npm test\nnext: 1\n";
  assert.deepEqual(parseYamlSubset(compact), parseYamlSubset(indented));
  assert.deepEqual(parseYamlSubset("steps:\n- id: a\n  worker: w\n- id: b\nentry: a\n"), {
    steps: [{ id: "a", worker: "w" }, { id: "b" }],
    entry: "a",
  });
});

test("a plain list item is a map only when it starts with key: ", () => {
  assert.deepEqual(parseYamlSubset("args:\n  - http://x\n  - a:b\n  - key: value\n  - bare:\n      nested: 1\n"), {
    args: ["http://x", "a:b", { key: "value" }, { bare: { nested: 1 } }],
  });
});

test("an ambiguous item with ': ' is refused with a way to write it", () => {
  rejects("args:\n  - echo a: b\n", /list item "echo a: b" contains ": "; quote it \(- "echo a: b"\) or write it as key: value/);
  assert.deepEqual(parseYamlSubset('args:\n  - "echo a: b"\n'), { args: ["echo a: b"] });
});

test("leading zeros are kept as written", () => {
  assert.deepEqual(parseYamlSubset("run: 007\nneg: -01\nzero: 0\nten: 10\nminus: -3\n"), {
    run: "007",
    neg: "-01",
    zero: 0,
    ten: 10,
    minus: -3,
  });
});

test("multi-line list items keep the previous rule and messages", () => {
  for (const text of ["args:\n  - http://x\n    more: 1\n", "args:\n  - plain\n    more: 1\n", "args:\n  - name: a\n    more: 1\n"]) {
    let before;
    let after;
    try {
      before = { value: parseV1(text) };
    } catch (error) {
      before = { error: error.message };
    }
    try {
      after = { value: parseYamlSubset(text) };
    } catch (error) {
      after = { error: error.message };
    }
    assert.deepEqual(after, before, text);
  }
});

test("a key with no value says how to fix it", () => {
  rejects("stopAt:\nentry: build\n", /key "stopAt" has no value: give it a value, write stopAt: \[\] for an empty list, or indent its items under it/);
});

test("everything outside the subset is still refused", () => {
  rejects("a: &anchor 1", /unsupported YAML syntax/);
  rejects("a: *alias", /unsupported YAML syntax/);
  rejects("a:\n\t- x", /tabs are not allowed/);
  rejects("a: 1\n---\nb: 2", /multi-document/);
  rejects("a: 1\na: 2", /duplicate map key/);
  rejects("a: |\n  text", /unsupported YAML syntax/);
});

function yamlFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "runtime" || entry === "worktrees") {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yamlFiles(path, found);
    } else if (/\.ya?ml$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

// Everything the previous parser accepted must parse to exactly the same
// value. The previous parser is frozen in tests/support, so this holds in a
// shallow clone and in the published package alike.
test("every YAML file the previous parser accepted parses identically", () => {
  const files = ["src", "templates", "example", "delivery", ".buildbeat"]
    .map((dir) => join(ROOT, dir))
    .filter(existsSync)
    .flatMap((dir) => yamlFiles(dir));
  let compared = 0;
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    let before;
    try {
      before = parseV1(text);
    } catch {
      continue;
    }
    assert.deepEqual(parseYamlSubset(text), before, relative(ROOT, path));
    compared += 1;
  }
  assert.ok(compared >= 20, `only ${compared} YAML files compared`);
});
