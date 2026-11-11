// What the runtime accepts as a reviewer's report.

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import test from "node:test";

import { parseEnvelope } from "../src/runtime/orchestrator.js";
import { EventLedger } from "../src/storage/event-ledger.js";
import { commit, fixture, reviewWith, worker } from "./support/review.js";

test("parseEnvelope tolerates one markdown fence but stays strict inside", () => {
  const fenced = parseEnvelope('```json\n{"status":"succeeded","findings":[]}\n```');
  assert.equal(fenced.error, null);
  assert.deepEqual(fenced.envelope.findings, []);
  const bad = parseEnvelope("```json\nnot json\n```");
  assert.match(bad.error, /not valid JSON/);
});

test("a report that is not a valid envelope is a tooling failure, not a verdict on the commit", async (t) => {
  const { root, work } = fixture({ prefix: "bb-review-" });
  commit(root, "add the feature", { "src/feature.txt": "hello\n" });
  const reports = {
    "not JSON": "not-json\n",
    "a finding without a severity": JSON.stringify({ findings: [{ summary: "something is off" }] }),
  };
  for (const [name, text] of Object.entries(reports)) {
    await t.test(name, () => {
      const result = reviewWith(root, work, {
        reviewer: worker(({ outputPath }) => {
          writeFileSync(outputPath, text);
          return {};
        }),
      });
      const state = result.state;
      assert.equal(state.steps.review.detail, "invalid-output");
      // No verdict: the run ends CANCELLED, nothing waits for a person and
      // no review evidence is recorded.
      assert.equal(state.terminal.status, "CANCELLED");
      assert.equal(
        state.terminal.reason,
        "worker infrastructure failure at review: output is not a worker envelope; not a candidate defect",
      );
      assert.equal(state.pendingHuman, null);
      assert.equal(state.evidence.some((item) => item.kind === "review"), false);
      const finished = EventLedger.open(result.ledgerPath).events
        .filter((event) => event.type === "STEP_FINISHED" && event.data.step === "review");
      assert.equal(finished.length, 1);
      assert.equal(finished[0].data.infra, true);
    });
  }
});
