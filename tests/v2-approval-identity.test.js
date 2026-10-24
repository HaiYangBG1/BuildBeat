// WORK-APPROVAL-IDENTITY: a decision records who made it and whether that
// was a person or an AI session, instead of defaulting to "human".
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { deliveryWorkflow, DELIVERY_TEXT } from "../src/v2/engine/workflow.js";
import { sha256Text } from "../src/v2/policy/policy.js";
import { describeActor, detectAgentSession, resolveActor } from "../src/v2/runtime/actor.js";
import {
  acceptArtifacts,
  adoptCandidate,
  rejectRun,
  requestFix,
} from "../src/v2/runtime/decisions.js";
import { adjudicateFinding, readFindingsAccount, recordReviewFindings } from "../src/v2/runtime/findings.js";
import { startRun } from "../src/v2/runtime/orchestrator.js";
import { closeWork } from "../src/v2/runtime/release.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { tempDir } from "./support/tmp.js";

// Fixture repositories must not see the host's git identity: the default
// name for a person comes from git, and a missing one has to be an error.
const gitEnvironment = {
  GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_GLOBAL: "/dev/null",
};
let saved;
beforeEach(() => {
  saved = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("GIT_")));
  for (const key of Object.keys(saved)) delete process.env[key];
  Object.assign(process.env, gitEnvironment);
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (key.startsWith("GIT_")) delete process.env[key];
  Object.assign(process.env, saved);
});

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const clean = () => ({ behavior: "succeed", envelope: { status: "succeeded", findings: [] } });
const NO_SESSION = {};
const SESSION = { CLAUDECODE: "1" };

