// Free attempts and budget grants are no longer written; the reducer still
// reads the ledgers of earlier versions, with and without them.

import assert from "node:assert/strict";
import test from "node:test";

import { applyEvent, initialState, reduceEvents } from "../src/v2/engine/reducer.js";

function legacyEvents() {
  return [
    ["RUN_CREATED", { workflowRef: "workflow", workflowDigest: "sha256:w", base: "abc", riskPreset: "standard" }],
    ["WORKSPACE_BOUND", { workspaceId: "main", repo: ".", branch: "run/test", worktreePath: "tree", base: "abc" }],
    ["RUN_STARTED", {}],
    ["STEP_STARTED", { step: "verify", attempt: 1, workspaceId: "main" }],
    ["STEP_FINISHED", { step: "verify", attempt: 1, status: "succeeded" }],
    ["BUDGET_CONSUMED", { kind: "attempts", amount: 1, remaining: 3 }],
    ["HUMAN_REQUESTED", { transition: "enter-review", subject: { candidate: "abc" }, reasons: ["boundary"] }],
  ].map(([type, data], index) => ({ seq: index + 1, run: "RUN-OLD", work: "WORK-OLD", type, data }));
}

test("old events with no free attempts or grants reproduce the complete legacy state", () => {
  assert.deepEqual(reduceEvents(legacyEvents()), {
    ...initialState(), seq: 7,
    run: { id: "RUN-OLD", work: "WORK-OLD", status: "WAITING_HUMAN", workflowRef: "workflow",
      workflowDigest: "sha256:w", base: "abc", riskPreset: "standard", entry: null,
      planDigest: "UNVERIFIED", intentDigest: "UNVERIFIED" },
    workspaces: { main: { repo: ".", branch: "run/test", worktreePath: "tree", base: "abc", candidate: null } },
    steps: { verify: { status: "SUCCEEDED", attempts: 1, detail: "succeeded", infraAttempts: 0 } },
    budgets: { attempts: { consumed: 1, remaining: 3 } },
    pendingHuman: { transition: "enter-review", subject: { candidate: "abc" }, reasons: ["boundary"], kind: "boundary" },
  });
});

test("free attempts survive subsequent STEP_STARTED events", () => {
  const input = legacyEvents().slice(0, 5);
  input[4].data.free = true;
  let state = reduceEvents(input);
  state = applyEvent(state, { seq: 6, type: "STEP_STARTED", data: { step: "verify", attempt: 2, workspaceId: "main" } });
  assert.equal(state.steps.verify.freeAttempts, 1);
});
