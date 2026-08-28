import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { EventInputError, GENESIS_DIGEST } from "../src/v2/domain/event-registry.js";
import { IllegalEventError } from "../src/v2/engine/reducer.js";
import { EventLedger, LedgerError, eventDigest } from "../src/v2/storage/event-ledger.js";

const KERNEL = { kind: "kernel", id: "orchestrator" };
const TS = "2026-08-28T00:00:00.000Z";

function freshPath() {
  return join(mkdtempSync(join(tmpdir(), "bb-v2-ledger-")), "events.jsonl");
}

function startedLedger(path = freshPath()) {
  const ledger = EventLedger.open(path);
  ledger.append({
    type: "RUN_CREATED",
    actor: KERNEL,
    ts: TS,
    run: "RUN-001",
    work: "WORK-001",
    data: {
      workflowRef: "software-delivery",
      workflowDigest: "sha256:wf",
      base: "abc1234",
      riskPreset: "standard",
    },
  });
  ledger.append({ type: "RUN_STARTED", actor: KERNEL, ts: TS, data: {} });
  ledger.append({
    type: "WORKSPACE_BOUND",
    actor: KERNEL,
    ts: TS,
    data: {
      workspaceId: "main",
      repo: ".",
      branch: "run/RUN-001",
      worktreePath: ".buildbeat/worktrees/RUN-001",
      base: "abc1234",
    },
  });
  return ledger;
}

test("append builds a verifiable hash chain with monotonic seq", () => {
  const ledger = startedLedger();
  assert.equal(ledger.events.length, 3);
  assert.deepEqual(
    ledger.events.map((event) => event.seq),
    [1, 2, 3],
  );
  assert.equal(ledger.events[0].prev, GENESIS_DIGEST);
  assert.equal(ledger.events[1].prev, ledger.events[0].digest);
  assert.equal(ledger.events[2].prev, ledger.events[1].digest);
  for (const event of ledger.events) {
    assert.equal(eventDigest(event), event.digest);
  }
  const lines = readFileSync(ledger.path, "utf8").split("\n").filter(Boolean);
  assert.equal(lines.length, 3);
});

test("reopening replays the ledger to an identical state", () => {
  const ledger = startedLedger();
  ledger.append({
    type: "STEP_STARTED",
    actor: KERNEL,
    ts: TS,
    data: { step: "build", attempt: 1, worker: "builder", adapter: "mock", workspaceId: "main" },
  });
  const reopened = EventLedger.open(ledger.path);
  assert.equal(reopened.corruption, null);
  assert.deepEqual(reopened.state, ledger.state);
  assert.equal(reopened.lastDigest, ledger.lastDigest);
  assert.equal(reopened.events.length, 4);
});

test("tampering corrupts the ledger from the first bad line and blocks appends", () => {
  const ledger = startedLedger();
  const lines = readFileSync(ledger.path, "utf8").split("\n").filter(Boolean);
  const tampered = JSON.parse(lines[2]);
  tampered.data.base = "evil000";
  lines[2] = JSON.stringify(tampered);
  writeFileSync(ledger.path, `${lines.join("\n")}\n`, "utf8");

  const reopened = EventLedger.open(ledger.path);
  assert.ok(reopened.corruption);
  assert.equal(reopened.corruption.atLine, 3);
  assert.equal(reopened.corruption.afterSeq, 2);
  assert.match(reopened.corruption.reason, /digest mismatch/);
  assert.equal(reopened.events.length, 2);
  assert.throws(
    () => reopened.append({ type: "RUN_STARTED", actor: KERNEL, ts: TS, data: {} }),
    LedgerError,
  );
});

test("a removed line breaks the prev chain", () => {
  const ledger = startedLedger();
  const lines = readFileSync(ledger.path, "utf8").split("\n").filter(Boolean);
  writeFileSync(ledger.path, `${lines[0]}\n${lines[2]}\n`, "utf8");
  const reopened = EventLedger.open(ledger.path);
  assert.ok(reopened.corruption);
  assert.equal(reopened.corruption.atLine, 2);
  assert.match(reopened.corruption.reason, /prev mismatch/);
});

