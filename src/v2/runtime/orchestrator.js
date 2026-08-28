// M1 orchestrator: one project, one repository, one foreground run. Drives
// workflow steps through adapters, records everything in the event ledger,
// and stops honestly wherever automation ends — a terminal step, a human
// boundary (stopAt), a missing adapter, an exhausted budget, or a repeated
// failure fingerprint. resumeRun recovers a crashed run from the ledger
// alone: an in-flight step is closed as crashed (the dead process cannot be
// trusted to have finished it), never silently continued. Loop policy
// hardening (budgets as Policy, review loops, approvals) lands in M2;
// nothing here may bypass the ledger.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { nextStep } from "../engine/workflow.js";
import { collectCommandEvidence } from "../evidence/collector.js";
import { EventLedger } from "../storage/event-ledger.js";
import {
  acquireLock,
  createWorkspace,
  readback,
  releaseLock,
} from "../workspace/workspace-manager.js";
import { writeRunRecord } from "./run-record.js";

const KERNEL = { kind: "kernel", id: "orchestrator" };

export class OrchestratorError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrchestratorError";
  }
}

function sha256(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function makeContext(options, ledger, workspace) {
  const {
    repoRoot,
    workflow,
    stopAt = [],
    adapters = {},
    maxAttemptsPerStep = 4,
    stepTimeoutMs,
    now = () => new Date().toISOString(),
  } = options;
  const runtimeDir = join(repoRoot, ".buildbeat", "runtime");
  const context = {
    repoRoot,
    workflow,
    stopAt,
    adapters,
    maxAttemptsPerStep,
    stepTimeoutMs,
    now,
    runtimeDir,
    ledger,
    workspace,
  };
  context.subjectNow = () => {
    const candidate = ledger.state.workspaces[workspace.workspaceId]?.candidate ?? workspace.base;
    const lastEvidence = ledger.state.evidence[ledger.state.evidence.length - 1];
    return {
      candidate,
      planDigest: "UNVERIFIED",
      evidenceDigest: lastEvidence?.digest ?? "UNVERIFIED",
    };
  };
  context.waitHuman = (transition, reasons) => {
    ledger.append({
      type: "HUMAN_REQUESTED",
      actor: KERNEL,
      ts: context.now(),
      data: { transition, subject: context.subjectNow(), reasons },
    });
  };
  return context;
}

// Records fingerprint/policy/transition bookkeeping for a finished step and
// returns the next step id, or null when the run stopped (human or terminal).
function settleOutcome(context, step, outcome, tree, exec) {
  const { ledger, workflow, workspace, now } = context;
  if (outcome === "failed") {
    ledger.append({
      type: "FAILURE_FINGERPRINT",
      actor: KERNEL,
      ts: now(),
      data: {
        step,
        command: exec.command,
        exitCode: exec.exitCode ?? -1,
        errorDigest: sha256(`${exec.stderr}\n${exec.stdout}\n${exec.exitCode}`),
        diffDigest: sha256(tree.head),
      },
    });
    if (ledger.state.consecutiveSameFailure >= 2) {
      context.waitHuman(`resume-${step}`, [
        `same failure fingerprint twice in a row at ${step}; automation stops`,
      ]);
      return null;
    }
  }
  const to = nextStep(workflow, step, outcome);
  ledger.append({
    type: "POLICY_EVALUATED",
    actor: KERNEL,
    ts: now(),
    data: {
      policy: "workflow.edge",
      phase: "transition",
      result: to ? (outcome === "failed" ? "RETRY" : "PASS") : "BLOCK",
      enforcement: "LOCAL_ENFORCED",
      reason: to ? `(${step}, ${outcome}) -> ${to}` : `no transition for (${step}, ${outcome})`,
    },
  });
  if (!to) {
    ledger.append({
      type: "RUN_TERMINAL",
      actor: KERNEL,
      ts: now(),
      data: { status: "FAILED", reason: `no transition for (${step}, ${outcome})` },
    });
    writeRunRecord({ repoRoot: context.repoRoot, ledger, ts: now() });
    return null;
  }
  ledger.append({
    type: "TRANSITION",
    actor: KERNEL,
    ts: now(),
    data: { from: step, to, cause: `outcome:${outcome}` },
  });
  ledger.append({
    type: "CHECKPOINT",
    actor: KERNEL,
    ts: now(),
    data: {
      resumePoint: { step: to, attempt: (ledger.state.steps[to]?.attempts ?? 0) + 1 },
      workspaceStates: [{ workspaceId: workspace.workspaceId, head: tree.head, dirty: tree.dirty }],
    },
  });
  return to;
}

function drive(context, startStep) {
  const { ledger, workflow, workspace, adapters, now } = context;
  let step = startStep;
  while (step) {
    if (workflow.terminal.has(step)) {
      context.waitHuman(`enter-${step}`, ["terminal step requires a human decision"]);
      return;
    }
    if (context.stopAt.includes(step)) {
      context.waitHuman(`enter-${step}`, [`automation boundary: stopAt includes ${step}`]);
      return;
    }
    const stepDef = workflow.steps.find((candidate) => candidate.id === step);
    const adapter = stepDef.worker ? adapters[stepDef.worker] : null;
    if (!adapter) {
      context.waitHuman(`enter-${step}`, [
        `no adapter configured for worker ${stepDef.worker ?? "(none)"}; attended handoff`,
      ]);
      return;
    }

    const attempt = (ledger.state.steps[step]?.attempts ?? 0) + 1;
    if (attempt > context.maxAttemptsPerStep) {
      context.waitHuman(`resume-${step}`, [
        `budget exhausted: ${step} would exceed maxAttempts=${context.maxAttemptsPerStep}`,
      ]);
      return;
    }

    ledger.append({
      type: "STEP_STARTED",
      actor: KERNEL,
      ts: now(),
      data: {
        step,
        attempt,
        worker: stepDef.worker,
        adapter: adapter.name,
        workspaceId: workspace.workspaceId,
      },
    });
    const exec = adapter.execute({
      step,
      worker: stepDef.worker,
      workspacePath: workspace.worktreePath,
      input: { workId: ledger.state.run.work, runId: ledger.state.run.id, step, attempt },
      timeoutMs: context.stepTimeoutMs,
    });
    const tree = readback(workspace.worktreePath);
    const evidence = collectCommandEvidence({
      runtimeDir: context.runtimeDir,
      runId: ledger.state.run.id,
      step,
      attempt,
      execResult: exec,
      subject: tree.head,
    });
    ledger.append({
      type: "EVIDENCE_RECORDED",
      actor: KERNEL,
      ts: now(),
      data: {
        evidenceRef: evidence.location,
        kind: evidence.kind,
        subject: evidence.subject,
        digest: evidence.digest,
        status: evidence.status,
        grade: evidence.grade,
      },
    });

    let stepStatus;
    if (exec.spawnError) {
      stepStatus = "crashed";
    } else if (exec.timedOut) {
      stepStatus = "timeout";
    } else if (exec.signal) {
      stepStatus = "crashed";
    } else {
      stepStatus = exec.exitCode === 0 ? "succeeded" : "failed";
    }
    ledger.append({
      type: "STEP_FINISHED",
      actor: KERNEL,
      ts: now(),
      data: { step, attempt, status: stepStatus, exitCode: exec.exitCode },
    });
    ledger.append({
      type: "BUDGET_CONSUMED",
      actor: KERNEL,
      ts: now(),
      data: { kind: "attempts", amount: 1, remaining: context.maxAttemptsPerStep - attempt },
    });

    if (stepStatus === "succeeded") {
      if (tree.dirty) {
        context.waitHuman(`resume-${step}`, [
          `step ${step} left a dirty worktree; a candidate must be a committed state`,
        ]);
        return;
      }
      const pinned = ledger.state.workspaces[workspace.workspaceId]?.candidate;
      if (tree.head !== (pinned ?? workspace.base)) {
        ledger.append({
          type: "CANDIDATE_PINNED",
          actor: KERNEL,
          ts: now(),
          data: {
            workspaceId: workspace.workspaceId,
            base: workspace.base,
            candidate: tree.head,
          },
        });
      }
    }

    const outcome = stepStatus === "succeeded" ? "succeeded" : "failed";
    step = settleOutcome(context, step, outcome, tree, exec);
  }
}

function openLedgerFor(repoRoot, runId) {
  const ledgerPath = join(repoRoot, ".buildbeat", "runtime", "runs", runId, "events.jsonl");
  const ledger = EventLedger.open(ledgerPath);
  if (ledger.corruption) {
    throw new OrchestratorError(
      `ledger for ${runId} is corrupted after seq=${ledger.corruption.afterSeq}; human decision required`,
    );
  }
  return { ledger, ledgerPath };
}

export function startRun(options) {
  const {
    repoRoot,
    workflow,
    workflowDigest,
    workId,
    runId,
    base = "HEAD",
    entry = workflow.entry,
    riskPreset = "standard",
  } = options;
  if (!repoRoot || !workId || !runId) {
    throw new OrchestratorError("repoRoot, workId and runId are required");
  }
  if (!workflow.stepIds.has(entry)) {
    throw new OrchestratorError(`entry step not in workflow: ${entry}`);
  }
  if (!workflowDigest) {
    throw new OrchestratorError("workflowDigest is required (pin what you run)");
  }
  const { ledger, ledgerPath } = openLedgerFor(repoRoot, runId);
  if (ledger.events.length > 0) {
    throw new OrchestratorError(`run ${runId} already has a ledger; use resumeRun`);
  }

  acquireLock(repoRoot, runId);
  try {
    const workspace = createWorkspace({ repoRoot, runId, base });
    const context = makeContext(options, ledger, workspace);
    const now = context.now;
    ledger.append({
      type: "RUN_CREATED",
      actor: KERNEL,
      ts: now(),
      run: runId,
      work: workId,
      data: {
        workflowRef: workflow.name,
        workflowDigest,
        base: workspace.base,
        riskPreset,
        entry,
      },
    });
    ledger.append({ type: "RUN_STARTED", actor: KERNEL, ts: now(), data: {} });
    ledger.append({
      type: "WORKSPACE_BOUND",
      actor: KERNEL,
      ts: now(),
      data: {
        workspaceId: workspace.workspaceId,
        repo: repoRoot,
        branch: workspace.branch,
        worktreePath: workspace.worktreePath,
        base: workspace.base,
      },
    });
    drive(context, entry);
    return { runId, workId, ledgerPath, state: ledger.state, workspace };
  } finally {
    releaseLock(repoRoot, runId);
  }
}

export function resumeRun(options) {
  const { repoRoot, workflow, workflowDigest, runId } = options;
  if (!repoRoot || !runId) {
    throw new OrchestratorError("repoRoot and runId are required");
  }
  const { ledger, ledgerPath } = openLedgerFor(repoRoot, runId);
  const state = ledger.state;
  if (!state.run) {
    throw new OrchestratorError(`no ledger for run ${runId}; use startRun`);
  }
  if (workflowDigest && state.run.workflowDigest !== workflowDigest) {
    throw new OrchestratorError(
      `workflow changed since the run was created (${state.run.workflowDigest} != ${workflowDigest}); refusing to resume`,
    );
  }
  if (state.terminal) {
    return { runId, ledgerPath, state, resumed: false, reason: "run is terminal" };
  }
  if (state.run.status === "WAITING_HUMAN") {
    return { runId, ledgerPath, state, resumed: false, reason: "waiting on a human decision" };
  }

  const bound = state.workspaces[runId];
  if (!bound) {
    throw new OrchestratorError(`run ${runId} has no bound workspace; cannot resume`);
  }
  if (!existsSync(bound.worktreePath)) {
    throw new OrchestratorError(
      `worktree missing: ${bound.worktreePath}; recovery requires a human decision`,
    );
  }
  const workspace = {
    workspaceId: runId,
    repoRoot,
    worktreePath: bound.worktreePath,
    branch: bound.branch,
    base: bound.base,
  };

  acquireLock(repoRoot, runId);
  try {
    const context = makeContext(options, ledger, workspace);
    const now = context.now;
    ledger.append({ type: "RUN_INTERRUPTED", actor: KERNEL, ts: now(), data: { cause: "resume after process loss" } });

    const tree = readback(workspace.worktreePath);
    let startStep = null;
    if (state.currentStep) {
      const step = state.currentStep;
      const attempt = state.steps[step].attempts;
      ledger.append({
        type: "STEP_FINISHED",
        actor: KERNEL,
        ts: now(),
        data: { step, attempt, status: "crashed" },
      });
      if (tree.dirty) {
        context.waitHuman(`resume-${step}`, [
          `interrupted step ${step} left a dirty worktree; decide whether to keep or discard before rerunning`,
        ]);
        return { runId, ledgerPath, state: ledger.state, resumed: true, reason: null };
      }
      startStep = settleOutcome(context, step, "failed", tree, {
        command: "(interrupted)",
        exitCode: null,
        stdout: "",
        stderr: "process lost before completion",
      });
    } else if (tree.dirty) {
      context.waitHuman("resume-run", [
        "worktree is dirty at resume with no step in flight; human triage required",
      ]);
      return { runId, ledgerPath, state: ledger.state, resumed: true, reason: null };
    } else {
      startStep = state.lastCheckpoint?.resumePoint?.step ?? state.run.entry ?? null;
      if (!startStep) {
        throw new OrchestratorError("no checkpoint and no recorded entry; cannot derive a safe resume point");
      }
    }
    if (startStep) {
      drive(context, startStep);
    }
    return { runId, ledgerPath, state: ledger.state, resumed: true, reason: null };
  } finally {
    releaseLock(repoRoot, runId);
  }
}
