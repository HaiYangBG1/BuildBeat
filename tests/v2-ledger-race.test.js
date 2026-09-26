import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createShellAdapter } from "../src/v2/adapters/shell.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { approveRun, rejectRun } from "../src/v2/runtime/decisions.js";
import { resumeRun, startRun } from "../src/v2/runtime/orchestrator.js";
import { EventLedger, LedgerError } from "../src/v2/storage/event-ledger.js";

const CLI = join(import.meta.dirname, "..", "bin", "buildbeat.js");
const PRESET = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");

function tempRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "bb-ledger-race-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// Minimal reducer: the guard under test lives in EventLedger itself.
const COUNTING = {
  initialState: () => ({ seq: 0 }),
  applyEvent: (state, event) => ({ seq: event.seq }),
};
const KERNEL = { kind: "kernel", id: "test" };

test("a writer whose read is stale is refused and the ledger stays intact", (t) => {
  const path = join(tempRoot(t), "events.jsonl");
  const first = EventLedger.open(path, COUNTING);
  first.append({ type: "RUN_STARTED", actor: KERNEL, data: {}, run: "RUN-X", work: "WORK-X" });
  const a = EventLedger.open(path, COUNTING);
  const b = EventLedger.open(path, COUNTING);
  a.append({ type: "RUN_STARTED", actor: KERNEL, data: {} });
  assert.throws(
    () => b.append({ type: "RUN_STARTED", actor: KERNEL, data: {} }),
    (error) => error instanceof LedgerError && /ledger for RUN-X changed on disk since it was read \(another writer\); re-read it and retry/.test(error.message),
  );
  const reread = EventLedger.open(path, COUNTING);
  assert.equal(reread.corruption, null);
  assert.equal(reread.events.length, 2);
  // Re-reading and retrying is safe.
  reread.append({ type: "RUN_STARTED", actor: KERNEL, data: {} });
  assert.equal(EventLedger.open(path, COUNTING).events.length, 3);
});

test("a writer keeps appending after its own writes", (t) => {
  const path = join(tempRoot(t), "events.jsonl");
  const ledger = EventLedger.open(path, COUNTING);
  for (let i = 0; i < 5; i += 1) {
    ledger.append({ type: "RUN_STARTED", actor: KERNEL, data: {}, run: "RUN-X", work: "WORK-X" });
  }
  assert.equal(EventLedger.open(path, COUNTING).events.length, 5);
});

// A real repository with a run waiting on a human at enter-review.
function waitingRun(t) {
  const root = tempRoot(t);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-qm", "baseline");
  const config = join(root, "run-config.yaml");
  const worker = (name, script) => [`  ${name}:`, `    command: ${process.execPath}`, "    args:", "      - -e", `      - '${script}'`];
  writeFileSync(config, [
    "repo: .", "work: WORK-RACE", "run: RUN-RACE", `workflow: ${PRESET}`, "riskPreset: fast", "entry: build",
    "stopAt:", "  - review", "workers:",
    ...worker("builder", "0"),
    ...worker("verifier", "0"),
    ...worker("reviewer", 'require("node:fs").writeFileSync(process.env.BUILDBEAT_OUTPUT, JSON.stringify({status: "succeeded", findings: []}))'),
  ].join("\n"));
  execFileSync(process.execPath, [CLI, "start", "--config", config, "--attempt", "new"], { encoding: "utf8" });
  const ledgerPath = join(root, ".buildbeat", "runtime", "runs", "RUN-RACE-01", "events.jsonl");
  assert.equal(EventLedger.open(ledgerPath).state.pendingHuman.transition, "enter-review");
  return { root, config, ledgerPath };
}

// Launches CLI processes staggered by `gapMs` so that some read the ledger
// while another is writing it; resolves with every exit code and stderr.
function race(commands, gapMs) {
  return Promise.all(
    commands.map(
      (args, index) =>
        new Promise((resolve) => {
          setTimeout(() => {
            const child = spawn(process.execPath, [CLI, ...args], { stdio: ["ignore", "pipe", "pipe"] });
            let stderr = "";
            child.stderr.on("data", (chunk) => {
              stderr += chunk;
            });
            child.on("close", (code) => resolve({ args, code, stderr }));
          }, index * gapMs);
        }),
    ),
  );
}

function intact(ledgerPath) {
  const ledger = EventLedger.open(ledgerPath);
  assert.equal(ledger.corruption, null, JSON.stringify(ledger.corruption));
  return ledger;
}

test("five concurrent approvals: exactly one lands and the ledger stays intact", async (t) => {
  const f = waitingRun(t);
  const approve = ["approve", "--repo", f.root, "--run", "RUN-RACE-01", "--transition", "enter-review"];
  const results = await race(Array.from({ length: 5 }, () => approve), 3);
  const ledger = intact(f.ledgerPath);
  assert.equal(ledger.events.filter((event) => event.type === "DECISION_RECORDED").length, 1);
  assert.equal(results.filter((result) => result.code === 0).length, 1, results.map((result) => result.stderr).join("\n"));
  for (const result of results.filter((item) => item.code !== 0)) {
    assert.match(result.stderr, /error: .+/);
  }
});

