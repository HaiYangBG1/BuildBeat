// Human decision runtime: approve / reject a pending request, and the inbox.
// An approval is recorded only after re-reading the workspace and confirming
// the subject is still exactly what the request showed — if the candidate
// moved or the tree is dirty, the request is refreshed instead of stamped
// (lessons.md「读过期 race」: no rubber-stamping a moved target). Every decision lands both
// as a DECISION_RECORDED event and as a line in the Git plane
// (delivery/work/<work>/decisions.jsonl).

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";

import {
  deliveryChecks,
  evaluatePolicies,
  sha256Text,
} from "../policy/policy.js";
import { EventLedger } from "../storage/event-ledger.js";
import {
  acquireLock,
  readback,
  releaseLock,
} from "../workspace/workspace-manager.js";
import { writeRunRecord } from "./run-record.js";
import { resolveRepoRef } from "./repo-ref.js";

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

// Work artifacts whose digests a run froze at creation: the plan or work.md
// it was started on and, for the legacy controlled safeguards, intent.md.
// `committed` marks the ones start verified in the base checkout, so the
// candidate must still carry them unchanged.
export function boundArtifacts(run, planDigest = run.planDigest) {
  const checks = run.deliveryChecks;
  if (!checks) return [];
  const bound = [];
  if (checks.requireAcceptance || planDigest !== "UNVERIFIED") {
    bound.push({
      artifact: checks.artifact,
      digest: planDigest,
      committed: checks.requireAcceptance,
    });
  }
  if (checks.requireIntent && checks.artifact !== "work") {
    bound.push({
      artifact: "intent",
      digest: run.intentDigest ?? "UNVERIFIED",
      committed: true,
    });
  }
  return bound;
}

function digestOf(file) {
  return existsSync(file) ? sha256Text(readFileSync(file, "utf8")) : null;
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

export function approveRun(
  repoRoot,
  runId,
  { by = "human", transition, ts, policies } = {},
) {
  // Read, check and write under the run lock: a ledger read before the
  // lock may be stale by the time it is written to.
  acquireLock(repoRoot, runId);
  try {
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
    const bound = ledger.state.workspaces[runId];
    const worktreePath = bound
      ? resolveRepoRef(repoRoot, bound.worktreePath)
      : null;
    if (!bound || !existsSync(worktreePath)) {
      throw new DecisionError(
        `worktree missing for ${runId}; cannot verify the approval subject`,
      );
    }
    const tree = readback(worktreePath);
    const when = ts ?? new Date().toISOString();
    if (tree.dirty || tree.head !== pending.subject.candidate) {
      const lastEvidence =
        ledger.state.evidence[ledger.state.evidence.length - 1];
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
          reasons: [
            "subject changed since the request; review the new state before approving",
          ],
          kind: pending.kind,
        },
      });
      return {
        approved: false,
        refreshed: true,
        subject: ledger.state.pendingHuman.subject,
      };
    }

    // Both the accepted copy (main checkout) and the candidate's copy must
    // still be the bytes bound at creation: a builder or fixer that edits
    // the work artifact in its worktree must not carry a different scope
    // into a final approval.
    const frozenChecks = ledger.state.run.deliveryChecks;
    for (const { artifact, digest, committed } of boundArtifacts(
      ledger.state.run,
      pending.subject.planDigest,
    )) {
      const rel = join(
        "delivery",
        "work",
        ledger.state.run.work,
        `${artifact}.md`,
      );
      if (digestOf(join(repoRoot, rel)) !== digest) {
        throw new DecisionError(
          `work artifact changed since the run was created (${artifact}.md); accept the new scope and start a new attempt`,
        );
      }
      if (committed && digestOf(join(worktreePath, rel)) !== digest) {
        throw new DecisionError(
          `the candidate changed the bound ${artifact}.md; restore the accepted version in the candidate, or accept the new scope and start a new attempt`,
        );
      }
    }

    // Transition policies are enforced at the moment of stamping: an
    // approval that a LOCAL_ENFORCED policy forbids is refused, not logged.
    const policyRows = evaluatePolicies(
      frozenChecks ? deliveryChecks(frozenChecks) : (policies ?? []),
      { type: "transition", appliesTo: pending.transition },
      {
        repoRoot,
        state: ledger.state,
        candidate: pending.subject.candidate,
        workDir: join(repoRoot, "delivery", "work", ledger.state.run.work),
        worktreePath,
        readWorktree: () => readback(worktreePath),
      },
    );
    for (const row of policyRows) {
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
    const refused = policyRows.filter(
      (row) => row.enforcement !== "ADVISORY" && row.result !== "PASS",
    );
    if (refused.length > 0) {
      throw new DecisionError(
        `approval refused by policy: ${refused
          .map((row) => `${row.policy} (${row.reason})`)
          .join("; ")}`,
      );
    }
    const warnings = policyRows
      .filter((row) => row.enforcement === "ADVISORY" && row.result !== "PASS")
      .map((row) => `${row.policy}: ${row.reason}`);

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
          reason:
            "final decision approved; the external action (merge) stays manual",
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
      warnings,
      state: ledger.state,
    };
  } finally {
    releaseLock(repoRoot, runId);
  }
}

