#!/usr/bin/env node
// M1 runtime CLI: run start / status / stop for a single foreground run.
// Deliberately thin — all facts live in the event ledger; this file only
// parses input, wires adapters, and renders derived state.
//
// Iteration 08 adds the human-facing layer the deploy campaign showed was
// missing: elapsed/typical time and live output in `status`, next-reply
// commands wherever a run waits, supersession of stale waits, `gc` for the
// runtime plane, `watch` + outbound notifications so a stopped run reaches
// its human.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createShellAdapter } from "../adapters/shell.js";
import { loadRiskPreset } from "../engine/risk-preset.js";
import {
  DELIVERY_TEXT,
  loadWorkflow,
  deliveryWorkflow,
  nextStep,
} from "../engine/workflow.js";
import { parseYamlSubset } from "../engine/yaml-subset.js";
import { deliveryChecks } from "../policy/policy.js";
import {
  acceptArtifacts,
  adoptCandidate,
  approveRun,
  listInbox,
  rejectRun,
} from "../runtime/decisions.js";
import { checkRequires } from "../runtime/env-contract.js";
import {
  adjudicateFinding,
  findingsAccountRef,
  latestAdjudications,
  readFindingsAccount,
} from "../runtime/findings.js";
import { loadEnvelope, nextAttemptId } from "../runtime/envelope.js";
import { applyGc, planGc } from "../runtime/gc.js";
import {
  artifactStatus,
  computeOverview,
  readJsonl,
  renderOverview,
} from "../runtime/overview.js";
import {
  DEFAULT_STALL_AFTER_MS,
  describeLiveness,
  formatMs,
  tailLive,
} from "../runtime/liveness.js";
import { computeMetrics, renderMetrics } from "../runtime/metrics.js";
import {
  NOTIFY_CONFIG,
  buildNotification,
  dispatchNotification,
  loadNotifyConfig,
  nextReply,
  subscribes,
} from "../runtime/notify.js";
import { writeRunRecord } from "../runtime/run-record.js";
import {
  DEFAULT_REVIEW_ROUNDS_PER_WORK,
  assertRunConfiguration,
  resumeRun,
  startRun,
} from "../runtime/orchestrator.js";
import { toRepoRef } from "../runtime/repo-ref.js";
import { EventLedger } from "../storage/event-ledger.js";
import {
  acquireLock,
  listHeldRunLocks,
  releaseLock,
} from "../workspace/workspace-manager.js";
import {
  checkRunConfigAgainstWorkflow,
  checkRunConfigShape,
  RunConfigError,
} from "./run-config-check.js";

const KERNEL = { kind: "kernel", id: "cli" };

const USAGE = `BuildBeat runtime

Usage:
  buildbeat --version
  buildbeat accept --repo <path> --work <WORK-ID> [--by <name>]
  buildbeat run --config <run-config.yaml> [--run <RUN-ID>] [--new] [--adopt <sha> --by <name>]
  buildbeat status --repo <path> [--work <WORK-ID> | --run <RUN-ID>] [--json]
  buildbeat decide --repo <path> --run <RUN-ID> --action approve|reject --transition <t> [--by <name>] [--reason <text>]
  buildbeat decide --repo <path> --work <WORK-ID> --action accept|dismiss --fingerprint <fp> [--by <name>] [--note <text>]
  buildbeat check --config <run-config.yaml> [--step <id>]
  buildbeat stop --repo <path> --run <RUN-ID> --reason <text>
  buildbeat gc --repo <path> [--apply] [--force]
  buildbeat history --repo <path> --run <RUN-ID> [--verify]

Core legacy command spellings remain aliases; see docs/MIGRATION.md.
check --step executes that worker in the main checkout, outside the evidence ledger.
`;

// Switches may stand alone (`--json`) or take an explicit true/false
// (`--json true`, the older spelling); every other flag needs a value.
const SWITCHES = new Set(["json", "apply", "force", "once", "new", "verify"]);

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || key === "--") {
      throw new Error(`unexpected argument: ${key}`);
    }
    const name = key.slice(2);
    const next = argv[index + 1];
    if (SWITCHES.has(name)) {
      if (next === "true" || next === "false") {
        flags[name] = next;
        index += 1;
      } else {
        flags[name] = "true";
      }
      continue;
    }
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`${key} needs a value`);
    }
    flags[name] = next;
    index += 1;
  }
  return flags;
}

function ledgerPathFor(repo, runId) {
  return join(
    resolve(repo),
    ".buildbeat",
    "runtime",
    "runs",
    runId,
    "events.jsonl",
  );
}

function stallAfterFromFlags(flags, fallbackMs = DEFAULT_STALL_AFTER_MS) {
  if (flags["stall-after-ms"] !== undefined) {
    return Number(flags["stall-after-ms"]);
  }
  if (flags["stall-after"] !== undefined) {
    return Number(flags["stall-after"]) * 60 * 1000;
  }
  return fallbackMs;
}

// The --repo value to print in copyable commands. Inside the project it is
// the relative path the user would type; outside it a placeholder — printing
// a machine-local absolute path is exactly what the output must never do.
function repoLabelFor(repoRoot, typed) {
  if (typed && !isAbsolute(typed)) {
    return typed;
  }
  const rel = relative(process.cwd(), repoRoot);
  if (rel === "") {
    return ".";
  }
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return "<repo-path>";
  }
  return rel;
}

function printNextReply(repoLabel, state) {
  const lines = nextReply({ repoLabel, state });
  if (lines.length === 0) {
    return;
  }
  console.log("next (copy one):");
  for (const line of lines) {
    console.log(`  ${line}`);
  }
}

