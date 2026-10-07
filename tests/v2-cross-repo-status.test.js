import assert from "node:assert/strict";
import childProcess, { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, relative } from "node:path";
import test from "node:test";
import { acceptArtifact } from "../src/v2/runtime/decisions.js";
import { computeOverview, computeRepositoryOverview } from "../src/v2/runtime/overview.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
import { tempDir } from "./support/tmp.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
const actor = { kind: "kernel", id: "test" };
function fixtureEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null",
    GIT_CONFIG_KEY_1: "commit.gpgSign", GIT_CONFIG_VALUE_1: "false" };
}
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: fixtureEnv() }).trim();
function repo(root) {
  mkdirSync(root, { recursive: true });
  git(root, "init", "-q", "-b", "main");
  git(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "--allow-empty", "-m", "fixture");
  return root;
}
function work(root, id, target = null, release = false) {
  const dir = join(root, "delivery", "work", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "work.md"), `# ${id}\n`);
  if (target) writeFileSync(join(dir, "run-config.yaml"), `repo: ${relative(dir, target)}\nwork: ${id}\n${release ? "release:\n  command: true\n" : ""}`);
  return dir;
}
function ledger(root, id, waiting = true) {
  const run = `RUN-${id}`;
  const log = EventLedger.open(join(root, ".buildbeat", "runtime", "runs", run, "events.jsonl"));
  log.append({ type: "RUN_CREATED", actor, run, work: id, data: {
    workflowRef: "software-delivery", workflowDigest: "sha256:test", base: git(root, "rev-parse", "HEAD"),
    riskPreset: "standard", deliveryChecks: { enabled: true },
  } });
  log.append({ type: "RUN_STARTED", actor, data: {} });
  if (waiting) {
    const path = join(".buildbeat", "worktrees", run);
    git(root, "worktree", "add", "--quiet", "--detach", path, "HEAD");
    log.append({ type: "WORKSPACE_BOUND", actor, data: { workspaceId: run, repo: ".",
      branch: "HEAD", worktreePath: path, base: git(root, "rev-parse", "HEAD") } });
  }
  if (waiting) log.append({ type: "HUMAN_REQUESTED", actor, data: {
    transition: "enter-fix", kind: "approval", subject: { candidate: git(root, "rev-parse", "HEAD"), planDigest: "UNVERIFIED", evidenceDigest: "sha256:evidence" }, reasons: ["test decision"],
  } });
  return log;
}
function archived(root, id) {
  const dir = join(root, "delivery", "work", id, "runs", `RUN-${id}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run-record.json"), JSON.stringify({ startedAt: "2026-10-01T00:00:00Z", terminal: { status: "SUCCEEDED" }, workspaces: { [`RUN-${id}`]: { candidate: git(root, "rev-parse", "HEAD") } } }));
}
function cli(cwd, ...args) {
  const out = spawnSync(process.execPath, [CLI, "status", "--repo", ".", ...args], { cwd, encoding: "utf8", env: fixtureEnv() });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
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
function fixture() {
  const base = realpathSync(tempDir("bb-cross-repo-"));
  const main = repo(join(base, "main"));
  const a = repo(join(main, "code a's"));
  const b = repo(join(main, "code-b"));
  work(main, "SHARED", a);
  acceptArtifact(main, "SHARED", "work", { by: "owner" });
  work(a, "SHARED");
  writeFileSync(join(a, "delivery/work/SHARED/review-findings.jsonl"), JSON.stringify({ kind: "finding", severity: "P1", fingerprint: "target-only", summary: "target finding" }) + "\n");
  ledger(a, "SHARED");
  work(main, "DRAFT");
  work(main, "FUTURE", b);
  work(b, "ONLY-CODE");
  for (const [id, decision] of [["DONE", "closed"], ["CANCEL", "cancelled"]]) {
    const dir = work(b, id);
    writeFileSync(join(dir, "decisions.jsonl"), `${JSON.stringify({ transition: "close-work", decision })}\n`);
  }
  work(b, "MERGED", b);
  archived(b, "MERGED");
  work(main, "RELEASE", b, true);
  work(b, "RELEASE");
  archived(b, "RELEASE");
  return { base, main, a, b };
}

test("all-repos merges authoritative work facts, keeps drafts and counts settled works; commands resolve from the caller", () => {
  const { base, main, a, b } = fixture();
  const before = snapshot(base);
  const result = JSON.parse(cli(main, "--all-repos", "--json"));
  assert.deepEqual(Object.keys(result), ["repos", "pending", "warnings"]);
  assert.equal(result.repos.length, 3);
  assert.deepEqual(result.warnings, []);
  const rows = result.repos.flatMap((group) => group.works);
  const shared = rows.filter((row) => row.work === "SHARED");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].repo, a);
  assert.equal(shared[0].stage, "WAITING_HUMAN");
  assert.equal(shared[0].openFindings, 1);
  assert.equal(shared[0].findings[0].fingerprint, "target-only");
  assert.equal(shared[0].config, join(main, "delivery/work/SHARED/run-config.yaml"));
  assert.deepEqual(rows.map((row) => row.work).sort(), ["CANCEL", "DONE", "DRAFT", "FUTURE", "MERGED", "ONLY-CODE", "RELEASE", "SHARED"]);
  for (const [id, stage] of [["DONE", "CLOSED"], ["CANCEL", "CANCELLED"], ["MERGED", "MERGED"]]) {
    assert.equal(rows.find((row) => row.work === id).stage, stage);
  }
  assert.equal(rows.find((row) => row.work === "DRAFT").repo, main);
  assert.equal(rows.find((row) => row.work === "ONLY-CODE").repo, b);
  assert.equal(rows.find((row) => row.work === "FUTURE").targetRepo, b);
  assert.equal(rows.find((row) => row.work === "FUTURE").repo, main);
  assert.equal(rows.find((row) => row.work === "RELEASE").hasRelease, true);
  assert.deepEqual(result.repos.find((group) => group.repo === b).settled, { total: 3, closed: 1, cancelled: 1, merged: 1 });
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].repo, a);
  const text = cli(main, "--all-repos");
  assert.ok(text.indexOf("待人决定") < text.indexOf("仓库："));
  assert.match(text, /RELEASE  MERGED/);
  assert.doesNotMatch(text, /(?:DONE  CLOSED|CANCEL  CANCELLED|MERGED  MERGED)/);
  assert.match(text, /已了结 3 项（CLOSED 1 \/ CANCELLED 1 \/ 已合并无收尾步骤 1）/);
  assert.match(text, /运行目标：code-b/);
  assert.match(text, /--config delivery\/work\/SHARED\/run-config.yaml/);
  const single = JSON.parse(cli(main, "--work", "SHARED", "--json"));
  assert.equal(single.works[0].stage, "WAITING_HUMAN");
  assert.equal(single.pending[0].repo, a);
  assert.doesNotMatch(cli(main, "--work", "SHARED"), /READY_TO_RUN/);
  assert.equal(computeOverview(main, { work: "SHARED" })[0].repo, a);
  const filtered = JSON.parse(cli(main, "--all-repos", "--work", "SHARED", "--json"));
  assert.deepEqual(filtered.repos.flatMap((group) => group.works).map((row) => row.work), ["SHARED"]);
  assert.equal(filtered.pending.length, 1);
  const invalid = spawnSync(process.execPath, [CLI, "status", "--repo", main, "--all-repos", "--run", "RUN-SHARED"], { encoding: "utf8", env: fixtureEnv() });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /--all-repos.*--run.*--work/);
  assert.deepEqual(snapshot(base), before, "every file and directory in every repo is unchanged");
});

for (const repoArgument of ["absolute", "relative"]) {
  test(`single-repo status quotes the owning repo for an unstarted cross-repo work (${repoArgument} --repo)`, () => {
    const base = realpathSync(tempDir("bb-cross-draft-"));
    const main = repo(join(base, "main repo"));
    const target = repo(join(base, "code"));
    const caller = join(base, "caller");
    mkdirSync(caller);
    work(main, "FUTURE", target);
    const before = snapshot(base);
    const args = ["--repo", repoArgument === "absolute" ? main : relative(caller, main), "--work", "FUTURE"];
    const row = JSON.parse(cli(caller, ...args, "--json")).works[0];
    const command = "buildbeat accept --repo '../main repo' --work FUTURE --artifact work --by <you>";
    assert.equal(row.stage, "WORK_DRAFT");
    assert.equal(row.repo, main);
    assert.equal(row.targetRepo, target);
    assert.equal(row.next, command);
    assert.ok(cli(caller, ...args).includes(`next: ${command}`));
    assert.deepEqual(snapshot(base), before, "status leaves both repositories unchanged");
    const targetBefore = snapshot(target);
    const result = spawnSync("sh", ["-c", `buildbeat() { "$BB_NODE" "$BB_CLI" "$@"; }; ${row.next.replaceAll("<you>", "owner")}`], {
      cwd: caller, encoding: "utf8", env: { ...fixtureEnv(), BB_NODE: process.execPath, BB_CLI: CLI },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(cli(caller, ...args, "--json")).works[0].plan.accepted, true);
    assert.deepEqual(snapshot(target), targetBefore, "acceptance is recorded only in the main repository");
  });
}

test("discovery is one-level, deduplicates real paths, warns without failing and supports ledger-only targets", () => {
  const { base, main, a, b } = fixture();
  symlinkSync(a, join(main, "alias"));
  work(main, "ALIAS", join(main, "alias"));
  work(main, "MISSING", join(base, "missing"));
  const nonrepo = join(base, "plain");
  mkdirSync(nonrepo);
  work(main, "NONREPO", nonrepo);
  const broken = work(main, "BROKEN");
  writeFileSync(join(broken, "run-config.yaml"), "repo: [invalid]\n");
  // A ledger alone establishes target ownership, including live state when
  // there is no work artifact in that checkout.
  work(main, "LEDGER", b);
  ledger(b, "LEDGER", false);
  const nested = repo(join(b, "nested"));
  work(nested, "DEEP");
  work(b, "POINTER", nested);
  const before = snapshot(base);
  const result = JSON.parse(cli(main, "--all-repos", "--json"));
  assert.equal(result.repos.length, 3);
  assert.equal(result.warnings.length, 3);
  const rows = result.repos.flatMap((group) => group.works);
  assert.equal(rows.find((row) => row.work === "LEDGER").repo, b);
  assert.equal(rows.find((row) => row.work === "LEDGER").stage, "RUNNING");
  assert.equal(rows.some((row) => row.work === "DEEP"), false);
  assert.equal(cli(main, "--all-repos").split("\n").filter((line) => line.startsWith("warning:")).length, 3);
  assert.match(cli(main, "--all-repos"), /DRAFT  WORK_DRAFT/);
  assert.deepEqual(snapshot(base), before);
});


test("external targets and config-only entries work from another cwd; stalled runs stay visible", () => {
  const base = realpathSync(tempDir("bb-cross-external-"));
  const main = repo(join(base, "main repo"));
  const target = repo(join(base, "outside repo"));
  const dir = work(main, "EXTERNAL", target, true);
  rmSync(join(dir, "work.md"));
  work(target, "EXTERNAL");
  archived(target, "EXTERNAL");
  work(target, "STUCK");
  const log = ledger(target, "STUCK", false);
  log.append({ type: "WORKSPACE_BOUND", actor, data: { workspaceId: "test", repo: ".", branch: "run/RUN-STUCK", worktreePath: ".buildbeat/worktrees/RUN-STUCK", base: git(target, "rev-parse", "HEAD") } });
  log.append({ type: "STEP_STARTED", actor, ts: "2020-01-01T00:00:00Z", data: { step: "build", attempt: 1, worker: "builder", adapter: "test", workspaceId: "test" } });
  const before = snapshot(base);
  const out = spawnSync(process.execPath, [CLI, "status", "--repo", "main repo", "--all-repos", "--json"], { cwd: base, encoding: "utf8", env: fixtureEnv() });
  assert.equal(out.status, 0, out.stderr);
  const result = JSON.parse(out.stdout);
  assert.equal(result.repos.length, 2);
  const rows = result.repos.flatMap((group) => group.works);
  assert.equal(rows.filter((row) => row.work === "EXTERNAL").length, 1);
  assert.match(rows.find((row) => row.work === "EXTERNAL").next, /--config 'main repo\/delivery\/work\/EXTERNAL\/run-config.yaml'/);
  assert.equal(rows.find((row) => row.work === "STUCK").stage, "STALLED");
  assert.match(rows.find((row) => row.work === "STUCK").next, /--repo 'outside repo' --run RUN-STUCK/);
  assert.deepEqual(snapshot(base), before);
});


for (const action of ["approve", "reject"]) {
  test(`rendered ${action} command records a real decision in the target repository`, () => {
    const { main, a } = fixture();
    const beforeMain = snapshot(join(main, "delivery"));
    const text = cli(main, "--all-repos");
    const command = text.split("\n").find((line) => line.includes(`buildbeat decide --action ${action}`)).trim().replace(/^next: /, "");
    const executable = command.split("   #")[0].replaceAll("<you>", "owner").replaceAll("<why>", "reason");
    // The shell parses the displayed command, including the quoted repo name;
    // the function dispatches every argument to the real CLI.
    const result = spawnSync("sh", ["-c", `buildbeat() { "$BB_NODE" "$BB_CLI" "$@"; }; ${executable}`], {
      cwd: main, encoding: "utf8", env: { ...fixtureEnv(), BB_NODE: process.execPath, BB_CLI: CLI },
    });
    assert.equal(result.status, 0, result.stderr);
    const log = EventLedger.open(join(a, ".buildbeat/runtime/runs/RUN-SHARED/events.jsonl"));
    const decision = log.events.find((event) => event.type === "DECISION_RECORDED");
    assert.equal(decision?.data.decision, action === "approve" ? "approved" : "rejected");
    assert.equal(decision.data.transition, "enter-fix");
    assert.equal(decision.actor.id, "owner");
    assert.deepEqual(snapshot(join(main, "delivery")), beforeMain);
  });
}

test("discovers an immediate child with no main-repository config pointing to it", () => {
  const { main } = fixture();
  const child = repo(join(main, "unreferenced"));
  work(child, "CHILD-ONLY");
  const result = JSON.parse(cli(main, "--all-repos", "--json"));
  assert.deepEqual(result.repos.find((group) => group.repo === child).works.map((row) => row.work), ["CHILD-ONLY"]);
});

test("an unreadable first config cannot hide valid ownership or main-config hints", () => {
  const { main, a } = fixture();
  writeFileSync(join(main, "delivery/work/SHARED/run-config-00.yaml"), "repo: [invalid]\n");
  for (const all of [[], ["--all-repos"]]) {
    const result = JSON.parse(cli(main, ...all, "--work", "SHARED", "--json"));
    const rows = result.works ?? result.repos.flatMap((group) => group.works);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].repo, a);
    assert.equal(rows[0].stage, "WAITING_HUMAN");
    assert.equal(rows[0].config, join(main, "delivery/work/SHARED/run-config.yaml"));
    assert.equal(result.warnings.length, 1);
    const text = cli(main, ...all, "--work", "SHARED");
    assert.match(text, /--config delivery\/work\/SHARED\/run-config.yaml/);
    assert.doesNotMatch(text, /READY_TO_RUN/);
  }
});

test("forwarding aggregates release metadata and chooses the release-bearing main config", () => {
  const { main, b } = fixture();
  const dir = join(main, "delivery/work/RELEASE");
  writeFileSync(join(dir, "run-config-00.yaml"), `repo: ${relative(dir, b)}\nwork: RELEASE\n`);
  for (const all of [[], ["--all-repos"]]) {
    const result = JSON.parse(cli(main, ...all, "--work", "RELEASE", "--json"));
    const rows = result.works ?? result.repos.flatMap((group) => group.works);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].hasRelease, true);
    assert.equal(rows[0].settled, false);
    assert.equal(rows[0].config, join(dir, "run-config.yaml"));
    assert.match(rows[0].next, /release --config delivery\/work\/RELEASE\/run-config.yaml/);
    assert.match(cli(main, ...all, "--work", "RELEASE"), /RELEASE  MERGED/);
  }
});

test("status caches target validation, HEAD and ancestry and reuses forwarded works", () => {
  const { main, b } = fixture();
  for (let i = 0; i < 5; i++) {
    work(main, `LOCAL-${i}`, main);
    archived(main, `LOCAL-${i}`);
    work(main, `FORWARDED-${i}`, b);
    work(b, `FORWARDED-${i}`);
    archived(b, `FORWARDED-${i}`);
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
    assert.equal(validations.length, 2, "only the two distinct target repositories are validated");
    const heads = calls.filter((args) => args.includes("--abbrev-ref"));
    assert.equal(heads.length, 3, "HEAD is read once per repository");
    const ancestry = calls.filter((args) => args.includes("merge-base"));
    assert.equal(ancestry.length, 2, "the shared candidate is checked once in each owning repository");
    assert.equal(new Set(calls.map((args) => JSON.stringify(args))).size, calls.length, "no Git query repeats");
  } finally {
    childProcess.execFileSync = original;
    syncBuiltinESMExports();
  }
});


test("ordinary local status JSON exactly preserves the pre-cross-repo serialization", () => {
  const root = repo(realpathSync(tempDir("bb-status-compat-")));
  work(root, "LOCAL", root);
  const draft = { exists: true, accepted: false, stale: false };
  // Full baseline row shape from 8ef9c29, including the original local hints.
  const expected = {
    works: [{ work: "LOCAL", stage: "WORK_DRAFT", intent: draft, plan: draft,
      workArtifact: "work", envFacts: false, openFindings: 0, findings: [], runs: 0,
      cost: null, latest: null, merged: false, mergedCandidate: null,
      next: "buildbeat accept --repo . --work LOCAL --artifact work --by <you>" }],
    pending: [], metrics: null,
  };
  assert.equal(cli(root, "--work", "LOCAL", "--json"), JSON.stringify(expected, null, 2) + "\n");
  acceptArtifact(root, "LOCAL", "work", { by: "owner" });
  const decision = JSON.parse(readFileSync(join(root, "delivery/work/LOCAL/decisions.jsonl"), "utf8").trim());
  expected.works[0].stage = "READY_TO_RUN";
  expected.works[0].intent = expected.works[0].plan = { exists: true, accepted: true, stale: false, by: "owner", at: decision.ts };
  expected.works[0].next = "buildbeat run --config delivery/work/LOCAL/run-config.yaml";
  assert.equal(cli(root, "--work", "LOCAL", "--json"), JSON.stringify(expected, null, 2) + "\n");
  const log = ledger(root, "LOCAL");
  const firstAt = log.events[0].ts, lastAt = log.events.at(-1).ts;
  Object.assign(expected.works[0], {
    stage: "WAITING_HUMAN", runs: 1,
    cost: { runs: 1, reviewRounds: 0, findings: 0, humanWaits: 1, infraFailures: 0, workerMs: 0, firstAt, lastAt },
    latest: { id: "RUN-LOCAL", status: "WAITING_HUMAN", candidate: null, at: lastAt, source: "runtime", terminalReason: null, waiting: "enter-fix" },
    next: "buildbeat decide --action approve --repo . --run RUN-LOCAL --transition enter-fix --by <you>   # then: run --config <run-config.yaml>",
  });
  expected.pending = [{ run: "RUN-LOCAL", work: "LOCAL", transition: "enter-fix", kind: "approval",
    reasons: ["test decision"], subject: { candidate: git(root, "rev-parse", "HEAD"), planDigest: "UNVERIFIED", evidenceDigest: "sha256:evidence" } }];
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
    work(root, "LOCAL", root);
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