// A human (or the driving session) supplies the candidate: the fix was made
// by hand in the run's worktree and committed, so the fixer step has nothing
// to do. The pending request is answered with the adopted commit as its
// subject and the run resumes at `resumeAt` (verify, by convention). Real
// incident: hand fixes inside a run cost a no-op fixer and an extra verify
// each time (a frontend run reached verify #5 and fix #3 for three hand
// fixes). The commit must already be the worktree HEAD: git is read back,
// the claim is not trusted.
export function adoptCandidate(
  repoRoot,
  runId,
  { sha, by = "human", resumeAt, ts } = {},
) {
  acquireLock(repoRoot, runId);
  try {
    if (!sha || typeof sha !== "string" || sha.length < 7) {
      throw new DecisionError(
        "adopt requires a commit sha (at least 7 characters)",
      );
    }
    if (!resumeAt) {
      throw new DecisionError(
        "adopt requires the step to resume at (resumeAt)",
      );
    }
    const ledger = openWaiting(repoRoot, runId);
    const pending = ledger.state.pendingHuman;
    if (pending.kind === "final-decision") {
      throw new DecisionError(
        "adopt is for a run waiting before fix/verify, not at the merge decision",
      );
    }
    const bound = ledger.state.workspaces[runId];
    const worktreePath = bound
      ? resolveRepoRef(repoRoot, bound.worktreePath)
      : null;
    if (!bound || !existsSync(worktreePath)) {
      throw new DecisionError(
        `worktree missing for ${runId}; cannot adopt a candidate`,
      );
    }
    const tree = readback(worktreePath);
    if (tree.dirty) {
      throw new DecisionError(
        "worktree is dirty; commit the hand fix before adopting it",
      );
    }
    if (!tree.head.startsWith(sha)) {
      throw new DecisionError(
        `worktree HEAD is ${tree.head}, not ${sha}; adopt what git reads back`,
      );
    }
    const when = ts ?? new Date().toISOString();
    const lastEvidence =
      ledger.state.evidence[ledger.state.evidence.length - 1];
    if (bound.candidate !== tree.head) {
      ledger.append({
        type: "CANDIDATE_PINNED",
        actor: { kind: "human", id: by },
        ts: when,
        data: {
          workspaceId: runId,
          base: bound.base,
          candidate: tree.head,
          adopted: true,
        },
      });
    }
    const subject = {
      candidate: tree.head,
      planDigest: ledger.state.run.planDigest,
      evidenceDigest: lastEvidence?.digest ?? "UNVERIFIED",
    };
    const decisionRef = `D-${runId}-${ledger.state.decisions.length + 1}`;
    ledger.append({
      type: "DECISION_RECORDED",
      actor: { kind: "human", id: by },
      ts: when,
      data: {
        decision: "approved",
        transition: pending.transition,
        subject,
        decisionRef,
        adopted: tree.head,
        resumeAt,
      },
    });
    recordDecisionFile(repoRoot, ledger.state.run.work, {
      ts: when,
      run: runId,
      decisionRef,
      decision: "approved",
      transition: pending.transition,
      subject,
      by,
      adopted: tree.head,
      resumeAt,
    });
    return {
      adopted: tree.head,
      decisionRef,
      transition: pending.transition,
      resumeAt,
      state: ledger.state,
    };
  } finally {
    releaseLock(repoRoot, runId);
  }
}

// Accepts a work artifact (plan, intent, spec) by binding a decision to the
// file's current digest in the Git plane. If the file changes afterwards,
// artifact.accepted evaluates false again — acceptance cannot go stale
// silently (closes MVP DoD #1 with staleness included).
export function acceptArtifact(
  repoRoot,
  workId,
  artifact,
  { by = "human", ts } = {},
) {
  if (!["work", "intent", "plan", "spec"].includes(artifact))
    throw new DecisionError("artifact must be work, intent, plan or spec");
  const filePath = join(repoRoot, "delivery", "work", workId, `${artifact}.md`);
  if (!existsSync(filePath)) {
    throw new DecisionError(`artifact file missing: ${filePath}`);
  }
  const digest = sha256Text(readFileSync(filePath, "utf8"));
  const decisionsPath = join(
    repoRoot,
    "delivery",
    "work",
    workId,
    "decisions.jsonl",
  );
  const count = existsSync(decisionsPath)
    ? readFileSync(decisionsPath, "utf8").split("\n").filter(Boolean).length
    : 0;
  const when = ts ?? new Date().toISOString();
  const decisionRef = `A-${workId}-${count + 1}`;
  recordDecisionFile(repoRoot, workId, {
    ts: when,
    decisionRef,
    decision: "approved",
    transition: `accept-${artifact}`,
    subject: { artifact, digest },
    by,
  });
  return { decisionRef, digest };
}

// One human "accept" for several artifacts: every file must exist before any
// acceptance is written, and each artifact keeps its own digest-bound line.
export function acceptArtifacts(repoRoot, workId, artifacts, options = {}) {
  const unique = [...new Set(artifacts)];
  if (unique.some((name) => !["work", "intent", "plan", "spec"].includes(name)))
    throw new DecisionError("artifact must be work, intent, plan or spec");
  if (unique.length === 0) {
    throw new DecisionError("no artifact to accept");
  }
  const missing = unique
    .map((artifact) =>
      join(repoRoot, "delivery", "work", workId, `${artifact}.md`),
    )
    .filter((filePath) => !existsSync(filePath));
  if (missing.length > 0) {
    throw new DecisionError(`artifact file missing: ${missing.join(", ")}`);
  }
  return unique.map((artifact) => ({
    artifact,
    ...acceptArtifact(repoRoot, workId, artifact, options),
  }));
}

export function rejectRun(
  repoRoot,
  runId,
  { by = "human", transition, reason, ts } = {},
) {
  acquireLock(repoRoot, runId);
  try {
    const ledger = openWaiting(repoRoot, runId);
    const pending = ledger.state.pendingHuman;
    if (transition && transition !== pending.transition) {
      throw new DecisionError(
        `transition mismatch: pending is ${pending.transition}, got ${transition}`,
      );
    }
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
      data: {
        status: "CANCELLED",
        reason: `rejected by ${by}${reason ? `: ${reason}` : ""}`,
      },
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