function printState(state, ledger, view = {}) {
  if (ledger.corruption) {
    console.log(
      `WARNING: ledger corrupted after seq=${ledger.corruption.afterSeq} at line ${ledger.corruption.atLine}: ${ledger.corruption.reason}`,
    );
  }
  if (!state.run) {
    console.log("no run recorded");
    return;
  }
  const liveness =
    view.repoRoot && ledger.events
      ? describeLiveness({
          repoRoot: view.repoRoot,
          runId: state.run.id,
          ledger,
          stallAfterMs: view.stallAfterMs ?? DEFAULT_STALL_AFTER_MS,
        })
      : { steps: {}, inFlight: null };
  console.log(`run: ${state.run.id} (work ${state.run.work})`);
  console.log(`status: ${state.run.status}`);
  console.log(
    `workflow: ${state.run.workflowRef} @ ${state.run.workflowDigest}`,
  );
  for (const [id, workspace] of Object.entries(state.workspaces)) {
    console.log(
      `workspace ${id}: base ${workspace.base.slice(0, 7)} candidate ${workspace.candidate ? workspace.candidate.slice(0, 7) : "(none)"}`,
    );
  }
  for (const [step, info] of Object.entries(state.steps)) {
    const timing = liveness.steps[step];
    let suffix = "";
    if (timing && info.status !== "RUNNING") {
      const parts = [];
      if (timing.lastMs !== null) {
        parts.push(`last ${formatMs(timing.lastMs)}`);
      }
      if (timing.attempts > 1) {
        parts.push(`total ${formatMs(timing.totalMs)}`);
      }
      if (timing.typicalMs !== null) {
        parts.push(`typical ${formatMs(timing.typicalMs)} n=${timing.samples}`);
      }
      if (parts.length > 0) {
        suffix = ` [${parts.join(", ")}]`;
      }
    }
    console.log(
      `step ${step}: ${info.status} (attempts ${info.attempts})${suffix}`,
    );
  }
  const live = liveness.inFlight;
  if (live) {
    const typical =
      live.typicalMs !== null
        ? `, typical ${formatMs(live.typicalMs)} n=${live.samples}`
        : "";
    console.log(
      `in flight: ${live.step} attempt ${live.attempt} since ${live.startedAt} (elapsed ${formatMs(live.elapsedMs)}${typical})`,
    );
    if (live.command) {
      console.log(`  worker: ${live.command}`);
    }
    if (live.lastOutputAt) {
      console.log(
        `  last output: ${live.lastOutputAt} (${formatMs(live.sinceOutputMs)} ago, ${live.bytes} bytes so far)`,
      );
    } else {
      console.log(
        `  last output: (none yet, ${formatMs(live.sinceOutputMs)} since start)`,
      );
    }
    if (live.stalled) {
      console.log(
        `  STALLED: no output for ${formatMs(live.sinceOutputMs)} (threshold ${formatMs(live.stallAfterMs)}); process not killed — inspect, then stop or wait`,
      );
    }
    const tail = tailLive(view.repoRoot, state.run.id, 3);
    for (const line of tail) {
      console.log(`  | ${line.slice(0, 160)}`);
    }
  }
  for (const item of state.evidence) {
    const ref = isAbsolute(item.ref)
      ? "<legacy-absolute-evidence-ref>"
      : item.ref;
    const reused = item.reused ? ` (reused from ${item.reused.run})` : "";
    console.log(
      `evidence [${item.status}/${item.grade}] ${item.kind} ${ref}${reused}`,
    );
  }
  if (state.pendingHuman) {
    console.log(`waiting on human: ${state.pendingHuman.transition}`);
    for (const reason of state.pendingHuman.reasons) {
      console.log(`  reason: ${reason}`);
    }
    if (view.repoLabel) {
      printNextReply(view.repoLabel, state);
    }
  }
  if (state.terminal) {
    console.log(
      `terminal: ${state.terminal.status} (${state.terminal.reason})`,
    );
  }
  if (state.compacted) {
    console.log(`compacted: ${state.compacted.runRecordRef}`);
  }
}

function workerEnvOverrides(worker, env) {
  if (env === undefined || env === null) {
    return {};
  }
  if (typeof env !== "object" || Array.isArray(env)) {
    throw new Error(
      `workers.${worker}.env must be a mapping of variable names to scalar values`,
    );
  }
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`workers.${worker}.env: invalid variable name ${key}`);
    }
    if (value === null || typeof value === "object") {
      throw new Error(`workers.${worker}.env.${key} must be a scalar`);
    }
    out[key] = String(value);
  }
  return out;
}

function loadRunConfig(flags, command) {
  if (!flags.config) {
    throw new Error(`${command} requires --config`);
  }
  const configPath = resolve(flags.config);
  const config = parseYamlSubset(readFileSync(configPath, "utf8"));
  // Validate before anything runs and list every problem at once: the
  // workflow does not depend on repo, so its checks run whenever it loads.
  const problems = checkRunConfigShape(config);
  const configDir = dirname(configPath);
  let workflow = null;
  let workflowPath = null;
  let workflowText = null;
  if (typeof config?.workflow === "string" && config.workflow.trim() !== "") {
    workflowPath = resolve(configDir, config.workflow);
    try {
      workflowText = readFileSync(workflowPath, "utf8");
      workflow = loadWorkflow(workflowPath);
    } catch (error) {
      problems.push(
        `workflow: cannot load ${config.workflow}: ${error.message}`,
      );
    }
  }
  if (config?.workflow === undefined) {
    workflow = deliveryWorkflow();
    workflowPath = null;
  }
  if (workflow) {
    problems.push(...checkRunConfigAgainstWorkflow(config, workflow));
  }
  if (problems.length > 0) {
    throw new RunConfigError(flags.config, problems);
  }
  const repoRoot = resolve(configDir, config.repo);
  workflowText ??= DELIVERY_TEXT;
  const workflowDigest = `sha256:${createHash("sha256").update(workflowText, "utf8").digest("hex")}`;

  const adapters = {};
  for (const [worker, spec] of Object.entries(config.workers ?? {})) {
    // The env posture documented in the adapter guide (allowlist by default,
    // `inheritEnv: true` to opt out, `env:` for explicit injection) must reach
    // the adapter through this loader, or doctor reports one posture while
    // start runs another.
    adapters[worker] = createShellAdapter({
      name: `shell:${worker}`,
      command: spec.command,
      args: spec.args ?? [],
      timeoutMs: spec.timeoutMs,
      inheritEnv: spec.inheritEnv === true,
      env: workerEnvOverrides(worker, spec.env),
    });
  }
  const digestOfWorkFile = (name) => {
    const filePath = join(repoRoot, "delivery", "work", config.work, name);
    if (!existsSync(filePath)) {
      return undefined;
    }
    return `sha256:${createHash("sha256").update(readFileSync(filePath, "utf8"), "utf8").digest("hex")}`;
  };

  const workDir = join(repoRoot, "delivery", "work", config.work);
  const artifact =
    existsSync(join(workDir, "work.md")) || !config.workflow ? "work" : "plan";
  // 3.3.1 ran a workflow config without riskPreset with no artifact gate;
  // keep that (the merge evidence floor is now always on). New configs
  // (no workflow) default to standard.
  const riskPreset =
    config.riskPreset ?? (config.workflow === undefined ? "standard" : "fast");
  const preset = loadRiskPreset(riskPreset, { artifact });
  const safeguards = { ...preset.checks };
  if (config.maxReviewSeverity) {
    if (safeguards.maxSeverity === "P3" && config.maxReviewSeverity === "P2") {
      throw new Error(
        "maxReviewSeverity cannot weaken the legacy controlled safeguards",
      );
    }
    safeguards.maxSeverity = config.maxReviewSeverity;
  }
  const policies = deliveryChecks(safeguards);
  const presetStopAt = [];
  const entry = config.entry ?? workflow.entry;
  // Legacy planner steps would write the artifact inside the run, but an
  // accepted artifact is bound (and checked in base) before the run starts.
  if (
    safeguards.requireAcceptance &&
    ["intent", "spec", "plan"].includes(entry)
  ) {
    throw new Error(
      `entry ${entry} starts at the retired planner steps, but risk preset ${riskPreset} binds an accepted ${artifact}.md before the run starts; write, accept and commit ${artifact}.md, then set entry: build (docs/MIGRATION.md)`,
    );
  }

  if (
    config.reviewTriage !== undefined &&
    !["required", "off"].includes(config.reviewTriage)
  ) {
    throw new Error(
      `reviewTriage must be "required" or "off", got: ${config.reviewTriage}`,
    );
  }
  if (
    config.supersede !== undefined &&
    !["waiting", "off"].includes(config.supersede)
  ) {
    throw new Error(
      `supersede must be "waiting" or "off", got: ${config.supersede}`,
    );
  }
  if (config.stallAfterMs !== undefined && !(Number(config.stallAfterMs) > 0)) {
    throw new Error(
      `stallAfterMs must be a positive number, got: ${config.stallAfterMs}`,
    );
  }
  // budgets: run config beats the preset (a preset cap that could not be
  // raised per run once ended a pilot's shipped candidates as CANCELLED
  // runs).
  const budgets = {};
  if (config.budgets !== undefined) {
    if (
      !config.budgets ||
      typeof config.budgets !== "object" ||
      Array.isArray(config.budgets)
    ) {
      throw new Error("budgets must be a map");
    }
    for (const key of Object.keys(config.budgets)) {
      if (!["maxAttempts", "reviewRoundsPerWork"].includes(key)) {
        throw new Error(
          `unknown budgets key: ${key} (known: maxAttempts, reviewRoundsPerWork)`,
        );
      }
    }
    if (config.budgets.maxAttempts !== undefined) {
      const map = config.budgets.maxAttempts;
      if (!map || typeof map !== "object" || Array.isArray(map)) {
        throw new Error(
          "budgets.maxAttempts must be a map of step -> positive integer",
        );
      }
      budgets.maxAttempts = {};
      for (const [step, value] of Object.entries(map)) {
        if (!workflow.stepIds.has(step)) {
          throw new Error(`budgets.maxAttempts.${step}: step not in workflow`);
        }
        if (!Number.isInteger(Number(value)) || Number(value) < 1) {
          throw new Error(
            `budgets.maxAttempts.${step} must be a positive integer, got: ${value}`,
          );
        }
        budgets.maxAttempts[step] = Number(value);
      }
    }
    if (config.budgets.reviewRoundsPerWork !== undefined) {
      const value = Number(config.budgets.reviewRoundsPerWork);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error(
          `budgets.reviewRoundsPerWork must be a positive integer, got: ${config.budgets.reviewRoundsPerWork}`,
        );
      }
      budgets.reviewRoundsPerWork = value;
    }
  }
  const cache = {};
  for (const [step, mode] of Object.entries(config.cache ?? {})) {
    if (mode !== "tree") {
      throw new Error(`cache.${step} must be "tree", got: ${mode}`);
    }
    if (!workflow.stepIds.has(step)) {
      throw new Error(`cache.${step}: step not in workflow`);
    }
    cache[step] = mode;
  }
  const redact = (config.redact ?? []).map((pattern) => {
    try {
      return new RegExp(String(pattern), "g");
    } catch {
      throw new Error(
        `redact pattern is not a valid regular expression: ${pattern}`,
      );
    }
  });
  const envelope = loadEnvelope(
    config,
    configDir,
    Object.keys(config.workers ?? {}),
  );

  return {
    envelope,
    cache,
    redact,
    repoRoot,
    workflow,
    workflowDigest,
    workId: config.work,
    runId: config.run,
    base: config.base ?? "HEAD",
    entry,
    stopAt: config.stopAt ?? presetStopAt ?? [],
    adapters,
    adapterConfigs: config.workers ?? {},
    policies,
    deliveryChecks: safeguards,
    workArtifact: artifact,
    riskPreset,
    maxAttemptsPerStep: config.maxAttemptsPerStep ?? 4,
    budgets,
    stepTimeoutMs: config.stepTimeoutMs,
    allowedPaths: config.allowedPaths,
    requires: config.requires ?? [],
    reviewTriage: config.reviewTriage === "required" ? "required" : null,
    supersede: config.supersede ?? "waiting",
    parallel: config.parallel === true,
    stallAfterMs:
      config.stallAfterMs !== undefined
        ? Number(config.stallAfterMs)
        : DEFAULT_STALL_AFTER_MS,
    planDigest: digestOfWorkFile(`${artifact}.md`),
    intentDigest: digestOfWorkFile("intent.md"),
  };
}

