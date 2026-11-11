// The runtime grants no budgets any more; the reducer still reads the grants
// that ledgers of earlier versions carry.

import assert from "node:assert/strict";
import test from "node:test";

import { applyEvent, initialState } from "../src/v2/engine/reducer.js";

test("BUDGET_EXTENDED events of an old ledger reduce deterministically", () => {
  let state = initialState();
  const base = { v: 1, ts: "2026-09-05T00:00:00.000Z", run: "RUN-1", work: "WORK-1", actor: { kind: "kernel", id: "orchestrator" }, prev: "sha256:x", digest: "sha256:y" };
  state = applyEvent(state, { ...base, seq: 1, type: "RUN_CREATED", data: { workflowRef: "wf", workflowDigest: "sha256:wf", base: "abc", riskPreset: "standard" } });
  state = applyEvent(state, { ...base, seq: 2, type: "BUDGET_EXTENDED", data: { step: "review", amount: 1, maxAttempts: 3, approvalRef: "D-1" } });
  state = applyEvent(state, { ...base, seq: 3, type: "BUDGET_EXTENDED", data: { step: "review", amount: 1, maxAttempts: 4, approvalRef: "D-2" } });
  assert.deepEqual(state.budgetExtensions, { review: 2 });
});
