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
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { listInbox } from "./decisions.js";
import { configTargets, directory, discoverRepos, pathLabel, shellArg, workConfigs } from "./overview-repos.js";

import { EventLedger } from "../storage/event-ledger.js";
import { latestAdjudications, readFindingsAccount } from "./findings.js";
import { nextReply } from "./notify.js";
import { readReleases } from "./release.js";
import { describeLiveness } from "./liveness.js";
import { computeWorkCost, renderWorkCost } from "./work-cost.js";

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path, "utf8"), "utf8").digest("hex")}`;
}

export function readJsonl(path) {
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

export function artifactStatus(workDir, decisions, artifact) {
  const path = join(workDir, `${artifact}.md`);
  if (!existsSync(path)) {
    return { exists: false, accepted: false, stale: false };
  }
  const digest = sha256File(path);
  const accepts = decisions.filter(
    (row) =>
      row.transition === `accept-${artifact}` && row.decision === "approved",
  );
  const latest = accepts[accepts.length - 1];
  if (!latest) {
    return { exists: true, accepted: false, stale: false };
  }
  const stale = latest.subject?.digest !== digest;
  return {
    exists: true,
    accepted: !stale,
    stale,
    by: latest.by,
    at: latest.ts,
  };
}

function isAncestor(repoRoot, sha, ref, context) {
  const key = JSON.stringify([repoRoot, sha, ref]);
  if (context.ancestry.has(key)) return context.ancestry.get(key);
  try {
    execFileSync(
      "git",
      ["-C", repoRoot, "merge-base", "--is-ancestor", sha, ref],
      { stdio: "ignore" },
    );
    context.ancestry.set(key, true);
    return true;
  } catch {
    context.ancestry.set(key, false);
    return false;
  }
}

function headRef(repoRoot, context) {
  if (context.heads.has(repoRoot)) return context.heads.get(repoRoot);
  try {
    const ref = execFileSync(
      "git",
      ["-C", repoRoot, "rev-parse", "--abbrev-ref", "HEAD"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    context.heads.set(repoRoot, ref);
    return ref;
  } catch {
    context.heads.set(repoRoot, "HEAD");
    return "HEAD";
  }
}

// Runs for a work: runtime ledgers first, run-records for the rest.
export function runsFor(repoRoot, workId) {
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
        workflow: state.run.workflowRef ?? null,
        steps: Object.keys(state.steps),
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
          workflow: record.workflow ?? null,
          steps: Object.keys(record.attempts ?? {}),
          state: null,
          source: "run-record",
        });
      } catch {
        // an unreadable record is reported as absent, not guessed
      }
    }
  }
  return [...runs.values()].sort((a, b) =>
    String(a.createdAt).localeCompare(String(b.createdAt)),
  );
}

// Per status invocation: known local roots need no validation subprocess,
// and forwarded works share repository facts with the later target scan.
function overviewContext(repoRoot) {
  return { roots: new Map([[realpathSync(repoRoot), realpathSync(repoRoot)]]), heads: new Map(), ancestry: new Map() };
}

export function computeOverview(
  repoRoot,
  { work = null, repoLabel: defaultRepoLabel = ".", cwd = null, followTargets = true, warnings = [], configsOverride = null, context = overviewContext(repoRoot), skipWorks = new Set(), localCompatibility = false } = {},
) {
  const workRoot = join(repoRoot, "delivery", "work");
  const rows = [];
  const workIds = new Set(directory(workRoot) ? readdirSync(workRoot).filter((id) => directory(join(workRoot, id))) : []);
  const runsDir = join(repoRoot, ".buildbeat", "runtime", "runs");
  if (directory(runsDir)) {
    for (const id of readdirSync(runsDir)) {
      const file = join(runsDir, id, "events.jsonl");
      if (!existsSync(file)) continue;
      const run = EventLedger.open(file).state.run;
      if (run?.work) workIds.add(run.work);
    }
  }
  const mainRef = headRef(repoRoot, context);
  // Resolve once; do not spawn another Git process for each local work.
  const currentRoot = realpathSync(repoRoot);
  for (const workId of [...workIds].sort()) {
    if ((work && workId !== work) || skipWorks.has(workId)) {
      continue;
    }
    const workDir = join(workRoot, workId);
    const configs = configsOverride ?? workConfigs(repoRoot, workId, warnings);
    const resolved = followTargets ? configTargets(configs, warnings, context.roots) : configs;
    const owner = followTargets ? resolved.find((item) => item.repo && item.repo !== currentRoot &&
      (directory(join(item.repo, "delivery", "work", workId)) || runsFor(item.repo, workId).length)) : null;
    const usable = resolved.filter((item) => !item.error);
    const selected = owner ?? usable[0] ?? resolved[0] ?? null;
    const applicable = selected?.repo ? resolved.filter((item) => item.repo === selected.repo) : usable;
    const local = localCompatibility && (!selected?.target || selected.repo === currentRoot);
    const config = (local ? null : applicable.find((item) => item.release)) ?? selected;
    if (owner) {
      const targetRows = computeOverview(config.repo, {
        work: workId, repoLabel: shellArg(pathLabel(cwd ?? process.cwd(), config.repo)),
        cwd: cwd ?? process.cwd(), followTargets: false, warnings, configsOverride: applicable, context,
      });
      if (targetRows.length) {
        rows.push({ ...targetRows[0], repo: config.repo, repoLabel: pathLabel(cwd ?? process.cwd(), config.repo) });
        continue;
      }
    }
    // Cross-repo work still belongs here until the target has records.
    // Its commands need a copyable owner path, not the legacy local label.
    const repoLabel = followTargets && config?.target && config.repo !== currentRoot
      ? shellArg(pathLabel(cwd ?? process.cwd(), repoRoot)) : defaultRepoLabel;
    const pathFor = (item) =>
      shellArg(cwd && !local ? pathLabel(cwd, item.path) : `delivery/work/${workId}/${item.path.split("/").at(-1)}`);
    const configPath = config ? pathFor(config) : "<run-config.yaml>";
    const runs = runsFor(repoRoot, workId);
    if (!configs.length && !runs.length && !["work.md", "intent.md", "plan.md", "decisions.jsonl", "runs"].some((name) => existsSync(join(workDir, name)))) continue;
    const decisions = readJsonl(join(workDir, "decisions.jsonl"));
    const unified = existsSync(join(workDir, "work.md"));
    const intent = artifactStatus(
      workDir,
      decisions,
      unified ? "work" : "intent",
    );
    const plan = unified ? intent : artifactStatus(workDir, decisions, "plan");
    const envFacts = existsSync(join(workDir, "env-facts.md"));
    const findingRows = readFindingsAccount(repoRoot, workId);
    const adjudicated = latestAdjudications(findingRows);
    const openFindings = findingRows.filter(
      (row) =>
        row.kind === "finding" &&
        (row.severity === "P0" || row.severity === "P1") &&
        !adjudicated.has(row.fingerprint),
    ).length;
    const live = runs.filter((run) => run.status !== "SUPERSEDED");
    const latest = live[live.length - 1] ?? null;
    // "Merged" is a fact about any candidate of the work, not only the
    // latest run's: a pilot's shipped candidate sat behind a CANCELLED run
    // (its in-run review budget ran out and closure happened elsewhere) and
    // overview reported the shipped work as STOPPED_CANCELLED.
    const mergedRun =
      [...runs]
        .reverse()
        .find(
          (run) =>
            run.candidate && isAncestor(repoRoot, run.candidate, mainRef, context),
        ) ?? null;
    const merged = Boolean(mergedRun);
    const RELEASE_STEPS = ["preflight", "apply-readback", "observe"];
    const isReleaseLane = (run) =>
      Boolean(run) &&
      (run.workflow === "release-readback" ||
        run.steps.some((step) => RELEASE_STEPS.includes(step)));

    // A Work is closed by an explicit row in decisions.jsonl:
    //   {"transition":"close-work","decision":"closed"|"cancelled","subject":{"result":"..."}}
    // A live run (RUNNING / WAITING_HUMAN) contradicts a closure and wins, so a
    // stale close row can never hide something that still needs a human.
    const closure = [...decisions]
      .reverse()
      .find((row) => row.transition === "close-work");
    const readback = readReleases(repoRoot, workId).at(-1) ?? null;
    const liveRun =
      latest &&
      (latest.status === "RUNNING" || latest.status === "WAITING_HUMAN");

    let stage;
    let next;
    if (closure && !liveRun) {
      stage = closure.decision === "cancelled" ? "CANCELLED" : "CLOSED";
      const result =
        typeof closure.subject?.result === "string" &&
        closure.subject.result.length > 0
          ? closure.subject.result
          : "see decisions.jsonl";
      next = `${stage.toLowerCase()} @ ${closure.ts ?? "?"}: ${result.slice(0, 160)}`;
    } else if (!intent.exists && (!latest || directory(workDir))) {
      // A work directory without a work description stays NO_INTENT even
      // when it has runs, as in 4.0.0; only a work known solely from
      // runtime ledgers (no directory here) shows its run state.
      stage = "NO_INTENT";
      next = `write delivery/work/${workId}/work.md (goal, scope, acceptance, implementation plan)`;
    } else if (!latest) {
      if (!plan.exists) {
        stage = intent.accepted ? "INTENT_ACCEPTED" : "INTENT_DRAFT";
        next = intent.accepted
          ? `write delivery/work/${workId}/plan.md, then accept it`
          : `buildbeat accept --repo ${repoLabel} --work ${workId} --artifact intent --by <you>`;
      } else if (!plan.accepted) {
        stage = unified
          ? plan.stale
            ? "WORK_STALE"
            : "WORK_DRAFT"
          : plan.stale
            ? "PLAN_STALE"
            : "PLAN_DRAFT";
        const artifacts = unified
          ? "work"
          : intent.accepted
            ? "plan"
            : "intent,plan";
        next = `buildbeat accept --repo ${repoLabel} --work ${workId} --artifact ${artifacts} --by <you>${plan.stale ? `   # ${unified ? "work.md" : "plan"} changed since acceptance` : ""}`;
      } else {
        stage = "READY_TO_RUN";
        next =
          configs.length > 0
            ? `buildbeat run --config ${configPath}`
            : `no run-config in delivery/work/${workId}: write one, or close it with a decisions.jsonl row {"transition":"close-work","decision":"closed","subject":{"result":"..."}} if it was doc-only`;
      }
    } else if (latest.status === "RUNNING") {
      stage = "RUNNING";
      next = `buildbeat status --repo ${repoLabel} --run ${latest.id}`;
    } else if (latest.status === "WAITING_HUMAN") {
      stage =
        latest.pendingHuman?.kind === "final-decision"
          ? "MERGE_DECISION"
          : "WAITING_HUMAN";
      const replies = latest.state
        ? nextReply({ repoLabel, state: latest.state, repoRoot })
        : [];
      next = replies[0] ?? `buildbeat status --repo ${repoLabel} --work ${workId}`;
    } else if (latest.status === "SUCCEEDED" && isReleaseLane(latest)) {
      // A release-readback lane that reached wait-close and was approved is
      // a closed release window, not "nothing to merge".
      stage = "RELEASED";
      next = `release window closed by ${latest.id}; close the work with a decisions.jsonl row {"transition":"close-work","decision":"closed","subject":{"result":"released"}}`;
    } else if (merged) {
      stage = "MERGED";
      // After the merge: the person releases, the project's readback proves
      // it, and the window closes on a passing readback. The readback lives
      // in whichever run config has a release: section; when every config
      // was read and none has one, `buildbeat release` could only fail, so
      // the merge is the end of the work. Unreadable or absent configs keep
      // the generic hint.
      const releaseConfig = configs.find((item) => item.release) ?? null;
      const releasePath = releaseConfig ? pathFor(releaseConfig) : configPath;
      const noReleaseStep =
        configs.length > 0 && !releaseConfig && !configs.some((item) => item.error);
      const close = `buildbeat decide --repo ${repoLabel} --work ${workId} --action close --result <what was released> --by <you>`;
      next = !readback
        ? noReleaseStep
          ? "merged; no release readback configured, nothing left to do (add a release: section to the run config to record a readback and close the window)"
          : `candidate ${mergedRun.candidate.slice(0, 7)} (${mergedRun.id}) is on ${mainRef}; release it (a human action), then buildbeat release --config ${releasePath}; then ${close}`
        : readback.status === "passed"
          ? `readback passed @ ${readback.ts} (${readback.commit.slice(0, 7)}); close the window: ${close}`
          : `latest readback failed @ ${readback.ts} (exit ${readback.exitCode}); fix the release, then buildbeat release --config ${releasePath} again`;
      if (latest.status !== "SUCCEEDED") {
        next += `   # latest run ${latest.id} ended ${latest.status} after the merge`;
      }
    } else if (latest.status === "SUCCEEDED") {
      stage = "MERGE_READY";
      next = latest.candidate
        ? `merge ${latest.candidate.slice(0, 7)} (run/${latest.id}) into ${mainRef} — manual, then push`
        : "run succeeded without a candidate; nothing to merge";
    } else {
      stage = `STOPPED_${latest.status}`;
      next = plan.accepted
        ? `decide: retry (buildbeat run --config ${configPath} --new) or close the work`
        : `${unified ? "work.md" : "plan"} not accepted (${plan.exists ? "draft" : "missing"}); fix that before another run`;
    }
    rows.push({
      work: workId,
      ...(config ? { config: config.path, hasRelease: configs.some((item) => item.release) ? true : configs.some((item) => item.error) ? null : false } : { hasRelease: false }),
      ...(config?.target && (!config.repo || config.repo !== currentRoot) && followTargets ? { targetRepo: config.repo ?? config.target, targetLabel: pathLabel(cwd ?? process.cwd(), config.repo ?? config.target) } : {}),
      stage,
      intent,
      plan,
      ...(unified ? { workArtifact: "work" } : {}),
      envFacts,
      openFindings,
      findings: findingRows
        .filter((item) => item.kind === "finding")
        .map((item) => ({
          ...item,
          adjudication: adjudicated.get(item.fingerprint)?.action ?? "open",
        })),
      runs: runs.length,
      cost: runs.length > 0 ? computeWorkCost(repoRoot, workId) : null,
      latest: latest
        ? {
            id: latest.id,
            status: latest.status,
            candidate: latest.candidate,
            at: latest.lastAt,
            source: latest.source,
            terminalReason: latest.terminal?.reason ?? null,
            waiting: latest.pendingHuman?.transition ?? null,
          }
        : null,
      merged,
      mergedCandidate: mergedRun?.candidate ?? null,
      ...(readback
        ? {
            readback: {
              status: readback.status,
              at: readback.ts,
              commit: readback.commit,
              digest: readback.digest,
              ...(readback.note ? { note: readback.note } : {}),
            },
          }
        : {}),
      next: local ? next : next.replaceAll("--config <run-config.yaml>", `--config ${configPath}`),
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
    if (row.repo) lines.push(`  repo: ${row.repoLabel ?? row.repo}`);
    if (row.targetRepo) lines.push(`  runs in: ${row.targetLabel ?? row.targetRepo}`);
    const parts =
      row.workArtifact === "work"
        ? [`work.md ${mark(row.plan)}`, `runs ${row.runs}`]
        : [
            `intent ${mark(row.intent)}`,
            `plan ${mark(row.plan)}`,
            `runs ${row.runs}`,
          ];
    const settled = ["MERGED", "RELEASED", "CLOSED", "CANCELLED"].includes(
      row.stage,
    );
    if (row.openFindings > 0 && !settled) {
      // Unadjudicated, not necessarily unresolved: a fixer may have closed
      // them without anyone recording a verdict. The number says "nobody
      // ruled on these", which is exactly what a human should know.
      parts.push(`unadjudicated P0/P1 findings ${row.openFindings}`);
    }
    if (!settled && row.findings?.length) {
      for (const finding of row.findings)
        lines.push(
          `  [${finding.severity} ${finding.fingerprint}] (${finding.adjudication}) ${finding.summary}`,
        );
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
      const cand = row.latest.candidate
        ? ` candidate ${row.latest.candidate.slice(0, 7)}${row.latest.candidate === row.mergedCandidate ? " (merged)" : ""}`
        : "";
      const wait = row.latest.waiting ? ` waiting ${row.latest.waiting}` : "";
      const why = row.latest.terminalReason
        ? ` — ${row.latest.terminalReason.slice(0, 100)}`
        : "";
      lines.push(
        `  latest ${row.latest.id} ${row.latest.status}${cand}${wait} @ ${row.latest.at ?? "?"}${why}`,
      );
    }
    lines.push(`  next: ${row.next}`);
  }
  return lines.join("\n");
}

