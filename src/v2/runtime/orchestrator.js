// M2 orchestrator: one project, one repository, one foreground run. Drives
// workflow steps through adapters, records everything in the event ledger,
// and stops honestly wherever automation ends — a terminal step, a human
// boundary (stopAt), a missing adapter, an exhausted budget, or a repeated
// failure fingerprint. Review steps are read-only enforced (a reviewer that
// writes is blocked, not merged) and consume a worker output envelope whose
// P0/P1 findings route back to fix. resumeRun recovers a crashed run from
// the ledger alone — an in-flight step closes as crashed, never silently
// continues — and continues an approved run only after re-verifying that the
// approval's subject (candidate, plan) is still what the human saw;
// anything changed goes APPROVAL_STALE and back to WAITING_HUMAN.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { nextStep } from "../engine/workflow.js";
import { collectCommandEvidence } from "../evidence/collector.js";
import { evaluatePolicies } from "../policy/policy.js";
import { EventLedger, canonicalJson } from "../storage/event-ledger.js";
import {
  acquireLock,
  createWorkspace,
  listChangedPaths,
  readback,
  releaseLock,
} from "../workspace/workspace-manager.js";
import { writeRunRecord } from "./run-record.js";
import { assertRequires } from "./env-contract.js";
import { materialisePrompt } from "./envelope.js";
import { cacheKey, findReusableEvidence, lastReviewedCandidate, treeHash } from "./cache.js";
import {
  buildAnchor,
  fingerprintFinding,
  latestAdjudications,
  readFindingsAccount,
  recordReviewFindings,
} from "./findings.js";
import { resolveRepoRef, toRepoRef } from "./repo-ref.js";

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

// MVP is single project, single active run: driving a run takes a
// repository-wide lock in addition to the per-run lock.
const ACTIVE_LOCK = "active-run";

function lockActive(repoRoot) {
  try {
    acquireLock(repoRoot, ACTIVE_LOCK);
  } catch {
    throw new OrchestratorError(
      "another run is active in this repository (MVP allows a single active run)",
    );
  }
}

function withRunLocks(repoRoot, runId, fn) {
  lockActive(repoRoot);
  try {
    acquireLock(repoRoot, runId);
    try {
      return fn();
    } finally {
      releaseLock(repoRoot, runId);
    }
  } finally {
    releaseLock(repoRoot, ACTIVE_LOCK);
  }
}

