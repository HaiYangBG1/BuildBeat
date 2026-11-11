// Reviews one existing commit of a work: the commit is checked out by itself,
// the project's verifier runs on it and, when that passes, a read-only
// reviewer. Every fact goes into the run's event ledger. Nothing is written,
// retried or repaired here: the session that wrote the commit fixes it and
// sends the next one, which is a new run.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { REVIEW_STEPS, WORKFLOW_DIGEST, WORKFLOW_NAME } from "../engine/workflow.js";
import { collectCommandEvidence } from "../evidence/collector.js";
import { checkScreenshotFile, screenshotFormat } from "../evidence/image.js";
import { currentScreenshots } from "../policy/policy.js";
import { EventLedger, canonicalJson } from "../storage/event-ledger.js";
import {
  acquireLock,
  createWorkspace,
  discardWorkspace,
  listChangedPaths,
  readback,
  releaseLock,
  withRepoGitLock,
} from "../workspace/workspace-manager.js";
import { writeRunRecord } from "./run-record.js";
import { assertRequires } from "./env-contract.js";
import { materialisePrompt } from "./envelope.js";
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

// One review runs in a repository at a time: it holds the repository's
// active-run lock and its own run lock until it returns. A lock whose owner
// process is gone is reclaimed inside acquireLock; what is reported here is
// held, and names its owner.
const ACTIVE_LOCK = "active-run";

function withRunLock(repoRoot, runId, fn) {
  try {
    acquireLock(repoRoot, ACTIVE_LOCK);
  } catch (error) {
    const detail = error.lock?.detail;
    throw new OrchestratorError(
      `another review is running in this repository${detail ? `; ${detail}` : ""}`,
    );
  }
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

// Every run ledger of the repository that holds a run, in name order.
function runLedgers(repoRoot) {
  const runsDir = join(repoRoot, ".buildbeat", "runtime", "runs");
  if (!existsSync(runsDir)) {
    return [];
  }
  const out = [];
  for (const entry of readdirSync(runsDir).sort()) {
    const path = join(runsDir, entry, "events.jsonl");
    if (existsSync(path)) {
      out.push({ entry, path });
    }
  }
  return out;
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
        return {
          envelope: null,
          error: "each finding needs severity P0-P3 and a summary",
        };
      }
    }
  }
  return { envelope: doc, error: null };
}

// The most recent review of this work whose commit is an ancestor of (and
// not equal to) the one under review: a reviewer told about it can read the
// difference instead of the whole change again. Null when there is none.
function lastReviewedCandidate(repoRoot, workId, worktreePath, head) {
  let best = null;
  for (const { path } of runLedgers(repoRoot)) {
    const ledger = EventLedger.open(path);
    if (ledger.state.run?.work !== workId) {
      continue;
    }
    for (const event of ledger.events) {
      if (event.type !== "EVIDENCE_RECORDED" || event.data.kind !== "review") {
        continue;
      }
      const subject = event.data.subject;
      if (!subject || subject === head || (best && event.ts <= best.ts)) {
        continue;
      }
      try {
        execFileSync(
          "git",
          ["-C", worktreePath, "merge-base", "--is-ancestor", subject, head],
          { stdio: "ignore" },
        );
      } catch {
        continue;
      }
      best = {
        candidate: subject,
        run: ledger.state.run.id,
        evidenceRef: event.data.evidenceRef,
        ts: event.ts,
      };
    }
  }
  return best
    ? {
        candidate: best.candidate,
        run: best.run,
        evidenceRef: best.evidenceRef,
        range: `${best.candidate}..${head}`,
      }
    : null;
}

