import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeRunRecord } from "../src/v2/runtime/run-record.js";

test("compaction normalizes legacy absolute runtime references", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "bb-v2-record-"));
  const runId = "RUN-LEGACY";
  const workId = "WORK-LEGACY";
  const ledger = {
    events: [
      { seq: 1, ts: "2026-08-28T00:00:00.000Z", run: runId, work: workId },
      { seq: 2, ts: "2026-08-28T00:01:00.000Z", digest: "sha256:last" },
    ],
    state: {
      terminal: { status: "FAILED", reason: "legacy fixture" },
      steps: {},
      budgets: {},
      workspaces: {
        [runId]: {
          repo: repoRoot,
          branch: `run/${runId}`,
          worktreePath: join(repoRoot, ".buildbeat", "worktrees", runId),
          base: "abc1234",
          candidate: null,
        },
      },
      evidence: [
        {
          ref: join(repoRoot, ".buildbeat", "runtime", "runs", runId, "logs", "build-1.log"),
          kind: "command",
          subject: "abc1234",
          digest: "sha256:evidence",
          status: "failed",
          grade: "L2",
        },
      ],
      decisions: [],
      approvals: [],
    },
    append(event) {
      this.compactionEvent = event;
    },
  };

  const result = writeRunRecord({ repoRoot, ledger, ts: "2026-08-28T00:01:00.000Z" });
  const raw = readFileSync(result.recordPath, "utf8");
  const record = JSON.parse(raw);
  assert.doesNotMatch(raw, new RegExp(repoRoot));
  assert.equal(record.workspaces[runId].repo, ".");
  assert.equal(record.workspaces[runId].worktreePath, `.buildbeat/worktrees/${runId}`);
  assert.equal(
    record.evidence[0].ref,
    `.buildbeat/runtime/runs/${runId}/logs/build-1.log`,
  );
  assert.equal(ledger.compactionEvent.data.runRecordRef, result.runRecordRef);
});
