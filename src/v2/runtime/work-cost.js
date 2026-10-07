// Work-level cost (iteration 09): what a work has already consumed across
// every run of it, superseded ones included. Per-run budgets were bypassed
// by "one run per review round" (a pilot work ran 21 runs and 9 review
// rounds while the preset's two-round cap never fired), and a work that ate
// ten runs and a day was cut by the owner as "cost > benefit" with no
// number in front of them. Derived only: runtime ledgers first, run-records
// for runs whose runtime was wiped. Nothing is written.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { EventLedger } from "../storage/event-ledger.js";
import { readFindingsAccount } from "./findings.js";

// How each human wait ended. Counting waits alone hid where the time went:
// one work showed 32 minutes of decided waits while 11 hours had passed on
// a request nobody answered before a new run superseded it.
export const WAIT_KINDS = ["decided", "superseded", "stopped", "open"];

function emptyWaits() {
  return Object.fromEntries(WAIT_KINDS.map((kind) => [kind, { count: 0, ms: 0 }]));
}

function addWait(bucket, ms) {
  bucket.count += 1;
  if (Number.isFinite(ms) && ms > 0) {
    bucket.ms += ms;
  }
}

function emptyCost() {
  return {
    runs: 0,
    reviewRounds: 0,
    findings: 0,
    humanWaits: 0,
    waits: emptyWaits(),
    infraFailures: 0,
    workerMs: 0,
    firstAt: null,
    lastAt: null,
  };
}

// Cost facts of one ledger: review rounds, human waits and how each ended,
// infra failures and worker wall time (STEP_STARTED → STEP_FINISHED per
// attempt). A wait runs from HUMAN_REQUESTED to the next DECISION_RECORDED
// (decided) or to a RUN_TERMINAL without a decision (superseded or
// stopped); a run still waiting counts up to `now` (open).
export function ledgerCost(ledger, { now = Date.now() } = {}) {
  const cost = {
    reviewRounds: 0,
    humanWaits: 0,
    waits: emptyWaits(),
    infraFailures: 0,
    workerMs: 0,
  };
  const open = new Map();
  let waitingSince = null;
  let terminal = false;
  for (const event of ledger.events) {
    if (event.type === "STEP_STARTED") {
      open.set(`${event.data.step}#${event.data.attempt}`, Date.parse(event.ts));
    } else if (event.type === "STEP_FINISHED") {
      const key = `${event.data.step}#${event.data.attempt}`;
      const startedAt = open.get(key);
      if (startedAt !== undefined) {
        const ms = Date.parse(event.ts) - startedAt;
        if (Number.isFinite(ms) && ms > 0) {
          cost.workerMs += ms;
        }
        open.delete(key);
      }
      if (event.data.step === "review") {
        cost.reviewRounds += 1;
      }
      if (event.data.infra === true) {
        cost.infraFailures += 1;
      }
    } else if (event.type === "HUMAN_REQUESTED") {
      cost.humanWaits += 1;
      waitingSince ??= Date.parse(event.ts);
    } else if (event.type === "DECISION_RECORDED") {
      if (waitingSince !== null) {
        addWait(cost.waits.decided, Date.parse(event.ts) - waitingSince);
        waitingSince = null;
      }
    } else if (event.type === "RUN_TERMINAL") {
      terminal = true;
      if (waitingSince !== null) {
        const kind = event.data?.status === "SUPERSEDED" ? "superseded" : "stopped";
        addWait(cost.waits[kind], Date.parse(event.ts) - waitingSince);
        waitingSince = null;
      }
    }
  }
  if (waitingSince !== null && !terminal) {
    addWait(cost.waits.open, now - waitingSince);
  }
  return cost;
}

function addWaits(total, waits) {
  for (const kind of WAIT_KINDS) {
    const row = waits?.[kind];
    if (row && Number.isFinite(row.count) && Number.isFinite(row.ms)) {
      total[kind].count += row.count;
      total[kind].ms += row.ms;
    }
  }
}

export function computeWorkCost(repoRoot, workId, { excludeRun = null, now = Date.now() } = {}) {
  const cost = emptyCost();
  const seen = new Set();
  const runsDir = join(repoRoot, ".buildbeat", "runtime", "runs");
  if (existsSync(runsDir)) {
    for (const entry of readdirSync(runsDir)) {
      const path = join(runsDir, entry, "events.jsonl");
      if (!existsSync(path)) {
        continue;
      }
      const ledger = EventLedger.open(path);
      const state = ledger.state;
      if (ledger.corruption || !state.run || state.run.work !== workId) {
        continue;
      }
      seen.add(state.run.id);
      if (state.run.id === excludeRun) {
        continue;
      }
      const row = ledgerCost(ledger, { now });
      cost.runs += 1;
      cost.reviewRounds += row.reviewRounds;
      cost.humanWaits += row.humanWaits;
      addWaits(cost.waits, row.waits);
      cost.infraFailures += row.infraFailures;
      cost.workerMs += row.workerMs;
      track(cost, ledger.events[0]?.ts, ledger.events[ledger.events.length - 1]?.ts);
    }
  }
  const recordsDir = join(repoRoot, "delivery", "work", workId, "runs");
  if (existsSync(recordsDir)) {
    for (const entry of readdirSync(recordsDir)) {
      if (seen.has(entry) || entry === excludeRun) {
        continue;
      }
      const path = join(recordsDir, entry, "run-record.json");
      if (!existsSync(path)) {
        continue;
      }
      let record;
      try {
        record = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        continue;
      }
      cost.runs += 1;
      // Records written before iteration 09 carry attempts and decisions
      // only; the cost block is preferred when present.
      cost.reviewRounds += record.cost?.reviewRounds ?? record.attempts?.review ?? 0;
      cost.humanWaits += record.cost?.humanWaits ?? record.decisions?.length ?? 0;
      // Records written before wait kinds existed add no durations.
      addWaits(cost.waits, record.cost?.waits);
      cost.infraFailures += record.cost?.infraFailures ?? 0;
      cost.workerMs += record.cost?.workerMs ?? 0;
      track(cost, record.startedAt, record.finishedAt);
    }
  }
  cost.findings = readFindingsAccount(repoRoot, workId).filter((row) => row.kind === "finding").length;
  return cost;
}

function track(cost, firstAt, lastAt) {
  if (firstAt && (!cost.firstAt || firstAt < cost.firstAt)) {
    cost.firstAt = firstAt;
  }
  if (lastAt && (!cost.lastAt || lastAt > cost.lastAt)) {
    cost.lastAt = lastAt;
  }
}

export function formatWorkerMs(ms) {
  if (!ms || ms < 1000) {
    return "0s";
  }
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`;
  }
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

export function renderWorkCost(cost) {
  const waits = WAIT_KINDS.filter((kind) => cost.waits?.[kind]?.count > 0).map(
    (kind) => `${kind} ${formatWorkerMs(cost.waits[kind].ms)}`,
  );
  return [
    `review rounds ${cost.reviewRounds}`,
    `findings ${cost.findings}`,
    `human waits ${cost.humanWaits}${waits.length > 0 ? ` (${waits.join(" · ")})` : ""}`,
    ...(cost.infraFailures > 0 ? [`infra failures ${cost.infraFailures}`] : []),
    `worker ${formatWorkerMs(cost.workerMs)}`,
  ].join(" · ");
}