// Records STEP_STARTED and prepares the worker's input: for the reviewer,
// the read-only snapshot, where the change starts, the adjudicated findings
// so far, the commit the last review saw and the screenshots of this one.
function beginStep(context, stepDef) {
  const { ledger, workspace, now } = context;
  const step = stepDef.id;
  ledger.append({
    type: "STEP_STARTED",
    actor: KERNEL,
    ts: now(),
    data: {
      step,
      attempt: 1,
      worker: stepDef.worker,
      adapter: context.adapters[stepDef.worker].name,
      workspaceId: workspace.workspaceId,
    },
  });
  const before = stepDef.readonly ? readback(workspace.worktreePath) : null;
  const outputsDir = join(
    context.runtimeDir,
    "runs",
    ledger.state.run.id,
    "outputs",
  );
  mkdirSync(outputsDir, { recursive: true });
  const outputPath = join(outputsDir, `${step}-1.json`);
  const input = {
    workId: ledger.state.run.work,
    runId: ledger.state.run.id,
    step,
    attempt: 1,
    workArtifact: {
      ref: `delivery/work/${ledger.state.run.work}/work.md`,
      digest: ledger.state.run.planDigest,
    },
  };
  // The worker's prompt, materialised into the run directory and handed
  // over as BUILDBEAT_PROMPT / input.envelope.
  const prompt = materialisePrompt({
    envelope: context.envelope,
    worker: stepDef.worker,
    runtimeDir: context.runtimeDir,
    runId: ledger.state.run.id,
    step,
    attempt: 1,
    repoRoot: context.repoRoot,
  });
  if (prompt) {
    input.envelope = {
      promptRef: prompt.ref,
      file: prompt.file,
      digest: context.envelope.digest,
      vars: context.envelope.vars,
    };
  }
  if (stepDef.readonly) {
    // The commit sits on its author's branch, so the branch does not say
    // where the change starts.
    input.base = workspace.base;
    // Anchored review: a fresh reviewer inherits settled verdicts instead of
    // re-litigating them.
    const anchor = buildAnchor(context.repoRoot, ledger.state.run.work);
    if (anchor) {
      input.anchor = anchor;
    }
    const lastReviewed = lastReviewedCandidate(
      context.repoRoot,
      ledger.state.run.work,
      workspace.worktreePath,
      before.head,
    );
    if (lastReviewed) {
      input.lastReviewed = lastReviewed;
    }
    // The reviewer judges the real render it is shown, not a description.
    const screenshots = currentScreenshots(ledger.state.evidence, before.head);
    if (screenshots.length > 0) {
      input.screenshots = screenshots.map((item) => ({
        path: resolveRepoRef(context.repoRoot, item.ref),
        digest: item.digest,
      }));
    }
  }
  return { before, outputPath, input, prompt };
}

// An image counts only as a regular file (no symlink that could point at
// something removed later) that is structurally complete for its format.
function screenshotFiles(dir) {
  const accepted = [];
  const rejected = [];
  for (const name of readdirSync(dir).sort()) {
    if (!screenshotFormat(name)) {
      continue;
    }
    const path = join(dir, name);
    const checked = checkScreenshotFile(path);
    if (checked.ok) {
      accepted.push({ file: path, digest: checked.digest });
    } else {
      rejected.push(checked.reason);
    }
  }
  return { accepted, rejected };
}

