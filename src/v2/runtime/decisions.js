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
import { spawnSync } from "node:child_process";
import { adjudicateFinding, fingerprintFinding, recordReviewFindings } from "./findings.js";

import {
  deliveryChecks,
  evaluatePolicies,
  sha256Text,
} from "../policy/policy.js";
import { EventLedger } from "../storage/event-ledger.js";
import {
  acquireLock,
  listChangedPaths,
  readback,
  releaseLock,
} from "../workspace/workspace-manager.js";
import { actorFrom } from "./actor.js";
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
  { by, as, actor, transition, ts, policies, candidate } = {},
) {
  const who = actorFrom({ actor, by, as, repoRoot });
  // Read, check and write under the run lock: a ledger read before the
  // lock may be stale by the time it is written to.
  acquireLock(repoRoot, runId);
  try {
    const ledger = openWaiting(repoRoot, runId);
    const pending = ledger.state.pendingHuman;
    if (ledger.state.run.pass) {
      throw new DecisionError(
        `${runId} reviewed one commit: approve it with buildbeat decide --repo <path> --work ${ledger.state.run.work} --action approve --candidate ${pending.subject.candidate}`,
      );
    }
    const repaired = ledger.events.some((event) => event.type === "DECISION_RECORDED" &&
      event.data.transition === "enter-wait-merge" && (event.data.adopted || event.data.decision === "fix"));
    if ((candidate && candidate !== pending.subject.candidate) ||
        (pending.kind === "final-decision" && repaired && !candidate)) {
      throw new DecisionError("approval stale: read the current decision card and bind approval to its candidate");
    }
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

    return stampApproval({
      repoRoot,
      runId,
      ledger,
      pending,
      who,
      when,
      policies,
      worktreePath,
    });
  } finally {
    releaseLock(repoRoot, runId);
  }
}

// Checks an approval against what the run froze and against the merge
// checks, then records it. Shared by approveRun, which has read the checkout
// back, and approvePass, whose subject is a commit and has no checkout
// (worktreePath null).
function stampApproval({
  repoRoot,
  runId,
  ledger,
  pending,
  who,
  when,
  policies,
  worktreePath,
}) {
  // Both the accepted copy (main checkout) and the candidate's copy must
  // still be the bytes bound at creation: a builder or fixer that edits
  // the work artifact in its worktree must not carry a different scope
  // into a final approval. A reviewed commit was compared with the bound
  // bytes on its own checkout before the run was recorded, and a commit
  // does not change afterwards.
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
    if (committed && worktreePath && digestOf(join(worktreePath, rel)) !== digest) {
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
      ...(worktreePath
        ? { worktreePath, readWorktree: () => readback(worktreePath) }
        : {}),
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
    actor: who,
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
    by: who.id,
    actor: who,
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
    actor: who,
    terminal,
    transition: pending.transition,
    subject: pending.subject,
    warnings,
    state: ledger.state,
  };
}

