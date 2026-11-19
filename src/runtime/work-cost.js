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
  const cost = { runs: 0, reviewRounds: 0, findings: 0, blockingStreak: 0 };
  const seen = new Set();
  // Every review a run finished and when the run started, for the streak.
  const rounds = [];
  for (const { ledger } of ledgers ?? readRunLedgers(repoRoot)) {
    const state = ledger.state;
    if (ledger.corruption || !state.run || state.run.work !== workId) {
      continue;
    }
    seen.add(state.run.id);
    cost.runs += 1;
    const spent = ledgerCost(ledger);
    cost.reviewRounds += spent.reviewRounds;
    if (state.run.pass) rounds.push(...reviewOutcomes({ id: state.run.id, startedAt: ledger.events?.[0]?.ts, evidence: state.evidence, terminal: state.terminal, humanWaits: spent.humanWaits }));
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
      if (record.pass) rounds.push(...reviewOutcomes({ id: entry, startedAt: record.startedAt, evidence: record.evidence, terminal: record.terminal, humanWaits: record.cost?.humanWaits }));
    }
  }
  cost.findings = readFindingsAccount(repoRoot, workId).filter((row) => row.kind === "finding").length;
  cost.blockingStreak = blockingStreak(rounds);
  return cost;
}

// The reviewer's own reports among a run's evidence, in order: a verifier
// may write findings too, recorded under the same kind.
const REVIEW_REPORT = /(?:^|\/)review-\d+\.json$/;

export function reviewerReports(evidence) {
  return (evidence ?? []).filter(
    (item) => item.kind === "review" && REVIEW_REPORT.test(String(item.ref ?? "")) && (item.status === "failed" || item.status === "passed"),
  );
}

// The review a run finished: "failed" when it raised a blocking finding,
// "passed" when it raised none. A run that ended CANCELLED without ever
// asking a person ended on broken tooling, so its report is no verdict (a
// reviewer that timed out may have written one first); a run a person
// rejected also ends CANCELLED, after its review was done. Only runs this
// version made count (pass: true, one review each): earlier versions
// retried and waited within a run, and their records cannot tell which
// report was a finished review.
function reviewOutcomes({ id, startedAt, evidence, terminal, humanWaits }) {
  const reviews = reviewerReports(evidence);
  if (terminal?.status === "CANCELLED" && !(humanWaits > 0)) reviews.pop();
  return reviews.map((item, index) => ({ id, index, startedAt, outcome: item.status }));
}

// How many of the latest reviews in a row raised a blocking finding. A run
// that reviewed nothing (verification failed, the tooling broke, still
// running) neither counts nor breaks the streak; a review with
// no blocking finding ends it. A work once went through 108 reviews this
// way, each fix inviting the next finding, and nothing asked a person.
function blockingStreak(rounds) {
  const reviewed = [...rounds].sort(
    (a, b) =>
      (Date.parse(a.startedAt) || 0) - (Date.parse(b.startedAt) || 0) ||
      attemptNumber(a.id) - attemptNumber(b.id) ||
      a.index - b.index,
  );
  let streak = 0;
  for (const round of reviewed) {
    streak = round.outcome === "failed" ? streak + 1 : 0;
  }
  return streak;
}

// Runs started in the same millisecond keep their numbered order
// (RUN-X-100 after RUN-X-99, which a string sort would not give).
function attemptNumber(id) {
  return Number(/-(\d+)$/.exec(String(id))?.[1] ?? 0);
}

// Every this many blocking reviews in a row, `review` tells the session to
// stop and ask the user before fixing again.
export const BLOCKING_STREAK_STOP = 5;

export function blockingStreakStop(streak) {
  return streak > 0 && streak % BLOCKING_STREAK_STOP === 0
    ? `stop: ${streak} reviews in a row found blocking problems; before fixing again, show the user where they keep coming from and ask whether to narrow the work, rule on the findings, or keep fixing`
    : null;
}

export function renderBlockingStreak(streak) {
  return `blocking streak: ${streak} review${streak === 1 ? "" : "s"} in a row found blocking problems`;
}

export function renderWorkCost(cost) {
  return `review rounds ${cost.reviewRounds} · findings ${cost.findings}`;
}