// Runs the worker and records the command evidence for the commit Git reads
// back, plus the screenshots a UI work's verify left.
function executeStep(context, stepDef, { outputPath, input, prompt }) {
  const { ledger, workspace, now } = context;
  const step = stepDef.id;
  // UI work (requireScreenshot): verify leaves screenshots of the real
  // render in a fresh directory outside the checkout; each image becomes
  // screenshot evidence for this commit.
  let screenshotDir = null;
  if (
    step === "verify" &&
    ledger.state.run.deliveryChecks?.requireScreenshot === true
  ) {
    screenshotDir = join(
      context.runtimeDir,
      "runs",
      ledger.state.run.id,
      "screenshots",
      `${step}-1`,
    );
    rmSync(screenshotDir, { recursive: true, force: true });
    mkdirSync(screenshotDir, { recursive: true });
  }
  let exec = context.adapters[stepDef.worker].execute({
    step,
    worker: stepDef.worker,
    workspacePath: workspace.worktreePath,
    input,
    outputPath,
    promptPath: prompt?.path ?? null,
    vars: context.envelope?.vars ?? null,
    extraEnv: screenshotDir
      ? { BUILDBEAT_SCREENSHOT_DIR: screenshotDir }
      : undefined,
  });
  const found = screenshotDir
    ? screenshotFiles(screenshotDir)
    : { accepted: [], rejected: [] };
  // Rejections are reported whether or not another screenshot passed.
  if (found.rejected.length > 0) {
    exec = { ...exec, screenshotsRejected: found.rejected };
  }
  if (
    screenshotDir &&
    found.accepted.length === 0 &&
    exec.exitCode === 0 &&
    !exec.timedOut &&
    !exec.signal &&
    !exec.spawnError
  ) {
    exec = {
      ...exec,
      requirementFailure:
        "requireScreenshot is on, but verify left no PNG screenshot in BUILDBEAT_SCREENSHOT_DIR" +
        (found.rejected.length > 0
          ? `; rejected: ${found.rejected.join(", ")}`
          : ""),
    };
  }
  const tree = readback(workspace.worktreePath);
  const evidence = collectCommandEvidence({
    runtimeDir: context.runtimeDir,
    runId: ledger.state.run.id,
    step,
    attempt: 1,
    execResult: exec,
    subject: tree.head,
    grade: stepDef.grade,
    redact: context.redact,
  });
  const source = toRepoRef(context.repoRoot, evidence.location);
  ledger.append({
    type: "EVIDENCE_RECORDED",
    actor: KERNEL,
    ts: now(),
    data: {
      evidenceRef: source,
      kind: evidence.kind,
      subject: evidence.subject,
      digest: evidence.digest,
      status: evidence.status,
      grade: evidence.grade,
    },
  });
  if (evidence.status === "passed") {
    for (const shot of found.accepted) {
      ledger.append({
        type: "EVIDENCE_RECORDED",
        actor: KERNEL,
        ts: now(),
        data: {
          evidenceRef: toRepoRef(context.repoRoot, shot.file),
          kind: "screenshot",
          subject: tree.head,
          digest: shot.digest,
          status: "passed",
          grade: "L2",
          source,
        },
      });
    }
  }
  return { exec, tree };
}