// Notification config is optional and never fatal for a run: a broken file
// is reported once and the run proceeds without outbound messages.
function notifyConfigFor(repoRoot) {
  try {
    return { config: loadNotifyConfig(repoRoot), error: null };
  } catch (error) {
    return { config: null, error: error.message };
  }
}

async function notifyForState(repoRoot, repoLabel, state) {
  const { config, error } = notifyConfigFor(repoRoot);
  if (error) {
    console.log(`notify: config ignored (${error})`);
    return;
  }
  if (!config || !state.run) {
    return;
  }
  const kinds = [];
  if (state.pendingHuman && state.run.status === "WAITING_HUMAN") {
    kinds.push("HUMAN_REQUESTED");
  }
  if (state.terminal) {
    kinds.push("RUN_TERMINAL");
  }
  for (const kind of kinds) {
    if (!subscribes(config, kind)) {
      continue;
    }
    const results = await dispatchNotification(
      config,
      buildNotification(kind, { repoLabel, state }),
      { repoRoot },
    );
    for (const row of results) {
      const outcome = row.ok
        ? "sent"
        : row.skipped
          ? `skipped (${row.error})`
          : `FAILED (${row.error})`;
      console.log(`notify ${kind} -> ${row.channel}: ${outcome}`);
    }
  }
}

// A stall watcher is a separate detached process: the orchestrator blocks in
// spawnSync while a worker runs, so it cannot look at the clock itself. The
// watcher exits on its own once the run is no longer RUNNING or the parent
// process is gone.
function spawnStallWatcher(repoRoot, runId, stallAfterMs) {
  const { config } = notifyConfigFor(repoRoot);
  if (!subscribes(config, "STALLED")) {
    return false;
  }
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      "watch",
      "--repo",
      repoRoot,
      "--run",
      runId,
      "--stall-after-ms",
      String(stallAfterMs),
      "--parent",
      String(process.pid),
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  return true;
}

