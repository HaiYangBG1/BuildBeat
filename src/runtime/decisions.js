// Decisions a person (or a session relaying one) records: accepting a work
// description, and approving or rejecting the commit a review left waiting.
// An approval names its commit and is checked against what the run froze and
// against the merge checks at the moment it is recorded. Every decision
// lands both as a DECISION_RECORDED event and as a line in the Git plane
// (delivery/work/<work>/decisions.jsonl).

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

import { mergeChecks, sha256Text } from "../policy/policy.js";
import { EventLedger } from "../storage/event-ledger.js";
import { acquireLock, releaseLock } from "../workspace/workspace-manager.js";
import { actorFrom } from "./actor.js";
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
    throw new DecisionError(
      `run ${runId} is already terminal (${ledger.state.terminal.status})`,
    );
  }
  if (!ledger.state.pendingHuman) {
    throw new DecisionError(`run ${runId} has no pending human request`);
  }
  return ledger;
}

function recordDecisionFile(repoRoot, work, line) {
  const dir = join(repoRoot, "delivery", "work", work);
  mkdirSync(dir, { recursive: true });
  appendFileSync(
    join(dir, "decisions.jsonl"),
    `${JSON.stringify(line)}\n`,
    "utf8",
  );
}

// The run of a work that reviewed a commit and waits for the decision on it,
// or null. A newer review supersedes an older waiting one, so there is
// normally at most one; the most recently created wins. Runs an older
// version left waiting (no `pass`) are not ours to decide.
export function waitingReview(repoRoot, workId) {
  const dir = join(repoRoot, ".buildbeat", "runtime", "runs");
  if (!existsSync(dir)) {
    return null;
  }
  let found = null;
  for (const entry of readdirSync(dir)) {
    const path = ledgerPathFor(repoRoot, entry);
    if (!existsSync(path)) {
      continue;
    }
    const ledger = EventLedger.open(path);
    const state = ledger.state;
    if (
      ledger.corruption ||
      !state.run?.pass ||
      state.run.work !== workId ||
      state.terminal ||
      state.pendingHuman?.kind !== "final-decision"
    ) {
      continue;
    }
    const createdAt = ledger.events[0]?.ts ?? "";
    if (!found || createdAt > found.createdAt) {
      found = {
        runId: entry,
        candidate: state.pendingHuman.subject.candidate,
        createdAt,
      };
    }
  }
  return found;
}

// Approves the commit a review left waiting. The approval names the commit;
// what is checked is that this is the commit waiting for the decision, that
// it is still in the repository, that the accepted work description still
// has the bytes the run was bound to, and the merge checks: verify passed on
// this commit, no undismissed blocking finding, screenshots when required.
// The commit's own copy of work.md was compared with the accepted one on its
// checkout before the run was recorded, and a commit does not change.
export function approveReview(
  repoRoot,
  workId,
  { candidate, by, as, actor, ts } = {},
) {
  const waiting = waitingReview(repoRoot, workId);
  if (!waiting) {
    throw new DecisionError(
      `no reviewed commit of ${workId} waits for a decision; review one with buildbeat review --repo <path> --work ${workId}`,
    );
  }
  if (typeof candidate !== "string" || !/^[0-9a-f]{40,64}$/.test(candidate)) {
    throw new DecisionError(
      `an approval names the full commit it approves: --candidate ${waiting.candidate}`,
    );
  }
  const stale = (current) =>
    new DecisionError(
      `approval stale: the commit waiting for a decision is ${current}, not ${candidate}`,
    );
  if (candidate !== waiting.candidate) {
    throw stale(waiting.candidate);
  }
  const who = actorFrom({ actor, by, as, repoRoot });
  const runId = waiting.runId;
  acquireLock(repoRoot, runId);
  try {
    // Read again under the lock: the run may have been superseded, rejected
    // or approved since the scan.
    const ledger = openWaiting(repoRoot, runId);
    const pending = ledger.state.pendingHuman;
    if (pending.kind !== "final-decision" || pending.subject.candidate !== candidate) {
      throw stale(pending.subject.candidate);
    }
    const present = spawnSync(
      "git",
      ["-C", repoRoot, "cat-file", "-e", `${candidate}^{commit}`],
      { stdio: "ignore" },
    );
    if (present.status !== 0) {
      throw new DecisionError(
        `commit ${candidate} is not in this repository; review a commit that is`,
      );
    }
    const workDir = join(repoRoot, "delivery", "work", workId);
    const description = join(workDir, "work.md");
    if (
      ledger.state.run.deliveryChecks?.requireAcceptance &&
      (!existsSync(description) ||
        sha256Text(readFileSync(description, "utf8")) !== pending.subject.planDigest)
    ) {
      throw new DecisionError(
        "work.md changed since the commit was reviewed; accept the new scope and review again",
      );
    }
    const when = ts ?? new Date().toISOString();
    // The merge checks are enforced at the moment of stamping: an approval
    // they forbid is refused, not logged.
    const rows = mergeChecks(ledger.state.run.deliveryChecks ?? {}, {
      repoRoot,
      state: ledger.state,
      candidate,
      workDir,
    });
    for (const row of rows) {
      ledger.append({
        type: "POLICY_EVALUATED",
        actor: KERNEL,
        ts: when,
        data: {
          policy: row.policy,
          phase: "transition",
          result: row.result,
          enforcement: row.enforcement,
          reason: row.reason,
        },
      });
    }
    const refused = rows.filter((row) => row.result !== "PASS");
    if (refused.length > 0) {
      throw new DecisionError(
        `approval refused by policy: ${refused
          .map((row) => `${row.policy} (${row.reason})`)
          .join("; ")}`,
      );
    }
    const decisionRef = `D-${runId}-${ledger.state.decisions.length + 1}`;
    ledger.append({
      type: "DECISION_RECORDED",
      actor: who,
      ts: when,
      data: {
        decision: "approved",
        transition: pending.transition,
        subject: pending.subject,
        decisionRef,
      },
    });
    recordDecisionFile(repoRoot, workId, {
      ts: when,
      run: runId,
      decisionRef,
      decision: "approved",
      transition: pending.transition,
      subject: pending.subject,
      by: who.id,
      actor: who,
    });
    ledger.append({
      type: "RUN_TERMINAL",
      actor: KERNEL,
      ts: when,
      data: {
        status: "SUCCEEDED",
        reason:
          "final decision approved; the external action (merge) stays manual",
      },
    });
    writeRunRecord({ repoRoot, ledger, ts: when });
    return {
      runId,
      decisionRef,
      actor: who,
      transition: pending.transition,
      subject: pending.subject,
      state: ledger.state,
    };
  } finally {
    releaseLock(repoRoot, runId);
  }
}

