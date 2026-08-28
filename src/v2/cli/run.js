#!/usr/bin/env node
// M1 runtime CLI: run start / status / stop for a single foreground run.
// Deliberately thin — all facts live in the event ledger; this file only
// parses input, wires adapters, and renders derived state.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { createShellAdapter } from "../adapters/shell.js";
import { loadRiskPreset } from "../engine/risk-preset.js";
import { loadWorkflow } from "../engine/workflow.js";
import { parseYamlSubset } from "../engine/yaml-subset.js";
import { parsePolicyDoc } from "../policy/policy.js";
import { acceptArtifact, approveRun, listInbox, rejectRun } from "../runtime/decisions.js";
import { computeMetrics, renderMetrics } from "../runtime/metrics.js";
import { writeRunRecord } from "../runtime/run-record.js";
import { resumeRun, startRun } from "../runtime/orchestrator.js";
import { EventLedger } from "../storage/event-ledger.js";
import { acquireLock, releaseLock } from "../workspace/workspace-manager.js";

const KERNEL = { kind: "kernel", id: "cli" };

const USAGE = `BuildBeat v2 runtime (M1 vertical slice)

Usage:
  run.js start --config <run-config.yaml>
  run.js resume --config <run-config.yaml>
  run.js status --repo <path> --run <RUN-ID>
  run.js inbox --repo <path>
  run.js approve --repo <path> --run <RUN-ID> --transition <t> [--by <name>] [--config <run-config.yaml>]
  run.js reject --repo <path> --run <RUN-ID> [--transition <t>] [--reason <text>] [--by <name>]
  run.js accept --repo <path> --work <WORK-ID> --artifact <plan|intent|spec> [--by <name>]
  run.js doctor --config <run-config.yaml>
  run.js events --repo <path> --run <RUN-ID>
  run.js replay --repo <path> --run <RUN-ID>
  run.js metrics --repo <path> [--json true]
  run.js stop --repo <path> --run <RUN-ID> --reason <text>
`;

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`bad arguments near: ${key ?? "(end)"}`);
    }
    flags[key.slice(2)] = value;
  }
  return flags;
}

function ledgerPathFor(repo, runId) {
  return join(resolve(repo), ".buildbeat", "runtime", "runs", runId, "events.jsonl");
}

function printState(state, ledger) {
  if (ledger.corruption) {
    console.log(
      `WARNING: ledger corrupted after seq=${ledger.corruption.afterSeq} at line ${ledger.corruption.atLine}: ${ledger.corruption.reason}`,
    );
  }
  if (!state.run) {
    console.log("no run recorded");
    return;
  }
  console.log(`run: ${state.run.id} (work ${state.run.work})`);
  console.log(`status: ${state.run.status}`);
  console.log(`workflow: ${state.run.workflowRef} @ ${state.run.workflowDigest}`);
  for (const [id, workspace] of Object.entries(state.workspaces)) {
    console.log(
      `workspace ${id}: base ${workspace.base.slice(0, 7)} candidate ${workspace.candidate ? workspace.candidate.slice(0, 7) : "(none)"}`,
    );
  }
  for (const [step, info] of Object.entries(state.steps)) {
    console.log(`step ${step}: ${info.status} (attempts ${info.attempts})`);
  }
  for (const item of state.evidence) {
    console.log(`evidence [${item.status}/${item.grade}] ${item.kind} ${item.ref}`);
  }
  if (state.pendingHuman) {
    console.log(`waiting on human: ${state.pendingHuman.transition}`);
    for (const reason of state.pendingHuman.reasons) {
      console.log(`  reason: ${reason}`);
    }
  }
  if (state.terminal) {
    console.log(`terminal: ${state.terminal.status} (${state.terminal.reason})`);
  }
  if (state.compacted) {
    console.log(`compacted: ${state.compacted.runRecordRef}`);
  }
}