// Classifies what the step did and records it. Returns the blocking findings
// of a step that passed, or null when the run ended here: FAILED when the
// commit failed verify or broke a rule the runner checks, CANCELLED when the
// tooling failed, which is no verdict on the commit.
function recordStepResult(context, stepDef, { before, outputPath }, { exec, tree }) {
  const { ledger, workspace, now } = context;
  const step = stepDef.id;
  const finish = (status, extra = {}) =>
    ledger.append({
      type: "STEP_FINISHED",
      actor: KERNEL,
      ts: now(),
      data: { step, attempt: 1, status, ...extra },
    });
  const blocked = (policy, reason) =>
    ledger.append({
      type: "POLICY_EVALUATED",
      actor: KERNEL,
      ts: now(),
      data: {
        policy,
        phase: "action",
        result: "BLOCK",
        enforcement: "LOCAL_ENFORCED",
        reason,
      },
    });

  // Read-only enforcement: a reviewer that changed the checkout reviewed
  // something other than the commit, and its report counts for nothing.
  if (
    stepDef.readonly &&
    (tree.head !== before.head || tree.dirty !== before.dirty)
  ) {
    const reason = `read-only step ${step} modified the workspace`;
    blocked("step.readonly", reason);
    finish("blocked");
    return context.end("CANCELLED", `${reason}; its report is not a verdict on the commit`);
  }

  let envelopeRaw = exec.envelope;
  if (exec.envelope !== undefined && exec.envelope !== null) {
    writeFileSync(
      outputPath,
      `${JSON.stringify(exec.envelope, null, 2)}\n`,
      "utf8",
    );
  } else if (existsSync(outputPath)) {
    envelopeRaw = readFileSync(outputPath, "utf8");
  }
  const { envelope, error: envelopeError } = parseEnvelope(envelopeRaw);
  // A review that exits cleanly without a report reviewed nothing the runner
  // can check. Real incident: a reviewer printed 3 P1, 6 P2 and 4 P3
  // findings to stdout only and the step counted as passed.
  const reportMissing =
    stepDef.readonly && (envelopeRaw === undefined || envelopeRaw === null);

  let stepStatus;
  if (exec.spawnError) {
    stepStatus = "crashed";
  } else if (exec.timedOut) {
    stepStatus = "timeout";
  } else if (exec.signal) {
    stepStatus = "crashed";
  } else if (exec.exitCode !== 0) {
    stepStatus = "failed";
  } else if (exec.requirementFailure) {
    // The command passed but a requirement the runner checks did not (no
    // screenshots): a failure of the commit.
    stepStatus = "failed";
  } else if (envelopeError || reportMissing) {
    stepStatus = "invalid-output";
  } else {
    stepStatus = "succeeded";
  }
  let outputProblem = null;
  if (stepStatus === "invalid-output" && !envelopeError) {
    const stdoutBytes = Buffer.byteLength(String(exec.stdout ?? "").trim());
    outputProblem =
      "the reviewer exited 0 without writing a report to $BUILDBEAT_OUTPUT (stdout is not read)" +
      (stdoutBytes > 0
        ? `; stdout has ${stdoutBytes} bytes; write the JSON report to $BUILDBEAT_OUTPUT`
        : "");
  }
  // Tooling failure or failure of the commit. A timeout, a crash, garbage
  // output, the worker's own "environment unavailable" (exit 75,
  // EX_TEMPFAIL) or a reviewer that exits non-zero says nothing about the
  // commit. Real incidents: a worker backend outage and non-JSON reviewer
  // output ended five runs in two days as candidate failures.
  const infra =
    stepStatus === "timeout" ||
    stepStatus === "crashed" ||
    stepStatus === "invalid-output" ||
    (stepStatus === "failed" && (exec.exitCode === 75 || stepDef.readonly));
  finish(stepStatus, {
    exitCode: exec.exitCode,
    ...(exec.requirementFailure ? { reason: exec.requirementFailure } : {}),
    ...(outputProblem ? { reason: outputProblem } : {}),
    ...(exec.screenshotsRejected
      ? { screenshotsRejected: exec.screenshotsRejected }
      : {}),
    ...(infra ? { infra: true } : {}),
  });
  if (infra) {
    let cause = stepStatus;
    if (stepStatus === "invalid-output") {
      cause = outputProblem ?? "output is not a worker envelope";
    } else if (stepStatus === "failed") {
      cause =
        exec.exitCode === 75
          ? "exit 75 (worker reports its environment unavailable)"
          : `exit ${exec.exitCode} without a verdict`;
    }
    return context.end(
      "CANCELLED",
      `worker infrastructure failure at ${step}: ${cause}; not a candidate defect`,
    );
  }
  if (stepStatus !== "succeeded") {
    return context.end(
      "FAILED",
      `${step} failed (exit ${exec.exitCode})${exec.requirementFailure ? `: ${exec.requirementFailure}` : ""}`,
    );
  }

  let blockingFindings = [];
  if (envelope?.findings) {
    recordReviewFindings(context.repoRoot, ledger.state.run.work, {
      run: ledger.state.run.id,
      step,
      attempt: 1,
      findings: envelope.findings,
      ts: now(),
    });
    // A fingerprint a person dismissed stays visible in the evidence but no
    // longer blocks: settled verdicts do not reopen without a person.
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
        ...(suppressed.length > 0
          ? { suppressedFingerprints: suppressed }
          : {}),
      },
    });
  }
  if (stepDef.readonly) {
    return blockingFindings;
  }

  // What the runner checks on the commit itself, once verify passed.
  // Scope: any path changed outside allowedPaths. The work's own records
  // (decisions, findings, run records) are committed next to the code and
  // are always in scope; its work.md is bound by digest.
  if (context.allowedPaths) {
    const records = `delivery/work/${ledger.state.run.work}/`;
    const violations = listChangedPaths(
      workspace.worktreePath,
      workspace.base,
    ).filter(
      (path) =>
        !path.startsWith(records) &&
        !context.allowedPaths.some(
          (prefix) =>
            path === prefix ||
            path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
        ),
    );
    if (violations.length > 0) {
      const reason = `the commit changes paths outside the allowed scope: ${violations.slice(0, 5).join(", ")}`;
      blocked("workspace.scope", reason);
      return context.end("FAILED", reason);
    }
  }
  if (tree.dirty) {
    return context.end(
      "FAILED",
      `step ${step} left a dirty checkout; verify must leave the commit as it found it`,
    );
  }
  // The commit's work.md was compared with the accepted one on this
  // checkout, and the approval will name this commit. A verifier that leaves
  // another HEAD behind (it committed, or checked something else out) would
  // have the reviewer and the approval look at a commit nobody sent.
  const candidate = ledger.state.workspaces[workspace.workspaceId].candidate;
  if (tree.head !== candidate) {
    return context.end(
      "FAILED",
      `step ${step} moved the checkout from ${candidate.slice(0, 7)} to ${tree.head.slice(0, 7)}; a review judges the commit it was given`,
    );
  }
  return blockingFindings;
}