// Declines the commit a review left waiting: the run ends CANCELLED.
export function rejectReview(repoRoot, workId, { by, as, actor, reason, ts } = {}) {
  const waiting = waitingReview(repoRoot, workId);
  if (!waiting) {
    throw new DecisionError(
      `no reviewed commit of ${workId} waits for a decision`,
    );
  }
  const who = actorFrom({ actor, by, as, repoRoot });
  const runId = waiting.runId;
  acquireLock(repoRoot, runId);
  try {
    const ledger = openWaiting(repoRoot, runId);
    const pending = ledger.state.pendingHuman;
    const when = ts ?? new Date().toISOString();
    const decisionRef = `D-${runId}-${ledger.state.decisions.length + 1}`;
    ledger.append({
      type: "DECISION_RECORDED",
      actor: who,
      ts: when,
      data: {
        decision: "rejected",
        transition: pending.transition,
        subject: pending.subject,
        decisionRef,
      },
    });
    recordDecisionFile(repoRoot, workId, {
      ts: when,
      run: runId,
      decisionRef,
      decision: "rejected",
      transition: pending.transition,
      subject: pending.subject,
      by: who.id,
      actor: who,
      reason: reason ?? null,
    });
    ledger.append({
      type: "RUN_TERMINAL",
      actor: KERNEL,
      ts: when,
      data: {
        status: "CANCELLED",
        reason: `rejected by ${who.id}${reason ? `: ${reason}` : ""}`,
      },
    });
    writeRunRecord({ repoRoot, ledger, ts: when });
    return {
      runId,
      candidate: pending.subject.candidate,
      decisionRef,
      actor: who,
      state: ledger.state,
    };
  } finally {
    releaseLock(repoRoot, runId);
  }
}

// Accepts a work's description as it is on disk: the acceptance is bound to
// those bytes, and editing work.md afterwards makes it stale.
export function acceptWork(repoRoot, workId, { by, as, actor, note, ts } = {}) {
  const workDir = join(repoRoot, "delivery", "work", workId);
  const filePath = join(workDir, "work.md");
  if (!existsSync(filePath)) {
    throw new DecisionError(`artifact file missing: ${filePath}`);
  }
  const who = actorFrom({ actor, by, as, repoRoot });
  const digest = sha256Text(readFileSync(filePath, "utf8"));
  const decisionsPath = join(workDir, "decisions.jsonl");
  const count = existsSync(decisionsPath)
    ? readFileSync(decisionsPath, "utf8").split("\n").filter(Boolean).length
    : 0;
  const decisionRef = `A-${workId}-${count + 1}`;
  recordDecisionFile(repoRoot, workId, {
    ts: ts ?? new Date().toISOString(),
    decisionRef,
    decision: "approved",
    transition: "accept-work",
    subject: { artifact: "work", digest },
    // The person's own words or reason, as given with the decision.
    ...(typeof note === "string" && note.trim() !== "" ? { note: note.trim() } : {}),
    by: who.id,
    actor: who,
  });
  return { decisionRef, digest, actor: who };
}

// Every run that waits for a person, as status lists them.
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
    if (
      state.run &&
      state.run.status === "WAITING_HUMAN" &&
      state.pendingHuman
    ) {
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
