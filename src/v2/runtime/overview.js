// Work-level overview (iteration 08, C5): "where is this thing, and who
// moves next" — the question the owner opened three sessions with
// ("X 上线了吗 / 离上线还差多远 / 从每个系统说待办") and that inbox,
// which only knows about runs waiting on a human, cannot answer.
//
// Everything here is derived: work directories and decision ledgers in the
// Git plane, run ledgers in the runtime plane (run-records fill in for runs
// whose runtime was wiped), and git ancestry for "merged". Nothing is
// written.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { EventLedger } from "../storage/event-ledger.js";
import { latestAdjudications, readFindingsAccount } from "./findings.js";
import { nextReply } from "./notify.js";
import { computeWorkCost, renderWorkCost } from "./work-cost.js";

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path, "utf8"), "utf8").digest("hex")}`;
}

function readJsonl(path) {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function artifactStatus(workDir, decisions, artifact) {
  const path = join(workDir, `${artifact}.md`);
  if (!existsSync(path)) {
    return { exists: false, accepted: false, stale: false };
  }
  const digest = sha256File(path);
  const accepts = decisions.filter((row) => row.transition === `accept-${artifact}` && row.decision === "approved");
  const latest = accepts[accepts.length - 1];
  if (!latest) {
    return { exists: true, accepted: false, stale: false };
  }
  const stale = latest.subject?.digest !== digest;
  return { exists: true, accepted: !stale, stale, by: latest.by, at: latest.ts };
}

function isAncestor(repoRoot, sha, ref) {
  try {
    execFileSync("git", ["-C", repoRoot, "merge-base", "--is-ancestor", sha, ref], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function headRef(repoRoot) {
  try {
    return execFileSync("git", ["-C", repoRoot, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "HEAD";
  }
}

// Runs for a work: runtime ledgers first, run-records for the rest.
function runsFor(repoRoot, workId) {
  const runs = new Map();
  const runsDir = join(repoRoot, ".buildbeat", "runtime", "runs");
  if (existsSync(runsDir)) {
    for (const entry of readdirSync(runsDir)) {
      const path = join(runsDir, entry, "events.jsonl");
      if (!existsSync(path)) {
        continue;
      }
      const ledger = EventLedger.open(path);
      const state = ledger.state;
      if (!state.run || state.run.work !== workId) {
        continue;
      }
      runs.set(state.run.id, {
        id: state.run.id,
        status: state.run.status,
        terminal: state.terminal,
        pendingHuman: state.pendingHuman,
        candidate: state.workspaces[state.run.id]?.candidate ?? null,
        createdAt: ledger.events[0]?.ts ?? null,
        lastAt: ledger.events[ledger.events.length - 1]?.ts ?? null,
        state,
        source: "runtime",
      });
    }
  }
  const recordsDir = join(repoRoot, "delivery", "work", workId, "runs");
  if (existsSync(recordsDir)) {
    for (const entry of readdirSync(recordsDir)) {
      if (runs.has(entry)) {
        continue;
      }
      const path = join(recordsDir, entry, "run-record.json");
      if (!existsSync(path)) {
        continue;
      }
      try {
        const record = JSON.parse(readFileSync(path, "utf8"));
        runs.set(entry, {
          id: entry,
          status: record.terminal?.status ?? "UNKNOWN",
          terminal: record.terminal ?? null,
          pendingHuman: null,
          candidate: record.workspaces?.[entry]?.candidate ?? null,
          createdAt: record.startedAt ?? null,
          lastAt: record.finishedAt ?? null,
          state: null,
          source: "run-record",
        });
      } catch {
        // an unreadable record is reported as absent, not guessed
      }
    }
  }
  return [...runs.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function computeOverview(repoRoot, { work = null, repoLabel = "." } = {}) {
  const workRoot = join(repoRoot, "delivery", "work");
  const rows = [];
  if (!existsSync(workRoot)) {
    return rows;
  }
  const mainRef = headRef(repoRoot);
  for (const workId of readdirSync(workRoot).sort()) {
    if (work && workId !== work) {
      continue;
    }
    const workDir = join(workRoot, workId);
    if (!existsSync(join(workDir, "intent.md")) && !existsSync(join(workDir, "plan.md")) && !existsSync(join(workDir, "decisions.jsonl")) && !existsSync(join(workDir, "runs"))) {
      continue;
    }
    const decisions = readJsonl(join(workDir, "decisions.jsonl"));
    const intent = artifactStatus(workDir, decisions, "intent");
    const plan = artifactStatus(workDir, decisions, "plan");
    const envFacts = existsSync(join(workDir, "env-facts.md"));
    const findingRows = readFindingsAccount(repoRoot, workId);
    const adjudicated = latestAdjudications(findingRows);
    const openFindings = findingRows.filter(
      (row) => row.kind === "finding" && (row.severity === "P0" || row.severity === "P1") && !adjudicated.has(row.fingerprint),
    ).length;
    const runs = runsFor(repoRoot, workId);
    const live = runs.filter((run) => run.status !== "SUPERSEDED");
    const latest = live[live.length - 1] ?? null;
    let merged = false;
    if (latest?.candidate) {
      merged = isAncestor(repoRoot, latest.candidate, mainRef);
    }

    // A Work is closed by an explicit row in decisions.jsonl:
    //   {"transition":"close-work","decision":"closed"|"cancelled","subject":{"result":"..."}}
    // A live run (RUNNING / WAITING_HUMAN) contradicts a closure and wins, so a
    // stale close row can never hide something that still needs a human.
    const closure = [...decisions].reverse().find((row) => row.transition === "close-work");
    const liveRun = latest && (latest.status === "RUNNING" || latest.status === "WAITING_HUMAN");

    let stage;
    let next;
    if (closure && !liveRun) {
      stage = closure.decision === "cancelled" ? "CANCELLED" : "CLOSED";
      const result = typeof closure.subject?.result === "string" && closure.subject.result.length > 0 ? closure.subject.result : "see decisions.jsonl";
      next = `${stage.toLowerCase()} @ ${closure.ts ?? "?"}: ${result.slice(0, 160)}`;
    } else if (!intent.exists) {
      stage = "NO_INTENT";
      next = `write delivery/work/${workId}/intent.md (what and why), then plan.md`;
    } else if (!latest) {
      if (!plan.exists) {
        stage = intent.accepted ? "INTENT_ACCEPTED" : "INTENT_DRAFT";
        next = intent.accepted
          ? `write delivery/work/${workId}/plan.md, then accept it`
          : `buildbeat-v2 accept --repo ${repoLabel} --work ${workId} --artifact intent --by <you>`;
      } else if (!plan.accepted) {
        stage = plan.stale ? "PLAN_STALE" : "PLAN_DRAFT";
        next = `buildbeat-v2 accept --repo ${repoLabel} --work ${workId} --artifact plan --by <you>${plan.stale ? "   # plan changed since acceptance" : ""}`;
      } else {
        stage = "READY_TO_RUN";
        const configs = readdirSync(workDir).filter((name) => /^run-config.*\.ya?ml$/.test(name));
        next =
          configs.length > 0
            ? `buildbeat-v2 start --config delivery/work/${workId}/${configs[0]} --attempt new`
            : `no run-config in delivery/work/${workId}: write one, or close it with a decisions.jsonl row {"transition":"close-work","decision":"closed","subject":{"result":"..."}} if it was doc-only`;
      }
    } else if (latest.status === "RUNNING") {
      stage = "RUNNING";
      next = `buildbeat-v2 status --repo ${repoLabel} --run ${latest.id}`;
    } else if (latest.status === "WAITING_HUMAN") {
      stage = latest.pendingHuman?.kind === "final-decision" ? "MERGE_DECISION" : "WAITING_HUMAN";
      const replies = latest.state ? nextReply({ repoLabel, state: latest.state }) : [];
      next = replies[0] ?? `buildbeat-v2 inbox --repo ${repoLabel}`;
    } else if (latest.status === "SUCCEEDED") {
      if (merged) {
        stage = "MERGED";
        next = `release/deploy stays a human action; then buildbeat-v2 gc --repo ${repoLabel}`;
      } else {
        stage = "MERGE_READY";
        next = latest.candidate
          ? `merge ${latest.candidate.slice(0, 7)} (run/${latest.id}) into ${mainRef} — manual, then push`
          : "run succeeded without a candidate; nothing to merge";
      }
    } else {
      stage = `STOPPED_${latest.status}`;
      next = plan.accepted
        ? `decide: retry (buildbeat-v2 start ... --attempt new) or close the work`
        : `plan not accepted (${plan.exists ? "draft" : "missing"}); fix that before another run`;
    }
    rows.push({
      work: workId,
      stage,
      intent,
      plan,
      envFacts,
      openFindings,
      runs: runs.length,
      cost: runs.length > 0 ? computeWorkCost(repoRoot, workId) : null,
      latest: latest
        ? { id: latest.id, status: latest.status, candidate: latest.candidate, at: latest.lastAt, source: latest.source, terminalReason: latest.terminal?.reason ?? null, waiting: latest.pendingHuman?.transition ?? null }
        : null,
      merged,
      next,
    });
  }
  return rows;
}

function mark(status) {
  if (!status.exists) {
    return "–";
  }
  if (status.stale) {
    return "stale";
  }
  return status.accepted ? "✓" : "draft";
}

export function renderOverview(rows) {
  if (rows.length === 0) {
    return "overview: no work items under delivery/work";
  }
  const lines = [];
  for (const row of rows) {
    lines.push(`${row.work}  ${row.stage}`);
    const parts = [`intent ${mark(row.intent)}`, `plan ${mark(row.plan)}`, `runs ${row.runs}`];
    if (row.openFindings > 0) {
      // Unadjudicated, not necessarily unresolved: a fixer may have closed
      // them without anyone recording a verdict. The number says "nobody
      // ruled on these", which is exactly what a human should know.
      parts.push(`unadjudicated P0/P1 findings ${row.openFindings}`);
    }
    if (row.envFacts) {
      parts.push("env-facts ✓");
    }
    lines.push(`  ${parts.join(" · ")}`);
    if (row.cost) {
      // What this work has already consumed across every run, superseded
      // ones included: the number a "continue or cut" decision needs.
      lines.push(`  cost: ${renderWorkCost(row.cost)}`);
    }
    if (row.latest) {
      const cand = row.latest.candidate ? ` candidate ${row.latest.candidate.slice(0, 7)}${row.merged ? " (merged)" : ""}` : "";
      const wait = row.latest.waiting ? ` waiting ${row.latest.waiting}` : "";
      const why = row.latest.terminalReason ? ` — ${row.latest.terminalReason.slice(0, 100)}` : "";
      lines.push(`  latest ${row.latest.id} ${row.latest.status}${cand}${wait} @ ${row.latest.at ?? "?"}${why}`);
    }
    lines.push(`  next: ${row.next}`);
  }
  return lines.join("\n");
}