// Verify, then review, each once. Ends the run, or leaves it waiting for the
// person's decision on the commit.
function runSteps(context) {
  const { ledger, workspace, now } = context;
  let blocking = [];
  for (const [index, stepDef] of REVIEW_STEPS.entries()) {
    const started = beginStep(context, stepDef);
    const ran = executeStep(context, stepDef, started);
    const result = recordStepResult(context, stepDef, started, ran);
    if (result === null) {
      return;
    }
    blocking = result;
    ledger.append({
      type: "TRANSITION",
      actor: KERNEL,
      ts: now(),
      data: {
        from: stepDef.id,
        to: REVIEW_STEPS[index + 1]?.id ?? "wait-merge",
        cause: `outcome:${blocking.length > 0 ? "findings-blocking" : "succeeded"}`,
      },
    });
  }
  const lastEvidence = ledger.state.evidence[ledger.state.evidence.length - 1];
  ledger.append({
    type: "HUMAN_REQUESTED",
    actor: KERNEL,
    ts: now(),
    data: {
      transition: "enter-wait-merge",
      subject: {
        candidate: ledger.state.workspaces[workspace.workspaceId].candidate,
        planDigest: ledger.state.run.planDigest,
        evidenceDigest: lastEvidence?.digest ?? "UNVERIFIED",
      },
      reasons:
        blocking.length > 0
          ? [
              `review found ${blocking.length} blocking finding(s); approval is refused until each is dismissed, or a fixed commit is reviewed`,
              ...blocking
                .slice(0, 5)
                .map(
                  (finding) =>
                    `[${finding.severity} ${fingerprintFinding(finding)}] ${finding.summary.slice(0, 200)}`,
                ),
            ]
          : [
              "verified and reviewed with no blocking finding; the decision on this commit is the person's",
            ],
      kind: "final-decision",
    },
  });
}

// A newer review of the same work makes an older one still waiting for a
// decision moot: the person would be approving a commit nobody intends to
// merge. Real incident: two waiting runs sat in a pilot repository's inbox
// for a day after their successor had shipped. This includes a run an
// earlier version left waiting, which nothing else can end.
function supersedeWaitingRuns(repoRoot, workId, newRunId, now) {
  const superseded = [];
  const skipped = [];
  const waiting = (ledger) =>
    !ledger.corruption &&
    ledger.state.run?.work === workId &&
    !ledger.state.terminal &&
    ledger.state.run.status === "WAITING_HUMAN";
  for (const { entry, path } of runLedgers(repoRoot)) {
    if (entry === newRunId || !waiting(EventLedger.open(path))) {
      continue;
    }
    try {
      acquireLock(repoRoot, entry);
    } catch {
      skipped.push({ run: entry, reason: "locked by another process" });
      continue;
    }
    try {
      // Read again under the lock: the run may have been approved or
      // rejected since the scan, and the scan's read must not be written to.
      const ledger = EventLedger.open(path);
      if (!waiting(ledger)) {
        continue;
      }
      ledger.append({
        type: "RUN_TERMINAL",
        actor: KERNEL,
        ts: now(),
        data: {
          status: "SUPERSEDED",
          reason: `superseded by ${newRunId} (same work ${workId})`,
        },
      });
      writeRunRecord({ repoRoot, ledger, ts: now() });
      superseded.push(entry);
    } finally {
      releaseLock(repoRoot, entry);
    }
  }
  return { superseded, skipped };
}

