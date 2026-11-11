// `buildbeat status --all-repos`: one call covers the main repository and
// every checkout directly inside it that keeps works of its own. Each
// repository's works, decisions and waiting reviews are read from that
// repository; nothing is written.

import assert from "node:assert/strict";
import childProcess, { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, relative } from "node:path";
import test from "node:test";
import { acceptWork } from "../src/v2/runtime/decisions.js";
import { computeRepositoryOverview } from "../src/v2/runtime/overview.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { addWork, commit, reviewWith } from "./support/review.js";
import { tempDir } from "./support/tmp.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
const actor = { kind: "kernel", id: "test" };
function fixtureEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  // No background maintenance either: after a fixture commit git may start
  // a detached `maintenance run --auto` whose objects/maintenance.lock lands
  // between the before/after snapshots.
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_COUNT: "4", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null",
    GIT_CONFIG_KEY_1: "commit.gpgSign", GIT_CONFIG_VALUE_1: "false",
    GIT_CONFIG_KEY_2: "maintenance.auto", GIT_CONFIG_VALUE_2: "false",
    GIT_CONFIG_KEY_3: "gc.auto", GIT_CONFIG_VALUE_3: "0" };
}
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: fixtureEnv() }).trim();
function repo(root) {
  mkdirSync(root, { recursive: true });
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "maintenance.auto", "false");
  git(root, "config", "gc.auto", "0");
  git(root, "commit", "-q", "--allow-empty", "-m", "fixture");
  return root;
}
// A work folder with a description nobody accepted; with `release`, its own
// run config declares a release readback.
function work(root, id, { release = false } = {}) {
  const dir = join(root, "delivery", "work", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "work.md"), `# ${id}\n`);
  if (release) writeFileSync(join(dir, "run-config.yaml"), "release:\n  command: true\n");
  return dir;
}
// A run ledger written by hand: a run that started and, with `waiting`, asked
// a person for something. It carries no `pass`, like a run of an earlier
// version.
function ledger(root, id, waiting = true) {
  const run = `RUN-${id}`;
  const log = EventLedger.open(join(root, ".buildbeat", "runtime", "runs", run, "events.jsonl"));
  log.append({ type: "RUN_CREATED", actor, run, work: id, data: {
    workflowRef: "software-delivery", workflowDigest: "sha256:test", base: git(root, "rev-parse", "HEAD"),
    riskPreset: "standard", deliveryChecks: { enabled: true },
  } });
  log.append({ type: "RUN_STARTED", actor, data: {} });
  if (waiting) log.append({ type: "HUMAN_REQUESTED", actor, data: {
    transition: "enter-fix", kind: "approval", subject: { candidate: git(root, "rev-parse", "HEAD"), planDigest: "UNVERIFIED", evidenceDigest: "sha256:evidence" }, reasons: ["test decision"],
  } });
  return log;
}
// The record of a finished run whose commit is HEAD.
function archived(root, id) {
  const dir = join(root, "delivery", "work", id, "runs", `RUN-${id}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run-record.json"), JSON.stringify({ startedAt: "2026-10-01T00:00:00Z", terminal: { status: "SUCCEEDED" }, workspaces: { [`RUN-${id}`]: { candidate: git(root, "rev-parse", "HEAD") } } }));
}
function call(cwd, ...args) {
  return spawnSync(process.execPath, [CLI, "status", ...args], { cwd, encoding: "utf8", env: fixtureEnv() });
}
// `buildbeat status --repo . <args>` from inside the repository.
function cli(cwd, ...args) {
  const out = call(cwd, "--repo", ".", ...args);
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}
// Runs a command status printed, the way a person pastes it into a shell.
function paste(cwd, command) {
  return spawnSync("sh", ["-c", `buildbeat() { "$BB_NODE" "$BB_CLI" "$@"; }; ${command}`], {
    cwd, encoding: "utf8", env: { ...fixtureEnv(), BB_NODE: process.execPath, BB_CLI: CLI },
  });
}
function snapshot(root) {
  const files = {};
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name), key = relative(root, file);
      if (entry.isSymbolicLink()) files[key] = readlinkSync(file);
      else if (entry.isDirectory()) { files[`${key}/`] = "directory"; visit(file); }
      else files[key] = createHash("sha256").update(readFileSync(file)).digest("hex");
    }
  }
  visit(root);
  return files;
}
const worksOf = (result) => result.repos.flatMap((group) => group.works);

// A main repository with two code repositories inside it. In the first a
// reviewed commit of SHARED waits for the person; the second holds settled
// works and one that still has a release to read back.
function fixture() {
  const base = realpathSync(tempDir("bb-cross-repo-"));
  const main = repo(join(base, "main"));
  const a = repo(join(main, "code a's"));
  const b = repo(join(main, "code-b"));
  work(main, "DRAFT");
  addWork(a, "SHARED");
  const candidate = commit(a, "change for SHARED\n\nWork: SHARED", { ".gitignore": ".buildbeat/\n", "src/feature.txt": "hello\n" });
  assert.equal(reviewWith(a, "SHARED").state.pendingHuman.kind, "final-decision");
  work(a, "NOTED");
  writeFileSync(join(a, "delivery/work/NOTED/review-findings.jsonl"), JSON.stringify({ kind: "finding", severity: "P1", fingerprint: "noted-only", summary: "a finding nobody ruled on" }) + "\n");
  work(b, "ONLY-CODE");
  for (const [id, decision] of [["DONE", "closed"], ["CANCEL", "cancelled"]]) {
    const dir = work(b, id);
    writeFileSync(join(dir, "decisions.jsonl"), `${JSON.stringify({ transition: "close-work", decision })}\n`);
  }
  work(b, "MERGED");
  archived(b, "MERGED");
  work(b, "RELEASE", { release: true });
  archived(b, "RELEASE");
  return { base, main, a, b, candidate };
}

test("all-repos reads each repository's own works, keeps drafts and counts settled works; commands resolve from the caller", () => {
  const { base, main, a, b, candidate } = fixture();
  const before = snapshot(base);
  const result = JSON.parse(cli(main, "--all-repos", "--json"));
  assert.deepEqual(Object.keys(result), ["repos", "pending", "warnings"]);
  assert.deepEqual(result.repos.map((group) => group.repo), [main, a, b]);
  assert.deepEqual(result.warnings, []);
  const rows = worksOf(result);
  const shared = rows.filter((row) => row.work === "SHARED");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].repo, a);
  assert.equal(shared[0].stage, "MERGE_DECISION");
  assert.equal(shared[0].next, `buildbeat decide --repo 'code a'\\''s' --work SHARED --action approve --candidate ${candidate} --by <you>`);
  const noted = rows.find((row) => row.work === "NOTED");
  assert.equal(noted.repo, a);
  assert.equal(noted.openFindings, 1);
  assert.equal(noted.findings[0].fingerprint, "noted-only");
  assert.deepEqual(rows.map((row) => row.work).sort(), ["CANCEL", "DONE", "DRAFT", "MERGED", "NOTED", "ONLY-CODE", "RELEASE", "SHARED"]);
  for (const [id, stage] of [["DONE", "CLOSED"], ["CANCEL", "CANCELLED"], ["MERGED", "MERGED"]]) {
    assert.equal(rows.find((row) => row.work === id).stage, stage);
  }
  assert.equal(rows.find((row) => row.work === "DRAFT").repo, main);
  assert.equal(rows.find((row) => row.work === "ONLY-CODE").repo, b);
  assert.equal(rows.find((row) => row.work === "RELEASE").hasRelease, true);
  assert.equal(rows.find((row) => row.work === "RELEASE").settled, false);
  assert.deepEqual(result.repos.find((group) => group.repo === b).settled, { total: 3, closed: 1, cancelled: 1, merged: 1 });
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].repo, a);
  assert.equal(result.pending[0].run, "RUN-SHARED-01");

  const text = cli(main, "--all-repos");
  const pendingHeader = text.indexOf("pending decisions · code a's");
  assert.ok(pendingHeader >= 0 && pendingHeader < text.search(/^repo .+:$/m), "pending decisions come before the per-repo sections");
  assert.match(text, /^repo code a's:$/m);
  assert.match(text, /^DRAFT {2}WORK_DRAFT$/m);
  assert.match(text, /^RELEASE {2}MERGED$/m);
  // Settled works are counted, not listed.
  assert.doesNotMatch(text, /(?:DONE {2}CLOSED|CANCEL {2}CANCELLED|MERGED {2}MERGED)/);
  assert.match(text, /^code-b: settled 3 \(closed 1 · cancelled 1 · merged, not closed 1\)$/m);
  assert.match(text, /next: buildbeat decide --repo 'code a'\\''s' --work SHARED --action approve /);
  assert.doesNotMatch(text, /[\u4e00-\u9fff]/, "the cross-repo view prints English like the rest of the CLI");

  // The main repository alone does not answer for the ones inside it.
  const single = JSON.parse(cli(main, "--json"));
  assert.deepEqual(single.works.map((row) => row.work), ["DRAFT"]);
  assert.deepEqual(single.pending, []);
  const filtered = JSON.parse(cli(main, "--all-repos", "--work", "SHARED", "--json"));
  assert.deepEqual(worksOf(filtered).map((row) => row.work), ["SHARED"]);
  assert.equal(filtered.pending.length, 1);
  // A settled work asked for by name is shown.
  assert.match(cli(main, "--all-repos", "--work", "DONE"), /^DONE {2}CLOSED$/m);
  const invalid = call(main, "--repo", main, "--all-repos", "--run", "RUN-SHARED-01");
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /--all-repos.*--run.*--work/);
  assert.deepEqual(snapshot(base), before, "every file and directory in every repo is unchanged");
});