function cli(root, env, ...args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: root, encoding: "utf8", env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function lines(path) {
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function repo({ name = "Test" } = {}) {
  const root = tempDir("bb-identity-");
  git(root, "init", "-q", "-b", "main");
  if (name) git(root, "config", "user.name", name);
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "commit.gpgSign", "false");
  git(root, "config", "core.hooksPath", "/dev/null");
  writeFileSync(join(root, "feature.txt"), "baseline\n");
  git(root, "add", ".");
  git(root, "-c", "user.name=Setup", "commit", "-qm", "baseline");
  return root;
}

// A run waiting at the final merge decision, with a fixer configured.
function finalDecision() {
  const root = repo();
  const worktree = join(root, ".buildbeat", "worktrees", "RUN-I");
  const scripted = createMockAdapter({ build: ["succeed"], verify: Array(4).fill("succeed"), review: Array.from({ length: 4 }, clean), fix: Array(4).fill("succeed") });
  const adapter = {
    name: "fixture",
    execute(context) {
      if (context.step === "build") commit(worktree, "built\n");
      return scripted.execute(context);
    },
  };
  startRun({
    repoRoot: root, workId: "WORK-I", runId: "RUN-I", entry: "build", workflow: deliveryWorkflow(),
    workflowDigest: sha256Text(DELIVERY_TEXT), allowedPaths: ["feature.txt"],
    budgets: { reviewRoundsPerWork: 6 },
    deliveryChecks: { artifact: "work", requireAcceptance: false },
    adapters: { builder: adapter, verifier: adapter, reviewer: adapter, fixer: adapter },
  });
  const ledger = () => EventLedger.open(join(root, ".buildbeat/runtime/runs/RUN-I/events.jsonl"));
  assert.equal(ledger().state.pendingHuman.kind, "final-decision");
  return { root, worktree, ledger, candidate: () => ledger().state.pendingHuman.subject.candidate };
}

function commit(worktree, content) {
  writeFileSync(join(worktree, "feature.txt"), content);
  git(worktree, "add", "feature.txt");
  git(worktree, "-c", "user.name=Setup", "commit", "-qm", "change");
  return git(worktree, "rev-parse", "HEAD");
}

const decisionsOf = (root, work = "WORK-I") => lines(join(root, "delivery", "work", work, "decisions.jsonl"));

test("default: outside an AI session a decision is a person's, named from git", () => {
  const root = repo({ name: "Alice" });
  assert.deepEqual(resolveActor({ repoRoot: root, env: NO_SESSION }), { kind: "human", id: "Alice", source: "git" });
});

test("default: no git name and no --by is an error, never a made-up 'human'", () => {
  const root = repo({ name: null });
  assert.throws(() => resolveActor({ repoRoot: root, env: NO_SESSION }), /pass --by <name>/);
  mkdirSync(join(root, "delivery", "work", "W"), { recursive: true });
  writeFileSync(join(root, "delivery", "work", "W", "work.md"), "# W\n");
  const result = spawnSync(process.execPath, [CLI, "accept", "--repo", root, "--work", "W"], {
    encoding: "utf8", env: { ...process.env },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pass --by <name>/);
});

test("explicit --by and --as are recorded as given", () => {
  const root = repo();
  assert.deepEqual(resolveActor({ by: " owner ", repoRoot: root, env: NO_SESSION }), { kind: "human", id: "owner", source: "flag" });
  assert.deepEqual(resolveActor({ by: "bot", as: "agent", repoRoot: root, env: NO_SESSION }), { kind: "agent", id: "bot", source: "flag" });
  assert.deepEqual(resolveActor({ as: "agent", repoRoot: root, env: NO_SESSION }), { kind: "agent", id: "ai-session", source: "default" });
  assert.throws(() => resolveActor({ as: "robot", repoRoot: root, env: NO_SESSION }), /--as must be human or agent/);
});

test("inside an AI session a decision is the session's unless it says it relays a person", () => {
  const root = repo();
  assert.deepEqual(resolveActor({ repoRoot: root, env: SESSION }), { kind: "agent", id: "claude-code", source: "env" });
  assert.deepEqual(resolveActor({ by: "owner", repoRoot: root, env: SESSION }), { kind: "agent", id: "owner", source: "flag" });
  assert.deepEqual(resolveActor({ by: "owner", as: "human", repoRoot: root, env: SESSION }),
    { kind: "human", id: "owner", source: "flag", via: "agent-session" });
  assert.deepEqual(detectAgentSession({ CODEX_SANDBOX: "seatbelt" }), { tool: "codex", marker: "CODEX_SANDBOX" });
  assert.deepEqual(detectAgentSession({ AI_AGENT: "claude-code_2-1-295_agent" }), { tool: "claude-code", marker: "AI_AGENT" });
  assert.deepEqual(detectAgentSession({ BUILDBEAT_ACTOR: "agent" }), { tool: "ai-session", marker: "BUILDBEAT_ACTOR" });
  assert.equal(detectAgentSession({ BUILDBEAT_ACTOR: "human" }), null);
  assert.equal(detectAgentSession({ CLAUDECODE: "0" }), null);
});

test("an AI session approving the merge is recorded, replayable and called out in status", () => {
  const f = finalDecision();
  const candidate = f.candidate();
  const out = cli(f.root, SESSION, "decide", "--repo", f.root, "--run", "RUN-I", "--action", "approve",
    "--transition", "enter-wait-merge", "--candidate", candidate);
  assert.match(out, /by claude-code \(AI session\)/);
  const row = decisionsOf(f.root).at(-1);
  assert.equal(row.by, "claude-code");
  assert.deepEqual(row.actor, { kind: "agent", id: "claude-code", source: "env" });
  const ledger = f.ledger();
  assert.equal(ledger.corruption, null);
  const event = ledger.events.findLast((item) => item.type === "DECISION_RECORDED");
  assert.deepEqual(event.actor, { kind: "agent", id: "claude-code", source: "env" });
  assert.deepEqual(ledger.state.decisions.at(-1).actor, event.actor);
  const record = JSON.parse(readFileSync(join(f.root, "delivery/work/WORK-I/runs/RUN-I/run-record.json"), "utf8"));
  assert.equal(record.decisions.at(-1).actor.kind, "agent");

  const status = cli(f.root, NO_SESSION, "status", "--repo", f.root, "--work", "WORK-I");
  assert.match(status, /note: merge approved by an AI session \(claude-code, D-RUN-I-1\), not by a person/);
  assert.match(status, /decisions:\n.* D-RUN-I-1 enter-wait-merge approved by claude-code \(AI session\)/);
  const run = cli(f.root, NO_SESSION, "status", "--repo", f.root, "--run", "RUN-I");
  assert.match(run, /decision D-RUN-I-1 enter-wait-merge approved by claude-code \(AI session\)/);
  assert.match(run, /note: merge approved by an AI session \(claude-code, D-RUN-I-1\), not by a person/);
  const overview = cli(f.root, NO_SESSION, "status", "--repo", f.root);
  assert.match(overview, /note: merge approved by an AI session/);
  const json = JSON.parse(cli(f.root, NO_SESSION, "status", "--repo", f.root, "--work", "WORK-I", "--json"));
  assert.equal(json.works[0].decisions.at(-1).actor.kind, "agent");
  assert.equal(json.works[0].selfMergeApproval.decisionRef, "D-RUN-I-1");
});

test("a person's merge decision relayed from an AI session says so, without the AI-approval note", () => {
  const f = finalDecision();
  cli(f.root, SESSION, "decide", "--repo", f.root, "--run", "RUN-I", "--action", "approve",
    "--transition", "enter-wait-merge", "--candidate", f.candidate(), "--as", "human", "--by", "owner");
  assert.deepEqual(decisionsOf(f.root).at(-1).actor, { kind: "human", id: "owner", source: "flag", via: "agent-session" });
  const status = cli(f.root, NO_SESSION, "status", "--repo", f.root, "--work", "WORK-I");
  assert.match(status, /approved by owner \(person, entered from an AI session\)/);
  assert.doesNotMatch(status, /merge approved by an AI session/);
});

test("every decision entry point records the decider", () => {
  const root = repo();
  mkdirSync(join(root, "delivery", "work", "WORK-I"), { recursive: true });
  writeFileSync(join(root, "delivery", "work", "WORK-I", "work.md"), "# Work\n");
  const accepted = acceptArtifacts(root, "WORK-I", ["work"], { env: undefined });
  assert.deepEqual(accepted[0].actor, { kind: "human", id: "Test", source: "git" });
  assert.deepEqual(decisionsOf(root).at(-1).actor, accepted[0].actor);

  const adopt = finalDecision();
  const sha = commit(adopt.worktree, "hand fix\n");
  adoptCandidate(adopt.root, "RUN-I", { sha, as: "agent", resumeAt: "verify" });
  assert.equal(decisionsOf(adopt.root).at(-1).actor.kind, "agent");
  const pinned = adopt.ledger().events.findLast((item) => item.type === "CANDIDATE_PINNED");
  assert.equal(pinned.actor.kind, "agent");

  const reject = finalDecision();
  const rejected = rejectRun(reject.root, "RUN-I", { by: "owner", reason: "not needed" });
  assert.equal(rejected.actor.id, "owner");
  assert.equal(decisionsOf(reject.root).at(-1).actor.kind, "human");

  const fix = finalDecision();
  requestFix(fix.root, "RUN-I", { by: "bot", as: "agent", reason: "tighten the check" });
  assert.equal(decisionsOf(fix.root).at(-1).actor.kind, "agent");
  const adjudication = readFindingsAccount(fix.root, "WORK-I").findLast((item) => item.kind === "adjudication");
  assert.deepEqual(adjudication.actor, { kind: "agent", id: "bot", source: "flag" });

  recordReviewFindings(root, "WORK-I", { run: "RUN-X", step: "review", attempt: 1, findings: [{ severity: "P2", summary: "docs drift" }] });
  const [finding] = readFindingsAccount(root, "WORK-I");
  const verdict = adjudicateFinding(root, "WORK-I", { fingerprint: finding.fingerprint, action: "dismiss", by: "owner", note: "fine" });
  assert.deepEqual(verdict.actor, { kind: "human", id: "owner", source: "flag" });

  appendFileSync(join(root, "delivery", "work", "WORK-I", "releases.jsonl"),
    `${JSON.stringify({ ts: "2026-10-19T00:00:00.000Z", status: "passed", digest: "sha256:readback", commit: git(root, "rev-parse", "HEAD"), candidate: null })}\n`);
  writeFileSync(join(root, "delivery", "work", "WORK-I", "result.md"), "# WORK-I result\n\nReleased.\n");
  const closed = closeWork({ repoRoot: root, workId: "WORK-I", result: "released" });
  assert.deepEqual(closed.actor, { kind: "human", id: "Test", source: "git" });

  // Finding rulings are decisions too, listed with their decider even
  // after the work is closed.
  const status = cli(root, NO_SESSION, "status", "--repo", root, "--work", "WORK-I");
  assert.match(status, /WORK-I {2}CLOSED/);
  assert.match(status, new RegExp(`adjudicate-finding ${finding.fingerprint} dismiss by owner \\(person\\)`));
  assert.match(status, /close-work closed by Test \(person\)/);
  const json = JSON.parse(cli(root, NO_SESSION, "status", "--repo", root, "--work", "WORK-I", "--json"));
  const ruling = json.works[0].decisions.find((item) => item.transition === "adjudicate-finding");
  assert.deepEqual(ruling.actor, { kind: "human", id: "owner", source: "flag" });
  assert.equal(ruling.fingerprint, finding.fingerprint);
});

test("records written before identities existed stay readable and are not guessed", () => {
  const root = repo();
  const dir = join(root, "delivery", "work", "WORK-OLD");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "work.md"), "# Old\n");
  const digest = sha256Text("# Old\n");
  appendFileSync(join(dir, "decisions.jsonl"), [
    { ts: "2026-09-01T00:00:00.000Z", decisionRef: "A-WORK-OLD-1", decision: "approved", transition: "accept-work", subject: { artifact: "work", digest }, by: "human" },
    { ts: "2026-09-02T00:00:00.000Z", run: "RUN-OLD-01", decisionRef: "D-RUN-OLD-01-1", decision: "approved", transition: "enter-wait-merge", subject: { candidate: "abc" }, by: "driving-session" },
  ].map((row) => `${JSON.stringify(row)}\n`).join(""));
  const status = cli(root, NO_SESSION, "status", "--repo", root, "--work", "WORK-OLD");
  assert.match(status, /accept-work approved by human \(identity not recorded\)/);
  assert.match(status, /enter-wait-merge approved by driving-session \(identity not recorded\)/);
  assert.doesNotMatch(status, /merge approved by an AI session/);
  assert.equal(describeActor({ by: "x", actor: { kind: "human", id: "x" } }), "x (identity not recorded)");
});

