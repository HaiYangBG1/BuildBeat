import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { beforeEach, afterEach } from "node:test";
import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { deliveryWorkflow, DELIVERY_TEXT } from "../src/v2/engine/workflow.js";
import { sha256Text } from "../src/v2/policy/policy.js";
import { adoptCandidate, approveRun, requestFix } from "../src/v2/runtime/decisions.js";
import { readFindingsAccount } from "../src/v2/runtime/findings.js";
import { nextReply, buildNotification } from "../src/v2/runtime/notify.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";
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

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const clean = () => ({ behavior: "succeed", envelope: { status: "succeeded", findings: [] } });

function fixture({ fixer = true, legacy = false, rounds = 6, entry = "build", buildCommit = true } = {}) {
  const root = tempDir("bb-final-fix-");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "commit.gpgSign", "false");
  git(root, "config", "core.hooksPath", "/dev/null");
  writeFileSync(join(root, "feature.txt"), "baseline\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "baseline");
  const worktree = join(root, ".buildbeat", "worktrees", "RUN-F");
  const inputs = [];
  const scripted = createMockAdapter({ build: ["succeed"], verify: Array(6).fill("succeed"), review: Array.from({ length: 6 }, clean), fix: Array(6).fill("succeed") });
  const adapter = {
    name: "fixture",
    execute(context) {
      inputs.push(structuredClone(context.input));
      if (context.step === "fix" || (context.step === "build" && buildCommit)) commit(`${context.step} ${inputs.length}\n`);
      return scripted.execute(context);
    },
  };
  function commit(content, path = "feature.txt") {
    writeFileSync(join(worktree, path), content);
    git(worktree, "add", path);
    git(worktree, "commit", "-qm", "repair");
    return git(worktree, "rev-parse", "HEAD");
  }
  const options = {
    repoRoot: root, workId: "WORK-F", runId: "RUN-F", entry, workflow: deliveryWorkflow(),
    workflowDigest: sha256Text(DELIVERY_TEXT), allowedPaths: ["feature.txt"],
    budgets: { reviewRoundsPerWork: rounds },
    ...(!legacy ? { deliveryChecks: { artifact: "work", requireAcceptance: false } } : {}),
    adapters: { builder: adapter, verifier: adapter, reviewer: adapter, ...(fixer ? { fixer: adapter } : {}) },
  };
  startRun(options);
  const ledger = () => EventLedger.open(join(root, ".buildbeat/runtime/runs/RUN-F/events.jsonl"));
  assert.equal(ledger().state.pendingHuman.kind, "final-decision");
  const adopt = (sha) => adoptCandidate(root, "RUN-F", { sha, by: "owner", resumeAt: "verify" });
  const approve = (candidate) => approveRun(root, "RUN-F", { by: "owner", transition: "enter-wait-merge", candidate });
  return { root, worktree, options, ledger, inputs, commit, adopt, approve };
}

test("final adopt keeps evidence, verifies and incrementally reviews the new candidate; stale approvals fail", () => {
  const f = fixture();
  const before = f.ledger().state;
  const old = before.pendingHuman.subject.candidate;
  const sha = f.commit("manual repair\n");
  f.adopt(sha.slice(0, 7));
  assert.equal(f.ledger().state.pendingHuman, null);
  assert.throws(() => f.approve(old), /no pending human/);
  const { state } = resumeRun(f.options);
  assert.equal(state.steps.build.attempts, 1);
  assert.equal(state.steps.fix, undefined);
  assert.equal(state.steps.verify.attempts, 2);
  assert.equal(state.steps.review.attempts, 2);
  assert.equal(state.pendingHuman.subject.candidate, sha);
  assert.deepEqual(state.evidence.slice(0, before.evidence.length), before.evidence);
  assert.equal(f.ledger().events.filter((e) => e.type === "BUDGET_EXTENDED").length, 0);
  const review = f.inputs.filter((input) => input.step === "review").at(-1);
  assert.ok(JSON.stringify(review.lastReviewed).includes(old), "incremental review names the previous candidate");
  assert.throws(() => f.approve(old), /approval stale/);
  assert.throws(() => f.approve(), /approval stale/);
  assert.equal(f.approve(sha).terminal, true);
  assert.equal(f.ledger().state.terminal.status, "SUCCEEDED");
  assert.throws(() => f.adopt(sha), /already terminal/);
});