for (const repoArgument of ["absolute", "relative"]) {
  test(`all-repos status quotes a repository path so its commands run from the caller's directory (${repoArgument} --repo)`, () => {
    const base = realpathSync(tempDir("bb-cross-draft-"));
    const main = repo(join(base, "main repo"));
    const caller = join(base, "caller");
    mkdirSync(caller);
    work(main, "FUTURE");
    const before = snapshot(base);
    const args = ["--repo", repoArgument === "absolute" ? main : relative(caller, main), "--all-repos", "--work", "FUTURE"];
    const read = () => {
      const out = call(caller, ...args, "--json");
      assert.equal(out.status, 0, out.stderr);
      return worksOf(JSON.parse(out.stdout))[0];
    };
    const row = read();
    const command = "buildbeat accept --repo '../main repo' --work FUTURE --by <you>";
    assert.equal(row.stage, "WORK_DRAFT");
    assert.equal(row.repo, main);
    assert.equal(row.next, command);
    assert.ok(call(caller, ...args).stdout.includes(`next: ${command}`));
    assert.deepEqual(snapshot(base), before, "status leaves the repository unchanged");
    const result = paste(caller, row.next.replaceAll("<you>", "owner"));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(read().plan.accepted, true);
  });
}

test("discovery is one level deep, follows a link to the same checkout once, skips plain directories and shows a work known only from a run ledger", () => {
  const { base, main, a, b } = fixture();
  symlinkSync(a, join(main, "alias"));
  // A directory that keeps works but is no checkout of its own.
  work(join(main, "plain"), "NOT-A-REPO");
  // A run ledger with no work folder in that checkout.
  ledger(b, "LEDGER", false);
  const nested = repo(join(b, "nested"));
  work(nested, "DEEP");
  const before = snapshot(base);
  const result = JSON.parse(cli(main, "--all-repos", "--json"));
  assert.deepEqual(result.repos.map((group) => group.repo), [main, a, b]);
  assert.deepEqual(result.warnings, []);
  const rows = worksOf(result);
  assert.equal(rows.filter((row) => row.work === "SHARED").length, 1);
  assert.equal(rows.find((row) => row.work === "LEDGER").repo, b);
  assert.equal(rows.find((row) => row.work === "LEDGER").stage, "RUNNING");
  assert.equal(rows.some((row) => row.work === "DEEP"), false);
  assert.equal(rows.some((row) => row.work === "NOT-A-REPO"), false);
  assert.match(cli(main, "--all-repos"), /^DRAFT {2}WORK_DRAFT$/m);
  assert.deepEqual(snapshot(base), before);
});

