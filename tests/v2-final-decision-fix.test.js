// What outlived the "fix" and "adopt" answers to the merge decision this file
// was written for (both are gone: a repair is the next commit, reviewed as a
// new run):
// 1. Fixtures, the runtime and shell workers are not affected by the host's
//    Git configuration.
// 2. Records an earlier version wrote for a repair handed in with --adopt
//    still read as a hand-in, not as a merge approval.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { beforeEach, afterEach } from "node:test";
import { approveReview } from "../src/v2/runtime/decisions.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { cli, commit, decide, fixture, record, review, reviewWith, yaml } from "./support/review.js";
import { tempDir } from "./support/tmp.js";

// Runtime Git calls inherit this process; CLI children inherit it too. Workers
// use an allowlist, so their fixture config explicitly carries these overrides.
const gitEnvironment = {
  GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_GLOBAL: "/dev/null",
};
let savedGitEnvironment;
beforeEach(() => {
  savedGitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("GIT_")));
  for (const key of Object.keys(savedGitEnvironment)) delete process.env[key];
  Object.assign(process.env, gitEnvironment);
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (key.startsWith("GIT_")) delete process.env[key];
  Object.assign(process.env, savedGitEnvironment);
});

test("the runtime reviews a commit and records its approval", () => {
  const { root, work } = fixture();
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const reviewed = reviewWith(root, work);
  assert.equal(reviewed.candidate, sha);
  assert.equal(reviewed.state.pendingHuman.kind, "final-decision");
  const approved = approveReview(root, work, { candidate: sha, by: "owner", as: "human" });
  assert.equal(approved.state.terminal.status, "SUCCEEDED");
  assert.equal(record(root, work, "RUN-A-01").workspaces["RUN-A-01"].candidate, sha);
});

// The verifier commits in a repository of its own: a commit is what a signing
// program or a hook of the host would break.
const VERIFY_WITH_GIT = [
  "#!/bin/sh",
  "set -eu",
  "test -f src/feature.txt",
  'scratch=$(mktemp -d)',
  'git init -q "$scratch"',
  'git -C "$scratch" -c user.name=Worker -c user.email=worker@example.com commit -q --allow-empty -m probe',
  'rm -rf "$scratch"',
  "",
].join("\n");

test("the CLI reviews a commit with shell workers that use Git", () => {
  const env = Object.entries(gitEnvironment).map(([key, value]) => `      ${key}: "${value}"`);
  const { root, work } = fixture({
    workConfig: yaml([
      "workers:",
      "  verifier:", "    command: sh", "    env:", ...env, "    args:", "      - tools/verify.sh",
      "  reviewer:", "    command: sh", "    env:", ...env, "    args:", "      - tools/reviewer.sh",
    ]),
  });
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n", "tools/verify.sh": VERIFY_WITH_GIT });
  const reviewed = review(root, work);
  assert.equal(reviewed.status, 0, reviewed.all);
  assert.match(reviewed.out, /step verify: SUCCEEDED \(attempts 1\)/);
  assert.match(reviewed.out, /step review: SUCCEEDED \(attempts 1\)/);
  assert.match(reviewed.out, /status: WAITING_HUMAN/);
  const approved = decide(root, work, ["--action", "approve", "--candidate", sha]);
  assert.equal(approved.status, 0, approved.all);
  assert.equal(record(root, work, "RUN-A-01").terminal.status, "SUCCEEDED");
});

