// What a work has consumed so far, across every review of it.

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { formatMs } from "../src/v2/runtime/hints.js";
import { computeOverview, renderOverview } from "../src/v2/runtime/overview.js";
import { computeWorkCost, renderWorkCost } from "../src/v2/runtime/work-cost.js";
import { addWork, commit, emptyRepo, record, reviewWith } from "./support/review.js";

test("work cost adds up review rounds and findings across superseded runs", () => {
  // A pilot work once went through 21 runs and 9 review rounds while a
  // per-run cap of two never fired, because every round was a new run.
  const root = emptyRepo("bb-v2-cost-");
  commit(root, "baseline", { ".gitignore": ".buildbeat/\n" });
  const work = "WORK-COST";
  addWork(root, work);
  commit(root, `first try\n\nWork: ${work}`, { "src/feature.txt": "helo\n" });
  const first = reviewWith(root, work, { findings: [{ severity: "P1", summary: "one" }] });
  assert.equal(first.state.pendingHuman.kind, "final-decision");
  // The review of a fixed commit supersedes the one still waiting.
  commit(root, `fix\n\nWork: ${work}`, { "src/feature.txt": "hello\n" });
  const second = reviewWith(root, work);
  assert.deepEqual(second.superseded, [first.runId]);

  assert.deepEqual(computeWorkCost(root, work), { runs: 2, reviewRounds: 2, findings: 1 });
  const rows = computeOverview(root, { work });
  assert.equal(rows[0].runs, 2);
  assert.equal(rows[0].cost.reviewRounds, 2);
  assert.match(renderOverview(rows), /^ {2}cost: review rounds 2 · findings 1$/m);

  // The superseded run's record carries its rounds for when the runtime
  // directory is gone.
  assert.equal(record(root, work, first.runId).cost.reviewRounds, 1);
  rmSync(join(root, ".buildbeat", "runtime", "runs", first.runId), { recursive: true, force: true });
  assert.deepEqual(computeWorkCost(root, work), { runs: 2, reviewRounds: 2, findings: 1 });
});

test("durations and the cost line render in plain units", () => {
  assert.equal(formatMs(0), "0s");
  assert.equal(formatMs(45_000), "45s");
  assert.equal(formatMs(5 * 60_000), "5m");
  assert.equal(formatMs(3 * 3_600_000 + 40 * 60_000), "3h40m");
  assert.equal(renderWorkCost({ runs: 4, reviewRounds: 9, findings: 22 }), "review rounds 9 · findings 22");
});