for (const scenario of ["dirty", "non-descendant", "scope", "same-head", "wrong-head"]) {
  test(`final adopt refuses ${scenario} without answering the request or pinning a candidate`, () => {
    const f = fixture();
    const before = f.ledger().events.length;
    let sha = f.ledger().state.pendingHuman.subject.candidate;
    let pattern;
    if (scenario === "dirty") {
      writeFileSync(join(f.worktree, "feature.txt"), "dirty\n"); pattern = /dirty/;
    } else if (scenario === "non-descendant") {
      git(f.worktree, "reset", "--hard", f.ledger().state.run.base);
      sha = f.commit("different history\n"); pattern = /descendant/;
    } else if (scenario === "scope") {
      sha = f.commit("outside\n", "outside.txt"); pattern = /out-of-scope/;
    } else if (scenario === "same-head") pattern = /descendant/;
    else { sha = "0000000"; pattern = /not 0000000/; }
    assert.throws(() => f.adopt(sha), pattern);
    assert.equal(f.ledger().events.length, before);
  });
}

test("human fix records an accepted P1, feeds its complete reason to fixer and returns through verify/review", () => {
  const f = fixture();
  const before = f.ledger().state;
  const reason = `Repair the missing case: ${"long detail ".repeat(40)}`.trim();
  const result = requestFix(f.root, "RUN-F", { reason, by: "owner" });
  const decision = f.ledger().events.at(-1).data;
  assert.equal(decision.decision, "fix");
  assert.equal(decision.reason, reason);
  assert.equal(decision.resumeAt, "fix");
  assert.deepEqual(result.state.steps, before.steps);
  const rows = readFindingsAccount(f.root, "WORK-F");
  assert.equal(rows[0].severity, "P1");
  assert.equal(rows[0].summary, reason);
  assert.equal(rows[1].action, "accept");
  const state = resumeRun(f.options).state;
  const input = f.inputs.find((item) => item.step === "fix");
  assert.deepEqual(input.findings.map((item) => [item.summary, item.adjudication]), [[reason, "accept"]]);
  assert.equal(state.steps.fix.attempts, 1);
  assert.equal(state.steps.verify.attempts, 2);
  assert.equal(state.steps.review.attempts, 2);
  assert.equal(state.pendingHuman.kind, "final-decision");
  assert.notEqual(state.pendingHuman.subject.candidate, before.pendingHuman.subject.candidate);
  assert.equal(f.ledger().events.filter((e) => e.type === "BUDGET_EXTENDED").length, 0);
  const decisions = readFileSync(join(f.root, "delivery/work/WORK-F/decisions.jsonl"), "utf8");
  assert.equal(JSON.parse(decisions.trim()).decision, "fix");
});

test("fix refusal covers missing fixer, empty reason, changed tree, non-final wait and 3.x", () => {
  const missing = fixture({ fixer: false });
  assert.throws(() => requestFix(missing.root, "RUN-F", { reason: "repair" }), /no fixer.*--adopt/);
  const f = fixture();
  assert.throws(() => requestFix(f.root, "RUN-F", { reason: "  " }), /non-empty reason/);
  writeFileSync(join(f.worktree, "feature.txt"), "dirty");
  assert.throws(() => requestFix(f.root, "RUN-F", { reason: "repair" }), /worktree changed/);
  const ledger = f.ledger();
  ledger.append({ type: "HUMAN_REQUESTED", actor: { kind: "kernel", id: "test" }, data: {
    transition: "enter-fix", kind: "boundary", subject: ledger.state.pendingHuman.subject, reasons: [],
  } });
  assert.throws(() => requestFix(f.root, "RUN-F", { reason: "repair" }), /only available at the merge decision/);
  const old = fixture({ legacy: true });
  assert.throws(() => requestFix(old.root, "RUN-F", { reason: "repair" }), /legacy active run/);
  const sha = old.commit("hand repair\n");
  assert.throws(() => old.adopt(sha), /legacy active run/);
});

test("returning for repair does not extend an exhausted work review budget", () => {
  const f = fixture({ rounds: 1 });
  requestFix(f.root, "RUN-F", { reason: "repair" });
  const state = resumeRun(f.options).state;
  assert.equal(state.steps.fix.attempts, 1);
  assert.equal(state.steps.review.attempts, 1);
  assert.equal(state.pendingHuman.kind, "work-review-cap");
  assert.equal(f.ledger().events.filter((e) => e.type === "BUDGET_EXTENDED").length, 0);
});

