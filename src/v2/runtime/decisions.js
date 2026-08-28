// Human decision runtime: approve / reject a pending request, and the inbox.
// An approval is recorded only after re-reading the workspace and confirming
// the subject is still exactly what the request showed — if the candidate
// moved or the tree is dirty, the request is refreshed instead of stamped
// (lessons #18: no rubber-stamping a moved target). Every decision lands both
// as a DECISION_RECORDED event and as a line in the Git plane
// (delivery/work/<work>/decisions.jsonl).

import { appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { EventLedger } from "../storage/event-ledger.js";
import { acquireLock, readback, releaseLock } from "../workspace/workspace-manager.js";
import { writeRunRecord } from "./run-record.js";

const KERNEL = { kind: "kernel", id: "orchestrator" };

export class DecisionError extends Error {
  constructor(message) {
    super(message);
    this.name = "DecisionError";
  }
}

function ledgerPathFor(repoRoot, runId) {
  return join(repoRoot, ".buildbeat", "runtime", "runs", runId, "events.jsonl");
}

function openWaiting(repoRoot, runId) {
  const ledger = EventLedger.open(ledgerPathFor(repoRoot, runId));
  if (ledger.corruption) {
    throw new DecisionError(
      `ledger for ${runId} is corrupted after seq=${ledger.corruption.afterSeq}; no decision can be recorded`,
    );
  }
  if (!ledger.state.run) {
    throw new DecisionError(`no ledger for run ${runId}`);
  }
  if (ledger.state.terminal) {
    throw new DecisionError(`run ${runId} is already terminal (${ledger.state.terminal.status})`);
  }
  if (!ledger.state.pendingHuman) {
    throw new DecisionError(`run ${runId} has no pending human request`);
  }
  return ledger;
}

function recordDecisionFile(repoRoot, work, line) {
  const dir = join(repoRoot, "delivery", "work", work);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "decisions.jsonl"), `${JSON.stringify(line)}\n`, "utf8");
}

export function approveRun(repoRoot, runId, { by = "human", transition, ts } = {}) {
  const ledger = openWaiting(repoRoot, runId);
  const pending = ledger.state.pendingHuman;
  if (!transition) {
    throw new DecisionError(
      `an approval must name its transition explicitly (pending: ${pending.transition})`,
    );
  }
  if (transition !== pending.transition) {
    throw new DecisionError(
      `transition mismatch: pending is ${pending.transition}, got ${transition}`,
    );
  }
  acquireLock(repoRoot, runId);
  try {
    const bound = ledger.state.workspaces[runId];
    if (!bound || !existsSync(bound.worktreePath)) {
      throw new DecisionError(`worktree missing for ${runId}; cannot verify the approval subject`);
    }
    const tree = readback(bound.worktreePath);
    const when = ts ?? new Date().toISOString();
    if (tree.dirty || tree.head !== pending.subject.candidate) {
      const lastEvidence = ledger.state.evidence[ledger.state.evidence.length - 1];
      ledger.append({
        type: "HUMAN_REQUESTED",
        actor: KERNEL,
        ts: when,
        data: {
          transition: pending.transition,
          subject: {
            candidate: tree.head,
            planDigest: ledger.state.run.planDigest,
            evidenceDigest: lastEvidence?.digest ?? "UNVERIFIED",
          },
          reasons: ["subject changed since the request; review the new state before approving"],
          kind: pending.kind,
        },
      });
      return { approved: false, refreshed: true, subject: ledger.state.pendingHuman.subject };
    }
    const decisionRef = `D-${runId}-${ledger.state.decisions.length + 1}`;
    ledger.append({
      type: "DECISION_RECORDED",
      actor: { kind: "human", id: by },
      ts: when,
      data: {
        decision: "approved",
        transition: pending.transition,
        subject: pending.subject,
        decisionRef,
      },
    });
    recordDecisionFile(repoRoot, ledger.state.run.work, {
      ts: when,
      run: runId,
      decisionRef,
      decision: "approved",
      transition: pending.transition,
      subject: pending.subject,
      by,
    });
    let terminal = false;
    if (pending.kind === "final-decision") {
      ledger.append({
        type: "RUN_TERMINAL",
        actor: KERNEL,
        ts: when,
        data: {
          status: "SUCCEEDED",
          reason: "final decision approved; the external action (merge) stays manual",
        },
      });
      writeRunRecord({ repoRoot, ledger, ts: when });
      terminal = true;
    }
    return {
      approved: true,
      decisionRef,
      terminal,
      transition: pending.transition,
      subject: pending.subject,
      state: ledger.state,
    };
  } finally {
    releaseLock(repoRoot, runId);
  }
}

export function rejectRun(repoRoot, runId, { by = "human", transition, reason, ts } = {}) {
  const ledger = openWaiting(repoRoot, runId);
  const pending = ledger.state.pendingHuman;
  if (transition && transition !== pending.transition) {
    throw new DecisionError(
      `transition mismatch: pending is ${pending.transition}, got ${transition}`,
    );
  }
  acquireLock(repoRoot, runId);
  try {
    const when = ts ?? new Date().toISOString();
    const decisionRef = `D-${runId}-${ledger.state.decisions.length + 1}`;
    ledger.append({
      type: "DECISION_RECORDED",
      actor: { kind: "human", id: by },
      ts: when,
      data: {
        decision: "rejected",
        transition: pending.transition,
        subject: pending.subject,
        decisionRef,
      },
    });
    recordDecisionFile(repoRoot, ledger.state.run.work, {
      ts: when,
      run: runId,
      decisionRef,
      decision: "rejected",
      transition: pending.transition,
      subject: pending.subject,
      by,
      reason: reason ?? null,
    });
    ledger.append({
      type: "RUN_TERMINAL",
      actor: KERNEL,
      ts: when,
      data: { status: "CANCELLED", reason: `rejected by ${by}${reason ? `: ${reason}` : ""}` },
    });
    writeRunRecord({ repoRoot, ledger, ts: when });
    return { rejected: true, decisionRef, state: ledger.state };
  } finally {
    releaseLock(repoRoot, runId);
  }
}

export function listInbox(repoRoot) {
  const runsDir = join(repoRoot, ".buildbeat", "runtime", "runs");
  if (!existsSync(runsDir)) {
    return [];
  }
  const rows = [];
  for (const entry of readdirSync(runsDir)) {
    const ledgerPath = join(runsDir, entry, "events.jsonl");
    if (!existsSync(ledgerPath)) {
      continue;
    }
    const ledger = EventLedger.open(ledgerPath);
    if (ledger.corruption) {
      rows.push({ run: entry, corrupted: ledger.corruption });
      continue;
    }
    const state = ledger.state;
    if (state.run && state.run.status === "WAITING_HUMAN" && state.pendingHuman) {
      rows.push({
        run: state.run.id,
        work: state.run.work,
        transition: state.pendingHuman.transition,
        kind: state.pendingHuman.kind,
        reasons: state.pendingHuman.reasons,
        subject: state.pendingHuman.subject,
      });
    }
  }
  return rows;
}
