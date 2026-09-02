import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { EnvelopeError, loadEnvelope, nextAttemptId, substituteVars } from "../src/v2/runtime/envelope.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat-v2.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function cli(args, env = {}) {
  return execFileSync("node", [CLI, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-envelope-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return root;
}

test("envelope loads prompts per worker with component prefix, substitutes vars, and pins to a commit", () => {
  const root = fixtureRepo();
  const promptsDir = join(root, "delivery", "work", "WORK-E", "prompts");
  mkdirSync(promptsDir, { recursive: true });
  writeFileSync(join(promptsDir, "auth-builder.md"), "build {vars.component} at {vars.level}\n");
  writeFileSync(join(promptsDir, "verifier.md"), "verify generic\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "prompts v1"]);
  const pinned = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(promptsDir, "auth-builder.md"), "CHANGED after pin\n");

  const config = { envelope: { prompts: "prompts", vars: { component: "auth", level: 2 } } };
  const live = loadEnvelope(config, join(root, "delivery", "work", "WORK-E"), ["builder", "verifier", "reviewer"]);
  assert.equal(live.prompts.builder.file, "auth-builder.md");
  assert.equal(live.prompts.builder.text, "CHANGED after pin\n");
  assert.equal(live.prompts.verifier.text, "verify generic\n");
  assert.equal(live.prompts.reviewer, undefined);
  assert.match(live.digest, /^sha256:/);

  const frozen = loadEnvelope({ envelope: { ...config.envelope, pin: pinned } }, join(root, "delivery", "work", "WORK-E"), ["builder", "verifier"]);
  assert.equal(frozen.prompts.builder.text, "build auth at 2\n");
  assert.equal(frozen.pin, pinned);
  assert.notEqual(frozen.digest, live.digest);
  assert.match(frozen.source, new RegExp(`delivery/work/WORK-E/prompts@${pinned}`));

  assert.equal(loadEnvelope({}, root, ["builder"]), null);
  assert.throws(() => loadEnvelope({ envelope: { prompts: "nowhere" } }, root, ["builder"]), EnvelopeError);
  assert.throws(() => loadEnvelope({ envelope: { prompts: "prompts", pin: "not-a-sha" } }, root, ["builder"]), /commit sha/);
  assert.equal(substituteVars("a {vars.x} b {vars.y}", { x: 1 }), "a 1 b {vars.y}");
});

test("a run hands the materialised prompt to the worker, records the envelope digest, numbers attempts and redacts evidence", () => {
  const root = fixtureRepo();
  const workDir = join(root, "delivery", "work", "WORK-E");
  mkdirSync(join(workDir, "prompts"), { recursive: true });
  writeFileSync(join(workDir, "prompts", "svc-builder.md"), "Implement {vars.component}; token=hunter2 must not leak\n");
  writeFileSync(
    join(workDir, "run-config.yaml"),
    [
      "repo: ../../..",
      "work: WORK-E",
      "run: RUN-E",
      `workflow: ${PRESET}`,
      "riskPreset: fast",
      "entry: build",
      "stopAt:",
      "  - review",
      "envelope:",
      "  prompts: prompts",
      "  vars:",
      "    component: svc",
      "redact:",
      "  - 'token=[^ ]+'",
      "workers:",
      "  builder:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - 'cat \"$BUILDBEAT_PROMPT\" > prompt-seen.txt && echo component={vars.component} && echo \"$BUILDBEAT_INPUT\" | grep -o \"envelope\" && git add -A && git commit -qm candidate'",
      "  verifier:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - 'grep -q \"Implement svc\" prompt-seen.txt && echo token=abc123-in-output'",
    ].join("\n"),
  );

  const first = cli(["start", "--config", join(workDir, "run-config.yaml"), "--attempt", "new"]);
  assert.match(first, /attempt: RUN-E-01/);
  assert.match(first, /envelope: prompts \(builder\) sha256:/);
  assert.match(first, /status: WAITING_HUMAN/);
  const ledger = EventLedger.open(join(root, ".buildbeat", "runtime", "runs", "RUN-E-01", "events.jsonl"));
  assert.match(ledger.events[0].data.envelopeDigest, /^sha256:/);
  assert.equal(ledger.events[0].data.envelopeSource, "prompts");
  assert.ok(existsSync(join(root, ".buildbeat", "runtime", "runs", "RUN-E-01", "prompts", "build-1.md")));
  // The worker saw the substituted prompt; the args template saw the var.
  const buildLog = readFileSync(join(root, ".buildbeat", "runtime", "runs", "RUN-E-01", "logs", "build-1.log"), "utf8");
  assert.match(buildLog, /component=svc/);
  // Redaction applied to evidence logs (the verifier printed a token).
  const verifyLog = readFileSync(join(root, ".buildbeat", "runtime", "runs", "RUN-E-01", "logs", "verify-1.log"), "utf8");
  assert.match(verifyLog, /--- stdout ---\n<REDACTED>\n/);
  assert.doesNotMatch(verifyLog, /abc123/);

  // Second attempt of the same family: numbered, and it supersedes the first
  // (still waiting) run.
  const second = cli(["start", "--config", join(workDir, "run-config.yaml"), "--attempt", "new"]);
  assert.match(second, /attempt: RUN-E-02/);
  assert.match(second, /superseded RUN-E-01/);
  assert.equal(nextAttemptId(root, "WORK-E", "RUN-E"), "RUN-E-03");
});