test("status, inbox and notifications show manual repair and configured fixer commands; CLI fix records a decision", () => {
  const f = fixture();
  const state = f.ledger().state;
  const replies = nextReply({ repoLabel: ".", state });
  assert.ok(replies.some((line) => /--adopt <sha>/.test(line)));
  assert.ok(replies.some((line) => /--action fix --reason/.test(line)));
  assert.deepEqual(buildNotification("HUMAN_REQUESTED", { repoLabel: ".", state }).nextReply, replies);
  for (const command of ["status", "inbox"]) {
    const output = execFileSync(process.execPath, [CLI, command, "--repo", f.root, ...(command === "status" ? ["--run", "RUN-F"] : [])], { encoding: "utf8" });
    assert.match(output, /--adopt <sha>/);
    assert.match(output, /--action fix --reason/);
  }
  const cli = spawnSync(process.execPath, [CLI, "decide", "--repo", f.root, "--run", "RUN-F", "--action", "fix", "--reason", "CLI repair", "--by", "owner"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(f.ledger().events.at(-1).data.reason, "CLI repair");
  const missing = fixture({ fixer: false });
  assert.ok(nextReply({ repoLabel: ".", state: missing.ledger().state }).every((line) => !line.includes("--action fix")));
  const old = fixture({ legacy: true });
  assert.ok(nextReply({ repoLabel: ".", state: old.ledger().state }).every((line) => !line.includes("--adopt") && !line.includes("--action fix")));
});

function cliFixture({ old = false } = {}) {
  const root = tempDir("bb-final-cli-");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "commit.gpgSign", "false");
  git(root, "config", "core.hooksPath", "/dev/null");
  const dir = join(root, "delivery/work/WORK-C");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "work.md"), "# Confirmed work\nRepair feature.txt.\n");
  writeFileSync(join(root, "worker.sh"), `#!/bin/sh
set -eu
case "$1" in
 build|fix) echo "$1" > feature.txt; git add feature.txt; git commit -qm "$1" ;;
 verify) test -f feature.txt ;;
 review) printf '%s\\n' '{"status":"succeeded","findings":[]}' > "$BUILDBEAT_OUTPUT" ;;
esac
`);
  const config = join(dir, "run-config.yaml");
  writeFileSync(config, ["repo: ../../..", "work: WORK-C", "run: RUN-C", "allowedPaths:", "  - feature.txt", "workers:",
    ...["builder", "verifier", "reviewer", "fixer"].flatMap((worker, index) => [
      `  ${worker}:`, "    command: sh", "    env:",
      ...Object.entries(gitEnvironment).map(([key, value]) => `      ${key}: "${value}"`), "    args:", "      - worker.sh", `      - ${["build", "verify", "review", "fix"][index]}`,
    ]), ""].join("\n"));
  git(root, "add", ".");
  git(root, "commit", "-qm", "fixture");
  const call = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: "utf8" });
  const ok = (...args) => {
    const result = call(...args);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return result.stdout;
  };
  ok("accept", "--repo", ".", "--work", "WORK-C");
  ok("run", "--config", config);
  const path = join(root, ".buildbeat/runtime/runs/RUN-C-01/events.jsonl");
  if (old) {
    const events = EventLedger.open(path).events;
    rmSync(path);
    const replacement = EventLedger.open(path);
    for (const { type, actor, ts, run, work, data } of events) {
      const copy = structuredClone(data);
      if (type === "RUN_CREATED") delete copy.repair;
      replacement.append({ type, actor, ts, run, work, data: copy });
    }
  }
  return { root, config, call, ok, state: () => EventLedger.open(path).state,
    worktree: join(root, ".buildbeat/worktrees/RUN-C-01") };
}

// Split a displayed reply the way sh does for the forms the CLI prints (bare
// words, single-quoted words, backslash escapes, a trailing # comment), then
// run it without a shell, substituting only the CLI executable and the
// documented human-name placeholder.
function replyArgv(reply) {
  const args = [];
  let word = null;
  let quoted = false;
  for (let i = 0; i < reply.length; i++) {
    const c = reply[i];
    if (quoted) {
      if (c === "'") quoted = false;
      else word += c;
    } else if (c === "'") {
      quoted = true;
      word ??= "";
    } else if (c === "\\" && i + 1 < reply.length) {
      word = (word ?? "") + reply[++i];
    } else if (c === "#" && word === null) {
      break;
    } else if (/\s/.test(c)) {
      if (word !== null) args.push(word);
      word = null;
    } else {
      word = (word ?? "") + c;
    }
  }
  assert.equal(quoted, false, `unterminated quote in ${reply}`);
  if (word !== null) args.push(word);
  return args;
}
function runReply(f, reply) {
  const [command, ...args] = replyArgv(reply.replaceAll("<you>", "owner"));
  assert.equal(command, "buildbeat", reply);
  return spawnSync(process.execPath, [CLI, ...args], { cwd: f.root, encoding: "utf8" });
}
function displayedApproval(f) {
  const output = f.ok("status", "--repo", ".", "--run", "RUN-C-01");
  const reply = output.split("\n").find((line) => line.includes("buildbeat decide --action approve"));
  assert.ok(reply, output);
  return reply.slice(reply.indexOf("buildbeat"));
}

