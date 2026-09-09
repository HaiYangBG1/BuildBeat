import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseYamlSubset } from "../src/v2/engine/yaml-subset.js";

// The shipped example/ is a snapshot of a fictional project that has run one
// Work to the merge decision. Two things must stay true: the snapshot's own
// artifacts are consistent (config parses, decisions and run-record are the
// real output of the runtime, no host path leaked), and a copy of the
// example drives a *new* run to the merge decision with a scripted agent in
// place of codex — the project's real `npm test` acting as the verifier.
// This proves the example is usable as-is; it does not prove that a real
// model can do the task.

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");
const EXAMPLE = join(ROOT, "example");
const WORK = "WORK-EXPORT-DATE-FILTER";

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function cli(args, cwd = ROOT) {
  return execFileSync("node", [CLI, ...args], { encoding: "utf8", cwd });
}

test("the example's shipped artifacts are consistent with each other", () => {
  const config = parseYamlSubset(readFileSync(join(EXAMPLE, "delivery", "work", WORK, "run-config.yaml"), "utf8"));
  assert.equal(config.work, WORK);
  assert.deepEqual(Object.keys(config.workers).sort(), ["builder", "fixer", "reviewer", "verifier"]);
  assert.equal(config.envelope.prompts, "../../envelope/prompts");
  for (const relative of ["worker.sh", "prompts/builder.md", "prompts/reviewer.md", "prompts/fixer.md"]) {
    assert.ok(existsSync(join(EXAMPLE, "delivery", "envelope", relative)), `envelope is missing ${relative}`);
  }
  assert.equal(
    readFileSync(join(EXAMPLE, "delivery", "work", WORK, "workflow.yaml"), "utf8"),
    readFileSync(join(ROOT, "src", "v2", "presets", "software-delivery.yaml"), "utf8"),
    "the example's workflow.yaml must be a verbatim copy of the shipped preset",
  );

  const decisions = readFileSync(join(EXAMPLE, "delivery", "work", WORK, "decisions.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    decisions.map((entry) => entry.transition),
    ["accept-intent", "accept-plan", "enter-wait-merge"],
  );

  const record = JSON.parse(
    readFileSync(join(EXAMPLE, "delivery", "work", WORK, "runs", "RUN-EXPORT-01", "run-record.json"), "utf8"),
  );
  assert.equal(record.terminal.status, "SUCCEEDED");
  assert.deepEqual(record.attempts, { build: 1, verify: 1, review: 1 });
  assert.equal(record.decisions[0].transition, "enter-wait-merge");
  assert.equal(record.decisions[0].subject.planDigest, decisions[1].subject.digest);
  const review = record.evidence.find((item) => item.kind === "review");
  assert.equal(review.findings.length, 1);
  assert.equal(review.findings[0].severity, "P2");
  const serialized = JSON.stringify(record) + readFileSync(join(EXAMPLE, "delivery", "work", WORK, "decisions.jsonl"), "utf8");
  assert.doesNotMatch(serialized, /\/Users\/|\/home\/|\/tmp\/|\/private\//, "no host absolute path may leak into shipped artifacts");
});

test("a copy of the example drives a new run to the merge decision with a scripted agent", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-example-"));
  cpSync(EXAMPLE, root, { recursive: true });
  renameSync(join(root, "gitignore.template"), join(root, ".gitignore"));
  rmSync(join(root, "README.md"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);

  // Scripted agent standing in for codex: the builder adds one more real
  // test (prepared here, copied by the agent), the reviewer returns a clean
  // envelope, the fixer is never reached.
  mkdirSync(join(root, "tools"), { recursive: true });
  writeFileSync(
    join(root, "tools", "export-empty.test.js"),
    [
      'import assert from "node:assert/strict";',
      'import test from "node:test";',
      "",
      'import { exportCsv } from "../src/export.js";',
      "",
      'test("an empty ledger exports only the header", () => {',
      '  assert.equal(exportCsv([]), "date,category,amount,note\\n");',
      "});",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "tools", "fake-agent.sh"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "role=$1",
      "prompt=${@: -1}",
      "case \"$role\" in",
      "  build) [ -n \"$prompt\" ] || exit 9; cp tools/export-empty.test.js tests/export-empty.test.js ;;",
      "  fix) exit 9 ;;",
      "  review) [ -n \"$prompt\" ] || exit 9; printf '%s\\n' '{\"status\":\"succeeded\",\"findings\":[]}' ;;",
      "esac",
    ].join("\n"),
  );
  const configPath = join(root, "delivery", "work", WORK, "run-config.yaml");
  const config = readFileSync(configPath, "utf8")
    .replace(/      - codex\n      - exec\n      - -s\n      - workspace-write\n/, "      - bash\n      - tools/fake-agent.sh\n      - build\n")
    .replace(/      - codex\n      - exec\n      - -s\n      - read-only\n/, "      - bash\n      - tools/fake-agent.sh\n      - review\n")
    .replace(/      - codex\n      - exec\n      - -s\n      - workspace-write\n/, "      - bash\n      - tools/fake-agent.sh\n      - fix\n");
  assert.doesNotMatch(config, /^\s+- codex$/m);
  writeFileSync(configPath, config);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "example snapshot"]);

  // The shipped decisions.jsonl already accepts intent and plan; their
  // digests match the shipped files, so doctor must see them as accepted.
  const doctorOut = cli(["doctor", "--config", configPath], root);
  assert.match(doctorOut, /intent\.md: accepted/);
  assert.match(doctorOut, /plan\.md: accepted/);
  assert.match(doctorOut, /budgets\.reviewRoundsPerWork: 3/);

  // Shipped RUN-EXPORT-01 record makes the next attempt RUN-EXPORT-02.
  const startOut = cli(["start", "--config", configPath, "--attempt", "new"], root);
  assert.match(startOut, /RUN-EXPORT-02/);
  assert.match(startOut, /status: WAITING_HUMAN/);
  assert.match(startOut, /waiting on human: enter-wait-merge/);

  const statusOut = cli(["status", "--repo", ".", "--run", "RUN-EXPORT-02"], root);
  assert.match(statusOut, /step build: SUCCEEDED \(attempts 1\)/);
  assert.match(statusOut, /step verify: SUCCEEDED \(attempts 1\)/); // the project's real npm test
  assert.match(statusOut, /step review: SUCCEEDED \(attempts 1\)/);
  assert.doesNotMatch(statusOut, /invalid-output|infra/);
  assert.doesNotMatch(statusOut, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const candidate = statusOut.match(/candidate ([0-9a-f]{7,40})/)?.[1];
  assert.ok(candidate, "candidate sha missing from status");
  assert.match(git(root, ["ls-tree", "-r", "--name-only", candidate]), /tests\/export-empty\.test\.js/);
  assert.match(git(root, ["log", "--format=%s", `main..${candidate}`]), /builder: RUN-EXPORT-02 attempt 1/);

  const overviewOut = cli(["overview", "--repo", "."], root);
  assert.match(overviewOut, /WORK-EXPORT-DATE-FILTER/);
});