// The run of a work that reviewed one commit (reviewCommit) and waits for
// the decision on it, or null. A newer review supersedes an older waiting
// one, so there is normally at most one; the most recently created wins.
export function waitingPass(repoRoot, workId) {
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

// Approves the commit a run reviewed. The approval names the commit; what is
// checked is that this is the commit waiting for the decision, that it is
// still in the repository, that the accepted work description still has the
// bytes the run was bound to, and the merge checks: verify passed on this
// commit, no undismissed blocking finding, screenshots when required.
export function approvePass(
  repoRoot,
  workId,
  { candidate, by, as, actor, ts } = {},
) {
  const waiting = waitingPass(repoRoot, workId);
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
  acquireLock(repoRoot, waiting.runId);
  try {
    // Read again under the lock: the run may have been superseded, rejected
    // or approved since the scan.
    const ledger = openWaiting(repoRoot, waiting.runId);
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
    return {
      ...stampApproval({
        repoRoot,
        runId: waiting.runId,
        ledger,
        pending,
        who,
        when: ts ?? new Date().toISOString(),
        policies: [],
        worktreePath: null,
      }),
      runId: waiting.runId,
    };
  } finally {
    releaseLock(repoRoot, waiting.runId);
  }
}

// Declines the commit a run reviewed: the run ends CANCELLED.
export function rejectPass(repoRoot, workId, { by, as, actor, reason, ts } = {}) {
  const waiting = waitingPass(repoRoot, workId);
  if (!waiting) {
    throw new DecisionError(
      `no reviewed commit of ${workId} waits for a decision`,
    );
  }
  return {
    ...rejectRun(repoRoot, waiting.runId, { by, as, actor, reason, ts }),
    runId: waiting.runId,
    candidate: waiting.candidate,
  };
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
  { sha, by, as, actor, resumeAt, ts, allowedPaths } = {},
) {
  const who = actorFrom({ actor, by, as, repoRoot });
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
    if (ledger.state.run.pass) {
      throw new DecisionError(
        `${runId} reviewed one commit and takes no repair; commit the fix and run buildbeat review`,
      );
    }
    const final = pending.kind === "final-decision" && pending.transition === "enter-wait-merge";
    if (pending.kind === "final-decision" && (!final || !ledger.state.run.deliveryChecks)) {
      throw new DecisionError("legacy active run: use its original 3.3.1 runtime (docs/MIGRATION.md)");
    }
    if (final && resumeAt !== "verify") {
      throw new DecisionError("a final-decision repair must resume at verify");
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
    if (final) {
      const candidate = bound.candidate ?? bound.base;
      const ancestor = spawnSync("git", ["-C", worktreePath, "merge-base", "--is-ancestor", candidate, tree.head]);
      if (tree.head === candidate || ancestor.status !== 0) {
        throw new DecisionError("adopt requires a new descendant of the current candidate; history rewrites are refused");
      }
    }
    const scope = ledger.state.run.repair?.allowedPaths ?? allowedPaths;
    if (scope) {
      const violations = listChangedPaths(worktreePath, bound.base).filter((path) =>
        !scope.some((prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)));
      if (violations.length) throw new DecisionError(`out-of-scope changes: ${violations.join(", ")}`);
    }
    const when = ts ?? new Date().toISOString();
    const lastEvidence =
      ledger.state.evidence[ledger.state.evidence.length - 1];
    if (bound.candidate !== tree.head) {
      ledger.append({
        type: "CANDIDATE_PINNED",
        actor: who,
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
      actor: who,
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
      by: who.id,
      actor: who,
      adopted: tree.head,
      resumeAt,
    });
    return {
      adopted: tree.head,
      decisionRef,
      actor: who,
      transition: pending.transition,
      resumeAt,
      state: ledger.state,
    };
  } finally {
    releaseLock(repoRoot, runId);
  }
}

// Queue a human-requested repair without fabricating a review or a budget
// grant. The ordinary resume loop consumes this decision at the fix step.
export function requestFix(repoRoot, runId, { by, as, actor, reason, ts, hasFixer } = {}) {
  const who = actorFrom({ actor, by, as, repoRoot });
  acquireLock(repoRoot, runId);
  try {
    const ledger = openWaiting(repoRoot, runId);
    const pending = ledger.state.pendingHuman;
    if (ledger.state.run.pass)
      throw new DecisionError(`${runId} reviewed one commit and takes no repair; commit the fix and run buildbeat review`);
    if (!ledger.state.run.deliveryChecks)
      throw new DecisionError("legacy active run: use its original 3.3.1 runtime (docs/MIGRATION.md)");
    if (pending.kind !== "final-decision" || pending.transition !== "enter-wait-merge")
      throw new DecisionError("fix is only available at the merge decision");
    if (!(ledger.state.run.repair?.hasFixer ?? hasFixer))
      throw new DecisionError("no fixer configured; commit a manual repair and use run --adopt <sha> --by <name>");
    if (typeof reason !== "string" || !reason.trim())
      throw new DecisionError("fix requires a non-empty reason describing what to repair");
    const bound = ledger.state.workspaces[runId];
    const worktreePath = bound && resolveRepoRef(repoRoot, bound.worktreePath);
    if (!worktreePath || !existsSync(worktreePath))
      throw new DecisionError(`worktree missing for ${runId}`);
    const tree = readback(worktreePath);
    if (tree.dirty || tree.head !== (bound.candidate ?? bound.base) || tree.head !== pending.subject.candidate)
      throw new DecisionError("worktree changed since the request; commit the manual repair and use run --adopt");
    const when = ts ?? new Date().toISOString();
    const decisionRef = `D-${runId}-${ledger.state.decisions.length + 1}`;
    const finding = { severity: "P1", summary: reason.trim() };
    recordReviewFindings(repoRoot, ledger.state.run.work, {
      run: runId, step: "enter-wait-merge", attempt: ledger.state.decisions.length + 1,
      findings: [finding], ts: when,
    });
    adjudicateFinding(repoRoot, ledger.state.run.work, {
      fingerprint: fingerprintFinding(finding), action: "accept", actor: who,
      note: decisionRef, ts: when,
    });
    const data = {
      decision: "fix", transition: pending.transition, subject: pending.subject,
      decisionRef, reason: finding.summary, resumeAt: "fix",
    };
    ledger.append({ type: "DECISION_RECORDED", actor: who, ts: when, data });
    recordDecisionFile(repoRoot, ledger.state.run.work, { ts: when, run: runId, ...data, by: who.id, actor: who });
    return { decisionRef, actor: who, state: ledger.state };
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
  { by, as, actor, note, ts } = {},
) {
  if (!["work", "intent", "plan", "spec"].includes(artifact))
    throw new DecisionError("artifact must be work, intent, plan or spec");
  const filePath = join(repoRoot, "delivery", "work", workId, `${artifact}.md`);
  if (!existsSync(filePath)) {
    throw new DecisionError(`artifact file missing: ${filePath}`);
  }
  const who = actorFrom({ actor, by, as, repoRoot });
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
    // The person's own words or reason, as given with the decision.
    ...(typeof note === "string" && note.trim() !== "" ? { note: note.trim() } : {}),
    by: who.id,
    actor: who,
  });
  return { decisionRef, digest, actor: who };
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
  // Resolve once so every line of one accept names the same decider.
  const actor = actorFrom({ ...options, repoRoot });
  return unique.map((artifact) => ({
    artifact,
    ...acceptArtifact(repoRoot, workId, artifact, { ts: options.ts, actor, note: options.note }),
  }));
}

export function rejectRun(
  repoRoot,
  runId,
  { by, as, actor, transition, reason, ts } = {},
) {
  const who = actorFrom({ actor, by, as, repoRoot });
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
      actor: who,
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
    return { rejected: true, decisionRef, actor: who, state: ledger.state };
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