for (const old of [false, true]) {
  for (const route of ["fix", "adopt"]) {
    test(`CLI ${route} approves the refreshed reply on ${old ? "existing 4.x" : "new"} runs`, () => {
      const f = cliFixture({ old });
      const oldReply = displayedApproval(f);
      assert.match(f.ok("inbox", "--repo", "."), /--action fix --reason/);
      if (route === "fix") {
        f.ok("decide", "--repo", ".", "--run", "RUN-C-01", "--action", "fix", "--reason", "Repair feature", "--by", "owner");
        f.ok("run", "--config", f.config, "--run", "RUN-C-01");
      } else {
        writeFileSync(join(f.worktree, "feature.txt"), "manual\n");
        git(f.worktree, "add", "feature.txt");
        git(f.worktree, "commit", "-qm", "manual");
        f.ok("run", "--config", f.config, "--run", "RUN-C-01", "--adopt", git(f.worktree, "rev-parse", "HEAD"), "--by", "owner");
      }
      const state = f.state();
      const sha = git(f.worktree, "rev-parse", "HEAD");
      assert.equal(state.steps.build.attempts, 1);
      assert.equal(state.steps.fix?.attempts ?? 0, route === "fix" ? 1 : 0);
      assert.equal(state.steps.verify.attempts, 2);
      assert.equal(state.steps.review.attempts, 2);
      assert.equal(state.pendingHuman.subject.candidate, sha);
      const reply = displayedApproval(f);
      assert.ok(reply.includes(`--candidate ${sha}`));
      assert.ok(f.ok("inbox", "--repo", ".").includes(`--candidate ${sha}`));
      const notification = buildNotification("HUMAN_REQUESTED", { repoLabel: ".", state, repoRoot: f.root });
      assert.ok(notification.nextReply.includes(reply));
      const stale = runReply(f, oldReply);
      assert.notEqual(stale.status, 0);
      assert.match(stale.stderr, /approval stale/);
      const unbound = runReply(f, reply.replace(` --candidate ${sha}`, ""));
      assert.notEqual(unbound.status, 0);
      assert.match(unbound.stderr, /approval stale/);
      assert.equal(f.state().terminal, null);
      const approved = runReply(f, reply);
      assert.equal(approved.status, 0, approved.stderr + approved.stdout);
      assert.equal(f.state().terminal.status, "SUCCEEDED");
      assert.equal(f.state().decisions.at(-1).subject.candidate, sha);
      const decisions = readFileSync(join(f.root, "delivery/work/WORK-C/decisions.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
      assert.equal(decisions.at(-1).subject.candidate, sha);
    });
  }
}

for (const setup of [{ entry: "verify" }, { buildCommit: false }]) {
  for (const route of ["adopt", "fix"]) {
    test(`base-only ${JSON.stringify(setup)} accepts ${route} and rechecks the candidate`, () => {
      const f = fixture(setup);
      const initial = f.ledger().state;
      assert.equal(initial.workspaces["RUN-F"].candidate, null);
      assert.equal(initial.pendingHuman.subject.candidate, initial.workspaces["RUN-F"].base);
      if (route === "adopt") f.adopt(f.commit("manual base repair\n"));
      else requestFix(f.root, "RUN-F", { reason: "repair base" });
      const state = resumeRun(f.options).state;
      assert.equal(state.pendingHuman.kind, "final-decision");
      assert.equal(state.steps.verify.attempts, 2);
      assert.equal(state.steps.review.attempts, 2);
      assert.notEqual(state.pendingHuman.subject.candidate, initial.pendingHuman.subject.candidate);
      assert.equal(f.approve(state.pendingHuman.subject.candidate).terminal, true);
    });
  }
}

test("base-only fix still rejects a mismatched pending subject", () => {
  const f = fixture({ entry: "verify" });
  const ledger = f.ledger();
  const pending = ledger.state.pendingHuman;
  ledger.append({ type: "HUMAN_REQUESTED", actor: { kind: "kernel", id: "test" }, data: {
    ...pending, subject: { ...pending.subject, candidate: "0".repeat(40) },
  } });
  const before = f.ledger().events.length;
  assert.throws(() => requestFix(f.root, "RUN-F", { reason: "repair" }), /worktree changed/);
  assert.equal(f.ledger().events.length, before);
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
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-name-pattern", "^(final adopt keeps|CLI fix approves the refreshed reply on new runs)", import.meta.filename], {
    encoding: "utf8", env: { ...env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_SYSTEM: config,
      GIT_CONFIG_NOSYSTEM: "0", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "commit.gpgSign", GIT_CONFIG_VALUE_0: "true" },
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /# pass 2\b/, "both runtime and CLI fixture regressions must actually run");
  assert.equal(existsSync(marker), false, "host hooks must never execute");
});
