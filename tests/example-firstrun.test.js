import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { parseYamlSubset } from "../src/engine/yaml-subset.js";
import { tempDir } from "./support/tmp.js";

// The shipped example/ is a snapshot of a fictional project after one work
// went through a review to the owner's approval. Two things must stay true:
// the snapshot's records are consistent with each other and with the files
// next to them (they are the runtime's real output, and no host path leaked),
// and a copy of the example reviews a new commit, with a scripted reviewer
// in place of codex and the project's real `npm test` as the verifier. This
// proves the example is usable as it is; it does not prove that a real model
// can do the task.

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");
const EXAMPLE = join(ROOT, "example");
const WORK = "WORK-EXPORT-DATE-FILTER";
const WORK_DIR = join("delivery", "work", WORK);

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function cli(args, cwd = ROOT) {
  return execFileSync("node", [CLI, ...args], { encoding: "utf8", cwd });
}

const sha256 = (text) => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

test("the example's shipped records are consistent with each other and with its files", () => {
  const project = parseYamlSubset(readFileSync(join(EXAMPLE, "delivery", "run-config.yaml"), "utf8"));
  assert.deepEqual(Object.keys(project.workers).sort(), ["reviewer", "verifier"]);
  assert.equal(project.envelope.prompts, "envelope/prompts");
  assert.deepEqual(readdirSync(join(EXAMPLE, "delivery", "envelope", "prompts")), ["reader.md", "reviewer.md"]);
  assert.ok(existsSync(join(EXAMPLE, "delivery", "envelope", "worker.sh")));
  // The work overrides one thing and keeps the project's workers.
  assert.deepEqual(parseYamlSubset(readFileSync(join(EXAMPLE, WORK_DIR, "run-config.yaml"), "utf8")), { allowedPaths: ["src", "tests"] });
  // Nothing of an earlier version's format is left to copy.
  assert.deepEqual(readdirSync(join(EXAMPLE, WORK_DIR)).sort(), ["decisions.jsonl", "review-findings.jsonl", "run-config.yaml", "runs", "work.md"]);

  const decisions = readFileSync(join(EXAMPLE, WORK_DIR, "decisions.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(decisions.map((entry) => entry.transition), ["accept-work", "enter-wait-merge"]);
  // The acceptance is of the work.md that ships.
  const accepted = decisions[0].subject.digest;
  assert.equal(accepted, sha256(readFileSync(join(EXAMPLE, WORK_DIR, "work.md"), "utf8")));
  assert.equal(decisions[0].actor.kind, "human");

  const run = "RUN-EXPORT-DATE-FILTER-01";
  const record = JSON.parse(readFileSync(join(EXAMPLE, WORK_DIR, "runs", run, "run-record.json"), "utf8"));
  assert.equal(record.pass, true);
  assert.equal(record.terminal.status, "SUCCEEDED");
  assert.deepEqual(record.attempts, { verify: 1, review: 1 });
  assert.equal(record.decisions[0].transition, "enter-wait-merge");
  assert.equal(record.decisions[0].subject.planDigest, accepted);
  // The approval names the commit the run reviewed.
  assert.equal(decisions[1].run, run);
  assert.equal(decisions[1].subject.candidate, record.workspaces[run].candidate);
  assert.equal(decisions[1].actor.kind, "human");
  const review = record.evidence.find((item) => item.kind === "review");
  assert.equal(review.status, "passed");
  assert.equal(review.subject, record.workspaces[run].candidate);
  assert.equal(review.findings.length, 1);
  assert.equal(review.findings[0].severity, "P2");
  const findings = readFileSync(join(EXAMPLE, WORK_DIR, "review-findings.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].run, run);
  assert.equal(findings[0].summary, review.findings[0].summary);

  const serialized = JSON.stringify(record) + JSON.stringify(decisions) + JSON.stringify(findings);
  assert.doesNotMatch(serialized, /\/Users\/|\/home\/|\/tmp\/|\/private\//, "no host absolute path may leak into shipped records");
});

test("a copy of the example reviews a new commit with a scripted reviewer and the project's real tests", () => {
  const root = tempDir("bb-example-");
  cpSync(EXAMPLE, root, { recursive: true });
  renameSync(join(root, "gitignore.template"), join(root, ".gitignore"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);

  // A scripted reviewer standing in for codex. It gets the prompt as its
  // last argument, exactly like codex or claude, and returns a clean report.
  mkdirSync(join(root, "tools"), { recursive: true });
  writeFileSync(
    join(root, "tools", "fake-reviewer.sh"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "prompt=${@: -1}",
      "[ -n \"$prompt\" ] || exit 9",
      "printf '%s\\n' '{\"status\":\"succeeded\",\"findings\":[]}'",
    ].join("\n"),
  );
  const configPath = join(root, "delivery", "run-config.yaml");
  const config = readFileSync(configPath, "utf8")
    .replace(/      - codex\n      - exec\n      - -s\n      - read-only\n/, "      - bash\n      - tools/fake-reviewer.sh\n");
  assert.doesNotMatch(config, /^\s+- codex$/m);
  writeFileSync(configPath, config);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "example snapshot"]);

  // The shipped decisions.jsonl accepts the shipped work.md, so the copy
  // needs no new acceptance.
  const checkOut = cli(["check", "--repo", ".", "--work", WORK], root);
  assert.match(checkOut, /run config: delivery\/run-config\.yaml \+ delivery\/work\/WORK-EXPORT-DATE-FILTER\/run-config\.yaml/);
  assert.match(checkOut, /verifier: bash -lc npm test/);
  assert.match(checkOut, /allowed paths: src, tests/);
  assert.match(checkOut, /work\.md: accepted by 小周 \(person\)/);
  assert.match(checkOut, /ready: commit the change, then buildbeat review --repo \. --work WORK-EXPORT-DATE-FILTER/);

  // One more real test, as the next change of the work.
  writeFileSync(
    join(root, "tests", "export-empty.test.js"),
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
  git(root, ["add", "tests/export-empty.test.js"]);
  git(root, ["commit", "-q", "-m", `cover the empty ledger\n\nWork: ${WORK}`]);
  const sha = git(root, ["rev-parse", "HEAD"]);

  // The shipped RUN-…-01 record makes this review RUN-…-02.
  const reviewOut = cli(["review", "--repo", ".", "--work", WORK], root);
  assert.match(reviewOut, /reviewing \w{7} as RUN-EXPORT-DATE-FILTER-02/);
  assert.match(reviewOut, /status: WAITING_HUMAN/);
  assert.match(reviewOut, /step verify: SUCCEEDED \(attempts 1\)/); // the project's real npm test
  assert.match(reviewOut, /step review: SUCCEEDED \(attempts 1\)/);
  assert.match(reviewOut, /verified and reviewed with no blocking finding/);
  assert.doesNotMatch(reviewOut, /infrastructure|CANCELLED|FAILED/);
  assert.doesNotMatch(reviewOut, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const approveOut = cli(["decide", "--repo", ".", "--work", WORK, "--action", "approve", "--candidate", sha, "--by", "owner", "--as", "human"], root);
  assert.match(approveOut, /RUN-EXPORT-DATE-FILTER-02 is terminal: SUCCEEDED/);

  const row = JSON.parse(cli(["status", "--repo", ".", "--json"], root)).works.find((item) => item.work === WORK);
  assert.equal(row.stage, "MERGED");
  assert.equal(row.runs, 2);
  assert.equal(row.mergedCandidate, sha);
  // The new line traces back to the work.
  const trace = JSON.parse(cli(["history", "--repo", ".", "--path", "tests/export-empty.test.js", "--json"], root));
  assert.deepEqual(trace.works.map((item) => item.work), [WORK]);
  assert.equal(trace.works[0].title, "导出加日期筛选");
});