test("fixtures, runtime and shell workers ignore hostile host Git configuration", () => {
  const root = tempDir("bb-hostile-git-");
  const hooks = join(root, "hooks");
  const marker = join(root, "hook-ran");
  mkdirSync(hooks);
  writeFileSync(join(hooks, "pre-commit"), `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 });
  const config = join(root, "host.gitconfig");
  writeFileSync(config, `[commit]\n  gpgSign = true\n[gpg]\n  program = /unavailable-buildbeat-test-signer\n[core]\n  hooksPath = ${hooks}\n`);
  // A nested test runner must not inherit Node's child-runner protocol.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-name-pattern", "^(the runtime reviews a commit and records its approval|the CLI reviews a commit with shell workers that use Git)$", import.meta.filename], {
    encoding: "utf8", env: { ...env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_SYSTEM: config,
      GIT_CONFIG_NOSYSTEM: "0", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "commit.gpgSign", GIT_CONFIG_VALUE_0: "true" },
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /# pass 2\b/, "both the runtime and the CLI test must actually run");
  assert.equal(existsSync(marker), false, "host hooks must never execute");
});

// A hand repair adopted at the merge decision answered the request as an
// approved enter-wait-merge carrying `adopted`; it approved no merge
// (WORK-ADOPT-NOT-APPROVAL). Real cost behind it: status reported a merge
// "approved by an AI session, not by a person" while the owner had not
// decided yet. Nothing writes such a record any more; the ones in Git and in
// old ledgers are still read.
const SESSION = { kind: "agent", id: "claude-code", source: "env" };
const KERNEL = { kind: "kernel", id: "orchestrator" };
const OLD_RUN = "RUN-F";
const HAND_IN = "D-RUN-F-1";

// The ledger and the decision row an earlier version left: RUN-F waited at
// the merge decision on `first`, a session handed in `sha` with --adopt, and
// the run waits again on `sha`.
function oldHandIn(root, work, base, first, sha) {
  const ledger = EventLedger.open(join(root, ".buildbeat", "runtime", "runs", OLD_RUN, "events.jsonl"));
  const subject = (candidate) => ({ candidate, planDigest: "UNVERIFIED", evidenceDigest: "UNVERIFIED" });
  const waiting = (candidate) => ({ transition: "enter-wait-merge", kind: "final-decision", subject: subject(candidate), reasons: ["verified and reviewed"] });
  const events = [
    ["RUN_CREATED", KERNEL, { workflowRef: "software-delivery", workflowDigest: "sha256:old", base, riskPreset: "standard", deliveryChecks: { artifact: "work", requireAcceptance: false } }],
    ["RUN_STARTED", KERNEL, {}],
    ["WORKSPACE_BOUND", KERNEL, { workspaceId: OLD_RUN, repo: ".", branch: `run/${OLD_RUN}`, worktreePath: `.buildbeat/worktrees/${OLD_RUN}`, base }],
    ["CANDIDATE_PINNED", KERNEL, { workspaceId: OLD_RUN, base, candidate: first }],
    ["HUMAN_REQUESTED", KERNEL, waiting(first)],
    ["DECISION_RECORDED", SESSION, { decision: "approved", transition: "enter-wait-merge", subject: subject(first), decisionRef: HAND_IN, adopted: sha, resumeAt: "verify" }],
    ["RUN_STARTED", KERNEL, {}],
    ["CANDIDATE_PINNED", KERNEL, { workspaceId: OLD_RUN, base, candidate: sha }],
    ["HUMAN_REQUESTED", KERNEL, waiting(sha)],
  ];
  for (const [type, actor, data] of events) {
    ledger.append({ type, actor, data, run: OLD_RUN, work });
  }
  // The row carries the commit that reached the branch: read as an approval,
  // it would name the session as the one who approved the merge.
  appendFileSync(join(root, "delivery", "work", work, "decisions.jsonl"), `${JSON.stringify({
    ts: "2026-10-01T00:00:00.000Z", run: OLD_RUN, decisionRef: HAND_IN, decision: "approved", transition: "enter-wait-merge",
    subject: subject(sha), by: SESSION.id, actor: SESSION, adopted: sha, resumeAt: "verify",
  })}\n`);
}

function handedIn() {
  const { root, base, work } = fixture();
  const first = commit(root, "add the feature", { "src/feature.txt": "helo\n" });
  const sha = commit(root, "repair the text", { "src/feature.txt": "hello\n" });
  oldHandIn(root, work, base, first, sha);
  return { root, work, sha };
}

function statusOf(root, ...args) {
  const out = cli(["status", "--repo", root, ...args]);
  assert.equal(out.status, 0, out.err);
  return out.out;
}
const history = (root, ...args) => cli(["history", "--repo", root, "--path", "src/feature.txt", ...args]).out;

test("a repair adopted at the merge decision is shown as a hand-in, not as a merge approval", () => {
  const { root, work, sha } = handedIn();
  const views = [statusOf(root), statusOf(root, "--work", work), statusOf(root, "--run", OLD_RUN)];
  for (const view of views) assert.doesNotMatch(view, /merge approved by an AI session/);
  const line = `${HAND_IN} enter-wait-merge approved by claude-code \\(AI session\\) — adopted ${sha.slice(0, 7)}, resumed at verify$`;
  assert.match(views[2], new RegExp(`^decision ${line}`, "m"));
  assert.match(views[1], new RegExp(` ${line}`, "m"));
  assert.equal(JSON.parse(statusOf(root, "--work", work, "--json")).works[0].selfMergeApproval, undefined);

  // The repaired commit is on the branch with only the hand-in on record:
  // history --path names no approver.
  assert.equal(JSON.parse(history(root, "--json")).works.find((item) => item.work === work).approved, null);
  assert.doesNotMatch(history(root), /^ {4}approved: /m);

  // The session approving the merge itself is still called out, by that
  // approval's reference.
  const reviewed = reviewWith(root, work);
  assert.deepEqual(reviewed.superseded, [OLD_RUN]);
  const approval = approveReview(root, work, { actor: SESSION, candidate: sha });
  assert.equal(approval.state.terminal.status, "SUCCEEDED");
  const approved = approval.decisionRef;
  assert.notEqual(approved, HAND_IN);
  for (const view of [statusOf(root, "--work", work), statusOf(root, "--run", reviewed.runId)]) {
    assert.match(view, new RegExp(`note: merge approved by an AI session \\(claude-code, ${approved}\\), not by a person`));
  }

  // Once approved, history --path names that approval.
  assert.equal(JSON.parse(history(root, "--json")).works.find((item) => item.work === work).approved.decisionRef, approved);
  assert.match(history(root), new RegExp(`^ {4}approved: \\S+ by claude-code \\(AI session\\) \\(${reviewed.runId}\\)$`, "m"));
});

test("after a hand-in, a person's merge approval leaves no AI-approval note", () => {
  const { root, work, sha } = handedIn();
  const reviewed = reviewWith(root, work);
  approveReview(root, work, { by: "owner", as: "human", candidate: sha });
  for (const view of [statusOf(root), statusOf(root, "--work", work), statusOf(root, "--run", reviewed.runId)]) {
    assert.doesNotMatch(view, /merge approved by an AI session/);
  }
  const trace = JSON.parse(history(root, "--json"));
  assert.equal(trace.works.find((item) => item.work === work).approved.who, "owner (person)");
});