function loadRunConfig(flags, command) {
  if (!flags.config) {
    throw new Error(`${command} requires --config`);
  }
  const configPath = resolve(flags.config);
  const config = parseYamlSubset(readFileSync(configPath, "utf8"));
  const configDir = dirname(configPath);
  const repoRoot = resolve(configDir, config.repo);
  const workflowPath = resolve(configDir, config.workflow);
  const workflowText = readFileSync(workflowPath, "utf8");
  const workflow = loadWorkflow(workflowPath);
  const workflowDigest = `sha256:${createHash("sha256").update(workflowText, "utf8").digest("hex")}`;

  const adapters = {};
  for (const [worker, spec] of Object.entries(config.workers ?? {})) {
    adapters[worker] = createShellAdapter({
      name: `shell:${worker}`,
      command: spec.command,
      args: spec.args ?? [],
      timeoutMs: spec.timeoutMs,
    });
  }
  const digestOfWorkFile = (name) => {
    const filePath = join(repoRoot, "delivery", "work", config.work, name);
    if (!existsSync(filePath)) {
      return undefined;
    }
    return `sha256:${createHash("sha256").update(readFileSync(filePath, "utf8"), "utf8").digest("hex")}`;
  };

  const policies = [];
  let presetStopAt = null;
  let riskPreset = "standard";
  if (config.riskPreset) {
    const preset = loadRiskPreset(config.riskPreset);
    policies.push(...preset.policies);
    presetStopAt = preset.stopAt;
    riskPreset = preset.name;
  }
  for (const policyPath of config.policies ?? []) {
    policies.push(parsePolicyDoc(parseYamlSubset(readFileSync(resolve(configDir, policyPath), "utf8"))));
  }

  return {
    repoRoot,
    workflow,
    workflowDigest,
    workId: config.work,
    runId: config.run,
    base: config.base ?? "HEAD",
    entry: config.entry ?? workflow.entry,
    stopAt: config.stopAt ?? presetStopAt ?? [],
    adapters,
    adapterConfigs: config.workers ?? {},
    policies,
    riskPreset,
    maxAttemptsPerStep: config.maxAttemptsPerStep ?? 4,
    stepTimeoutMs: config.stepTimeoutMs,
    allowedPaths: config.allowedPaths,
    planDigest: digestOfWorkFile("plan.md"),
    intentDigest: digestOfWorkFile("intent.md"),
  };
}

function commandStart(flags) {
  const options = loadRunConfig(flags, "start");
  const result = startRun(options);
  console.log(`ledger: ${result.ledgerPath}`);
  printState(result.state, { corruption: null });
}

function commandResume(flags) {
  const options = loadRunConfig(flags, "resume");
  const result = resumeRun(options);
  if (!result.resumed) {
    console.log(`nothing to resume: ${result.reason}`);
  }
  console.log(`ledger: ${result.ledgerPath}`);
  printState(result.state, { corruption: null });
}

function commandInbox(flags) {
  if (!flags.repo) {
    throw new Error("inbox requires --repo");
  }
  const rows = listInbox(resolve(flags.repo));
  if (rows.length === 0) {
    console.log("inbox empty: no runs waiting on a human");
    return;
  }
  for (const row of rows) {
    if (row.corrupted) {
      console.log(`${row.run}: LEDGER CORRUPTED after seq=${row.corrupted.afterSeq} (${row.corrupted.reason})`);
      continue;
    }
    console.log(`${row.run} (work ${row.work}) [${row.kind}] ${row.transition}`);
    console.log(`  candidate: ${row.subject.candidate}`);
    console.log(`  planDigest: ${row.subject.planDigest}`);
    console.log(`  evidenceDigest: ${row.subject.evidenceDigest}`);
    for (const reason of row.reasons) {
      console.log(`  reason: ${reason}`);
    }
  }
}