for (const action of ["approve", "reject"]) {
  test(`the ${action} command status prints records a real decision in the repository that holds the work`, () => {
    const { main, a, candidate } = fixture();
    const beforeMain = snapshot(join(main, "delivery"));
    const text = cli(main, "--all-repos");
    const command = text.split("\n").find((line) => line.includes(`--action ${action}`)).trim().replace(/^next: /, "");
    const executable = command.split("   #")[0].replaceAll("<you>", "owner").replaceAll("<why>", "reason");
    // The shell parses the printed command, including the quoted repo name.
    const result = paste(main, executable);
    assert.equal(result.status, 0, result.stderr);
    const log = EventLedger.open(join(a, ".buildbeat/runtime/runs/RUN-SHARED-01/events.jsonl"));
    const decision = log.events.find((event) => event.type === "DECISION_RECORDED");
    assert.equal(decision?.data.decision, action === "approve" ? "approved" : "rejected");
    assert.equal(decision.data.transition, "enter-wait-merge");
    assert.equal(decision.actor.id, "owner");
    const recorded = JSON.parse(readFileSync(join(a, "delivery/work/SHARED/decisions.jsonl"), "utf8").trim().split("\n").at(-1));
    assert.equal(recorded.subject.candidate, candidate);
    assert.deepEqual(snapshot(join(main, "delivery")), beforeMain);
  });
}

