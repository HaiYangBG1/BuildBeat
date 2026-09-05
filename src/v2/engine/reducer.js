// Deterministic state reducer per docs/v2/SPEC-0001-events-v1.md §5.
// Same ledger must always reduce to the same state; illegal sequences are
// reported, never repaired. Unknown event types are skipped (seq still
// advances) so newer writers stay readable.

export class IllegalEventError extends Error {
  constructor(message) {
    super(message);
    this.name = "IllegalEventError";
  }
}

export function initialState() {
  return {
    seq: 0,
    run: null,
    position: null,
    currentStep: null,
    steps: {},
    workspaces: {},
    evidence: [],
    policyLog: [],
    fingerprints: [],
    consecutiveSameFailure: 0,
    budgets: {},
    budgetExtensions: {},
    workReviewGrants: 0,
    pendingHuman: null,
    decisions: [],
    approvals: [],
    lastCheckpoint: null,
    interrupted: null,
    terminal: null,
    compacted: null,
  };
}

const RUN_STARTABLE_FROM = ["CREATED", "QUEUED", "WAITING_HUMAN", "BLOCKED"];

export function applyEvent(state, event) {
  if (event.seq !== state.seq + 1) {
    throw new IllegalEventError(`expected seq ${state.seq + 1}, got ${event.seq}`);
  }
  const { type, data } = event;
  if (!state.run && type !== "RUN_CREATED") {
    throw new IllegalEventError(`first event must be RUN_CREATED, got ${type}`);
  }
  if (state.terminal && type !== "RUN_COMPACTED") {
    throw new IllegalEventError(
      `run is terminal (${state.terminal.status}); only RUN_COMPACTED is allowed`,
    );
  }

  const next = structuredClone(state);
  next.seq = event.seq;

  switch (type) {
    case "RUN_CREATED": {
      if (state.run) {
        throw new IllegalEventError("duplicate RUN_CREATED");
      }
      next.run = {
        id: event.run,
        work: event.work,
        status: "CREATED",
        workflowRef: data.workflowRef,
        workflowDigest: data.workflowDigest,
        base: data.base,
        riskPreset: data.riskPreset,
        entry: data.entry ?? null,
        planDigest: data.planDigest ?? "UNVERIFIED",
        intentDigest: data.intentDigest ?? "UNVERIFIED",
      };
      break;
    }
    case "RUN_STARTED": {
      if (!RUN_STARTABLE_FROM.includes(state.run.status)) {
        throw new IllegalEventError(`cannot start run from status ${state.run.status}`);
      }
      if (state.pendingHuman) {
        throw new IllegalEventError("pending human request unresolved");
      }
      next.run.status = "RUNNING";
      break;
    }
    case "WORKSPACE_BOUND": {
      if (state.workspaces[data.workspaceId]) {
        throw new IllegalEventError(`workspace already bound: ${data.workspaceId}`);
      }
      next.workspaces[data.workspaceId] = {
        repo: data.repo,
        branch: data.branch,
        worktreePath: data.worktreePath,
        base: data.base,
        candidate: null,
      };
      break;
    }
    case "STEP_STARTED": {
      if (state.run.status !== "RUNNING") {
        throw new IllegalEventError(`cannot start step while run is ${state.run.status}`);
      }
      if (!state.workspaces[data.workspaceId]) {
        throw new IllegalEventError(`unknown workspace: ${data.workspaceId}`);
      }
      const expectedAttempt = (state.steps[data.step]?.attempts ?? 0) + 1;
      if (data.attempt !== expectedAttempt) {
        throw new IllegalEventError(
          `step ${data.step} expected attempt ${expectedAttempt}, got ${data.attempt}`,
        );
      }
      next.steps[data.step] = {
        status: "RUNNING",
        attempts: data.attempt,
        detail: null,
        infraAttempts: state.steps[data.step]?.infraAttempts ?? 0,
      };
      next.currentStep = data.step;
      break;
    }
    case "STEP_FINISHED": {
      const step = state.steps[data.step];
      if (!step || step.status !== "RUNNING" || step.attempts !== data.attempt) {
        throw new IllegalEventError(
          `no running attempt ${data.attempt} for step ${data.step} to finish`,
        );
      }
      next.steps[data.step].status = data.status === "succeeded" ? "SUCCEEDED" : "FAILED";
      next.steps[data.step].detail = data.status;
      if (data.infra === true) {
        // A worker-infrastructure failure (backend outage, timeout, garbage
        // output, exit 75) is not charged to the step's budget.
        next.steps[data.step].infraAttempts = (step.infraAttempts ?? 0) + 1;
      }
      next.currentStep = null;
      break;
    }
    case "CANDIDATE_PINNED": {
      if (!state.workspaces[data.workspaceId]) {
        throw new IllegalEventError(`unknown workspace: ${data.workspaceId}`);
      }
      next.workspaces[data.workspaceId].base = data.base;
      next.workspaces[data.workspaceId].candidate = data.candidate;
      break;
    }
    case "EVIDENCE_RECORDED": {
      next.evidence.push({
        ref: data.evidenceRef,
        kind: data.kind,
        subject: data.subject,
        digest: data.digest,
        status: data.status,
        grade: data.grade,
        ...(data.findings ? { findings: data.findings } : {}),
        ...(data.suppressedFingerprints
          ? { suppressedFingerprints: data.suppressedFingerprints }
          : {}),
        ...(data.cacheKey ? { cacheKey: data.cacheKey } : {}),
        ...(data.reused ? { reused: data.reused } : {}),
      });
      break;
    }
    case "POLICY_EVALUATED": {
      next.policyLog.push({ policy: data.policy, phase: data.phase, result: data.result });
      break;
    }
    case "TRANSITION": {
      next.position = data.to;
      break;
    }
    case "FAILURE_FINGERPRINT": {
      const key = [data.step, data.command, data.exitCode, data.errorDigest].join("|");
      const last = state.fingerprints[state.fingerprints.length - 1];
      next.consecutiveSameFailure = last === key ? state.consecutiveSameFailure + 1 : 1;
      next.fingerprints.push(key);
      break;
    }
    case "BUDGET_CONSUMED": {
      const consumed = state.budgets[data.kind]?.consumed ?? 0;
      next.budgets[data.kind] = { consumed: consumed + data.amount, remaining: data.remaining };
      break;
    }
    case "BUDGET_EXTENDED": {
      // A human approving resume-<step> after its budget ran out grants
      // exactly one more attempt; the grant is a ledger fact, not a config
      // edit, so the effective cap is replayable.
      if (data.scope === "work") {
        // Work-level review cap (budgets.reviewRoundsPerWork) lifted once by
        // a human for this run.
        next.workReviewGrants = (state.workReviewGrants ?? 0) + data.amount;
      } else {
        next.budgetExtensions[data.step] = (state.budgetExtensions?.[data.step] ?? 0) + data.amount;
      }
      break;
    }
    case "HUMAN_REQUESTED": {
      next.pendingHuman = {
        transition: data.transition,
        subject: data.subject,
        reasons: data.reasons,
        kind: data.kind ?? "boundary",
      };
      next.run.status = "WAITING_HUMAN";
      break;
    }
    case "DECISION_RECORDED": {
      if (!state.pendingHuman || state.pendingHuman.transition !== data.transition) {
        throw new IllegalEventError(`no pending human request for transition ${data.transition}`);
      }
      next.decisions.push({
        decision: data.decision,
        transition: data.transition,
        subject: data.subject,
        decisionRef: data.decisionRef,
      });
      if (data.decision === "approved") {
        next.approvals.push({
          decisionRef: data.decisionRef,
          transition: data.transition,
          subject: data.subject,
          stale: false,
        });
      }
      next.pendingHuman = null;
      break;
    }
    case "APPROVAL_STALE": {
      const index = state.approvals.findIndex(
        (approval) => approval.decisionRef === data.approvalRef && !approval.stale,
      );
      if (index === -1) {
        throw new IllegalEventError(`no active approval to mark stale: ${data.approvalRef}`);
      }
      next.approvals[index].stale = true;
      next.approvals[index].changed = data.changed;
      next.pendingHuman = {
        transition: state.approvals[index].transition,
        subject: state.approvals[index].subject,
        reasons: ["APPROVAL_STALE"],
        kind: "stale",
      };
      next.run.status = "WAITING_HUMAN";
      break;
    }
    case "CHECKPOINT": {
      next.lastCheckpoint = {
        seq: event.seq,
        resumePoint: data.resumePoint,
        workspaceStates: data.workspaceStates,
      };
      break;
    }
    case "RUN_INTERRUPTED": {
      next.interrupted = { seq: event.seq, cause: data.cause };
      break;
    }
    case "RUN_TERMINAL": {
      next.terminal = { status: data.status, reason: data.reason };
      next.run.status = data.status;
      break;
    }
    case "RUN_COMPACTED": {
      if (!state.terminal) {
        throw new IllegalEventError("RUN_COMPACTED requires a terminal run");
      }
      next.compacted = { runRecordRef: data.runRecordRef, runRecordDigest: data.runRecordDigest };
      break;
    }
    default:
      // Unknown type written by a newer version: preserved in the ledger,
      // skipped here (seq already advanced above).
      break;
  }
  return next;
}

export function reduceEvents(events) {
  let state = initialState();
  for (const event of events) {
    state = applyEvent(state, event);
  }
  return state;
}
