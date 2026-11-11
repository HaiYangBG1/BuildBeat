// Where each work stands and who moves next. Everything here is derived:
// work folders and decision records in Git, run ledgers on this machine (run
// records fill in for runs whose ledger is elsewhere), and Git ancestry for
// "merged". Nothing is written.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { describeActor, selfMergeApproval } from "./actor.js";
import { checkPromotions, readResult } from "./closeout.js";
import { listInbox } from "./decisions.js";
import { directory, discoverRepos, hasProjectConfig, pathLabel, readRunLedgers, shellArg, workDeclaresRelease } from "./overview-repos.js";

import { latestAdjudications, readFindingsAccount } from "./findings.js";
import { nextReply } from "./hints.js";
import { readReleases } from "./release.js";
import { computeWorkCost, renderWorkCost } from "./work-cost.js";
import { codeCommitsOf } from "./work-commits.js";

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

// The work's description: is work.md there, and accepted with the bytes it
// has now?
export function descriptionStatus(workDir, decisions) {
  const path = join(workDir, "work.md");
  if (!existsSync(path)) {
    return { exists: false, accepted: false, stale: false };
  }
  const digest = sha256File(path);
  const latest = decisions
    .filter((row) => row.transition === "accept-work" && row.decision === "approved")
    .at(-1);
  if (!latest) {
    return { exists: true, accepted: false, stale: false };
  }
  const stale = latest.subject?.digest !== digest;
  return {
    exists: true,
    accepted: !stale,
    stale,
    by: latest.by,
    actor: latest.actor ?? null,
    at: latest.ts,
  };
}

// The commits on ref, from one `git rev-list` per repository and ref, or
// null when Git cannot list them (or the list passes 64 MB, about a million
// and a half commits). In a pilot workspace one cross-repository status
// spawned a merge-base process for each of 102 candidates (WORK-OVERVIEW-SPEED).
const FULL_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function commitsOn(repoRoot, ref, context) {
  const key = JSON.stringify([repoRoot, ref]);
  if (!context.reach.has(key)) {
    let commits = null;
    try {
      const out = execFileSync("git", ["-C", repoRoot, "rev-list", ref, "--"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
      });
      commits = new Set(out.split("\n").filter(Boolean));
    } catch {
      commits = null;
    }
    context.reach.set(key, commits);
  }
  return context.reach.get(key);
}