// A review whose process died (killed, host shut down) left its run RUNNING
// with a checkout behind it, and there is nothing to resume: the next review
// of the same work ends it. Called with the repository's run lock held, so
// no run recorded as RUNNING can still be alive. Only this version's reviews:
// a run an earlier version left RUNNING may hold a worktree with work in it.
function settleInterruptedRuns(repoRoot, workId, newRunId, now) {
  const settled = [];
  const interrupted = (ledger) =>
    !ledger.corruption &&
    ledger.state.run?.work === workId &&
    ledger.state.run.pass === true &&
    !ledger.state.terminal &&
    ledger.state.run.status === "RUNNING";
  for (const { entry, path } of runLedgers(repoRoot)) {
    if (entry === newRunId || !interrupted(EventLedger.open(path))) {
      continue;
    }
    try {
      acquireLock(repoRoot, entry);
    } catch {
      continue;
    }
    try {
      const ledger = EventLedger.open(path);
      if (!interrupted(ledger)) {
        continue;
      }
      const state = ledger.state;
      ledger.append({
        type: "RUN_INTERRUPTED",
        actor: KERNEL,
        ts: now(),
        data: { cause: "process lost during a review" },
      });
      if (state.currentStep) {
        ledger.append({
          type: "STEP_FINISHED",
          actor: KERNEL,
          ts: now(),
          data: {
            step: state.currentStep,
            attempt: state.steps[state.currentStep].attempts,
            status: "crashed",
            infra: true,
          },
        });
      }
      ledger.append({
        type: "RUN_TERMINAL",
        actor: KERNEL,
        ts: now(),
        data: {
          status: "CANCELLED",
          reason: `interrupted: the process that ran this review is gone; superseded by ${newRunId}`,
        },
      });
      writeRunRecord({ repoRoot, ledger, ts: now() });
      // Its checkout and branch, when they are still there.
      const bound = state.workspaces[entry];
      if (bound) {
        try {
          withRepoGitLock(repoRoot, () =>
            discardWorkspace({
              repoRoot,
              worktreePath: resolveRepoRef(repoRoot, bound.worktreePath),
              branch: bound.branch,
            }),
          );
        } catch {
          // already gone
        }
      }
      settled.push(entry);
    } finally {
      releaseLock(repoRoot, entry);
    }
  }
  return settled;
}