// The main repo's configuration remains the command source; all state and
// decisions come from the checkout that owns the work. Only the main repo's
// pointers are followed, so targets cannot recursively expand this view.
export function computeRepositoryOverview(repoRoot, { work = null, allRepos = false, cwd = process.cwd(), localRepoLabel = shellArg(pathLabel(cwd, repoRoot)) } = {}) {
  repoRoot = realpathSync(repoRoot);
  const context = overviewContext(repoRoot);
  const warnings = [];
  const roots = allRepos ? discoverRepos(repoRoot, warnings, context.roots) : [repoRoot];
  const primary = computeOverview(repoRoot, { work, cwd, repoLabel: allRepos ? shellArg(pathLabel(cwd, repoRoot)) : localRepoLabel, warnings, context, localCompatibility: !allRepos });
  const groups = new Map(roots.map((repo) => [repo, new Map()]));
  for (const row of primary) {
    const owner = row.repo ?? repoRoot;
    if (!groups.has(owner)) groups.set(owner, new Map());
    groups.get(owner).set(row.work, row);
  }
  if (allRepos) {
    for (const root of roots.filter((root) => root !== repoRoot)) {
      for (const row of computeOverview(root, { work, cwd, followTargets: false, warnings, context, skipWorks: new Set(groups.get(root).keys()), repoLabel: shellArg(pathLabel(cwd, root)) })) {
        if (!groups.get(root).has(row.work)) groups.get(root).set(row.work, row);
      }
    }
  }
  const pending = [];
  const repos = [];
  for (const [repo, byWork] of groups) {
    const works = [...byWork.values()].sort((a, b) => a.work.localeCompare(b.work)).map((row) => ({
      ...row, repo, repoLabel: pathLabel(cwd, repo),
      ...(row.targetRepo ? { targetLabel: pathLabel(cwd, row.targetRepo) } : {}),
    }));
    const settled = { total: 0, closed: 0, cancelled: 0, merged: 0 };
    for (const row of works) {
      if (allRepos && row.stage === "RUNNING" && row.latest?.source === "runtime") {
        const ledger = EventLedger.open(join(repo, ".buildbeat", "runtime", "runs", row.latest.id, "events.jsonl"));
        const live = describeLiveness({ repoRoot: repo, runId: row.latest.id, ledger });
        if (live.inFlight?.stalled) row.stage = "STALLED";
      }
      const kind = row.stage === "CLOSED" ? "closed" : row.stage === "CANCELLED" ? "cancelled" : row.stage === "MERGED" && row.hasRelease === false ? "merged" : null;
      row.settled = Boolean(kind);
      if (kind) { settled[kind]++; settled.total++; }
    }
    repos.push({ repo, works, settled });
    for (const row of listInbox(repo)) {
      if (work && row.work !== work && !row.corrupted) continue;
      if (!allRepos && repo !== repoRoot && !byWork.has(row.work) && !row.corrupted) continue;
      if (repo === repoRoot && primary.some((item) => item.work === row.work && item.repo && item.repo !== repoRoot)) continue;
      pending.push({ ...row, repo, ...(byWork.get(row.work)?.config ? { config: byWork.get(row.work).config } : {}) });
    }
  }
  return { repos, pending, warnings: [...new Set(warnings)] };
}
