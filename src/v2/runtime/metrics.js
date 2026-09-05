// buildbeat metrics v0: local, read-only, derived entirely from run ledgers.
// No collection, no upload (V2-PLAN §6 / lessons #8: without numbers you are
// forever doing precise work on the wrong thing).

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { EventLedger } from "../storage/event-ledger.js";
import { formatMs, typicalDurations } from "./liveness.js";

export function computeMetrics(repoRoot) {
  const runsDir = join(repoRoot, ".buildbeat", "runtime", "runs");
  const ledgers = [];
  if (existsSync(runsDir)) {
    for (const entry of readdirSync(runsDir).sort()) {
      const ledgerPath = join(runsDir, entry, "events.jsonl");
      if (!existsSync(ledgerPath)) {
        continue;
      }
      const ledger = EventLedger.open(ledgerPath);
      if (ledger.state.run || ledger.corruption) {
        ledgers.push(ledger);
      }
    }
  }

  const summary = {
    runs: ledgers.length,
    corrupted: 0,
    terminal: {},
    waitingHuman: 0,
    running: 0,
    autoReachedHumanRate: null,
    fixAttempts: {},
    approvalWaitMs: [],
    evidenceCompleteness: null,
    finishedSteps: 0,
    staleApprovals: 0,
    budgetStops: 0,
  };
  let autoReached = 0;
  let evidencedSteps = 0;

  for (const ledger of ledgers) {
    if (ledger.corruption) {
      summary.corrupted += 1;
      continue;
    }
    const state = ledger.state;
    if (state.terminal) {
      summary.terminal[state.terminal.status] = (summary.terminal[state.terminal.status] ?? 0) + 1;
    } else if (state.run.status === "WAITING_HUMAN") {
      summary.waitingHuman += 1;
    } else {
      summary.running += 1;
    }
    const events = ledger.events;
    if (events.some((event) => event.type === "HUMAN_REQUESTED")) {
      autoReached += 1;
    }
    const fixAttempts = state.steps.fix?.attempts ?? 0;
    summary.fixAttempts[fixAttempts] = (summary.fixAttempts[fixAttempts] ?? 0) + 1;

    let lastRequest = null;
    for (const event of events) {
      if (event.type === "HUMAN_REQUESTED") {
        lastRequest = event;
        if (event.data.reasons?.some((reason) => reason.includes("budget"))) {
          summary.budgetStops += 1;
        }
      } else if (event.type === "DECISION_RECORDED" && lastRequest) {
        summary.approvalWaitMs.push(Date.parse(event.ts) - Date.parse(lastRequest.ts));
        lastRequest = null;
      } else if (event.type === "APPROVAL_STALE") {
        summary.staleApprovals += 1;
      }
    }

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event.type !== "STEP_FINISHED") {
        continue;
      }
      summary.finishedSteps += 1;
      let evidenced = false;
      for (let back = index - 1; back >= 0; back -= 1) {
        const prior = events[back];
        if (
          prior.type === "STEP_STARTED" &&
          prior.data.step === event.data.step &&
          prior.data.attempt === event.data.attempt
        ) {
          break;
        }
        if (prior.type === "EVIDENCE_RECORDED") {
          evidenced = true;
        }
      }
      if (evidenced) {
        evidencedSteps += 1;
      }
    }
  }

  const measurable = summary.runs - summary.corrupted;
  summary.autoReachedHumanRate = measurable === 0 ? null : autoReached / measurable;
  summary.evidenceCompleteness =
    summary.finishedSteps === 0 ? null : evidencedSteps / summary.finishedSteps;
  // Typical step duration (median over finished attempts, crashes and
  // timeouts excluded): the number behind "is this taking too long".
  summary.stepDurations = typicalDurations(repoRoot);
  return summary;
}

const pct = (value) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);

export function renderMetrics(summary) {
  const lines = [];
  lines.push(`runs: ${summary.runs} (corrupted ledgers: ${summary.corrupted})`);
  const terminal = Object.entries(summary.terminal)
    .map(([status, count]) => `${status}=${count}`)
    .join(" ");
  lines.push(
    `states: waiting-human=${summary.waitingHuman} running=${summary.running} ${terminal}`.trim(),
  );
  lines.push(`auto-reached WAITING_HUMAN: ${pct(summary.autoReachedHumanRate)}`);
  lines.push(
    `evidence completeness: ${pct(summary.evidenceCompleteness)} over ${summary.finishedSteps} finished steps`,
  );
  const fixes = Object.entries(summary.fixAttempts)
    .map(([attempts, count]) => `${attempts}x${count}`)
    .join(" ");
  lines.push(`fix attempts distribution: ${fixes || "(none)"}`);
  if (summary.approvalWaitMs.length > 0) {
    const avg =
      summary.approvalWaitMs.reduce((total, value) => total + value, 0) /
      summary.approvalWaitMs.length;
    lines.push(`approval waits: ${summary.approvalWaitMs.length}, avg ${(avg / 1000).toFixed(1)}s`);
  } else {
    lines.push("approval waits: (none recorded)");
  }
  lines.push(`stale approvals: ${summary.staleApprovals}; budget stops: ${summary.budgetStops}`);
  const durations = Object.entries(summary.stepDurations ?? {})
    .map(([step, row]) => `${step}=${formatMs(row.medianMs)} (n=${row.samples})`)
    .join(" ");
  lines.push(`typical step duration (median): ${durations || "(no finished attempts)"}`);
  return lines.join("\n");
}
