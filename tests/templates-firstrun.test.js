import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { parseYamlSubset } from "../src/engine/yaml-subset.js";
import { tempDir } from "./support/tmp.js";

// Deterministic first review through the shipped templates: the run config
// sample, the worker wrapper and the reviewer prompt must carry a commit
// from `review` to the owner's approval, with a scripted reviewer standing
// in for the real tool. This proves the packaged paths, the config shape,
// the prompt hand-over and the report format connect, not that a real model
// can do the task.

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");
const TEMPLATES = join(ROOT, "templates");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function cli(args) {
  return execFileSync("node", [CLI, ...args], { encoding: "utf8" });
}

// The run config samples in a document: yaml blocks that configure workers.
function yamlBlocks(markdown) {
  const out = [];
  const re = /```yaml\n([\s\S]*?)```/g;
  let match;
  while ((match = re.exec(markdown))) {
    if (/^workers:/m.test(match[1])) out.push(match[1]);
  }
  return out;
}

test("every documented run config sample parses with the strict YAML subset and names only what review takes", () => {
  const known = ["workers", "envelope", "requires", "redact", "release", "requireScreenshot", "maxReviewSeverity"];
  const example = parseYamlSubset(readFileSync(join(TEMPLATES, "run-config.example.yaml"), "utf8"));
  assert.deepEqual(Object.keys(example.workers).sort(), ["reviewer", "verifier"]);
  assert.equal(example.envelope.prompts, "envelope/prompts");
  assert.deepEqual(readdirSync(join(TEMPLATES, "envelope", "prompts")), ["reader.md", "reviewer.md"]);
  for (const relative of ["docs/guide/01-quickstart.md", "docs/guide/01-quickstart.en.md"]) {
    const blocks = yamlBlocks(readFileSync(join(ROOT, relative), "utf8"));
    assert.ok(blocks.length > 0, `${relative}: no run config sample found`);
    for (const block of blocks) {
      const config = parseYamlSubset(block);
      assert.deepEqual(Object.keys(config.workers).sort(), ["reviewer", "verifier"], `${relative}: a sample configures a verifier and a reviewer`);
      for (const key of Object.keys(config)) {
        assert.ok(known.includes(key), `${relative}: sample uses ${key}, which the project run config does not take`);
      }
    }
  }
});

