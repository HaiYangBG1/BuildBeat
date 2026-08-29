// Terminal-run compaction per docs/v2/RFC-0002-domain-model.md §6: before any
// runtime cleanup, a terminal Run must be compacted into an immutable
// run-record in the Git plane. Long-term audit must never depend on the
// runtime directory still existing.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { canonicalJson } from "../storage/event-ledger.js";
import { normalizeRepoRef } from "./repo-ref.js";

const KERNEL = { kind: "kernel", id: "orchestrator" };

export function writeRunRecord({ repoRoot, ledger, ts }) {
  const state = ledger.state;
  if (!state.terminal) {
    throw new Error("run-record requires a terminal run");
  }
  const first = ledger.events[0];
  const last = ledger.events[ledger.events.length - 1];
  const attempts = {};
  for (const [step, info] of Object.entries(state.steps)) {
    attempts[step] = info.attempts;
  }
  const workspaces = Object.fromEntries(
    Object.entries(state.workspaces).map(([id, workspace]) => [
      id,
      {
        ...workspace,
        repo: normalizeRepoRef(repoRoot, workspace.repo),
        worktreePath: normalizeRepoRef(repoRoot, workspace.worktreePath),
      },
    ]),
  );
  const evidence = state.evidence.map((item) => ({
    ...item,
    ref: normalizeRepoRef(repoRoot, item.ref),
  }));
  const record = {
    run: first.run,
    work: first.work,
    terminal: state.terminal,
    events: { from: first.seq, to: last.seq, lastDigest: last.digest },
    startedAt: first.ts,
    finishedAt: last.ts,
    attempts,
    budgets: state.budgets,
    workspaces,
    evidence,
    decisions: state.decisions,
    approvals: state.approvals,
    unverified: evidence
      .filter((item) => item.status === "unverified")
      .map((item) => item.ref),
  };
  const recordDir = join(repoRoot, "delivery", "work", first.work, "runs", first.run);
  mkdirSync(recordDir, { recursive: true });
  const recordPath = join(recordDir, "run-record.json");
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  const digest = `sha256:${createHash("sha256").update(canonicalJson(record), "utf8").digest("hex")}`;
  const runRecordRef = relative(repoRoot, recordPath);
  ledger.append({
    type: "RUN_COMPACTED",
    actor: KERNEL,
    ts,
    data: { runRecordRef, runRecordDigest: digest },
  });
  return { recordPath, runRecordRef, digest };
}