test("status asks Git once per repository for its checkout, its branch and the commits on it", () => {
  const { main, b } = fixture();
  for (let i = 0; i < 5; i++) {
    work(main, `LOCAL-${i}`);
    archived(main, `LOCAL-${i}`);
    work(b, `CODE-${i}`);
    archived(b, `CODE-${i}`);
  }
  const calls = [];
  const original = childProcess.execFileSync;
  childProcess.execFileSync = (command, args, options) => {
    if (command === "git") calls.push(args);
    return original(command, args, { ...options, env: fixtureEnv() });
  };
  syncBuiltinESMExports();
  try {
    computeRepositoryOverview(main, { work: "LOCAL-0", cwd: main });
    assert.equal(calls.filter((args) => args.includes("rev-parse")).length, 1);
    calls.length = 0;
    computeRepositoryOverview(main, { allRepos: true, cwd: main });
    const validations = calls.filter((args) => args.includes("--show-toplevel"));
    assert.equal(validations.length, 2, "each repository inside the main one is validated once");
    const heads = calls.filter((args) => args.includes("--abbrev-ref"));
    assert.equal(heads.length, 3, "HEAD is read once per repository");
    // One rev-list of the branch per repository answers every full commit
    // id; no merge-base process.
    assert.equal(calls.filter((args) => args.includes("merge-base")).length, 0);
    const ancestry = calls.filter((args) => args.includes("rev-list"));
    assert.equal(ancestry.length, 2, "the branch is listed once in each repository with finished runs");
    assert.equal(new Set(calls.map((args) => JSON.stringify(args))).size, calls.length, "no Git query repeats");
  } finally {
    childProcess.execFileSync = original;
    syncBuiltinESMExports();
  }
});