// One run over one commit. How it ends:
//   FAILED         verify failed, or the commit broke a rule the runner
//                  checks (paths outside allowedPaths, a dirty checkout, a
//                  moved HEAD)
//   CANCELLED      the tooling failed (timeout, crash, exit 75, no review
//                  report, a reviewer that wrote or exited non-zero): no
//                  verdict on the commit
//   WAITING_HUMAN  verified and reviewed: the decision on this commit is the
//                  person's. Blocking findings do not end the run; the merge
//                  checks refuse the approval while they stand
//
// The checkout and its branch are removed before this returns. The subject
// of the decision is a commit, which cannot change, so the approval reads
// the ledger and Git, not a checkout.
export function reviewCommit(options) {
  const { repoRoot, workId, runId, base, commit, planDigest } = options;
  if (!repoRoot || !workId || !runId || !base || !commit) {
    throw new OrchestratorError(
      "repoRoot, workId, runId, base and commit are required",
    );
  }
  for (const { worker } of REVIEW_STEPS) {
    if (!options.adapters?.[worker]) {
      throw new OrchestratorError(
        `no ${worker} configured; a review needs a verifier and a reviewer`,
      );
    }
  }
  // Environment contract first: a missing or too-old binary fails here with
  // a readable cause instead of spending a run on an implicit PATH fact.
  if (options.requires?.length) {
    assertRequires(options.requires);
  }
  const ledgerPath = join(
    repoRoot,
    ".buildbeat",
    "runtime",
    "runs",
    runId,
    "events.jsonl",
  );
  const ledger = EventLedger.open(ledgerPath);
  if (ledger.events.length > 0 || ledger.corruption) {
    throw new OrchestratorError(`run ${runId} already has a ledger`);
  }
  const now = options.now ?? (() => new Date().toISOString());

  return withRunLock(repoRoot, runId, () => {
    const interrupted = settleInterruptedRuns(repoRoot, workId, runId, now);
    const workspace = withRepoGitLock(repoRoot, () =>
      createWorkspace({ repoRoot, runId, base, at: commit }),
    );
    let result;
    let leftover = null;
    try {
      // The checkout is the final word on what the reviewer is shown.
      if (options.verifyCheckout) {
        options.verifyCheckout(workspace.worktreePath);
      }
      const candidate = readback(workspace.worktreePath).head;
      const context = {
        repoRoot,
        adapters: options.adapters,
        now,
        runtimeDir: join(repoRoot, ".buildbeat", "runtime"),
        ledger,
        workspace,
        allowedPaths: options.allowedPaths ?? null,
        envelope: options.envelope ?? null,
        redact: options.redact ?? [],
        end: (status, reason) => {
          ledger.append({
            type: "RUN_TERMINAL",
            actor: KERNEL,
            ts: now(),
            data: { status, reason },
          });
          writeRunRecord({ repoRoot, ledger, ts: now() });
          return null;
        },
      };
      const supersession = supersedeWaitingRuns(repoRoot, workId, runId, now);
      ledger.append({
        type: "RUN_CREATED",
        actor: KERNEL,
        ts: now(),
        run: runId,
        work: workId,
        data: {
          pass: true,
          workflowRef: WORKFLOW_NAME,
          workflowDigest: WORKFLOW_DIGEST,
          base: workspace.base,
          riskPreset: "standard",
          entry: REVIEW_STEPS[0].id,
          planDigest: planDigest ?? "UNVERIFIED",
          intentDigest: "UNVERIFIED",
          ...(options.deliveryChecks
            ? { deliveryChecks: options.deliveryChecks }
            : {}),
          ...(supersession.superseded.length > 0
            ? { supersedes: supersession.superseded }
            : {}),
          ...(options.envelope
            ? {
                envelopeDigest: options.envelope.digest,
                envelopeSource: options.envelope.source,
              }
            : {}),
        },
      });
      ledger.append({
        type: "RUN_STARTED",
        actor: KERNEL,
        ts: now(),
        data: {},
      });
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
      // The candidate is the commit under review, whatever verify says.
      ledger.append({
        type: "CANDIDATE_PINNED",
        actor: KERNEL,
        ts: now(),
        data: {
          workspaceId: workspace.workspaceId,
          base: workspace.base,
          candidate,
        },
      });
      runSteps(context);
      result = {
        runId,
        workId,
        ledgerPath,
        candidate,
        state: ledger.state,
        superseded: supersession.superseded,
        supersedeSkipped: supersession.skipped,
        interrupted,
      };
    } finally {
      try {
        withRepoGitLock(repoRoot, () => discardWorkspace(workspace));
      } catch (error) {
        // Evidence lives in the run directory; a checkout that could not be
        // removed is reported, it does not change what the run found.
        leftover = `${workspace.worktreePath}: ${error.message}`;
      }
    }
    return leftover ? { ...result, checkoutLeft: leftover } : result;
  });
}
