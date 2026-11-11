// Prompts for the workers of a review (envelope: in a run config): loaded per
// worker, with declared vars substituted, optionally pinned to a commit, and
// materialised into the run directory for the worker to read.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { EnvelopeError, loadEnvelope, nextAttemptId, substituteVars } from "../src/v2/runtime/envelope.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { cli, commit, emptyRepo, fixture, review, write, yaml } from "./support/review.js";

// The workers a review has.
const WORKERS = ["verifier", "reviewer"];

test("envelope loads prompts per worker with component prefix, substitutes vars, and pins to a commit", () => {
  const root = emptyRepo("bb-v2-envelope-");
  const configDir = join(root, "delivery", "work", "WORK-E");
  const pinned = commit(root, "prompts v1", {
    "delivery/work/WORK-E/prompts/auth-reviewer.md": "review {vars.component} at {vars.level}\n",
    "delivery/work/WORK-E/prompts/verifier.md": "verify generic\n",
  });
  write(root, "delivery/work/WORK-E/prompts/auth-reviewer.md", "CHANGED after pin\n");

  const config = { envelope: { prompts: "prompts", vars: { component: "auth", level: 2 } } };
  const live = loadEnvelope(config, configDir, WORKERS);
  assert.equal(live.prompts.reviewer.file, "auth-reviewer.md");
  assert.equal(live.prompts.reviewer.text, "CHANGED after pin\n");
  assert.equal(live.prompts.verifier.text, "verify generic\n");
  assert.match(live.digest, /^sha256:/);
  // Without the component nothing is named for the reviewer: it gets no prompt.
  const plain = loadEnvelope({ envelope: { prompts: "prompts" } }, configDir, WORKERS);
  assert.equal(plain.prompts.verifier.file, "verifier.md");
  assert.equal(plain.prompts.reviewer, undefined);

  const frozen = loadEnvelope({ envelope: { ...config.envelope, pin: pinned } }, configDir, WORKERS);
  assert.equal(frozen.prompts.reviewer.text, "review auth at 2\n");
  assert.equal(frozen.pin, pinned);
  assert.notEqual(frozen.digest, live.digest);
  assert.match(frozen.source, new RegExp(`delivery/work/WORK-E/prompts@${pinned}`));

  assert.equal(loadEnvelope({}, root, WORKERS), null);
  assert.throws(() => loadEnvelope({ envelope: { prompts: "nowhere" } }, root, WORKERS), EnvelopeError);
  assert.throws(() => loadEnvelope({ envelope: { prompts: "prompts", pin: "not-a-sha" } }, root, WORKERS), /commit sha/);
  assert.equal(substituteVars("a {vars.x} b {vars.y}", { x: 1 }), "a 1 b {vars.y}");
});

test("a review hands the materialised prompt to the worker, records the envelope digest, numbers attempts and redacts evidence", () => {
  // The verifier passes only if it was handed the substituted prompt and an
  // input that names the envelope; it prints a var from its args template and
  // then a token the project redacts.
  const { root, work } = fixture({
    prefix: "bb-v2-envelope-",
    work: "WORK-E",
    projectConfig: yaml([
      "envelope:",
      "  prompts: prompts",
      "  vars:",
      "    component: svc",
      "redact:",
      "  - 'token=[^ ]+'",
      "workers:",
      "  verifier:",
      "    command: bash",
      "    args:",
      "      - -lc",
      "      - 'grep -q \"Check svc\" \"$BUILDBEAT_PROMPT\" && echo \"$BUILDBEAT_INPUT\" | grep -q \"envelope\" && echo component={vars.component} && echo token=abc123-in-output'",
      "  reviewer:",
      "    command: sh",
      "    args:",
      "      - tools/reviewer.sh",
    ]),
  });
  commit(root, "add the feature and the verifier's prompt", {
    "src/feature.txt": "hello\n",
    "delivery/prompts/svc-verifier.md": "Check {vars.component}; token=hunter2 must not leak\n",
  });

  const checked = cli(["check", "--repo", root, "--work", work]);
  assert.match(checked.out, /prompts: prompts \(verifier\) sha256:/);

  const first = review(root, work);
  assert.equal(first.status, 0, first.all);
  assert.match(first.out, /reviewing \w{7} as RUN-E-01/);
  assert.match(first.out, /status: WAITING_HUMAN/);
  const runDir = join(root, ".buildbeat", "runtime", "runs", "RUN-E-01");
  const ledger = EventLedger.open(join(runDir, "events.jsonl"));
  assert.match(ledger.events[0].data.envelopeDigest, /^sha256:/);
  assert.equal(ledger.events[0].data.envelopeSource, "prompts");
  // The worker with a prompt got it, substituted; the other got none.
  assert.equal(readFileSync(join(runDir, "prompts", "verify-1.md"), "utf8"), "Check svc; token=hunter2 must not leak\n");
  assert.equal(existsSync(join(runDir, "prompts", "review-1.md")), false);
  // The args template saw the var, and redaction applied to the evidence log
  // (the verifier printed a token).
  const verifyLog = readFileSync(join(runDir, "logs", "verify-1.log"), "utf8");
  assert.match(verifyLog, /--- stdout ---\ncomponent=svc\n<REDACTED>\n--- stderr ---\n/);
  assert.doesNotMatch(verifyLog, /abc123/);

  // Second review of the same work: numbered, and it supersedes the first
  // (still waiting) run.
  const second = review(root, work);
  assert.equal(second.status, 0, second.all);
  assert.match(second.out, /reviewing \w{7} as RUN-E-02/);
  assert.match(second.out, /superseded RUN-E-01/);
  assert.equal(nextAttemptId(root, work, "RUN-E"), "RUN-E-03");
});
