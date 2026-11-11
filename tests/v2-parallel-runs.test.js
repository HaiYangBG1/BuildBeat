// One review runs in a repository at a time. A second one, of the same work
// or of another, is refused while the first runs and leaves nothing behind;
// reviews of different works never touch each other's records.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { approveReview } from "../src/v2/runtime/decisions.js";
import { CLI, addWork, commit, fixture, jsonl, review, reviewWith, statusRow, worker, yaml } from "./support/review.js";
import { tempDir } from "./support/tmp.js";

// The verifier says it started (started-<run> in $SIGNALS) and then waits
// for as long as $SIGNALS/hang exists.
const VERIFIER = [
  'import { existsSync, writeFileSync } from "node:fs";',
  'import { join } from "node:path";',
  "const input = JSON.parse(process.env.BUILDBEAT_INPUT);",
  "const dir = process.env.SIGNALS;",
  'writeFileSync(join(dir, `started-${input.runId}`), "");',
  "const from = Date.now();",
  'while (existsSync(join(dir, "hang")) && Date.now() - from < 30000) {',
  "  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);",
  "}",
  "",
].join("\n");

function hangingRepo() {
  const signals = tempDir("bb-v2-parallel-signals-");
  const { root } = fixture({
    prefix: "bb-v2-parallel-",
    projectConfig: yaml([
      "workers:",
      "  verifier:",
      "    command: node",
      "    args:",
      "      - tools/verify.mjs",
      "    env:",
      `      SIGNALS: ${signals}`,
      "  reviewer:",
      "    command: sh",
      "    args:",
      "      - tools/reviewer.sh",
    ]),
  });
  addWork(root, "WORK-B");
  commit(root, "the verifier and a change", { "tools/verify.mjs": VERIFIER, "src/feature.txt": "hello\n" });
  return { root, signals, hang: join(signals, "hang") };
}

function reviewDetached(root, work) {
  const child = spawn(process.execPath, [CLI, "review", "--repo", root, "--work", work], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (chunk) => (out += chunk));
  child.stderr.on("data", (chunk) => (out += chunk));
  return new Promise((resolve) => child.on("close", (code) => resolve({ code, out })));
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function untilVerifying(signals, run) {
  const deadline = Date.now() + 30000;
  while (!existsSync(join(signals, `started-${run}`))) {
    assert.ok(Date.now() < deadline, `${run} never reached verify`);
    await pause(50);
  }
}

const runsOf = (root, work) => {
  const dir = join(root, "delivery", "work", work, "runs");
  return existsSync(dir) ? readdirSync(dir) : [];
};
const ledgers = (root) => readdirSync(join(root, ".buildbeat", "runtime", "runs")).sort();

test("while a review runs, a review of another work or of the same work is refused and records nothing", async () => {
  const { root, signals, hang } = hangingRepo();
  writeFileSync(hang, "");
  const first = reviewDetached(root, "WORK-A");
  try {
    await untilVerifying(signals, "RUN-A-01");

    const other = review(root, "WORK-B");
    assert.equal(other.status, 1, other.all);
    assert.match(other.err, /another review is running in this repository; .*pid \d+/);
    const same = review(root, "WORK-A");
    assert.equal(same.status, 1, same.all);
    assert.match(same.err, /another review is running in this repository/);

    assert.deepEqual(ledgers(root), ["RUN-A-01"]);
    assert.deepEqual(runsOf(root, "WORK-B"), []);
    assert.equal(existsSync(join(root, ".buildbeat", "worktrees", "RUN-B-01")), false);
  } finally {
    rmSync(hang, { force: true });
  }
  const done = await first;
  assert.equal(done.code, 0, done.out);
  assert.match(done.out, /status: WAITING_HUMAN/);

  // The refused reviews did not disturb the one that ran, and the other
  // work can be reviewed now.
  assert.deepEqual(ledgers(root), ["RUN-A-01"]);
  const later = review(root, "WORK-B");
  assert.equal(later.status, 0, later.all);
  assert.match(later.out, /as RUN-B-01 /);
  assert.doesNotMatch(later.out, /superseded/);
  assert.deepEqual(ledgers(root), ["RUN-A-01", "RUN-B-01"]);
  assert.equal(statusRow(root, "WORK-A").latest.status, "WAITING_HUMAN");
  assert.equal(statusRow(root, "WORK-B").latest.status, "WAITING_HUMAN");
});

test("reviews of two works keep their own runs, findings and decisions", () => {
  const { root } = fixture({ prefix: "bb-v2-parallel-" });
  addWork(root, "WORK-B");
  const sha = commit(root, "a change both works are reviewed on", { "src/feature.txt": "hello\n" });
  const seen = [];
  const spy = (summary) => worker(({ input }) => {
    seen.push(input);
    return { envelope: { findings: [{ severity: "P3", summary }] } };
  });

  const a = reviewWith(root, "WORK-A", { reviewer: spy("a note for A") });
  const b = reviewWith(root, "WORK-B", { reviewer: spy("a note for B") });
  assert.equal(a.runId, "RUN-A-01");
  assert.equal(b.runId, "RUN-B-01");
  // The waiting review of another work is not superseded.
  assert.deepEqual(b.superseded, []);
  assert.equal(a.state.run.status, "WAITING_HUMAN");
  assert.equal(b.state.run.status, "WAITING_HUMAN");
  // Nor is it what the reviewer of the other work "saw last".
  assert.equal(seen[1].lastReviewed, undefined);

  const summaries = (work) => jsonl(root, work, "review-findings.jsonl").filter((row) => row.kind === "finding").map((row) => row.summary);
  assert.deepEqual(summaries("WORK-A"), ["a note for A"]);
  assert.deepEqual(summaries("WORK-B"), ["a note for B"]);
  assert.equal(a.state.run.work, "WORK-A");
  assert.equal(b.state.run.work, "WORK-B");

  // Approving one work leaves the other waiting.
  approveReview(root, "WORK-B", { candidate: sha, by: "owner", as: "human" });
  const decisions = (work) => jsonl(root, work, "decisions.jsonl");
  // Each work holds its own acceptance; only WORK-B gained the approval.
  assert.equal(decisions("WORK-A").length, 1);
  assert.equal(decisions("WORK-B").length, 2);
  assert.ok(JSON.stringify(decisions("WORK-B")[1]).includes(sha));
  assert.equal(statusRow(root, "WORK-A").stage, "MERGE_DECISION");
  assert.notEqual(statusRow(root, "WORK-B").stage, "MERGE_DECISION");
});