export function parseEnvelope(raw) {
  if (raw === undefined || raw === null) {
    return { envelope: null, error: null };
  }
  let doc = raw;
  if (typeof raw === "string") {
    // Agents habitually wrap JSON in markdown fences; strip one outer fence
    // but stay strict about the JSON inside.
    let text = raw.trim();
    const fenced = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
    if (fenced) {
      text = fenced[1].trim();
    }
    try {
      doc = JSON.parse(text);
    } catch {
      return { envelope: null, error: "worker envelope is not valid JSON" };
    }
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { envelope: null, error: "worker envelope must be a JSON object" };
  }
  if (doc.findings !== undefined) {
    if (!Array.isArray(doc.findings)) {
      return { envelope: null, error: "envelope findings must be an array" };
    }
    for (const finding of doc.findings) {
      if (
        !finding ||
        typeof finding !== "object" ||
        !/^P[0-3]$/.test(finding.severity ?? "") ||
        typeof finding.summary !== "string"
      ) {
        return { envelope: null, error: "each finding needs severity P0-P3 and a summary" };
      }
    }
  }
  return { envelope: doc, error: null };
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
  // Effective cap per step: run config `budgets:` beats the preset, the
  // preset beats the global default, and every BUDGET_EXTENDED a human
  // granted on this ledger adds to it. Real incident: the preset's two
  // review rounds could not be raised from the run config, and approving
  // resume-review re-asked the same question forever.
  context.runBudgets = options.budgets ?? {};
  context.maxAttemptsFor = (step) =>
    (context.runBudgets.maxAttempts?.[step] ??
      workflow.budgets?.maxAttempts?.[step] ??
      maxAttemptsPerStep) +
    (ledger.state.budgetExtensions?.[step] ?? 0) +
    (ledger.state.steps[step]?.infraAttempts ?? 0);
  context.policies = options.policies ?? [];
  context.allowedPaths = options.allowedPaths ?? null;
  context.reviewTriage = options.reviewTriage ?? null;
  context.envelope = options.envelope ?? null;
  context.cache = options.cache ?? {};
  context.redact = options.redact ?? [];
  context.adapterConfigs = options.adapterConfigs ?? {};
  context.policyCtx = () => ({
    state: ledger.state,
    candidate: ledger.state.workspaces[workspace.workspaceId]?.candidate ?? null,
    workDir: join(repoRoot, "delivery", "work", ledger.state.run?.work ?? ""),
    worktreePath: workspace.worktreePath,
    readWorktree: () =>
      existsSync(workspace.worktreePath) ? readback(workspace.worktreePath) : null,
  });
  context.subjectNow = () => {
    const candidate = ledger.state.workspaces[workspace.workspaceId]?.candidate ?? workspace.base;
    const lastEvidence = ledger.state.evidence[ledger.state.evidence.length - 1];
    return {
      candidate,
      planDigest: ledger.state.run?.planDigest ?? "UNVERIFIED",
      evidenceDigest: lastEvidence?.digest ?? "UNVERIFIED",
    };
  };
  context.waitHuman = (transition, reasons, kind = "boundary") => {
    ledger.append({
      type: "HUMAN_REQUESTED",
      actor: KERNEL,
      ts: context.now(),
      data: { transition, subject: context.subjectNow(), reasons, kind },
    });
  };
  return context;
}

// Evaluates configured policies of `type` for `appliesTo`, records every
// verdict as a POLICY_EVALUATED event, and reports what the kernel must do.
// ADVISORY failures are recorded but never gate (doctor reports the gap).
function runPolicyGate(context, type, appliesTo) {
  const rows = evaluatePolicies(context.policies, { type, appliesTo }, context.policyCtx());
  for (const row of rows) {
    context.ledger.append({
      type: "POLICY_EVALUATED",
      actor: KERNEL,
      ts: context.now(),
      data: {
        policy: row.policy,
        phase: type,
        result: row.result,
        enforcement: row.enforcement,
        reason: row.reason,
      },
    });
  }
  const enforced = rows.filter((row) => row.enforcement !== "ADVISORY" && row.result !== "PASS");
  if (enforced.length === 0) {
    return { action: "continue", rows };
  }
  if (enforced.some((row) => row.result === "BLOCK")) {
    return { action: "block", rows: enforced };
  }
  return { action: "wait", rows: enforced };
}