test("the JSON of one repository's status keeps its shape", () => {
  const root = repo(realpathSync(tempDir("bb-status-compat-")));
  work(root, "LOCAL");
  const draft = { exists: true, accepted: false, stale: false };
  const expected = {
    works: [{ work: "LOCAL", stage: "WORK_DRAFT", intent: draft, plan: draft,
      workArtifact: "work", envFacts: false, openFindings: 0, findings: [], decisions: [], runs: 0,
      reader: null, cost: null, latest: null, merged: false, mergedCandidate: null,
      next: "buildbeat accept --repo . --work LOCAL --by <you>" }],
    pending: [],
  };
  assert.equal(cli(root, "--work", "LOCAL", "--json"), JSON.stringify(expected, null, 2) + "\n");

  commit(root, "describe LOCAL");
  acceptWork(root, "LOCAL", { by: "owner", as: "human" });
  const decision = JSON.parse(readFileSync(join(root, "delivery/work/LOCAL/decisions.jsonl"), "utf8").trim());
  expected.works[0].stage = "READY_TO_RUN";
  const owner = { kind: "human", id: "owner", source: "flag" };
  expected.works[0].intent = expected.works[0].plan = { exists: true, accepted: true, stale: false, by: "owner", actor: owner, at: decision.ts };
  expected.works[0].decisions = [{ ts: decision.ts, decisionRef: decision.decisionRef, transition: "accept-work",
    decision: "approved", by: "owner", actor: owner, who: "owner (person)" }];
  expected.works[0].next = "write delivery/run-config.yaml (workers.verifier, workers.reviewer), then buildbeat review --repo . --work LOCAL; or, if it was doc-only, close out: write delivery/work/LOCAL/result.md, then buildbeat decide --repo . --work LOCAL --action close --by <you>";
  assert.equal(cli(root, "--work", "LOCAL", "--json"), JSON.stringify(expected, null, 2) + "\n");

  const candidate = commit(root, "change for LOCAL\n\nWork: LOCAL", { "src/feature.txt": "hello\n" });
  const reviewed = reviewWith(root, "LOCAL");
  const events = EventLedger.open(reviewed.ledgerPath).events;
  const subject = reviewed.state.pendingHuman.subject;
  assert.equal(subject.candidate, candidate);
  Object.assign(expected.works[0], {
    stage: "MERGE_DECISION", runs: 1,
    cost: { runs: 1, reviewRounds: 1, findings: 0 },
    latest: { id: "RUN-LOCAL-01", status: "WAITING_HUMAN", candidate, at: events.at(-1).ts, source: "runtime", terminalReason: null, waiting: "enter-wait-merge" },
    next: `buildbeat decide --repo . --work LOCAL --action approve --candidate ${candidate} --by <you>`,
  });
  expected.pending = [{ run: "RUN-LOCAL-01", work: "LOCAL", transition: "enter-wait-merge", kind: "final-decision",
    reasons: reviewed.state.pendingHuman.reasons, subject }];
  assert.equal(cli(root, "--work", "LOCAL", "--json"), JSON.stringify(expected, null, 2) + "\n");
});