async function commandStart(flags, options = loadRunConfig(flags, "start")) {
  if (options.deliveryChecks.requireAcceptance) {
    const ref = `delivery/work/${options.workId}/${options.workArtifact}.md`;
    // Match the bytes Git checks out (EOL/smudge filters), not its normalized blob.
    let committed;
    try {
      committed = execFileSync(
        "git",
        [
          "-C",
          options.repoRoot,
          "cat-file",
          "--filters",
          `${options.base}:${ref}`,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch {
      throw new Error(
        `commit ${ref} into the selected base before starting; workers read that isolated checkout`,
      );
    }
    const digest = `sha256:${createHash("sha256").update(committed, "utf8").digest("hex")}`;
    if (digest !== options.planDigest)
      throw new Error(
        `the selected base contains a different ${ref}; commit the accepted work artifact before starting`,
      );
  }

  if (flags.attempt !== undefined) {
    if (flags.attempt !== "new") {
      throw new Error(
        `--attempt must be "new" (auto-number the next run of this family), got: ${flags.attempt}`,
      );
    }
    // The run config names the family; the kernel numbers the attempt. One
    // config per work, not one per retry (the campaign hand-numbered -01..-30).
    options.runId = nextAttemptId(
      options.repoRoot,
      options.workId,
      options.runId,
    );
    console.log(`attempt: ${options.runId}`);
  }
  if (options.envelope) {
    console.log(
      `envelope: ${options.envelope.source} (${Object.keys(options.envelope.prompts).join(", ")}) ${options.envelope.digest}`,
    );
  }
  if (process.stdout.isTTY) {
    // Run launch discipline (real incident: a host-tool timeout killed a
    // verify worker mid-run): anything longer than minutes belongs in a
    // detached process, not an interactive foreground shell.
    console.log(
      "tip: long runs should be started detached (nohup/setsid); interactive shells die with their host",
    );
  }
  const watching = spawnStallWatcher(
    options.repoRoot,
    options.runId,
    options.stallAfterMs,
  );
  if (watching) {
    console.log(
      `stall watcher armed (no output for ${formatMs(options.stallAfterMs)} notifies STALLED)`,
    );
  }
  let result;
  try {
    result = startRun(options);
  } catch (error) {
    if (/another run is active/.test(error.message ?? "")) {
      // Say who holds the repository and how to watch it: a pilot session
      // waited 3h23m behind another work's run with nothing but the lock
      // message to go on ("二十分钟了哎").
      const label = repoLabelFor(options.repoRoot);
      const holders = listHeldRunLocks(options.repoRoot);
      if (holders.length === 0) {
        // A dead owner would already have been reclaimed; the error below
        // names who holds the lock and what to do.
        console.error(
          "blocked by: the active-run lock alone (no run lock beside it); its owner is named below",
        );
      }
      for (const holder of holders) {
        const ledgerPath = join(
          options.repoRoot,
          ".buildbeat",
          "runtime",
          "runs",
          holder,
          "events.jsonl",
        );
        let summary = "(no ledger found)";
        if (existsSync(ledgerPath)) {
          const ledger = EventLedger.open(ledgerPath);
          const state = ledger.state;
          const step = state.currentStep
            ? `step ${state.currentStep} attempt ${state.steps[state.currentStep]?.attempts ?? "?"}`
            : "between steps";
          const since = ledger.events[ledger.events.length - 1]?.ts;
          summary = `${state.run?.work ?? "?"} ${state.run?.status ?? "?"} ${step}${since ? `, last event ${formatMs(Date.now() - Date.parse(since))} ago` : ""}`;
        }
        console.error(`blocked by ${holder}: ${summary}`);
        console.error(
          `  watch it: buildbeat status --repo ${label} --run ${holder}`,
        );
      }
      console.error(
        "queue position: next after the holder(s) above stop or wait on a human (by default one run drives a repository at a time; works whose run configs both set parallel: true can drive together)",
      );
    }
    throw error;
  }
  const repoLabel = repoLabelFor(options.repoRoot);
  for (const run of result.superseded ?? []) {
    console.log(
      `superseded ${run} (was waiting on a human for the same work; now SUPERSEDED)`,
    );
  }
  for (const row of result.supersedeSkipped ?? []) {
    console.log(`could not supersede ${row.run}: ${row.reason}`);
  }
  console.log(`ledger: ${toRepoRef(options.repoRoot, result.ledgerPath)}`);
  const ledger = EventLedger.open(result.ledgerPath);
  printState(ledger.state, ledger, {
    repoRoot: options.repoRoot,
    repoLabel,
    stallAfterMs: options.stallAfterMs,
  });
  await notifyForState(options.repoRoot, repoLabel, ledger.state);
}

// A run family is the configured run id plus its numbered attempts
// (<run>-01, <run>-02, ...); a longer id that merely shares the prefix
// belongs to another family.
function inRunFamily(family, id) {
  const escaped = family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return id === family || new RegExp(`^${escaped}-\\d{2,}$`).test(id);
}

// Resolve only from runtime ledgers. Reading candidates does not acquire
// their locks; resumeRun still owns the lock and freshness checks.
function resolveResumeRun(repoRoot, family, explicitRun) {
  if (explicitRun !== undefined) {
    if (!inRunFamily(family, explicitRun)) {
      throw new Error(
        `--run ${explicitRun} is not in run family ${family} of this config`,
      );
    }
    if (!existsSync(ledgerPathFor(repoRoot, explicitRun))) {
      throw new Error(`no ledger for run ${explicitRun}`);
    }
    return explicitRun;
  }
  if (existsSync(ledgerPathFor(repoRoot, family))) {
    return family;
  }
  const runsDir = join(repoRoot, ".buildbeat", "runtime", "runs");
  const runs = (existsSync(runsDir) ? readdirSync(runsDir) : [])
    .filter(
      (id) =>
        id !== family &&
        inRunFamily(family, id) &&
        existsSync(ledgerPathFor(repoRoot, id)),
    )
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((id) => ({
      id,
      state: EventLedger.open(ledgerPathFor(repoRoot, id)).state,
    }));
  const open = runs.filter(({ state }) => !state.terminal);
  if (open.length === 1) {
    console.log(`resuming ${open[0].id} (the open run of family ${family})`);
    return open[0].id;
  }
  if (open.length === 0) {
    const latest = runs.at(-1);
    throw new Error(
      `no open run in family ${family}; ${latest ? `latest run ${latest.id}: ${latest.state.terminal.status}` : "no ledgers found"}; use --run <RUN-ID> to select an existing run explicitly, or run --new to start another attempt`,
    );
  }
  throw new Error(
    `multiple open runs in family ${family}: ${open.map(({ id }) => id).join(", ")}; use --run <RUN-ID> to select one`,
  );
}

async function commandResume(
  flags,
  options = loadRunConfig(flags, "resume"),
) {
  options.runId = resolveResumeRun(options.repoRoot, options.runId, flags.run);
  const prior = EventLedger.open(
    ledgerPathFor(options.repoRoot, options.runId),
  );
  if (
    prior.state.run &&
    !prior.state.terminal &&
    !prior.state.run.deliveryChecks
  ) {
    throw new Error(
      "legacy active run: finish or cancel with its 3.3.1 runtime; new attempts can use this version (docs/MIGRATION.md)",
    );
  }
  // A finished run only reports its outcome: a config migrated since it ran
  // must not turn "already terminal" into a configuration error.
  if (!prior.state.terminal) {
    assertRunConfiguration(prior.state, options);
  }
  if (
    flags.adopt !== undefined &&
    prior.state.run?.deliveryChecks &&
    (options.planDigest ?? "UNVERIFIED") !== prior.state.run.planDigest
  ) {
    throw new Error(
      "work artifact changed; cannot adopt a candidate under a different scope",
    );
  }
  if (flags.adopt !== undefined) {
    const resumeAt = nextStep(options.workflow, "fix", "succeeded") ?? "verify";
    const adopted = adoptCandidate(options.repoRoot, options.runId, {
      sha: flags.adopt,
      by: flags.by ?? "human",
      resumeAt,
    });
    console.log(
      `adopted ${adopted.adopted} as candidate (${adopted.decisionRef}, answers ${adopted.transition}); resuming at ${adopted.resumeAt}`,
    );
  }
  const watching = spawnStallWatcher(
    options.repoRoot,
    options.runId,
    options.stallAfterMs,
  );
  if (watching) {
    console.log(
      `stall watcher armed (no output for ${formatMs(options.stallAfterMs)} notifies STALLED)`,
    );
  }
  const result = resumeRun(options);
  const repoLabel = repoLabelFor(options.repoRoot);
  if (!result.resumed) {
    console.log(`nothing to resume: ${result.reason}`);
    if (result.state?.terminal) {
      console.log(
        "start another attempt with: buildbeat run --config <run-config.yaml> --new",
      );
    }
  }
  console.log(`ledger: ${toRepoRef(options.repoRoot, result.ledgerPath)}`);
  const ledger = EventLedger.open(result.ledgerPath);
  printState(ledger.state, ledger, {
    repoRoot: options.repoRoot,
    repoLabel,
    stallAfterMs: options.stallAfterMs,
  });
  if (result.resumed) {
    await notifyForState(options.repoRoot, repoLabel, ledger.state);
  }
}

function pendingFor(repoRoot, work) {
  return listInbox(repoRoot).filter(
    (row) => !work || row.work === work || row.corrupted,
  );
}

function commandInbox(flags, rows = null) {
  if (!flags.repo) {
    throw new Error("inbox requires --repo");
  }
  const repoRoot = resolve(flags.repo);
  rows ??= pendingFor(repoRoot, flags.work);
  if (rows.length === 0) {
    console.log("inbox empty: no runs waiting on a human");
    return;
  }
  const sorted = [...rows].sort((a, b) =>
    `${a.work ?? ""}${a.run}`.localeCompare(`${b.work ?? ""}${b.run}`),
  );
  let lastWork = null;
  for (const row of sorted) {
    if (row.corrupted) {
      console.log(
        `${row.run}: LEDGER CORRUPTED after seq=${row.corrupted.afterSeq} (${row.corrupted.reason})`,
      );
      continue;
    }
    if (row.work !== lastWork) {
      console.log(`work ${row.work}:`);
      lastWork = row.work;
    }
    const ledger = EventLedger.open(ledgerPathFor(repoRoot, row.run));
    const requested = [...ledger.events]
      .reverse()
      .find((event) => event.type === "HUMAN_REQUESTED");
    const age = requested
      ? formatMs(Date.now() - Date.parse(requested.ts))
      : "?";
    console.log(
      `  ${row.run} [${row.kind}] ${row.transition} — waiting ${age}${requested ? ` (since ${requested.ts})` : ""}`,
    );
    console.log(`    candidate: ${row.subject.candidate}`);
    console.log(`    planDigest: ${row.subject.planDigest}`);
    console.log(`    evidenceDigest: ${row.subject.evidenceDigest}`);
    for (const reason of row.reasons) {
      console.log(`    reason: ${reason}`);
    }
    for (const line of nextReply({
      repoLabel: repoLabelFor(repoRoot, flags.repo),
      state: ledger.state,
    })) {
      console.log(`    next: ${line}`);
    }
  }
}

function commandApprove(flags) {
  if (!flags.repo || !flags.run || !flags.transition) {
    throw new Error("approve requires --repo, --run and --transition");
  }
  const prior = EventLedger.open(ledgerPathFor(resolve(flags.repo), flags.run));
  if (
    prior.state.run &&
    !prior.state.terminal &&
    !prior.state.run.deliveryChecks
  ) {
    throw new Error(
      "legacy active run: approve with its original 3.3.1 runtime (docs/MIGRATION.md)",
    );
  }
  const policies = flags.config ? loadRunConfig(flags, "approve").policies : [];
  const result = approveRun(resolve(flags.repo), flags.run, {
    by: flags.by ?? "human",
    transition: flags.transition,
    policies,
  });
  if (!result.approved) {
    console.log(
      "NOT approved: the subject changed since the request; a refreshed request was filed",
    );
    console.log(`  new candidate: ${result.subject.candidate}`);
    return;
  }
  console.log(`approved ${result.transition} as ${result.decisionRef}`);
  console.log(`  candidate: ${result.subject.candidate}`);
  console.log(`  planDigest: ${result.subject.planDigest}`);
  for (const warning of result.warnings ?? []) {
    console.log(`  advisory: ${warning}`);
  }
  if (result.terminal) {
    console.log(
      "run is terminal: SUCCEEDED (merge itself stays a manual external action)",
    );
  } else {
    console.log(
      `decision recorded; continue with: buildbeat run --config <run-config.yaml> --run ${flags.run}`,
    );
  }
}

function commandReject(flags) {
  if (!flags.repo || !flags.run) {
    throw new Error("reject requires --repo and --run");
  }
  const result = rejectRun(resolve(flags.repo), flags.run, {
    by: flags.by ?? "human",
    transition: flags.transition,
    reason: flags.reason,
  });
  console.log(`rejected as ${result.decisionRef}; run cancelled and compacted`);
}

function commandAccept(flags) {
  if (!flags.repo || !flags.work) {
    throw new Error("accept requires --repo and --work");
  }
  const workDir = join(resolve(flags.repo), "delivery", "work", flags.work);
  const selection =
    flags.artifact ??
    (existsSync(join(workDir, "work.md")) ? "work" : "intent,plan");
  const artifacts = String(selection)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const results = acceptArtifacts(resolve(flags.repo), flags.work, artifacts, {
    by: flags.by ?? "human",
  });
  for (const result of results) {
    console.log(`accepted ${result.artifact} as ${result.decisionRef}`);
    console.log(`  digest: ${result.digest}`);
  }
  console.log(
    "  note: editing an artifact after acceptance makes its acceptance stale",
  );
}

function commandDoctor(flags) {
  const options = loadRunConfig(flags, "doctor");
  console.log(`risk preset: ${options.riskPreset}`);
  console.log(
    `stopAt boundaries: ${options.stopAt.length > 0 ? options.stopAt.join(", ") : "(none)"}`,
  );
  console.log("policies (declared vs actually achieved enforcement):");
  if (options.policies.length === 0) {
    console.log("  (none configured)");
  }
  for (const policy of options.policies) {
    let actual;
    if (policy.enforcement === "ADVISORY") {
      actual = "ADVISORY (prompt-level only; nothing stops a worker)";
    } else if (policy.enforcement === "SERVER_ENFORCED") {
      actual =
        "UNVERIFIED (branch protection/CI cannot be verified from here; not claiming it)";
    } else if (policy.type === "transition") {
      actual = "LOCAL_ENFORCED (approve gate refuses the stamp)";
    } else {
      actual = "LOCAL_ENFORCED (runner gate before/after the step)";
    }
    console.log(
      `  ${policy.name}: type=${policy.type} appliesTo=${policy.appliesTo} declared=${policy.enforcement} actual=${actual}`,
    );
  }
  console.log("worker isolation:");
  for (const [worker, spec] of Object.entries(options.adapterConfigs)) {
    const mode =
      spec.inheritEnv === true
        ? "WARNING inherit (worker sees the full host env; credential isolation is ADVISORY only)"
        : "env allowlist (host credential env vars withheld from the worker)";
    console.log(`  ${worker}: ${mode}`);
  }
  let remotes = [];
  try {
    remotes = execFileSync("git", ["-C", options.repoRoot, "remote"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    remotes = [];
  }
  if (remotes.length > 0) {
    console.log(
      `push protection: worktree pushurl override is applied at workspace creation for: ${remotes.join(", ")}`,
    );
  } else {
    console.log(
      "push protection: repository has no remotes (nothing to protect)",
    );
  }
  console.log(
    "kernel capabilities: merge/deploy/publish have no call path in the runner (invariant 20)",
  );
  const budgetLines = [];
  const reviewRounds =
    options.budgets.reviewRoundsPerWork ?? DEFAULT_REVIEW_ROUNDS_PER_WORK;
  for (const step of options.workflow.steps) {
    if (!step.worker) {
      continue;
    }
    const fromRun = options.budgets.maxAttempts?.[step.id];
    const fromPreset = options.workflow.budgets?.maxAttempts?.[step.id];
    const review = step.id === "review" || step.worker === "reviewer";
    const effective =
      fromRun ??
      fromPreset ??
      (review ? reviewRounds : options.maxAttemptsPerStep);
    const source =
      fromRun !== undefined
        ? "run config"
        : fromPreset !== undefined
          ? "workflow preset"
          : review
            ? "reviewRoundsPerWork"
            : "default";
    budgetLines.push(`${step.id}=${effective} (${source})`);
  }
  console.log(
    `budgets (maxAttempts per step; approving resume-<step> after exhaustion grants +1): ${budgetLines.join(", ")}`,
  );
  console.log(
    `budgets.reviewRoundsPerWork: ${reviewRounds}${options.budgets.reviewRoundsPerWork === undefined ? " (default)" : ""} (counted across every run of the work, superseded ones included)`,
  );
  // Same preconditions start's first gate will read (real incident, twice:
  // doctor passed, start stopped at build because plan.md was not mirrored
  // into the repository the run was started in).
  const workDir = join(options.repoRoot, "delivery", "work", options.workId);
  const decisions = readJsonl(join(workDir, "decisions.jsonl"));
  console.log(
    `work artifacts in this repository (delivery/work/${options.workId}):`,
  );
  const artifactState = {};
  for (const artifact of options.workArtifact === "work"
    ? ["work"]
    : ["intent", "plan"]) {
    const status = artifactStatus(workDir, decisions, artifact);
    artifactState[artifact] = status;
    const label = !status.exists
      ? "MISSING"
      : status.stale
        ? "accepted but edited since (stale)"
        : status.accepted
          ? `accepted${status.by ? ` by ${status.by}` : ""}`
          : "draft (not accepted)";
    console.log(`  ${artifact}.md: ${label}`);
  }
  for (const policy of options.policies) {
    for (const artifact of policy.kind === "artifact"
      ? [policy.artifact]
      : []) {
      const status =
        artifactState[artifact] ?? artifactStatus(workDir, decisions, artifact);
      if (!status.accepted) {
        console.log(
          `  WARNING policy ${policy.name} (${policy.type} ${policy.appliesTo}) needs an accepted ${artifact}.md; start will stop at ${policy.appliesTo}` +
            (!status.exists
              ? " (file missing here: mirror it into this repository, then accept)"
              : " (accept it first)"),
        );
      }
    }
  }
  if (options.requires.length > 0) {
    console.log("environment contract (requires):");
    const check = checkRequires(options.requires);
    for (const row of check.checked) {
      console.log(
        `  ${row.command}: OK${row.version ? ` (${row.version})` : ""}`,
      );
    }
    for (const problem of check.problems) {
      console.log(`  PROBLEM ${problem}`);
    }
  } else {
    console.log(
      "environment contract: none declared (implicit PATH facts stay unchecked)",
    );
  }
  console.log(
    `supersede: ${options.supersede} (new run for the same work ${options.supersede === "off" ? "leaves" : "supersedes"} older WAITING_HUMAN runs)`,
  );
  console.log(
    options.parallel
      ? "concurrency: parallel (runs of other works with parallel: true may drive at the same time; runs of this work stay exclusive; verifiers must not share fixed ports or databases)"
      : "concurrency: exclusive (default: one driving run per repository; set parallel: true to drive alongside other works)",
  );
  console.log(
    `stall threshold: ${formatMs(options.stallAfterMs)} without worker output`,
  );
  const { config: notify, error: notifyError } = notifyConfigFor(
    options.repoRoot,
  );
  if (notifyError) {
    console.log(`notify: PROBLEM ${notifyError}`);
  } else if (!notify) {
    console.log(
      `notify: none (${NOTIFY_CONFIG} absent; a waiting run reaches nobody until someone runs inbox)`,
    );
  } else {
    console.log("notify channels:");
    for (const channel of notify.channels) {
      const urlState = process.env[channel.urlEnv]
        ? "url env set"
        : `WARNING env ${channel.urlEnv} not set in this shell`;
      console.log(
        `  ${channel.id}: type=${channel.type} events=${channel.events.join(",")} (${urlState})`,
      );
    }
  }
}

// Preflight: run one step's configured worker command directly in the main
// checkout — no worktree, no ledger, no evidence. Minute-level dry loops
// against the first failure boundary before a full run is what turned the
// deploy campaign's idle phase around; the output is a dry signal only and a
// Run must reproduce anything it finds.
function commandPreflight(flags) {
  const options = loadRunConfig(flags, "preflight");
  if (!flags.step) {
    throw new Error("preflight requires --step");
  }
  const stepDef = options.workflow.steps.find(
    (candidate) => candidate.id === flags.step,
  );
  if (!stepDef) {
    throw new Error(`step not in workflow: ${flags.step}`);
  }
  const spec = stepDef.worker ? options.adapterConfigs[stepDef.worker] : null;
  if (!spec) {
    throw new Error(
      `step ${flags.step} has no configured worker command to preflight`,
    );
  }
  if (options.requires.length > 0) {
    const check = checkRequires(options.requires);
    for (const problem of check.problems) {
      console.log(`requires PROBLEM: ${problem}`);
    }
  }
  const fill = (text) =>
    String(text)
      .replaceAll("{workspace}", options.repoRoot)
      .replaceAll("{step}", flags.step)
      .replaceAll("{worker}", stepDef.worker);
  const args = (spec.args ?? []).map(fill);
  let env;
  if (spec.inheritEnv === true) {
    env = { ...process.env };
  } else {
    env = {};
    for (const key of [
      "PATH",
      "HOME",
      "LANG",
      "LC_ALL",
      "TMPDIR",
      "TERM",
      "USER",
      "SHELL",
    ]) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }
  }
  Object.assign(env, spec.env ?? {});
  env.BUILDBEAT_PREFLIGHT = "1";
  console.log(
    `PREFLIGHT (dry signal, never evidence): step ${flags.step} -> ${spec.command} ${args.join(" ")}`,
  );
  console.log(
    `cwd: main checkout (no worktree, no ledger, no evidence written)`,
  );
  const result = spawnSync(spec.command, args, {
    cwd: options.repoRoot,
    stdio: "inherit",
    env,
    timeout: spec.timeoutMs,
  });
  if (result.error) {
    throw new Error(
      `preflight could not run the command: ${result.error.message}`,
    );
  }
  const exitCode = result.status ?? 1;
  console.log(
    `preflight exit=${exitCode} — a Run must reproduce this before it counts`,
  );
  process.exitCode = exitCode;
}

function commandFindings(rest) {
  const [sub, ...args] = rest;
  const flags = parseFlags(args);
  if (sub === "list") {
    if (!flags.repo || !flags.work) {
      throw new Error("findings list requires --repo and --work");
    }
    const rows = readFindingsAccount(resolve(flags.repo), flags.work);
    const findings = rows.filter((row) => row.kind === "finding");
    if (findings.length === 0) {
      console.log(`no recorded findings (${findingsAccountRef(flags.work)})`);
      return;
    }
    const adjudicated = latestAdjudications(rows);
    for (const row of findings) {
      const verdict = adjudicated.get(row.fingerprint);
      const status = verdict ? `${verdict.action} by ${verdict.by}` : "open";
      const reRaised = row.reRaised ? " RE-RAISED" : "";
      console.log(
        `[${row.severity} ${row.fingerprint}] (${status})${reRaised} ${row.summary}`,
      );
    }
  } else if (sub === "adjudicate") {
    if (!flags.repo || !flags.work || !flags.fingerprint || !flags.action) {
      throw new Error(
        "findings adjudicate requires --repo, --work, --fingerprint and --action",
      );
    }
    const row = adjudicateFinding(resolve(flags.repo), flags.work, {
      fingerprint: flags.fingerprint,
      action: flags.action,
      by: flags.by,
      note: flags.note,
    });
    console.log(
      `adjudicated ${row.fingerprint} -> ${row.action} ([${row.severity}] ${row.summary})`,
    );
    if (row.action === "dismiss") {
      console.log(
        "dismissed: this fingerprint no longer blocks; an escalated severity reopens on its own",
      );
    }
  } else {
    throw new Error(
      `findings subcommand must be list|adjudicate, got: ${sub ?? "(none)"}`,
    );
  }
}

function commandEvents(flags) {
  if (!flags.repo || !flags.run) {
    throw new Error("events requires --repo and --run");
  }
  const ledger = EventLedger.open(ledgerPathFor(flags.repo, flags.run));
  for (const event of ledger.events) {
    const detail =
      event.data.step ??
      event.data.transition ??
      event.data.policy ??
      event.data.status ??
      "";
    console.log(`${event.seq}\t${event.ts}\t${event.type}\t${detail}`);
  }
  if (ledger.corruption) {
    console.log(
      `WARNING: ledger corrupted after seq=${ledger.corruption.afterSeq} at line ${ledger.corruption.atLine}: ${ledger.corruption.reason}`,
    );
  }
}

function commandReplay(flags) {
  if (!flags.repo || !flags.run) {
    throw new Error("replay requires --repo and --run");
  }
  const ledger = EventLedger.open(ledgerPathFor(flags.repo, flags.run));
  if (ledger.corruption) {
    console.log(
      `chain BROKEN after seq=${ledger.corruption.afterSeq}: ${ledger.corruption.reason}; ` +
        "state below reflects the valid prefix only",
    );
  } else {
    console.log(
      `chain OK: ${ledger.events.length} events verified (digest/prev/seq)`,
    );
  }
  printState(ledger.state, { corruption: null }, {});
}

function commandMetrics(flags) {
  if (!flags.repo) {
    throw new Error("metrics requires --repo");
  }
  const summary = computeMetrics(resolve(flags.repo));
  if (flags.json === "true") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(renderMetrics(summary));
}

function commandStatus(flags) {
  if (!flags.repo) throw new Error("status requires --repo");
  const repoRoot = resolve(flags.repo);
  if (flags.run && flags.work)
    throw new Error("status: choose --run or --work");
  if (!flags.run) {
    const rows = computeOverview(repoRoot, {
      work: flags.work ?? null,
      repoLabel: repoLabelFor(repoRoot, flags.repo),
    });
    const pending = pendingFor(repoRoot, flags.work);
    if (flags.json === "true")
      console.log(
        JSON.stringify(
          {
            works: rows,
            pending,
            metrics: flags.work ? null : computeMetrics(repoRoot),
          },
          null,
          2,
        ),
      );
    else {
      console.log(renderOverview(rows));
      if (pending.length) commandInbox(flags, pending);
      if (!flags.work) console.log(renderMetrics(computeMetrics(repoRoot)));
    }
    return;
  }
  const path = ledgerPathFor(repoRoot, flags.run);
  if (!existsSync(path))
    throw new Error(
      `no runtime ledger for ${flags.run}; use status --work to read archived records`,
    );
  const ledger = EventLedger.open(path);
  if (flags.json === "true")
    console.log(
      JSON.stringify(
        { state: ledger.state, corruption: ledger.corruption },
        null,
        2,
      ),
    );
  else
    printState(ledger.state, ledger, {
      repoRoot,
      repoLabel: repoLabelFor(repoRoot, flags.repo),
      stallAfterMs: stallAfterFromFlags(flags),
    });
}

async function commandRun(flags) {
  const options = loadRunConfig(flags, "run");
  if (flags.new === "true" && (flags.run || flags.adopt))
    throw new Error("--new cannot be combined with --run or --adopt");
  if (flags.new === "true")
    return commandStart({ ...flags, attempt: "new" }, options);
  if (flags.run || flags.adopt) return commandResume(flags, options);
  // Resume an existing family, including its exact ID. Never interpret an
  // ambiguous, corrupt, or terminal run as permission to start another one.
  const dir = join(options.repoRoot, ".buildbeat", "runtime", "runs");
  const found =
    existsSync(dir) &&
    readdirSync(dir).some(
      (id) =>
        inRunFamily(options.runId, id) &&
        existsSync(ledgerPathFor(options.repoRoot, id)),
    );
  const records = join(
    options.repoRoot,
    "delivery",
    "work",
    options.workId,
    "runs",
  );
  const archived =
    existsSync(records) &&
    readdirSync(records).some((id) => inRunFamily(options.runId, id));
  if (found) return commandResume(flags, options);
  if (archived)
    throw new Error(
      "this work has archived runs; inspect status, then use --new explicitly for a new attempt",
    );
  return commandStart({ ...flags, attempt: "new" }, options);
}

function commandDecide(flags) {
  if (flags.action === "approve") return commandApprove(flags);
  if (flags.action === "reject") return commandReject(flags);
  if (["accept", "dismiss"].includes(flags.action) && flags.fingerprint) {
    if (!flags.repo || !flags.work)
      throw new Error("finding decisions require --repo and --work");
    const result = adjudicateFinding(resolve(flags.repo), flags.work, {
      fingerprint: flags.fingerprint,
      action: flags.action,
      by: flags.by ?? "human",
      note: flags.note,
    });
    console.log(JSON.stringify(result));
    return;
  }
  throw new Error(
    "decide requires --action approve|reject, or accept|dismiss with --work and --fingerprint",
  );
}

function commandStop(flags) {
  if (!flags.repo || !flags.run) {
    throw new Error("stop requires --repo and --run");
  }
  const repoRoot = resolve(flags.repo);
  if (!existsSync(ledgerPathFor(repoRoot, flags.run))) {
    throw new Error(`no ledger for run ${flags.run}`);
  }
  // Read and decide under the run lock: a ledger read before it may be
  // stale by the time RUN_TERMINAL is written.
  acquireLock(repoRoot, flags.run);
  try {
    const ledger = EventLedger.open(ledgerPathFor(repoRoot, flags.run));
    if (!ledger.state.run) {
      throw new Error(`no ledger for run ${flags.run}`);
    }
    if (ledger.state.terminal) {
      console.log(`run already terminal: ${ledger.state.terminal.status}`);
      return;
    }
    ledger.append({
      type: "RUN_TERMINAL",
      actor: KERNEL,
      data: { status: "CANCELLED", reason: flags.reason ?? "stopped via CLI" },
    });
    writeRunRecord({ repoRoot, ledger });
    console.log("run cancelled and compacted");
  } finally {
    releaseLock(repoRoot, flags.run);
  }
}

function commandOverview(flags) {
  if (!flags.repo) {
    throw new Error("overview requires --repo");
  }
  const repoRoot = resolve(flags.repo);
  const rows = computeOverview(repoRoot, {
    work: flags.work ?? null,
    repoLabel: repoLabelFor(repoRoot, flags.repo),
  });
  if (flags.json === "true") {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log(renderOverview(rows));
}

function commandGc(flags) {
  if (!flags.repo) {
    throw new Error("gc requires --repo");
  }
  const repoRoot = resolve(flags.repo);
  const rows = planGc(repoRoot);
  if (rows.length === 0) {
    console.log("gc: no run ledgers found");
    return;
  }
  let actionable = 0;
  for (const row of rows) {
    const summary = row.actions.map((action) => {
      if (action.kind === "remove-worktree") {
        return `remove worktree${action.dirty ? " (DIRTY, needs --force)" : ""}`;
      }
      if (action.kind === "delete-branch") {
        return `delete branch ${action.branch} (${action.reason})`;
      }
      return action.owner
        ? "remove active-run lock (owner process is gone)"
        : "remove stale lock";
    });
    actionable += row.actions.length;
    const keep = row.keep.map((reason) => `keep: ${reason}`);
    const parts = [...summary, ...keep];
    console.log(
      `${row.run} [${row.status}] ${parts.length > 0 ? parts.join("; ") : "nothing to do"}`,
    );
  }
  if (flags.apply !== "true") {
    console.log(
      actionable > 0
        ? `plan only: ${actionable} action(s); rerun with --apply to execute (branches whose candidate lives only there are always kept)`
        : "nothing to collect",
    );
    return;
  }
  const results = applyGc(repoRoot, rows, { force: flags.force === "true" });
  let done = 0;
  for (const result of results) {
    const target =
      result.kind === "delete-branch" ? result.branch : result.path;
    if (result.done) {
      done += 1;
      console.log(`  ${result.kind} ${target}: done`);
    } else {
      console.log(`  ${result.kind} ${target}: NOT done (${result.error})`);
    }
  }
  console.log(`gc applied: ${done}/${results.length} action(s)`);
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

// Watches one RUNNING run and reports a stall once per step attempt. Exits
// when the run leaves RUNNING, the parent process (if given) dies, or after a
// single pass with --once true.
async function commandWatch(flags) {
  if (!flags.repo || !flags.run) {
    throw new Error("watch requires --repo and --run");
  }
  const repoRoot = resolve(flags.repo);
  const stallAfterMs = stallAfterFromFlags(flags);
  const intervalMs = Number(flags.interval ?? 30) * 1000;
  const parent = flags.parent ? Number(flags.parent) : null;
  const repoLabel = repoLabelFor(repoRoot, flags.repo);
  const { config } = notifyConfigFor(repoRoot);
  const notified = new Set();
  let notifiedThisPass = false;
  for (;;) {
    notifiedThisPass = false;
    const ledger = EventLedger.open(ledgerPathFor(repoRoot, flags.run));
    if (!ledger.state.run) {
      console.log(`watch: no ledger for ${flags.run} yet`);
    } else if (ledger.state.run.status !== "RUNNING") {
      console.log(`watch: run is ${ledger.state.run.status}; done`);
      return;
    } else {
      const liveness = describeLiveness({
        repoRoot,
        runId: flags.run,
        ledger,
        stallAfterMs,
      });
      const live = liveness.inFlight;
      if (live?.stalled) {
        const key = `${live.step}#${live.attempt}`;
        if (!notified.has(key)) {
          notified.add(key);
          notifiedThisPass = true;
          console.log(
            `watch: STALLED ${live.step} attempt ${live.attempt} — no output for ${formatMs(live.sinceOutputMs)} (threshold ${formatMs(stallAfterMs)})`,
          );
          if (subscribes(config, "STALLED")) {
            const notification = buildNotification("STALLED", {
              repoLabel,
              state: ledger.state,
              detail: {
                step: live.step,
                attempt: live.attempt,
                startedAt: live.startedAt,
                elapsed: formatMs(live.elapsedMs),
                sinceOutput: formatMs(live.sinceOutputMs),
                threshold: formatMs(stallAfterMs),
                command: live.command,
              },
            });
            const results = await dispatchNotification(config, notification, {
              repoRoot,
            });
            for (const row of results) {
              console.log(
                `watch: notify -> ${row.channel}: ${row.ok ? "sent" : row.error}`,
              );
            }
          }
        }
      } else if (live) {
        console.log(
          `watch: ${live.step} attempt ${live.attempt} elapsed ${formatMs(live.elapsedMs)}, last output ${formatMs(live.sinceOutputMs)} ago`,
        );
      }
    }
    if (flags.once === "true") {
      return notifiedThisPass;
    }
    if (parent !== null && !processAlive(parent)) {
      console.log("watch: parent process gone; done");
      return;
    }
    await sleep(intervalMs);
  }
}

function packageVersion() {
  const packageJson = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "package.json",
  );
  return JSON.parse(readFileSync(packageJson, "utf8")).version;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`${packageVersion()}\n`);
    return;
  }
  if (command === "observe") {
    console.error(
      "error: observe execution is retired; existing records are preserved. See docs/MIGRATION.md",
    );
    process.exitCode = 1;
    return;
  }
  if (command === "findings") {
    try {
      commandFindings(rest);
    } catch (error) {
      console.error(`error: ${error.message}`);
      process.exitCode = 1;
    }
    return;
  }
  try {
    const flags = parseFlags(rest);
    if (command === "run") {
      await commandRun(flags);
    } else if (command === "decide") {
      commandDecide(flags);
    } else if (command === "check") {
      flags.step ? commandPreflight(flags) : commandDoctor(flags);
    } else if (command === "history") {
      flags.verify === "true" ? commandReplay(flags) : commandEvents(flags);
    } else if (command === "start") {
      await commandStart(flags);
    } else if (command === "resume") {
      await commandResume(flags);
    } else if (command === "inbox") {
      commandInbox(flags);
    } else if (command === "approve") {
      commandApprove(flags);
    } else if (command === "reject") {
      commandReject(flags);
    } else if (command === "accept") {
      commandAccept(flags);
    } else if (command === "doctor") {
      commandDoctor(flags);
    } else if (command === "events") {
      commandEvents(flags);
    } else if (command === "replay") {
      commandReplay(flags);
    } else if (command === "metrics") {
      commandMetrics(flags);
    } else if (command === "status") {
      commandStatus(flags);
    } else if (command === "stop") {
      commandStop(flags);
    } else if (command === "gc") {
      commandGc(flags);
    } else if (command === "overview") {
      commandOverview(flags);
    } else if (command === "watch") {
      await commandWatch(flags);
    } else if (command === "preflight") {
      commandPreflight(flags);
    } else {
      process.stdout.write(USAGE);
      process.exitCode = command ? 2 : 0;
      return;
    }
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

await main();