function policyReasons(rows) {
  return rows.map((row) => `policy ${row.policy}: ${row.reason}`);
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
    // A step that failed its final attempt can never run again, so routing
    // to fix would spend a worker on a candidate nothing can verify.
    if ((ledger.state.steps[step]?.attempts ?? 0) >= context.maxAttemptsFor(step)) {
      context.waitHuman(`resume-${step}`, [
        `budget exhausted: ${step} failed its final attempt (maxAttempts=${context.maxAttemptsFor(step)}); not routing to fix`,
        `approving resume-${step} grants one more attempt; rejecting ends the run`,
      ]);
      return null;
    }
  }
  const to = nextStep(workflow, step, outcome);
  let result = "PASS";
  if (to && outcome === "failed") {
    result = "RETRY";
  } else if (to && outcome === "findings-blocking") {
    result = "ROUTE";
  } else if (!to) {
    result = "BLOCK";
  }
  ledger.append({
    type: "POLICY_EVALUATED",
    actor: KERNEL,
    ts: now(),
    data: {
      policy: "workflow.edge",
      phase: "transition",
      result,
      enforcement: "LOCAL_ENFORCED",
      reason: to ? `(${step}, ${outcome}) -> ${to}` : `no transition for (${step}, ${outcome})`,
    },
  });
  if (!to) {
    // A workflow without an edge for this outcome is not a verdict on the
    // candidate; the person decides whether to rerun the step or end the
    // run. Terminal FAILED here used to kill runs whose reviewer had merely
    // errored out.
    context.waitHuman(`resume-${step}`, [
      `no transition for (${step}, ${outcome}); approve resume-${step} to rerun the step, reject to end the run`,
    ]);
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

function drive(context, startStep, { skipBoundaryOnce = false } = {}) {
  const { ledger, workflow, workspace, adapters, now } = context;
  let step = startStep;
  let firstStep = true;
  while (step) {
    if (workflow.terminal.has(step)) {
      context.waitHuman(
        `enter-${step}`,
        ["terminal step requires a human decision"],
        "final-decision",
      );
      return;
    }
    if (context.stopAt.includes(step) && !(skipBoundaryOnce && firstStep)) {
      context.waitHuman(`enter-${step}`, [`automation boundary: stopAt includes ${step}`]);
      return;
    }
    firstStep = false;
    const stepDef = workflow.steps.find((candidate) => candidate.id === step);
    const adapter = stepDef.worker ? adapters[stepDef.worker] : null;
    if (!adapter) {
      context.waitHuman(`enter-${step}`, [
        `no adapter configured for worker ${stepDef.worker ?? "(none)"}; attended handoff`,
      ]);
      return;
    }

    const preGate = runPolicyGate(context, "pre", step);
    if (preGate.action === "block") {
      ledger.append({
        type: "RUN_TERMINAL",
        actor: KERNEL,
        ts: now(),
        data: { status: "FAILED", reason: `pre policy blocked ${step}` },
      });
      writeRunRecord({ repoRoot: context.repoRoot, ledger, ts: now() });
      return;
    }
    if (preGate.action === "wait") {
      context.waitHuman(`resume-${step}`, policyReasons(preGate.rows));
      return;
    }

    const attempt = (ledger.state.steps[step]?.attempts ?? 0) + 1;
    const maxAttempts = context.maxAttemptsFor(step);
    if (attempt > maxAttempts) {
      context.waitHuman(`resume-${step}`, [
        `budget exhausted: ${step} would exceed maxAttempts=${maxAttempts}`,
        `approving resume-${step} grants one more attempt; rejecting ends the run`,
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
    const before = stepDef.readonly ? readback(workspace.worktreePath) : null;
    const outputsDir = join(context.runtimeDir, "runs", ledger.state.run.id, "outputs");
    mkdirSync(outputsDir, { recursive: true });
    const outputPath = join(outputsDir, `${step}-${attempt}.json`);
    // Anchored review: readonly (reviewer) steps receive the adjudicated
    // findings history so a fresh reviewer inherits settled verdicts instead
    // of re-litigating them; writing steps get the latest review findings
    // with their adjudication status (the fixer's worklist).
    const input = { workId: ledger.state.run.work, runId: ledger.state.run.id, step, attempt };
    const anchor = buildAnchor(context.repoRoot, ledger.state.run.work);
    if (anchor && stepDef.readonly) {
      input.anchor = anchor;
    } else if (anchor) {
      const lastReview = [...ledger.state.evidence]
        .reverse()
        .find((item) => item.kind === "review");
      if (lastReview?.findings?.length) {
        const adjudicated = latestAdjudications(
          readFindingsAccount(context.repoRoot, ledger.state.run.work),
        );
        input.findings = lastReview.findings.map((finding) => ({
          severity: finding.severity,
          summary: finding.summary,
          fingerprint: fingerprintFinding(finding),
          adjudication: adjudicated.get(fingerprintFinding(finding))?.action ?? "open",
        }));
      }
    }
    // Envelope (C6): the worker's prompt, materialised into the run
    // directory and handed over as BUILDBEAT_PROMPT / input.envelope.
    const prompt = materialisePrompt({
      envelope: context.envelope,
      worker: stepDef.worker,
      runtimeDir: context.runtimeDir,
      runId: ledger.state.run.id,
      step,
      attempt,
      repoRoot: context.repoRoot,
    });
    if (prompt) {
      input.envelope = { promptRef: prompt.ref, file: prompt.file, digest: context.envelope.digest, vars: context.envelope.vars };
    }
    // Incremental review (C7): tell a reviewer which candidate the last
    // review saw when it is an ancestor of this one.
    if (stepDef.readonly) {
      const head = before.head;
      const lastReviewed = lastReviewedCandidate(context.repoRoot, ledger.state.run.work, workspace.worktreePath, head);
      if (lastReviewed) {
        input.lastReviewed = lastReviewed;
      }
    }
    // Verification reuse (C7): same tree + same worker + same envelope that
    // already passed is referenced, not re-run. Failures always re-run.
    let stepCacheKey = null;
    let reused = null;
    if (context.cache[step] === "tree") {
      const current = readback(workspace.worktreePath);
      if (!current.dirty) {
        stepCacheKey = cacheKey({
          tree: treeHash(workspace.worktreePath),
          worker: stepDef.worker,
          adapterSpec: context.adapterConfigs[stepDef.worker] ?? null,
          adapterName: adapter.name,
          envelopeDigest: context.envelope?.digest ?? null,
        });
        reused = findReusableEvidence(context.repoRoot, stepCacheKey);
      }
    }
    let exec;
    if (reused) {
      const at = now();
      exec = {
        adapter: "cache",
        command: `reuse ${reused.run} ${reused.evidenceRef}`,
        exitCode: 0,
        signal: null,
        stdout: `REUSED: identical tree/worker/envelope already passed in ${reused.run} (${reused.evidenceRef}, ${reused.digest}); not re-run`,
        stderr: "",
        timedOut: false,
        spawnError: null,
        startedAt: at,
        finishedAt: at,
      };
    } else {
      exec = adapter.execute({
        step,
        worker: stepDef.worker,
        workspacePath: workspace.worktreePath,
        input,
        timeoutMs: context.stepTimeoutMs,
        outputPath,
        // Live output streams + marker land in the run directory so `status`
        // can answer "is it still doing something" while the step runs.
        liveDir: join(context.runtimeDir, "runs", ledger.state.run.id),
        promptPath: prompt?.path ?? null,
        vars: context.envelope?.vars ?? null,
      });
    }
    const tree = readback(workspace.worktreePath);
    const evidence = collectCommandEvidence({
      runtimeDir: context.runtimeDir,
      runId: ledger.state.run.id,
      step,
      attempt,
      execResult: exec,
      subject: tree.head,
      grade: reused ? reused.grade : stepDef.grade ?? "L2",
      redact: context.redact,
    });
    ledger.append({
      type: "EVIDENCE_RECORDED",
      actor: KERNEL,
      ts: now(),
      data: {
        evidenceRef: toRepoRef(context.repoRoot, evidence.location),
        kind: evidence.kind,
        subject: evidence.subject,
        digest: evidence.digest,
        status: evidence.status,
        grade: evidence.grade,
        ...(stepCacheKey ? { cacheKey: stepCacheKey } : {}),
        ...(reused ? { reused: { run: reused.run, evidenceRef: reused.evidenceRef, digest: reused.digest } } : {}),
      },
    });

    // Read-only enforcement: a reviewer that changed the workspace is a
    // policy violation, not a candidate (invariants 9/17).
    if (stepDef.readonly && (tree.head !== before.head || tree.dirty !== before.dirty)) {
      ledger.append({
        type: "POLICY_EVALUATED",
        actor: KERNEL,
        ts: now(),
        data: {
          policy: "step.readonly",
          phase: "action",
          result: "BLOCK",
          enforcement: "LOCAL_ENFORCED",
          reason: `read-only step ${step} modified the workspace`,
        },
      });
      ledger.append({
        type: "STEP_FINISHED",
        actor: KERNEL,
        ts: now(),
        data: { step, attempt, status: "blocked" },
      });
      context.waitHuman(`resume-${step}`, [
        `read-only step ${step} modified the workspace; human triage required`,
      ]);
      return;
    }

    let envelopeRaw = exec.envelope;
    if (exec.envelope !== undefined && exec.envelope !== null) {
      writeFileSync(outputPath, `${JSON.stringify(exec.envelope, null, 2)}\n`, "utf8");
    } else if (existsSync(outputPath)) {
      envelopeRaw = readFileSync(outputPath, "utf8");
    }
    const { envelope, error: envelopeError } = parseEnvelope(envelopeRaw);

    let stepStatus;
    if (exec.spawnError) {
      stepStatus = "crashed";
    } else if (exec.timedOut) {
      stepStatus = "timeout";
    } else if (exec.signal) {
      stepStatus = "crashed";
    } else if (exec.exitCode !== 0) {
      stepStatus = "failed";
    } else if (envelopeError) {
      stepStatus = "invalid-output";
    } else {
      stepStatus = "succeeded";
    }
    // Infrastructure failure vs candidate failure. A timeout, a crash,
    // garbage output or the worker's own "environment unavailable" signal
    // (exit 75, EX_TEMPFAIL) says nothing about the candidate: no failure
    // fingerprint, no fixer, the attempt is refunded, and a human decides
    // when the backend is back. Real incidents: a worker backend outage
    // (review exit 97) and non-JSON reviewer output killed five runs in two
    // days as "no transition for (review, failed)"; PATH, port and host-load
    // verify failures dispatched fixers five times.
    const infra =
      stepStatus === "timeout" ||
      stepStatus === "crashed" ||
      stepStatus === "invalid-output" ||
      (stepStatus === "failed" && exec.exitCode === 75);
    ledger.append({
      type: "STEP_FINISHED",
      actor: KERNEL,
      ts: now(),
      data: { step, attempt, status: stepStatus, exitCode: exec.exitCode, ...(infra ? { infra: true } : {}) },
    });
    ledger.append({
      type: "BUDGET_CONSUMED",
      actor: KERNEL,
      ts: now(),
      data: {
        kind: "attempts",
        amount: infra ? 0 : 1,
        remaining: context.maxAttemptsFor(step) - attempt,
      },
    });
    if (infra) {
      const cause =
        stepStatus === "failed"
          ? "exit 75 (worker reports its environment unavailable)"
          : stepStatus === "invalid-output"
            ? "output is not a worker envelope"
            : stepStatus;
      context.waitHuman(
        `resume-${step}`,
        [
          `worker infrastructure failure at ${step}: ${cause}; not a candidate defect, attempt not charged`,
          ...(tree.dirty ? [`the failed worker left the worktree dirty; inspect before rerunning`] : []),
          `approve resume-${step} to rerun once the backend/environment is back; reject to end the run`,
        ],
        "infra",
      );
      return;
    }

    let blockingFindings = [];
    if (envelope?.findings) {
      recordReviewFindings(context.repoRoot, ledger.state.run.work, {
        run: ledger.state.run.id,
        step,
        attempt,
        findings: envelope.findings,
        ts: now(),
      });
      // A fingerprint a human dismissed stays visible in the evidence but no
      // longer blocks: settled verdicts do not reopen without a human.
      const adjudicated = latestAdjudications(
        readFindingsAccount(context.repoRoot, ledger.state.run.work),
      );
      const suppressed = [];
      blockingFindings = envelope.findings.filter((finding) => {
        if (adjudicated.get(fingerprintFinding(finding))?.action === "dismiss") {
          suppressed.push(fingerprintFinding(finding));
          return false;
        }
        return finding.severity === "P0" || finding.severity === "P1";
      });
      ledger.append({
        type: "EVIDENCE_RECORDED",
        actor: KERNEL,
        ts: now(),
        data: {
          evidenceRef: toRepoRef(context.repoRoot, outputPath),
          kind: "review",
          subject: tree.head,
          digest: sha256(canonicalJson(envelope)),
          status: blockingFindings.length > 0 ? "failed" : "passed",
          grade: "L2",
          findings: envelope.findings,
          ...(suppressed.length > 0 ? { suppressedFingerprints: suppressed } : {}),
        },
      });
    }

    // Scope enforcement (B §10: out-of-scope changes stop the loop): any
    // path changed outside the allowed set means this candidate cannot
    // proceed, whatever the exit code said.
    if (!stepDef.readonly && context.allowedPaths) {
      const changed = listChangedPaths(workspace.worktreePath, workspace.base);
      const violations = changed.filter(
        (path) =>
          !context.allowedPaths.some(
            (prefix) =>
              path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
          ),
      );
      if (violations.length > 0) {
        ledger.append({
          type: "POLICY_EVALUATED",
          actor: KERNEL,
          ts: now(),
          data: {
            policy: "workspace.scope",
            phase: "action",
            result: "BLOCK",
            enforcement: "LOCAL_ENFORCED",
            reason: `out-of-scope changes: ${violations.slice(0, 5).join(", ")}`,
          },
        });
        context.waitHuman(`resume-${step}`, [
          `worker changed paths outside the allowed scope: ${violations.slice(0, 5).join(", ")}`,
        ]);
        return;
      }
    }

    if (stepStatus === "succeeded" && !stepDef.readonly) {
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

    if (stepStatus === "succeeded") {
      const postGate = runPolicyGate(context, "post", step);
      if (postGate.action === "block") {
        ledger.append({
          type: "RUN_TERMINAL",
          actor: KERNEL,
          ts: now(),
          data: { status: "FAILED", reason: `post policy blocked ${step}` },
        });
        writeRunRecord({ repoRoot: context.repoRoot, ledger, ts: now() });
        return;
      }
      if (postGate.action === "wait") {
        context.waitHuman(`resume-${step}`, policyReasons(postGate.rows));
        return;
      }
    }

    let outcome;
    if (stepStatus !== "succeeded") {
      outcome = "failed";
    } else if (blockingFindings.length > 0) {
      outcome = "findings-blocking";
    } else {
      outcome = "succeeded";
    }
    const routed = settleOutcome(context, step, outcome, tree, exec);
    // Finding triage gate (reviewTriage: required): blocking findings stop
    // for a human verdict before any fixer runs. Findings are prescriptions,
    // not facts — auto-routing them to a fixer burned four oscillation
    // rounds in the deploy campaign before a human stopped the loop.
    if (routed && outcome === "findings-blocking" && context.reviewTriage === "required") {
      context.waitHuman(
        `enter-${routed}`,
        [
          `review found ${blockingFindings.length} blocking finding(s); triage before ${routed} runs`,
          ...blockingFindings
            .slice(0, 5)
            .map(
              (finding) =>
                `[${finding.severity} ${fingerprintFinding(finding)}] ${finding.summary.slice(0, 200)}`,
            ),
          `adjudicate fingerprints (findings adjudicate), then approve enter-${routed} or reject the run`,
        ],
        "finding-triage",
      );
      return;
    }
    step = routed;
  }
}

// Supersede (iteration 08, C2): a new Run for the same Work makes any older
// Run still waiting on a human moot — the human would be approving a
// candidate nobody intends to merge. Real incident: two WAITING_HUMAN runs
// sat in a pilot repo's inbox for a day after their successor had already
// shipped. Only WAITING_HUMAN runs are touched; RUNNING ones are protected
// by the active lock, terminal ones are already settled.
function supersedeWaitingRuns(repoRoot, workId, newRunId, now) {
  const runsDir = join(repoRoot, ".buildbeat", "runtime", "runs");
  const superseded = [];
  const skipped = [];
  if (!existsSync(runsDir)) {
    return { superseded, skipped };
  }
  for (const entry of readdirSync(runsDir).sort()) {
    if (entry === newRunId) {
      continue;
    }
    const ledgerPath = join(runsDir, entry, "events.jsonl");
    if (!existsSync(ledgerPath)) {
      continue;
    }
    const ledger = EventLedger.open(ledgerPath);
    const state = ledger.state;
    if (ledger.corruption || !state.run || state.run.work !== workId) {
      continue;
    }
    if (state.terminal || state.run.status !== "WAITING_HUMAN") {
      continue;
    }
    try {
      acquireLock(repoRoot, entry);
    } catch {
      skipped.push({ run: entry, reason: "locked by another process" });
      continue;
    }
    try {
      ledger.append({
        type: "RUN_TERMINAL",
        actor: KERNEL,
        ts: now(),
        data: { status: "SUPERSEDED", reason: `superseded by ${newRunId} (same work ${workId})` },
      });
      writeRunRecord({ repoRoot, ledger, ts: now() });
      superseded.push(entry);
    } finally {
      releaseLock(repoRoot, entry);
    }
  }
  return { superseded, skipped };
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
    planDigest,
    intentDigest,
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
  // Environment contract first: a missing or too-old binary fails the start
  // with a readable cause instead of burning a run on an implicit PATH fact.
  if (options.requires?.length) {
    assertRequires(options.requires);
  }
  const { ledger, ledgerPath } = openLedgerFor(repoRoot, runId);
  if (ledger.events.length > 0) {
    throw new OrchestratorError(`run ${runId} already has a ledger; use resumeRun`);
  }

  return withRunLocks(repoRoot, runId, () => {
    const workspace = createWorkspace({ repoRoot, runId, base });
    const context = makeContext(options, ledger, workspace);
    const now = context.now;
    const supersession =
      options.supersede === "off"
        ? { superseded: [], skipped: [] }
        : supersedeWaitingRuns(repoRoot, workId, runId, now);
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
        planDigest: planDigest ?? "UNVERIFIED",
        intentDigest: intentDigest ?? "UNVERIFIED",
        ...(supersession.superseded.length > 0 ? { supersedes: supersession.superseded } : {}),
        ...(options.envelope ? { envelopeDigest: options.envelope.digest, envelopeSource: options.envelope.source } : {}),
      },
    });
    ledger.append({ type: "RUN_STARTED", actor: KERNEL, ts: now(), data: {} });
    ledger.append({
      type: "WORKSPACE_BOUND",
      actor: KERNEL,
      ts: now(),
      data: {
        workspaceId: workspace.workspaceId,
        repo: toRepoRef(repoRoot, repoRoot),
        branch: workspace.branch,
        worktreePath: toRepoRef(repoRoot, workspace.worktreePath),
        base: workspace.base,
      },
    });
    drive(context, entry);
    return {
      runId,
      workId,
      ledgerPath,
      state: ledger.state,
      workspace,
      superseded: supersession.superseded,
      supersedeSkipped: supersession.skipped,
    };
  });
}

function resumeStepFromTransition(transition) {
  if (transition.startsWith("enter-")) {
    return transition.slice("enter-".length);
  }
  if (transition.startsWith("resume-")) {
    return transition.slice("resume-".length);
  }
  return null;
}

export function resumeRun(options) {
  const { repoRoot, workflow, workflowDigest, runId, planDigest } = options;
  if (!repoRoot || !runId) {
    throw new OrchestratorError("repoRoot and runId are required");
  }
  if (options.requires?.length) {
    assertRequires(options.requires);
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
  if (state.run.status === "WAITING_HUMAN" && state.pendingHuman) {
    return { runId, ledgerPath, state, resumed: false, reason: "waiting on a human decision" };
  }

  const bound = state.workspaces[runId];
  if (!bound) {
    throw new OrchestratorError(`run ${runId} has no bound workspace; cannot resume`);
  }
  const worktreePath = resolveRepoRef(repoRoot, bound.worktreePath);
  if (!existsSync(worktreePath)) {
    throw new OrchestratorError(
      "worktree missing; recovery requires a human decision",
    );
  }
  const workspace = {
    workspaceId: runId,
    repoRoot,
    worktreePath,
    branch: bound.branch,
    base: bound.base,
  };

  return withRunLocks(repoRoot, runId, () => {
    const context = makeContext(options, ledger, workspace);
    const now = context.now;

    if (state.run.status === "WAITING_HUMAN") {
      // Pending request already resolved: continue only if the approval's
      // subject is still exactly what the human saw (F6 machine closure).
      const approval = [...state.approvals].reverse().find((entry) => !entry.stale);
      if (!approval) {
        return { runId, ledgerPath, state, resumed: false, reason: "no active approval to act on" };
      }
      const tree = readback(workspace.worktreePath);
      const changed = [];
      if (tree.head !== approval.subject.candidate) {
        changed.push("candidate");
      }
      if (
        planDigest &&
        approval.subject.planDigest !== "UNVERIFIED" &&
        planDigest !== approval.subject.planDigest
      ) {
        changed.push("plan");
      }
      if (changed.length > 0) {
        ledger.append({
          type: "APPROVAL_STALE",
          actor: KERNEL,
          ts: now(),
          data: { approvalRef: approval.decisionRef, changed },
        });
        return { runId, ledgerPath, state: ledger.state, resumed: true, stale: true, reason: null };
      }
      const step = resumeStepFromTransition(approval.transition);
      if (!step || !context.workflow.stepIds.has(step)) {
        throw new OrchestratorError(
          `cannot derive a resume step from approved transition ${approval.transition}`,
        );
      }
      // An approved resume-<step> on an exhausted budget is the human saying
      // "one more"; record the grant before driving or the same request
      // comes straight back (the pilot's app-login runs ended CANCELLED
      // with their candidates in production because of exactly that).
      if (
        approval.transition.startsWith("resume-") &&
        (state.steps[step]?.attempts ?? 0) >= context.maxAttemptsFor(step)
      ) {
        ledger.append({
          type: "BUDGET_EXTENDED",
          actor: KERNEL,
          ts: now(),
          data: {
            step,
            amount: 1,
            maxAttempts: context.maxAttemptsFor(step) + 1,
            approvalRef: approval.decisionRef,
          },
        });
      }
      ledger.append({ type: "RUN_STARTED", actor: KERNEL, ts: now(), data: {} });
      drive(context, step, { skipBoundaryOnce: true });
      return { runId, ledgerPath, state: ledger.state, resumed: true, reason: null };
    }

    // Crash recovery: the process died while RUNNING.
    ledger.append({
      type: "RUN_INTERRUPTED",
      actor: KERNEL,
      ts: now(),
      data: { cause: "resume after process loss" },
    });
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
      // An interrupted attempt says nothing about the candidate, so the step
      // itself reruns (the lost attempt still counts against its budget)
      // instead of settling as a step failure — routing a crash through the
      // failure edge dispatched a fixer with no verifier evidence (real
      // incident: deploy-18's verify worker was killed by a host timeout).
      startStep = step;
    } else if (tree.dirty) {
      context.waitHuman("resume-run", [
        "worktree is dirty at resume with no step in flight; human triage required",
      ]);
      return { runId, ledgerPath, state: ledger.state, resumed: true, reason: null };
    } else {
      startStep = state.lastCheckpoint?.resumePoint?.step ?? state.run.entry ?? null;
      if (!startStep) {
        throw new OrchestratorError(
          "no checkpoint and no recorded entry; cannot derive a safe resume point",
        );
      }
    }
    if (startStep) {
      drive(context, startStep);
    }
    return { runId, ledgerPath, state: ledger.state, resumed: true, reason: null };
  });
}