test("Codex desktop without a sandbox marker is still an AI session", () => {
  const root = repo();
  const env = { CODEX_THREAD_ID: "fixture-thread" };
  assert.deepEqual(detectAgentSession(env), { tool: "codex", marker: "CODEX_THREAD_ID" });
  assert.deepEqual(resolveActor({ repoRoot: root, env }), { kind: "agent", id: "codex", source: "env" });
  assert.deepEqual(resolveActor({ repoRoot: root, env, as: "human", by: "owner" }),
    { kind: "human", id: "owner", source: "flag", via: "agent-session" });
});

test("Codex desktop decisions persist AI identity and human relay provenance", () => {
  const f = finalDecision();
  const env = { CODEX_THREAD_ID: "fixture-thread" };
  cli(f.root, env, "decide", "--repo", f.root, "--run", "RUN-I", "--action", "approve",
    "--transition", "enter-wait-merge", "--candidate", f.candidate());
  assert.deepEqual(decisionsOf(f.root).at(-1).actor, { kind: "agent", id: "codex", source: "env" });
  assert.match(cli(f.root, NO_SESSION, "status", "--repo", f.root, "--run", "RUN-I"), /merge approved by an AI session \(codex,/);

  const relay = finalDecision();
  cli(relay.root, env, "decide", "--repo", relay.root, "--run", "RUN-I", "--action", "approve",
    "--transition", "enter-wait-merge", "--candidate", relay.candidate(), "--as", "human", "--by", "owner");
  assert.deepEqual(decisionsOf(relay.root).at(-1).actor,
    { kind: "human", id: "owner", source: "flag", via: "agent-session" });
});