function commandApprove(flags) {
  if (!flags.repo || !flags.run || !flags.transition) {
    throw new Error("approve requires --repo, --run and --transition");
  }
  const policies = flags.config ? loadRunConfig(flags, "approve").policies : [];
  const result = approveRun(resolve(flags.repo), flags.run, {
    by: flags.by ?? "human",
    transition: flags.transition,
    policies,
  });
  if (!result.approved) {
    console.log("NOT approved: the subject changed since the request; a refreshed request was filed");
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
    console.log("run is terminal: SUCCEEDED (merge itself stays a manual external action)");
  } else {
    console.log("decision recorded; continue with: run.js resume --config <run-config.yaml>");
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
  if (!flags.repo || !flags.work || !flags.artifact) {
    throw new Error("accept requires --repo, --work and --artifact");
  }
  const result = acceptArtifact(resolve(flags.repo), flags.work, flags.artifact, {
    by: flags.by ?? "human",
  });
  console.log(`accepted ${flags.artifact} as ${result.decisionRef}`);
  console.log(`  digest: ${result.digest}`);
  console.log("  note: editing the artifact after acceptance makes this acceptance stale");
}

function commandDoctor(flags) {
  const options = loadRunConfig(flags, "doctor");
  console.log(`risk preset: ${options.riskPreset}`);
  console.log(`stopAt boundaries: ${options.stopAt.length > 0 ? options.stopAt.join(", ") : "(none)"}`);
  console.log("policies (declared vs actually achieved enforcement):");
  if (options.policies.length === 0) {
    console.log("  (none configured)");
  }
  for (const policy of options.policies) {
    let actual;
    if (policy.enforcement === "ADVISORY") {
      actual = "ADVISORY (prompt-level only; nothing stops a worker)";
    } else if (policy.enforcement === "SERVER_ENFORCED") {
      actual = "UNVERIFIED (branch protection/CI cannot be verified from here; not claiming it)";
    } else if (policy.type === "transition") {
      actual = "LOCAL_ENFORCED (approve gate refuses the stamp)";
    } else {
      actual = "LOCAL_ENFORCED (runner gate before/after the step)";
    }
    console.log(`  ${policy.name}: type=${policy.type} appliesTo=${policy.appliesTo} declared=${policy.enforcement} actual=${actual}`);
  }
  console.log("worker isolation:");
  for (const [worker, spec] of Object.entries(options.adapterConfigs)) {
    const mode = spec.inheritEnv === true
      ? "WARNING inherit (worker sees the full host env; credential isolation is ADVISORY only)"
      : "env allowlist (host credential env vars withheld from the worker)";
    console.log(`  ${worker}: ${mode}`);
  }
  let remotes = [];
  try {
    remotes = execFileSync("git", ["-C", options.repoRoot, "remote"], { encoding: "utf8" })
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
    console.log("push protection: repository has no remotes (nothing to protect)");
  }
  console.log("kernel capabilities: merge/deploy/publish have no call path in the runner (invariant 20)");
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
    console.log(`chain OK: ${ledger.events.length} events verified (digest/prev/seq)`);
  }
  printState(ledger.state, { corruption: null });
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
  if (!flags.repo || !flags.run) {
    throw new Error("status requires --repo and --run");
  }
  const ledger = EventLedger.open(ledgerPathFor(flags.repo, flags.run));
  printState(ledger.state, ledger);
}

function commandStop(flags) {
  if (!flags.repo || !flags.run) {
    throw new Error("stop requires --repo and --run");
  }
  const repoRoot = resolve(flags.repo);
  const ledger = EventLedger.open(ledgerPathFor(repoRoot, flags.run));
  if (!ledger.state.run) {
    throw new Error(`no ledger for run ${flags.run}`);
  }
  if (ledger.state.terminal) {
    console.log(`run already terminal: ${ledger.state.terminal.status}`);
    return;
  }
  acquireLock(repoRoot, flags.run);
  try {
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

function main() {
  const [command, ...rest] = process.argv.slice(2);
  try {
    const flags = parseFlags(rest);
    if (command === "start") {
      commandStart(flags);
    } else if (command === "resume") {
      commandResume(flags);
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

main();
