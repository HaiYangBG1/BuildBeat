import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createMockAdapter } from "../src/v2/adapters/mock.js";
import { loadWorkflow } from "../src/v2/engine/workflow.js";
import { listInbox } from "../src/v2/runtime/decisions.js";
import { computeMetrics } from "../src/v2/runtime/metrics.js";
import { startRun } from "../src/v2/runtime/orchestrator.js";
import { EventLedger } from "../src/v2/storage/event-ledger.js";

const PRESET_PATH = join(import.meta.dirname, "..", "src", "v2", "presets", "software-delivery.yaml");
const WORKFLOW = loadWorkflow(PRESET_PATH);

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "bb-v2-supersede-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.email", "pilot@example.com"]);
  git(root, ["config", "user.name", "Pilot"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "baseline"]);
  return root;
}

function waitingRun(root, runId, workId, overrides = {}) {
  const adapter = createMockAdapter({ build: ["succeed"], verify: ["succeed"] });
  return startRun({
    repoRoot: root,
    workflow: WORKFLOW,
    workflowDigest: "sha256:test",
    workId,
    runId,
    entry: "build",
    stopAt: ["review"],
    adapters: { builder: adapter, verifier: adapter },
    ...overrides,
  });
}

test("a new run for the same work supersedes older runs still waiting on a human", () => {
  const root = fixtureRepo();
  const first = waitingRun(root, "RUN-S1", "WORK-S");
  assert.equal(first.state.run.status, "WAITING_HUMAN");
  const other = waitingRun(root, "RUN-O1", "WORK-OTHER");
  assert.equal(other.state.run.status, "WAITING_HUMAN");

  const second = waitingRun(root, "RUN-S2", "WORK-S");
  assert.deepEqual(second.superseded, ["RUN-S1"]);
  assert.deepEqual(second.supersedeSkipped, []);
  assert.deepEqual(second.state.run.status, "WAITING_HUMAN");

  const firstLedger = EventLedger.open(first.ledgerPath);
  assert.equal(firstLedger.corruption, null);
  assert.equal(firstLedger.state.terminal.status, "SUPERSEDED");
  assert.match(firstLedger.state.terminal.reason, /superseded by RUN-S2/);
  assert.ok(firstLedger.state.compacted, "superseded run is compacted into a run-record");
  assert.ok(existsSync(join(root, "delivery", "work", "WORK-S", "runs", "RUN-S1", "run-record.json")));

  const created = EventLedger.open(second.ledgerPath).events[0];
  assert.deepEqual(created.data.supersedes, ["RUN-S1"]);

  // Another work's waiting run is untouched; the inbox now shows exactly the
  // live waits.
  const inbox = listInbox(root).map((row) => row.run).sort();
  assert.deepEqual(inbox, ["RUN-O1", "RUN-S2"]);

  const metrics = computeMetrics(root);
  assert.equal(metrics.terminal.SUPERSEDED, 1);
  assert.equal(metrics.waitingHuman, 2);
});

test("supersede: off leaves older waiting runs alone", () => {
  const root = fixtureRepo();
  waitingRun(root, "RUN-K1", "WORK-K");
  const second = waitingRun(root, "RUN-K2", "WORK-K", { supersede: "off" });
  assert.deepEqual(second.superseded, []);
  assert.equal(EventLedger.open(join(root, ".buildbeat", "runtime", "runs", "RUN-K1", "events.jsonl")).state.terminal, null);
  assert.deepEqual(listInbox(root).map((row) => row.run).sort(), ["RUN-K1", "RUN-K2"]);
});