test("stop racing approve: the ledger stays intact and ends cancelled", async (t) => {
  const f = waitingRun(t);
  const results = await race([
    ["approve", "--repo", f.root, "--run", "RUN-RACE-01", "--transition", "enter-review"],
    ["stop", "--repo", f.root, "--run", "RUN-RACE-01", "--reason", "race"],
    ["stop", "--repo", f.root, "--run", "RUN-RACE-01", "--reason", "race again"],
  ], 4);
  const ledger = intact(f.ledgerPath);
  const types = ledger.events.map((event) => event.type);
  const approved = results.filter((result) => result.args[0] === "approve" && result.code === 0).length;
  const stopped = results.filter((result) => result.args[0] === "stop" && result.code === 0).length;
  // Whoever takes the run lock first always completes: never all fail.
  assert.ok(approved + stopped >= 1, results.map((result) => result.stderr).join("\n"));
  for (const result of results.filter((item) => item.code !== 0)) {
    assert.match(result.stderr, /error: .+/);
  }
  // The ledger records exactly what succeeded, in one consistent order.
  assert.equal(types.filter((type) => type === "DECISION_RECORDED").length, approved);
  assert.equal(types.filter((type) => type === "RUN_TERMINAL").length, stopped > 0 ? 1 : 0);
  if (stopped > 0) {
    assert.equal(ledger.state.terminal.status, "CANCELLED");
    assert.deepEqual(types.slice(types.indexOf("RUN_TERMINAL") + 1), ["RUN_COMPACTED"]);
    if (approved > 0) {
      // Approved first, then stopped: never a decision written after the end.
      assert.ok(types.indexOf("DECISION_RECORDED") < types.indexOf("RUN_TERMINAL"));
    }
  } else {
    assert.equal(ledger.state.terminal, null);
  }
});

test("concurrent resumes after an approval drive the run once", async (t) => {
  const f = waitingRun(t);
  execFileSync(process.execPath, [CLI, "approve", "--repo", f.root, "--run", "RUN-RACE-01", "--transition", "enter-review"]);
  const decided = EventLedger.open(f.ledgerPath).events.length;
  await race(Array.from({ length: 4 }, () => ["resume", "--config", f.config]), 25);
  const ledger = intact(f.ledgerPath);
  const after = ledger.events.slice(decided);
  assert.equal(after.filter((event) => event.type === "RUN_STARTED").length, 1);
  assert.equal(ledger.state.steps.review.attempts, 1);
  assert.equal(ledger.state.pendingHuman.transition, "enter-wait-merge");
});

// Deterministic interleaving: the race window (read the ledger, then take
// the lock) is far too narrow to hit reliably from separate processes, so
// these tests put another session's write exactly inside it. EventLedger.open
// is looked up at call time; the first read of the run's ledger runs the
// competing write before handing the (possibly now stale) read back.
function inProcessRun(t) {
  const root = tempRoot(t);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-qm", "baseline");
  const worker = createShellAdapter({
    command: process.execPath,
    args: ["-e", 'if (process.env.BUILDBEAT_OUTPUT) require("node:fs").writeFileSync(process.env.BUILDBEAT_OUTPUT, JSON.stringify({status: "succeeded", findings: []}))'],
  });
  const options = {
    repoRoot: root, workflow: loadWorkflow(PRESET), workflowDigest: "sha256:fixture", workId: "WORK-RACE",
    runId: "RUN-RACE", entry: "build", planDigest: "sha256:plan", stopAt: ["review"],
    adapters: { builder: worker, verifier: worker, reviewer: worker },
  };
  const started = startRun(options);
  assert.equal(started.state.pendingHuman.transition, "enter-review");
  return { options, ledgerPath: started.ledgerPath };
}

function interleave(t, ledgerPath, competingWrite) {
  const open = EventLedger.open;
  const outcome = { ran: false, error: null };
  EventLedger.open = function (path, ...rest) {
    const ledger = open.call(this, path, ...rest);
    if (path === ledgerPath && !outcome.ran) {
      outcome.ran = true;
      try {
        competingWrite();
      } catch (error) {
        outcome.error = error;
      }
    }
    return ledger;
  };
  t.after(() => {
    EventLedger.open = open;
  });
  return { outcome, restore: () => (EventLedger.open = open) };
}

test("an approval cannot be written through a read another session wrote past", (t) => {
  const f = inProcessRun(t);
  const { outcome, restore } = interleave(t, f.ledgerPath, () =>
    rejectRun(f.options.repoRoot, f.options.runId, { by: "other-session", reason: "raced" }),
  );
  let approved = null;
  let failure = null;
  try {
    approved = approveRun(f.options.repoRoot, f.options.runId, { by: "owner", transition: "enter-review" });
  } catch (error) {
    failure = error;
  }
  restore();
  assert.equal(outcome.ran, true);
  const ledger = intact(f.ledgerPath);
  // The approval took the lock before reading, so the competing reject in
  // the window could not write; the approval then stands on a fresh read.
  assert.match(String(outcome.error), /already locked/);
  assert.equal(failure, null, String(failure));
  assert.equal(approved.approved, true);
  assert.deepEqual(ledger.state.decisions.map((decision) => decision.decision), ["approved"]);
  assert.equal(ledger.state.terminal, null);
});

test("a resume decides on a read taken under the lock, not the one before it", (t) => {
  const f = inProcessRun(t);
  approveRun(f.options.repoRoot, f.options.runId, { by: "owner", transition: "enter-review" });
  // Another session stops the run right after this resume's first read.
  const { outcome, restore } = interleave(t, f.ledgerPath, () => {
    const ledger = EventLedger.open(f.ledgerPath);
    ledger.append({ type: "RUN_TERMINAL", actor: { kind: "human", id: "other-session" }, data: { status: "CANCELLED", reason: "raced" } });
  });
  const result = resumeRun(f.options);
  restore();
  assert.equal(outcome.ran, true);
  assert.equal(outcome.error, null);
  const ledger = intact(f.ledgerPath);
  assert.equal(result.resumed, false);
  assert.equal(result.reason, "run is terminal");
  assert.equal(ledger.state.terminal.status, "CANCELLED");
  assert.equal(ledger.events.filter((event) => event.type === "RUN_STARTED").length, 1);
});