test("fixture Git and CLI children ignore hostile inherited config and Git environment", () => {
  const base = realpathSync(tempDir("bb-status-git-env-"));
  const config = join(base, "host.gitconfig");
  const hooks = join(base, "hooks");
  mkdirSync(hooks);
  writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\nexit 99\n", { mode: 0o755 });
  writeFileSync(config, `[commit]\n  gpgSign = true\n[gpg]\n  program = /no-such-signing-program\n[core]\n  hooksPath = ${hooks}\n`);
  const hostile = { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_SYSTEM: config,
    GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "commit.gpgSign", GIT_CONFIG_VALUE_0: "true",
    GIT_DIR: join(base, "nonexistent.git"), GIT_WORK_TREE: join(base, "nonexistent"),
    GIT_INDEX_FILE: join(base, "nonexistent.index") };
  const saved = Object.fromEntries(Object.keys(hostile).map((key) => [key, process.env[key]]));
  Object.assign(process.env, hostile);
  try {
    const root = repo(join(base, "fixture"));
    work(root, "LOCAL");
    ledger(root, "LOCAL");
    const result = JSON.parse(cli(root, "--work", "LOCAL", "--json"));
    assert.equal(result.works[0].stage, "WAITING_HUMAN");
    assert.deepEqual(result.warnings, undefined);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

// In a pilot workspace one cross-repository status opened 245 run ledgers
// 20,390 times (19 s) and spawned 102 merge-base processes (11 s); both are
// now done once per repository per call.
test("one status call opens each run ledger at most twice, whatever the number of works", () => {
  const root = repo(realpathSync(tempDir("bb-ledger-once-")));
  // Finished runs, as nearly all are in a real workspace.
  for (let i = 0; i < 6; i++) {
    work(root, `W-${i}`);
    ledger(root, `W-${i}`, false).append({ type: "RUN_TERMINAL", actor, data: { status: "SUCCEEDED", reason: "test" } });
  }
  const opened = new Map();
  const original = EventLedger.open;
  EventLedger.open = function (path, ...rest) {
    opened.set(path, (opened.get(path) ?? 0) + 1);
    return original.call(this, path, ...rest);
  };
  try {
    const result = computeRepositoryOverview(root, { allRepos: true, cwd: root });
    assert.equal(result.repos.flatMap((group) => group.works).length, 6);
  } finally {
    EventLedger.open = original;
  }
  assert.equal(opened.size, 6);
  // Once for the overview, once for the pending-decision list.
  assert.ok(Math.max(...opened.values()) <= 2, JSON.stringify([...opened.values()]));
});

test("merged candidates are answered from one rev-list; a short id falls back to merge-base with the same answer", () => {
  const root = repo(realpathSync(tempDir("bb-ancestry-")));
  const merged = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "-q", "-b", "side");
  git(root, "commit", "-q", "--allow-empty", "-m", "unmerged");
  const unmerged = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "-q", "main");
  const record = (id, candidate) => {
    work(root, id);
    const dir = join(root, "delivery", "work", id, "runs", `RUN-${id}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "run-record.json"), JSON.stringify({ startedAt: "2026-10-01T00:00:00Z", terminal: { status: "SUCCEEDED" }, workspaces: { [`RUN-${id}`]: { candidate } } }));
  };
  record("FULL-IN", merged);
  record("FULL-OUT", unmerged);
  record("SHORT-IN", merged.slice(0, 7));
  record("SHORT-OUT", unmerged.slice(0, 7));
  const calls = [];
  const original = childProcess.execFileSync;
  childProcess.execFileSync = (command, args, options) => {
    if (command === "git") calls.push(args);
    return original(command, args, { ...options, env: fixtureEnv() });
  };
  syncBuiltinESMExports();
  let rows;
  try {
    rows = computeRepositoryOverview(root, { allRepos: true, cwd: root }).repos.flatMap((group) => group.works);
  } finally {
    childProcess.execFileSync = original;
    syncBuiltinESMExports();
  }
  const stage = Object.fromEntries(rows.map((row) => [row.work, row.stage]));
  assert.equal(stage["FULL-IN"], "MERGED");
  assert.equal(stage["SHORT-IN"], "MERGED");
  assert.notEqual(stage["FULL-OUT"], "MERGED");
  assert.notEqual(stage["SHORT-OUT"], "MERGED");
  assert.equal(calls.filter((args) => args.includes("rev-list")).length, 1);
  const bases = calls.filter((args) => args.includes("merge-base"));
  assert.deepEqual(bases.map((args) => args.at(-2)).sort(), [merged.slice(0, 7), unmerged.slice(0, 7)].sort());
});