// A full commit id is looked up in the list of commits on ref; anything
// else (a short id, a ref Git cannot list) asks merge-base, as before.
function isAncestor(repoRoot, sha, ref, context) {
  const key = JSON.stringify([repoRoot, sha, ref]);
  if (context.ancestry.has(key)) return context.ancestry.get(key);
  const commits = FULL_COMMIT.test(sha) ? commitsOn(repoRoot, ref, context) : null;
  if (commits) {
    context.ancestry.set(key, commits.has(sha));
    return commits.has(sha);
  }
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
// ledgers: the repository's run ledgers already read for this call
// (readRunLedgers); without them every ledger is read here.
export function runsFor(repoRoot, workId, ledgers = null) {
  const runs = new Map();
  for (const { ledger } of ledgers ?? readRunLedgers(repoRoot)) {
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
      pass: state.run.pass === true,
      steps: Object.keys(state.steps),
      state,
      source: "runtime",
    });
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
          pass: record.pass === true,
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

// Per status invocation, read-only caches: every work's runs, its cost and
// the work-id scan read the same ledgers, and "is this commit on the branch"
// is answered from one rev-list per branch. In a pilot workspace one
// cross-repository status opened 245 ledgers 20,390 times
// (WORK-OVERVIEW-SPEED).
function overviewContext(repoRoot) {
  return {
    roots: new Map([[realpathSync(repoRoot), realpathSync(repoRoot)]]),
    heads: new Map(),
    ancestry: new Map(),
    ledgers: new Map(),
    reach: new Map(),
  };
}

function ledgersOf(repoRoot, context) {
  if (!context.ledgers.has(repoRoot)) context.ledgers.set(repoRoot, readRunLedgers(repoRoot));
  return context.ledgers.get(repoRoot);
}

// What says a folder without work.md once held a work: records, or a
// description in an earlier version's format, which is any Markdown or YAML
// file this version does not itself put there before work.md (a run config,
// notes, environment facts). They stay in Git and are not read.
const RECORDS = ["decisions.jsonl", "review-findings.jsonl", "releases.jsonl", "result.md", "runs"];
const DRAFT_FILES = /^(?:run-config.*\.yaml|notes\.md|env-facts\.md)$/;
const heldWork = (workDir) =>
  directory(workDir) &&
  readdirSync(workDir).some((name) => RECORDS.includes(name) || (/\.(md|ya?ml)$/.test(name) && !DRAFT_FILES.test(name)));

export function computeOverview(
  repoRoot,
  { work = null, repoLabel = ".", context = overviewContext(repoRoot), committed: findCommitted = true } = {},
) {
  const workRoot = join(repoRoot, "delivery", "work");
  const rows = [];
  const workIds = new Set(directory(workRoot) ? readdirSync(workRoot).filter((id) => directory(join(workRoot, id))) : []);
  for (const { ledger } of ledgersOf(repoRoot, context)) {
    const run = ledger.state.run;
    if (run?.work) workIds.add(run.work);
  }
  const mainRef = headRef(repoRoot, context);
  const reviewable = hasProjectConfig(repoRoot);
  // Works nobody reviewed that may have commits behind them; looked up
  // together after the loop, with one git log for all of them.
  const unrun = [];
  for (const workId of [...workIds].sort()) {
    if (work && workId !== work) {
      continue;
    }
    const workDir = join(workRoot, workId);
    const runs = runsFor(repoRoot, workId, ledgersOf(repoRoot, context));
    const decisions = readJsonl(join(workDir, "decisions.jsonl"));
    const description = descriptionStatus(workDir, decisions);
    const legacy = !description.exists && heldWork(workDir);
    if (!description.exists && !legacy && runs.length === 0 && !directory(workDir)) continue;
    const envFacts = existsSync(join(workDir, "env-facts.md"));
    const findingRows = readFindingsAccount(repoRoot, workId);
    // Run and work decisions from decisions.jsonl, finding rulings from
    // review-findings.jsonl, in time order.
    const decisionRows = [
      ...decisions.map((item) => ({
        ts: item.ts ?? null,
        decisionRef: item.decisionRef ?? null,
        ...(item.run ? { run: item.run } : {}),
        transition: item.transition ?? null,
        decision: item.decision ?? null,
        by: item.by ?? null,
        actor: item.actor ?? null,
        who: describeActor(item),
        ...(item.adopted ? { adopted: item.adopted, resumeAt: item.resumeAt ?? null } : {}),
        ...(typeof item.note === "string" && item.note ? { note: item.note } : {}),
      })),
      ...findingRows.filter((item) => item.kind === "adjudication").map((item) => ({
        ts: item.ts ?? null,
        decisionRef: null,
        transition: "adjudicate-finding",
        decision: item.action ?? null,
        fingerprint: item.fingerprint ?? null,
        by: item.by ?? null,
        actor: item.actor ?? null,
        who: describeActor(item),
        ...(typeof item.note === "string" && item.note ? { note: item.note } : {}),
      })),
    ].sort((a, b) => String(a.ts ?? "").localeCompare(String(b.ts ?? "")));
    const selfMerge = selfMergeApproval(decisionRows);
    const adjudicated = latestAdjudications(findingRows);
    const openFindings = findingRows.filter(
      (row) =>
        row.kind === "finding" &&
        (row.severity === "P0" || row.severity === "P1") &&
        !adjudicated.has(row.fingerprint),
    ).length;
    const live = runs.filter((run) => run.status !== "SUPERSEDED");
    const latest = live[live.length - 1] ?? null;
    // "Merged" is a fact about any approved commit of the work, not only the
    // latest run's. A reviewed commit is on its branch before anyone decided
    // on it, so only an approved one counts; a run an earlier version made
    // counts whatever its end (a pilot's shipped candidate sat behind a
    // CANCELLED run).
    const mergedRun =
      [...runs]
        .reverse()
        .find(
          (run) =>
            run.candidate &&
            (!run.pass || run.status === "SUCCEEDED") &&
            isAncestor(repoRoot, run.candidate, mainRef, context),
        ) ?? null;
    const merged = Boolean(mergedRun);

    // A work is closed by an explicit row in decisions.jsonl:
    //   {"transition":"close-work","decision":"closed"|"cancelled","subject":{"result":"..."}}
    // A live run (RUNNING / WAITING_HUMAN) contradicts a closure and wins, so
    // a stale close row can never hide something that still needs a person.
    const closure = [...decisions]
      .reverse()
      .find((row) => row.transition === "close-work");
    const readback = readReleases(repoRoot, workId).at(-1) ?? null;
    const liveRun =
      latest &&
      (latest.status === "RUNNING" || latest.status === "WAITING_HUMAN");
    // true, false, or null when the work's run config cannot be read (which
    // counts as a release: a readback is never skipped for that).
    const declaresRelease = workDeclaresRelease(repoRoot, workId);

    // A work closes with its result page (closeout.js): the hint names the
    // page and the command, and a closed work says how many conclusions it
    // wrote into the project and whether the page changed afterwards.
    const page = readResult(repoRoot, workId);
    const closedDigest =
      closure && typeof closure.subject?.resultDigest === "string"
        ? closure.subject.resultDigest
        : null;
    const resultChanged = Boolean(closedDigest) && page.digest !== closedDigest;
    const closeOut = `write delivery/work/${workId}/result.md, then buildbeat decide --repo ${repoLabel} --work ${workId} --action close --by <you>`;
    const review = `buildbeat review --repo ${repoLabel} --work ${workId}`;
    const release = `buildbeat release --repo ${repoLabel} --work ${workId}`;

    let stage;
    let next;
    let maybeCommitted = false;
    if (closure && !liveRun) {
      stage = closure.decision === "cancelled" ? "CANCELLED" : "CLOSED";
      const result =
        typeof closure.subject?.result === "string" &&
        closure.subject.result.length > 0
          ? closure.subject.result
          : "see decisions.jsonl";
      next = `${stage.toLowerCase()} @ ${closure.ts ?? "?"}: ${result.slice(0, 160)}`;
      if (closedDigest) {
        const written = Array.isArray(closure.subject.promotions)
          ? closure.subject.promotions.length
          : 0;
        next += ` · written into the project: ${written}`;
        if (resultChanged) next += " · result.md changed after closing";
      }
    } else if (legacy && !liveRun) {
      stage = "LEGACY";
      next = "legacy records: read the folder, or close it with a result.md";
    } else if (!description.exists && (!latest || directory(workDir))) {
      // A work folder without a description stays NO_INTENT even when it has
      // runs; only a work known solely from run ledgers (no folder here)
      // shows its run state.
      stage = "NO_INTENT";
      next = `write delivery/work/${workId}/work.md (goal, scope, acceptance, implementation plan)`;
    } else if (!latest) {
      maybeCommitted = findCommitted;
      if (!description.accepted) {
        stage = description.stale ? "WORK_STALE" : "WORK_DRAFT";
        next = `buildbeat accept --repo ${repoLabel} --work ${workId} --by <you>${description.stale ? "   # work.md changed since acceptance" : ""}`;
      } else {
        stage = "READY_TO_RUN";
        next = reviewable
          ? `commit the change, then ${review}`
          : `write delivery/run-config.yaml (workers.verifier, workers.reviewer), then ${review}; or, if it was doc-only, close out: ${closeOut}`;
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
        ? nextReply({ repoLabel, state: latest.state })
        : [];
      next = replies[0] ?? `buildbeat status --repo ${repoLabel} --work ${workId}`;
    } else if (merged) {
      stage = "MERGED";
      // After the merge: the person releases, the project's readback proves
      // it, and a work that declares a release closes on a passing readback
      // and its result page. A work that declares none closes out with its
      // result page alone.
      next = !readback
        ? declaresRelease === false
          ? `merged; close out: ${closeOut}`
          : `candidate ${mergedRun.candidate.slice(0, 7)} (${mergedRun.id}) is on ${mainRef}; release it (a human action), then ${release}; then ${closeOut}`
        : readback.status === "passed"
          ? `readback passed @ ${readback.ts} (${readback.commit.slice(0, 7)}); close the window: ${closeOut}`
          : `latest readback failed @ ${readback.ts} (exit ${readback.exitCode}); fix the release, then ${release} again`;
      if (latest.status !== "SUCCEEDED") {
        next += `   # latest run ${latest.id} ended ${latest.status} after the merge`;
      }
    } else if (latest.status === "SUCCEEDED") {
      stage = "MERGE_READY";
      next = latest.candidate
        ? `approved ${latest.candidate.slice(0, 7)} is not on ${mainRef}; merge it — manual, then push`
        : "run succeeded without a candidate; nothing to merge";
    } else {
      stage = `STOPPED_${latest.status}`;
      next = description.accepted
        ? `decide: commit a fix and ${review}, or close the work`
        : `work.md not accepted (${description.exists ? "draft" : "missing"}); fix that before another review`;
    }
    const row = {
      work: workId,
      hasRelease: declaresRelease,
      stage,
      // Both name the work's description; two keys for readers of earlier
      // versions' output.
      intent: description,
      plan: description,
      ...(description.exists ? { workArtifact: "work" } : {}),
      envFacts,
      openFindings,
      findings: findingRows
        .filter((item) => item.kind === "finding")
        .map((item) => {
          const verdict = adjudicated.get(item.fingerprint);
          return {
            ...item,
            adjudication: verdict?.action ?? "open",
            ...(verdict ? { adjudicatedBy: describeActor(verdict) } : {}),
          };
        }),
      // Who decided what, as recorded: rows written before identities were
      // recorded say so rather than being read as a person's decision. The
      // full list comes with a single-work view; a merge approval the AI
      // session gave itself is flagged on every view.
      ...(work ? { decisions: decisionRows } : {}),
      ...(selfMerge ? { selfMergeApproval: selfMerge } : {}),
      // The single-work view checks the page's promotion lines against Git
      // now, closed or not, so a draft shows what closing would refuse.
      ...(work && (page.exists || closedDigest)
        ? {
            result: {
              exists: page.exists,
              digest: page.digest,
              ...(closedDigest ? { closedDigest, changed: resultChanged } : {}),
              ...(page.exists ? { promotions: checkPromotions(repoRoot, workId, page.promotions) } : {}),
            },
          }
        : {}),
      runs: runs.length,
      cost: runs.length > 0 ? computeWorkCost(repoRoot, workId, { ledgers: ledgersOf(repoRoot, context) }) : null,
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
      next,
    };
    rows.push(row);
    if (maybeCommitted) {
      unrun.push({
        row, workId, repoLabel, hasResult: page.exists,
        review: reviewable ? review : null,
        release: declaresRelease !== false && readback?.status !== "passed" ? release : null,
      });
    }
  }
  markCommitted(repoRoot, mainRef, unrun);
  return rows;
}

// COMMITTED (WORK-COMMITTED-WORKS): a work nobody reviewed, not closed, whose
// code commits are on the branch. It says there are commits, not that the
// work is done; in a repository whose commits are reviewed the review comes
// first, otherwise the close-out.
function markCommitted(repoRoot, branch, unrun) {
  if (unrun.length === 0) return;
  const found = codeCommitsOf(repoRoot, branch, unrun.map((item) => item.workId));
  for (const { row, workId, repoLabel, hasResult, review, release } of unrun) {
    const commits = found.get(workId);
    if (!commits?.length) continue;
    const describe = (item) => ({ commit: item.commit, at: new Date(item.time * 1000).toISOString(), subject: item.subject });
    row.stage = "COMMITTED";
    row.committed = { commits: commits.length, branch, first: describe(commits.at(-1)), latest: describe(commits[0]) };
    const close = `buildbeat decide --repo ${repoLabel} --work ${workId} --action close`;
    row.next = hasResult
      ? `if it is done, close it out: ${close} --by <you>`
      : `if it is done, close it out: ${close} --draft, edit delivery/work/${workId}/result.md, then ${close} --by <you>`;
    // A work that declares a release closes on a passing readback, so the
    // readback comes first.
    if (release) row.next = row.next.replace("close it out: ", `release it (a human action), then ${release} --env <name>; then close it out: `);
    if (review) row.next = `${review}; or, ${row.next}`;
  }
}

// What a decision line adds for a repair handed in with --adopt: the
// commit it adopted and where the run resumed.
export function adoptedNote(item) {
  return item.adopted ? ` — adopted ${String(item.adopted).slice(0, 7)}, resumed at ${item.resumeAt ?? "?"}` : "";
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

// extra(row) adds lines under a row before its next step (the work thread).
export function renderOverview(rows, { decisions = false, extra = null } = {}) {
  if (rows.length === 0) {
    return "overview: no work items under delivery/work";
  }
  const lines = [];
  for (const row of rows) {
    lines.push(`${row.work}  ${row.stage}`);
    if (row.repo) lines.push(`  repo: ${row.repoLabel ?? row.repo}`);
    const parts = [
      row.workArtifact === "work" ? `work.md ${mark(row.plan)}` : row.stage === "NO_INTENT" ? "work.md –" : "legacy records",
      `runs ${row.runs}`,
    ];
    const settled = ["MERGED", "CLOSED", "CANCELLED"].includes(row.stage);
    if (row.openFindings > 0 && !settled) {
      // Unadjudicated, not necessarily unresolved: a fixer may have closed
      // them without anyone recording a verdict. The number says "nobody
      // ruled on these", which is exactly what a human should know.
      parts.push(`unadjudicated P0/P1 findings ${row.openFindings}`);
    }
    if (!settled && row.findings?.length) {
      for (const finding of row.findings)
        lines.push(
          `  [${finding.severity} ${finding.fingerprint}] (${finding.adjudication}${finding.adjudicatedBy ? ` by ${finding.adjudicatedBy}` : ""}) ${finding.summary}`,
        );
    }
    if (row.envFacts) {
      parts.push("env-facts ✓");
    }
    lines.push(`  ${parts.join(" · ")}`);
    if (row.committed) {
      const { commits, branch, latest } = row.committed;
      const subject = latest.subject.length > 80 ? `${latest.subject.slice(0, 80)}…` : latest.subject;
      lines.push(`  committed: ${commits} commit${commits === 1 ? "" : "s"} on ${branch} outside its folder, latest ${latest.commit.slice(0, 7)} @ ${latest.at.slice(0, 10)} ${subject}`);
    }
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
    const selfMerge = row.selfMergeApproval;
    if (selfMerge) {
      lines.push(
        `  note: merge approved by an AI session (${selfMerge.actor.id}, ${selfMerge.decisionRef ?? "?"}), not by a person`,
      );
    }
    if (decisions && row.decisions?.length) {
      lines.push("  decisions:");
      for (const item of row.decisions) {
        const what = [item.transition, item.fingerprint, item.decision].filter(Boolean).join(" ");
        lines.push(
          `    ${item.ts ?? "?"} ${item.decisionRef ?? "-"} ${what} by ${item.who}${adoptedNote(item)}${item.note ? ` — ${item.note}` : ""}`,
        );
      }
    }
    if (row.result?.exists) {
      const promotions = row.result.promotions ?? [];
      lines.push(`  written into the project:${promotions.length ? "" : " none"}`);
      for (const item of promotions) {
        lines.push(item.ok ? `    ✓ ${item.path} @ ${item.commit.slice(0, 7)}` : `    ✗ ${item.problem}`);
      }
    }
    if (extra) lines.push(...extra(row));
    lines.push(`  next: ${row.next}`);
  }
  return lines.join("\n");
}

// One repository, or with allRepos this one and every checkout directly
// inside it that keeps works of its own. Each repository's works, decisions
// and waiting runs are read from that repository.
export function computeRepositoryOverview(repoRoot, { work = null, allRepos = false, cwd = process.cwd(), localRepoLabel = shellArg(pathLabel(cwd, repoRoot)) } = {}) {
  repoRoot = realpathSync(repoRoot);
  const context = overviewContext(repoRoot);
  const roots = allRepos ? discoverRepos(repoRoot, context.roots) : [repoRoot];
  const pending = [];
  const repos = [];
  for (const repo of roots) {
    const works = computeOverview(repo, {
      work, context,
      repoLabel: allRepos ? shellArg(pathLabel(cwd, repo)) : localRepoLabel,
    }).map((row) => ({ ...row, repo, repoLabel: pathLabel(cwd, repo) }));
    const settled = { total: 0, closed: 0, cancelled: 0, merged: 0 };
    for (const row of works) {
      const kind = row.stage === "CLOSED" ? "closed" : row.stage === "CANCELLED" ? "cancelled" : row.stage === "MERGED" && row.hasRelease === false ? "merged" : null;
      row.settled = Boolean(kind);
      if (kind) { settled[kind]++; settled.total++; }
    }
    repos.push({ repo, works, settled });
    for (const row of listInbox(repo)) {
      if (work && row.work !== work && !row.corrupted) continue;
      pending.push({ ...row, repo });
    }
  }
  return { repos, pending, warnings: [] };
}