test("an unknown envelope version is rejected, not guessed at", () => {
  const ledger = startedLedger();
  const alien = {
    v: 2,
    seq: 4,
    ts: TS,
    run: "RUN-001",
    work: "WORK-001",
    type: "RUN_STARTED",
    actor: KERNEL,
    data: {},
    prev: ledger.lastDigest,
  };
  alien.digest = eventDigest(alien);
  appendFileSync(ledger.path, `${JSON.stringify(alien)}\n`, "utf8");
  const reopened = EventLedger.open(ledger.path);
  assert.ok(reopened.corruption);
  assert.match(reopened.corruption.reason, /unsupported envelope version/);
});

test("unknown envelope fields and unknown types are preserved and skipped on read", () => {
  const ledger = startedLedger();
  const future = {
    v: 1,
    seq: 4,
    ts: TS,
    run: "RUN-001",
    work: "WORK-001",
    type: "FUTURE_EVENT",
    actor: KERNEL,
    data: { anything: true },
    prev: ledger.lastDigest,
    ext: "ignored-by-v1-readers",
  };
  future.digest = eventDigest(future);
  appendFileSync(ledger.path, `${JSON.stringify(future)}\n`, "utf8");

  const reopened = EventLedger.open(ledger.path);
  assert.equal(reopened.corruption, null);
  assert.equal(reopened.events.length, 4);
  assert.equal(reopened.state.seq, 4);
  assert.equal(reopened.state.run.status, "RUNNING");
});

test("write side rejects unknown types and missing or invalid data fields", () => {
  const ledger = startedLedger();
  assert.throws(
    () => ledger.append({ type: "FUTURE_EVENT", actor: KERNEL, ts: TS, data: {} }),
    EventInputError,
  );
  assert.throws(
    () =>
      ledger.append({
        type: "STEP_FINISHED",
        actor: KERNEL,
        ts: TS,
        data: { step: "build", attempt: 1 },
      }),
    EventInputError,
  );
  assert.throws(
    () =>
      ledger.append({
        type: "POLICY_EVALUATED",
        actor: KERNEL,
        ts: TS,
        data: { policy: "p", phase: "post", result: "MAYBE", enforcement: "ADVISORY", reason: "r" },
      }),
    EventInputError,
  );
});

test("write side rejects illegal transitions before anything hits disk", () => {
  const path = freshPath();
  const ledger = EventLedger.open(path);
  assert.throws(
    () =>
      ledger.append({
        type: "RUN_STARTED",
        actor: KERNEL,
        ts: TS,
        run: "RUN-001",
        work: "WORK-001",
        data: {},
      }),
    IllegalEventError,
  );
  assert.equal(ledger.events.length, 0);

  const started = startedLedger();
  started.append({
    type: "RUN_TERMINAL",
    actor: KERNEL,
    ts: TS,
    data: { status: "CANCELLED", reason: "test" },
  });
  assert.throws(
    () =>
      started.append({
        type: "EVIDENCE_RECORDED",
        actor: KERNEL,
        ts: TS,
        data: {
          evidenceRef: "e1",
          kind: "test",
          subject: "abc1234",
          digest: "sha256:e",
          status: "passed",
          grade: "L2",
        },
      }),
    IllegalEventError,
  );
  const lineCount = readFileSync(started.path, "utf8").split("\n").filter(Boolean).length;
  assert.equal(lineCount, 4);
  started.append({
    type: "RUN_COMPACTED",
    actor: KERNEL,
    ts: TS,
    data: { runRecordRef: "runs/RUN-001/run-record.json", runRecordDigest: "sha256:rr" },
  });
  assert.ok(started.state.compacted);
});
