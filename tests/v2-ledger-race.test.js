// Two writers on one run ledger. The ledger itself refuses a writer whose
// read is stale; the commands that record a decision take the run lock and
// read the ledger again under it, so a decision is never written on top of
// what another session wrote in between.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DecisionError, approveReview, rejectReview } from "../src/v2/runtime/decisions.js";
import { EventLedger, LedgerError } from "../src/v2/storage/event-ledger.js";
import { CLI, commit, fixture, jsonl, reviewWith } from "./support/review.js";
import { tempDir } from "./support/tmp.js";

function tempRoot(t) {
  const root = tempDir("bb-ledger-race-");
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

// A real repository with one reviewed commit waiting for the decision on it.
function waitingRun() {
  const { root, work } = fixture({ prefix: "bb-ledger-race-" });
  const sha = commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const reviewed = reviewWith(root, work);
  assert.equal(reviewed.state.pendingHuman.transition, "enter-wait-merge");
  return { root, work, sha, runId: reviewed.runId, ledgerPath: reviewed.ledgerPath };
}

const decide = (f, ...args) => ["decide", "--repo", f.root, "--work", f.work, "--by", "owner", "--as", "human", ...args];
const actionOf = (args) => args[args.indexOf("--action") + 1];

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

test("five concurrent approvals: exactly one lands and the ledger stays intact", async () => {
  const f = waitingRun();
  const approve = decide(f, "--action", "approve", "--candidate", f.sha);
  const results = await race(Array.from({ length: 5 }, () => approve), 3);
  const ledger = intact(f.ledgerPath);
  assert.equal(ledger.events.filter((event) => event.type === "DECISION_RECORDED").length, 1);
  assert.equal(results.filter((result) => result.code === 0).length, 1, results.map((result) => result.stderr).join("\n"));
  for (const result of results.filter((item) => item.code !== 0)) {
    assert.match(result.stderr, /error: .+/);
  }
  // The same single approval in the work's records.
  assert.equal(ledger.state.terminal.status, "SUCCEEDED");
  assert.deepEqual(
    jsonl(f.root, f.work, "decisions.jsonl").filter((row) => row.run === f.runId).map((row) => row.decision),
    ["approved"],
  );
});

test("reject racing approve: one decision lands, the run ends once and the ledger stays intact", async () => {
  const f = waitingRun();
  const results = await race([
    decide(f, "--action", "approve", "--candidate", f.sha),
    decide(f, "--action", "reject", "--reason", "race"),
    decide(f, "--action", "reject", "--reason", "race again"),
  ], 4);
  const ledger = intact(f.ledgerPath);
  const types = ledger.events.map((event) => event.type);
  const won = (action) => results.filter((result) => actionOf(result.args) === action && result.code === 0).length;
  const approved = won("approve");
  const rejected = won("reject");
  // Whoever takes the run lock first always completes, and either decision
  // ends the run: never all fail, never two succeed.
  assert.equal(approved + rejected, 1, results.map((result) => result.stderr).join("\n"));
  for (const result of results.filter((item) => item.code !== 0)) {
    assert.match(result.stderr, /error: .+/);
  }
  // The ledger records exactly what succeeded, in one consistent order.
  assert.equal(types.filter((type) => type === "DECISION_RECORDED").length, 1);
  assert.equal(types.filter((type) => type === "RUN_TERMINAL").length, 1);
  assert.deepEqual(ledger.state.decisions.map((decision) => decision.decision), [approved ? "approved" : "rejected"]);
  assert.equal(ledger.state.terminal.status, approved ? "SUCCEEDED" : "CANCELLED");
  // Decided first, then ended: never a decision written after the end.
  assert.ok(types.indexOf("DECISION_RECORDED") < types.indexOf("RUN_TERMINAL"));
  assert.deepEqual(types.slice(types.indexOf("RUN_TERMINAL") + 1), ["RUN_COMPACTED"]);
  assert.deepEqual(
    jsonl(f.root, f.work, "decisions.jsonl").filter((row) => row.run === f.runId).map((row) => row.decision),
    [approved ? "approved" : "rejected"],
  );
});

// Deterministic interleaving: the race window (read the ledger, then take
// the lock) is far too narrow to hit reliably from separate processes, so
// this test puts another session's write exactly inside it. EventLedger.open
// is looked up at call time; the first read of the run's ledger runs the
// competing write before handing the (now stale) read back.
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
  const f = waitingRun();
  const { outcome, restore } = interleave(t, f.ledgerPath, () =>
    rejectReview(f.root, f.work, { by: "other-session", as: "human", reason: "raced" }),
  );
  let approved = null;
  let failure = null;
  try {
    approved = approveReview(f.root, f.work, { candidate: f.sha, by: "owner", as: "human" });
  } catch (error) {
    failure = error;
  }
  restore();
  assert.equal(outcome.ran, true);
  const ledger = intact(f.ledgerPath);
  // An approval finds the waiting run by reading the work's ledgers, which
  // comes before it can take that run's lock: the rejection written in the
  // window stands. Under the lock the approval read the ledger again, saw
  // the run had ended, and wrote nothing.
  assert.equal(outcome.error, null, String(outcome.error));
  assert.equal(approved, null);
  assert.ok(failure instanceof DecisionError, String(failure));
  assert.match(failure.message, new RegExp(`run ${f.runId} is already terminal \\(CANCELLED\\)`));
  assert.deepEqual(ledger.state.decisions.map((decision) => decision.decision), ["rejected"]);
  assert.equal(ledger.state.approvals.length, 0);
  assert.equal(ledger.state.terminal.status, "CANCELLED");
  assert.deepEqual(
    jsonl(f.root, f.work, "decisions.jsonl").filter((row) => row.run === f.runId).map((row) => row.decision),
    ["rejected"],
  );
  // The refused approval gave the run lock back.
  assert.equal(existsSync(join(f.root, ".buildbeat", "runtime", "locks", `${f.runId}.lock`)), false);
});