test("the templates carry a commit from review to the owner's approval with a scripted reviewer", () => {
  const root = tempDir("bb-templates-");
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);

  // The project skeleton the quickstart lays out.
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "tools"), { recursive: true });
  cpSync(join(TEMPLATES, "envelope"), join(root, "delivery", "envelope"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".buildbeat/\n");
  writeFileSync(join(root, "README.md"), "fixture\n");

  // The scripted reviewer checks what it was handed (the work description,
  // where the change starts, a prompt that names work.md) and answers the
  // way agents do: the JSON report inside a ```json fence.
  writeFileSync(
    join(root, "tools", "fake-reviewer.sh"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `node -e 'const i=JSON.parse(process.env.BUILDBEAT_INPUT);const fs=require("node:fs");if(i.workArtifact?.ref!=="delivery/work/WORK-T/work.md"||!fs.existsSync(i.workArtifact.ref)||!/^[0-9a-f]{40}$/.test(i.base)||!fs.readFileSync(process.env.BUILDBEAT_PROMPT,"utf8").includes("work.md"))process.exit(9)'`,
      "prompt=${@: -1}",
      "[ -n \"$prompt\" ] || exit 9",
      "echo '```json'; echo '{\"status\":\"succeeded\",\"findings\":[{\"severity\":\"P2\",\"summary\":\"naming could be clearer\"}]}'; echo '```'",
    ].join("\n"),
  );

  // The sample config with codex swapped for the scripted reviewer and the
  // verifier pointed at a file the change will add.
  const sample = readFileSync(join(TEMPLATES, "run-config.example.yaml"), "utf8")
    .replace(/      - codex\n      - exec\n      - -s\n      - read-only\n/, "      - bash\n      - tools/fake-reviewer.sh\n")
    .replace("      - npm test\n", "      - test -f src/feature.txt\n");
  assert.doesNotMatch(sample, /^\s+- codex$/m);
  writeFileSync(join(root, "delivery", "run-config.yaml"), sample);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);

  mkdirSync(join(root, "delivery", "work", "WORK-T"), { recursive: true });
  writeFileSync(join(root, "delivery", "work", "WORK-T", "work.md"), "# Add the feature\n\n## Goal\nwrite src/feature.txt\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "describe WORK-T"]);

  const acceptOut = cli(["accept", "--repo", root, "--work", "WORK-T", "--by", "owner", "--as", "human"]);
  assert.match(acceptOut, /accepted work as A-WORK-T-\d+/);

  const checkOut = cli(["check", "--repo", root, "--work", "WORK-T"]);
  assert.match(checkOut, /run config: delivery\/run-config\.yaml\n/);
  assert.match(checkOut, /reviewer: bash delivery\/envelope\/worker\.sh reviewer -- bash tools\/fake-reviewer\.sh/);
  assert.match(checkOut, /environment: allowlist; host credentials withheld/);
  assert.match(checkOut, /prompts: envelope\/prompts \(reviewer, reader\) sha256:/);
  assert.match(checkOut, /node: OK/);
  assert.match(checkOut, /work\.md: accepted by owner/);

  writeFileSync(join(root, "src", "feature.txt"), "feature\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "add the feature\n\nWork: WORK-T"]);
  const sha = git(root, ["rev-parse", "HEAD"]);

  const reviewOut = cli(["review", "--repo", root, "--work", "WORK-T"]);
  assert.match(reviewOut, /reviewing \w{7} as RUN-T-01/);
  assert.match(reviewOut, /status: WAITING_HUMAN/);
  assert.match(reviewOut, /waiting on human: enter-wait-merge/);

  const statusOut = cli(["status", "--repo", root, "--run", "RUN-T-01"]);
  assert.match(statusOut, /step verify: SUCCEEDED \(attempts 1\)/);
  assert.match(statusOut, /step review: SUCCEEDED \(attempts 1\)/);
  assert.match(statusOut, /evidence \[passed\/L2\] command .*verify-1\.log/);
  assert.match(statusOut, /evidence \[passed\/L2\] review .*review-1\.json/);
  assert.doesNotMatch(statusOut, /invalid-output|infra/);
  // The wrapper hands the tool's stdout over verbatim; one ```json fence is
  // tolerated by the runtime's parser, so strip it the same way here.
  const rawEnvelope = readFileSync(
    join(root, ".buildbeat", "runtime", "runs", "RUN-T-01", "outputs", "review-1.json"),
    "utf8",
  ).trim();
  const reviewEnvelope = JSON.parse(rawEnvelope.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/)?.[1] ?? rawEnvelope);
  assert.equal(reviewEnvelope.status, "succeeded");
  assert.deepEqual(reviewEnvelope.findings, [{ severity: "P2", summary: "naming could be clearer" }]);

  // A P2 finding is recorded and does not block the approval.
  const approveOut = cli(["decide", "--repo", root, "--work", "WORK-T", "--action", "approve", "--candidate", sha, "--by", "owner", "--as", "human"]);
  assert.match(approveOut, /RUN-T-01 is terminal: SUCCEEDED/);
  const workOut = cli(["status", "--repo", root, "--work", "WORK-T"]);
  assert.match(workOut, /WORK-T {2}MERGED/);
  assert.match(workOut, /cost: review rounds 1 · findings 1/);
});

test("worker.sh reports a missing tool as infrastructure (exit 75)", () => {
  const root = tempDir("bb-wrapper-");
  execFileSync("git", ["init", "-q", root]);
  let code = 0;
  try {
    execFileSync("bash", [join(TEMPLATES, "envelope", "worker.sh"), "reviewer", "--", "definitely-not-a-tool-xyz"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    code = error.status;
  }
  assert.equal(code, 75);
});
