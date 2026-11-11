// Work-level cost (iteration 09): what a work has already consumed across
// every run of it, superseded ones included. Per-run budgets were bypassed
// by "one run per review round" (a pilot work ran 21 runs and 9 review
// rounds while the preset's two-round cap never fired), and a work that ate
// ten runs and a day was cut by the owner as "cost > benefit" with no
// number in front of them. Derived only: runtime ledgers first, run-records
// for runs whose runtime was wiped. Nothing is written.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { readFindingsAccount } from "./findings.js";
import { readRunLedgers } from "./overview-repos.js";

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

// Cost facts of one ledger: review rounds, human waits and how each ended,
// infra failures and worker wall time (STEP_STARTED → STEP_FINISHED per
// attempt). A wait runs from HUMAN_REQUESTED to the next DECISION_RECORDED
// (decided) or to a RUN_TERMINAL without a decision (superseded or
// stopped); a run still waiting counts up to `now` (open). A request
// repeated before any decision (a resumed run asks again for the same
// decision) continues the same wait from the first request: counting it
// again would count the overlapping time twice.
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

// ledgers: the repository's run ledgers already read for this call
// (readRunLedgers); without them every ledger is read here.
// What a work has consumed so far, across every run of it: review rounds and
// findings. Runtime ledgers first, run records for runs whose runtime is
// gone (another machine, a cleaned directory).
export function computeWorkCost(repoRoot, workId, { ledgers = null } = {}) {
  const cost = { runs: 0, reviewRounds: 0, findings: 0 };
  const seen = new Set();
  for (const { ledger } of ledgers ?? readRunLedgers(repoRoot)) {
    const state = ledger.state;
    if (ledger.corruption || !state.run || state.run.work !== workId) {
      continue;
    }
    seen.add(state.run.id);
    cost.runs += 1;
    cost.reviewRounds += ledgerCost(ledger).reviewRounds;
  }
  const recordsDir = join(repoRoot, "delivery", "work", workId, "runs");
  if (existsSync(recordsDir)) {
    for (const entry of readdirSync(recordsDir)) {
      const path = join(recordsDir, entry, "run-record.json");
      if (seen.has(entry) || !existsSync(path)) {
        continue;
      }
      let record;
      try {
        record = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        continue;
      }
      cost.runs += 1;
      // Early records carry attempts only; the cost block is preferred.
      cost.reviewRounds += record.cost?.reviewRounds ?? record.attempts?.review ?? 0;
    }
  }
  cost.findings = readFindingsAccount(repoRoot, workId).filter((row) => row.kind === "finding").length;
  return cost;
}

export function renderWorkCost(cost) {
  return `review rounds ${cost.reviewRounds} · findings ${cost.findings}`;
}
