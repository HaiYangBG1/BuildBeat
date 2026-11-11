#!/usr/bin/env node
// The buildbeat command line. Deliberately thin: every fact lives in the
// work's records in Git and in the run ledgers; this file parses input, wires
// the configured workers and prints derived state.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { workAccepted } from "../policy/policy.js";
import { acceptWork, approveReview, rejectReview } from "../runtime/decisions.js";
import { checkRequires } from "../runtime/env-contract.js";
import { adjudicateFinding } from "../runtime/findings.js";
import { nextAttemptId } from "../runtime/envelope.js";
import { candidateScreenshots, formatMs, nextReply } from "../runtime/hints.js";
import {
  adoptedNote,
  computeOverview,
  computeRepositoryOverview,
  descriptionStatus,
  readJsonl,
  renderOverview,
  runsFor,
} from "../runtime/overview.js";
import { discoverRepos, extraFilesWarning, heavyRecordsWarning, ignoredRecordsWarning, pathLabel, shellArg, workConfigRef } from "../runtime/overview-repos.js";
import { renderTrace, traceLines } from "../runtime/code-trace.js";
import { attachThreads, readWorks, renderThread, worksWithRef } from "../runtime/threads.js";
import { attachFacts, factsWarning, renderFacts } from "../runtime/facts.js";
import { closeWork, renderReleases, runReadback, summarizeReleases } from "../runtime/release.js";
import { writeResultDraft } from "../runtime/closeout.js";
import { installCommitHook, trailerWarning } from "../runtime/hooks.js";
import { reviewCommit } from "../runtime/orchestrator.js";
import { absoluteArgs, readerStanding, READER_QUESTIONS, runReaderTest } from "../runtime/reader.js";
import { createShellAdapter } from "../adapters/shell.js";
import { describeActor, selfMergeApproval } from "../runtime/actor.js";
import { EventLedger } from "../storage/event-ledger.js";
import { loadReviewConfig } from "./review-config.js";

const USAGE = `BuildBeat runtime

Usage:
  buildbeat --version
  buildbeat accept --repo <path> --work <WORK-ID> [--by <name>] [--as human|agent] [--note <text>]
  buildbeat review --repo <path> --work <WORK-ID> [--commit <sha>]
  buildbeat reader --repo <path> --work <WORK-ID> [--doc work|result]
  buildbeat decide --repo <path> --work <WORK-ID> --action approve --candidate <sha> [--by <name>] [--as human|agent]
  buildbeat decide --repo <path> --work <WORK-ID> --action reject --reason <text> [--by <name>] [--as human|agent]
  buildbeat decide --repo <path> --work <WORK-ID> --action accept|dismiss --fingerprint <fp> [--by <name>] [--as human|agent] [--note <text>]
  buildbeat decide --repo <path> --work <WORK-ID> --action close [--result <text>] [--note <text>] [--by <name>] [--as human|agent]
  buildbeat decide --repo <path> --work <WORK-ID> --action close --draft
  buildbeat release --repo <path> --work <WORK-ID> [--env <name>] [--ref <ref>] [--note <text>]
  buildbeat status --repo <path> [--work <WORK-ID> | --run <RUN-ID>] [--all-repos] [--json]
  buildbeat status --repo <path> [--all-repos] --ref <id> [--json]
  buildbeat status --repo <path> --releases [--all-repos] [--json]
  buildbeat history --repo <path> --path <file>[:<line>[-<line>]] [--json]
  buildbeat history --repo <path> --run <RUN-ID> [--verify]
  buildbeat check --repo <path> [--work <WORK-ID>]
  buildbeat hooks install --repo <path>

review verifies and reviews one existing commit (default HEAD) with the workers in
delivery/run-config.yaml; a work overrides them in delivery/work/<WORK-ID>/run-config.yaml.
Decisions record who made them: --by names the person or session (default:
git user.name for a person, the detected tool for an AI session); --as says
which (default: agent inside a detected AI session, otherwise human).
`;

const SWITCHES = new Set(["json", "verify", "all-repos", "draft", "releases"]);

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
    console.log(`step ${step}: ${info.status} (attempts ${info.attempts})`);
  }
  if (state.currentStep && !state.terminal) {
    const started = [...(ledger.events ?? [])]
      .reverse()
      .find((event) => event.type === "STEP_STARTED");
    if (started) {
      console.log(
        `in flight: ${state.currentStep} since ${started.ts} (${formatMs(Date.now() - Date.parse(started.ts))})`,
      );
    }
  }
  for (const item of state.evidence) {
    const ref = isAbsolute(item.ref) ? "<absolute-evidence-ref>" : item.ref;
    // A screenshot is judged by the file its digest names.
    const digest = item.kind === "screenshot" ? ` ${item.digest}` : "";
    console.log(
      `evidence [${item.status}/${item.grade}] ${item.kind} ${ref}${digest}`,
    );
  }
  // Who answered each request, as the ledger recorded it.
  for (const item of state.decisions) {
    console.log(
      `decision ${item.decisionRef} ${item.transition} ${item.decision} by ${describeActor(item)}${adoptedNote(item)}`,
    );
  }
  const selfMerge = selfMergeApproval(state.decisions);
  if (selfMerge) {
    console.log(
      `note: merge approved by an AI session (${selfMerge.actor.id}, ${selfMerge.decisionRef}), not by a person`,
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

const textDigest = (text) =>
  `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

// The runs waiting for a person, grouped by work, each with the commands
// that answer it.
function printPending(flags, rows) {
  const repoRoot = resolve(flags.repo);
  const sorted = [...rows].sort((a, b) =>
    `${a.work ?? ""}${a.run}`.localeCompare(`${b.work ?? ""}${b.run}`),
  );
  let lastWork = null;
  for (const row of sorted) {
    const rowRepo = row.repo ?? repoRoot;
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
    const ledger = EventLedger.open(ledgerPathFor(rowRepo, row.run));
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
    for (const shot of candidateScreenshots(
      ledger.state,
      row.subject.candidate,
    )) {
      console.log(`    screenshot: ${shot.ref} ${shot.digest}`);
    }
    for (const reason of row.reasons) {
      console.log(`    reason: ${reason}`);
    }
    for (const line of nextReply({
      repoLabel: realpathSync(rowRepo) === realpathSync(repoRoot) ? repoLabelFor(repoRoot, flags.repo) : shellArg(pathLabel(process.cwd(), rowRepo)),
      state: ledger.state,
    })) {
      console.log(`    next: ${line}`);
    }
  }
}

// What accept and check say about a work's folder before anything is built
// on it: records Git would ignore, files that do not belong in Git, too many
// files besides the records, facts whose code has changed, commits that name
// the work without its trailer.
function workWarnings(repoRoot, workId, repoLabel, base = null) {
  return [
    ignoredRecordsWarning(repoRoot, workId),
    heavyRecordsWarning(repoRoot, workId),
    extraFilesWarning(repoRoot, workId),
    factsWarning(repoRoot, workId, base ? { against: base, label: "base" } : {}),
    trailerWarning(repoRoot, repoLabel),
  ].filter(Boolean);
}

function commandAccept(flags) {
  if (!flags.repo || !flags.work) {
    throw new Error("accept requires --repo and --work");
  }
  if (flags.artifact !== undefined && flags.artifact !== "work") {
    throw new Error("accept records the acceptance of the work's description, work.md");
  }
  const repoRoot = resolve(flags.repo);
  const result = acceptWork(repoRoot, flags.work, {
    by: flags.by, as: flags.as, note: flags.note,
  });
  console.log(`accepted work as ${result.decisionRef} by ${describeActor(result)}`);
  console.log(`  digest: ${result.digest}`);
  for (const warning of workWarnings(repoRoot, flags.work, repoLabelFor(repoRoot, flags.repo))) {
    console.log(warning);
  }
  console.log(
    "  note: editing work.md after acceptance makes its acceptance stale",
  );
  if (!readerStanding(repoRoot, flags.work, "work")?.current) {
    console.log(`  note: delivery/work/${flags.work}/work.md has no reader test; buildbeat reader --repo ${repoLabelFor(repoRoot, flags.repo)} --work ${flags.work}`);
  }
}

// Reader test: a reader with no context answers fixed questions about one
// document of the work, in an empty directory outside the repository.
function commandReader(flags) {
  const workId = workIdOf(flags, "reader");
  const repoRoot = resolve(flags.repo);
  let options;
  try {
    options = loadReviewConfig(repoRoot, workId, { workers: false });
  } catch {
    // A work an earlier version configured: its document can still be read
    // with the project's reader.
    options = loadReviewConfig(repoRoot, null, { workers: false });
  }
  const spec = options.adapterConfigs.reader ?? options.adapterConfigs.reviewer;
  if (!spec) {
    throw new Error(`reader needs workers.reader or workers.reviewer in ${options.files.join(" or ")}`);
  }
  const adapter = createShellAdapter({
    name: `shell:${options.adapterConfigs.reader ? "reader" : "reviewer"}`,
    command: absoluteArgs(repoRoot, [spec.command])[0],
    args: absoluteArgs(repoRoot, (spec.args ?? []).map(String)),
    timeoutMs: spec.timeoutMs,
    inheritEnv: spec.inheritEnv === true,
    env: options.workerEnv[options.adapterConfigs.reader ? "reader" : "reviewer"],
  });
  const row = runReaderTest({
    repoRoot,
    workId,
    doc: flags.doc ?? null,
    adapter,
    instructions: options.envelope?.prompts?.reader?.text ?? null,
    vars: options.envelope?.vars,
    allowedPaths: options.allowedPaths,
    redact: options.redact,
  });
  const questions = READER_QUESTIONS[row.doc];
  console.log(`reader read delivery/work/${workId}/${row.doc} (${(row.bytes / 1024).toFixed(1)} KB, ${row.digest.slice(0, 19)})`);
  row.answers.forEach((answer, index) => {
    const last = index === questions.length - 1;
    const lines = Array.isArray(answer) ? answer : [answer];
    console.log(`${index + 1}. ${questions[index]}`);
    if (lines.every((line) => line.trim() === "")) {
      console.log(last ? "   (nothing)" : "   (no answer)");
    }
    for (const line of lines.filter((item) => item.trim() !== "")) {
      console.log(`   ${Array.isArray(answer) ? "- " : ""}${line}`);
    }
    const check = row.checks.find((item) => item.question === index + 1);
    if (check) {
      console.log(`   ${check.ok ? "✓" : "✗"} checked against ${check.against}${check.missed.length ? `: missing ${check.missed.join(", ")}` : ""}`);
    }
  });
  console.log(`recorded in delivery/work/${workId}/reader-tests.jsonl`);
}

// Which works wrote these lines (WORK-CODE-TRACE): blame at HEAD, mapped to
// works through recorded run ranges, Work: trailers and work folders.
async function commandTrace(flags) {
  if (!flags.repo) throw new Error("history --path requires --repo");
  const trace = await traceLines(flags.path, {
    repo: resolve(flags.repo),
    callers: [process.cwd()],
    cwd: process.cwd(),
  });
  console.log(flags.json === "true" ? JSON.stringify(trace, null, 2) : renderTrace(trace));
}

function commandEvents(flags) {
  if (!flags.repo || !flags.run) {
    throw new Error("history requires --repo and --run or --path");
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
    throw new Error("history --verify requires --repo and --run");
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

// Works that carry an external id (`- ref: <id>`), each with its thread; no
// match prints nothing (WORK-THREADS).
function commandStatusByRef(flags, repoRoot) {
  const root = realpathSync(repoRoot);
  const roots = flags["all-repos"] === "true" ? discoverRepos(root) : [root];
  const cwd = process.cwd();
  const rows = worksWithRef(readWorks(roots), String(flags.ref))
    .map((match) => {
      const row = computeOverview(match.repo, { work: match.work, repoLabel: shellArg(pathLabel(cwd, match.repo)) })[0];
      return row ? { ...row, repo: match.repo, repoLabel: pathLabel(cwd, match.repo) } : null;
    })
    .filter(Boolean);
  attachThreads(rows, roots, cwd);
  if (flags.json === "true") {
    console.log(JSON.stringify({ works: rows }, null, 2));
  } else if (rows.length) {
    console.log(renderOverview(rows.map((row) => (roots.length === 1 ? { ...row, repo: undefined } : row)), { extra: renderThread }));
  }
}

function commandStatus(flags) {
  if (!flags.repo) throw new Error("status requires --repo");
  const repoRoot = resolve(flags.repo);
  if (flags["all-repos"] === "true" && flags.run)
    throw new Error("status: --all-repos cannot be used with --run; use --work instead");
  if (flags.run && flags.work)
    throw new Error("status: choose --run or --work");
  if (flags.ref && (flags.run || flags.work))
    throw new Error("status: choose --ref, --work or --run");
  if (flags.ref && flags.releases === "true") throw new Error("status: choose --ref or --releases");
  if (flags.ref) return commandStatusByRef(flags, repoRoot);
  // What runs where (WORK-RELEASE-ENVS): the latest passing readback per
  // environment, across this repository's works (and the repositories
  // inside it with --all-repos).
  if (flags.releases === "true") {
    if (flags.run || flags.work) throw new Error("status: --releases cannot be combined with --work or --run");
    const roots = flags["all-repos"] === "true" ? discoverRepos(realpathSync(repoRoot)) : [repoRoot];
    const summary = summarizeReleases(roots);
    console.log(flags.json === "true" ? JSON.stringify({ releases: summary }, null, 2) : renderReleases(summary));
    return;
  }
  if (flags.run) {
    const path = ledgerPathFor(repoRoot, flags.run);
    if (!existsSync(path))
      throw new Error(
        `no runtime ledger for ${flags.run}; use status --work to read archived records`,
      );
    const ledger = EventLedger.open(path);
    if (flags.json === "true")
      console.log(JSON.stringify({ state: ledger.state, corruption: ledger.corruption }, null, 2));
    else
      printState(ledger.state, ledger, { repoLabel: repoLabelFor(repoRoot, flags.repo) });
    return;
  }
  const allRepos = flags["all-repos"] === "true";
  const result = computeRepositoryOverview(repoRoot, { work: flags.work ?? null, allRepos, localRepoLabel: repoLabelFor(repoRoot, flags.repo) });
  const rows = result.repos.flatMap((group) => group.works);
  // One work's view also shows the works linked to it (WORK-THREADS) and
  // which code its facts point at has changed (WORK-FACT-POINTERS).
  if (flags.work) {
    attachThreads(rows, result.repos.map((group) => group.repo));
    attachFacts(rows);
  }
  const extra = flags.work ? (row) => [...renderFacts(row), ...renderThread(row)] : null;
  if (flags.json === "true") {
    // One repository answers about itself: its rows name no repository.
    const local = ({ repo, repoLabel, settled, hasRelease, ...row }) => row;
    console.log(JSON.stringify(allRepos ? result : {
      works: rows.map(local),
      pending: result.pending.map(({ repo, ...row }) => row),
    }, null, 2));
    return;
  }
  if (!allRepos) {
    console.log(renderOverview(rows.map((row) => ({ ...row, repo: undefined })), { decisions: Boolean(flags.work), extra }));
    if (result.pending.length) printPending(flags, result.pending);
    return;
  }
  for (const group of result.repos) {
    const pending = result.pending.filter((row) => row.repo === group.repo);
    if (pending.length) {
      console.log(`pending decisions · ${pathLabel(process.cwd(), group.repo)}`);
      printPending(flags, pending);
    }
  }
  for (const group of result.repos) {
    // A work asked for by name is shown even when it is settled.
    const open = group.works.filter((row) => flags.work || !row.settled);
    if (open.length) {
      console.log(`repo ${pathLabel(process.cwd(), group.repo)}:`);
      console.log(renderOverview(open, { decisions: Boolean(flags.work), extra }));
    }
  }
  for (const group of result.repos) {
    const count = group.settled;
    console.log(`${pathLabel(process.cwd(), group.repo)}: settled ${count.total} (closed ${count.closed} · cancelled ${count.cancelled} · merged, not closed ${count.merged})`);
  }
}

// A work id becomes part of paths and branch names.
function workIdOf(flags, command) {
  if (!flags.repo || !flags.work) {
    throw new Error(`${command} requires --repo and --work`);
  }
  const workId = String(flags.work);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(workId) || workId.includes("..")) {
    throw new Error(`--work ${workId} is not a work id`);
  }
  return workId;
}

// Verify and review one existing commit of a work: the commit is checked out
// by itself, the project's verifier runs on it and, when that passes, the
// read-only reviewer. The change under review is what the commit adds after
// the commit that holds the accepted work.md (or after `base:` in the work's
// run config).
function commandReview(flags) {
  const workId = workIdOf(flags, "review");
  const repoRoot = resolve(flags.repo);
  const repoLabel = repoLabelFor(repoRoot, flags.repo);
  const again = `buildbeat review --repo ${repoLabel} --work ${workId}`;
  const ref = `delivery/work/${workId}/work.md`;
  const options = loadReviewConfig(repoRoot, workId);
  const accepted = workAccepted({
    workDir: join(repoRoot, "delivery", "work", workId),
  });
  if (accepted.ok !== true) {
    throw new Error(
      `${ref} is not accepted (${accepted.why}); buildbeat accept --repo ${repoLabel} --work ${workId} --by <you>`,
    );
  }
  const git = (args) =>
    execFileSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commitOf = (name) => {
    // A name that starts with "-" would be read by git as an option.
    if (String(name).startsWith("-")) {
      throw new Error(`${name} does not name a commit`);
    }
    try {
      return git(["rev-parse", "--verify", `${name}^{commit}`]);
    } catch {
      throw new Error(`${name} does not name a commit`);
    }
  };
  const commit = commitOf(flags.commit ?? "HEAD");
  const short = commit.slice(0, 7);
  const missing = `commit ${short} does not contain ${ref}; commit the accepted work.md first, then the change`;
  // Where the work starts: the commit that last wrote its work.md, unless
  // the work's run config names another one.
  const base = options.base
    ? commitOf(options.base)
    : git(["log", "-1", "--format=%H", commit, "--", ref]);
  if (!base) {
    throw new Error(missing);
  }
  if (base === commit) {
    throw new Error(
      `nothing to review: ${short} is the commit the work starts from; commit the change after it${options.base ? "" : `, or name an earlier start as base: in ${workConfigRef(workId)}`}`,
    );
  }
  // Compared on the checkout itself, where Git has applied that checkout's
  // attributes and filters.
  const verifyCheckout = (worktreePath) => {
    const file = join(worktreePath, ref);
    if (!existsSync(file)) {
      throw new Error(missing);
    }
    if (textDigest(readFileSync(file, "utf8")) !== options.planDigest) {
      throw new Error(
        `commit ${short} carries a different ${ref} than the accepted one; commit the accepted version, or accept the new one`,
      );
    }
  };
  const runId = nextAttemptId(repoRoot, workId, options.family);
  console.log(`reviewing ${short} as ${runId} (changes since ${base.slice(0, 7)})`);
  const result = reviewCommit({ ...options, runId, base, commit, verifyCheckout });
  for (const run of result.superseded ?? []) {
    console.log(
      `superseded ${run} (an earlier review of this work was still waiting; now SUPERSEDED)`,
    );
  }
  for (const row of result.supersedeSkipped ?? []) {
    console.log(`could not supersede ${row.run}: ${row.reason}`);
  }
  for (const run of result.interrupted ?? []) {
    console.log(
      `ended ${run} (its review was interrupted: the process is gone; now CANCELLED)`,
    );
  }
  if (result.checkoutLeft) {
    console.log(`warning: the review checkout could not be removed (${result.checkoutLeft})`);
  }
  const ledger = EventLedger.open(result.ledgerPath);
  printState(ledger.state, ledger, { repoLabel });
  // A run that ended reviewed nothing a person can decide on.
  if (ledger.state.terminal) {
    console.log(
      ledger.state.terminal.status === "FAILED"
        ? `next: fix it, commit, then ${again}`
        : `next: once the tooling works again, ${again}`,
    );
    process.exitCode = 1;
  }
}

// Runs the project's release readback once and records it in the work.
function commandRelease(flags) {
  const workId = workIdOf(flags, "release");
  const repoRoot = resolve(flags.repo);
  const options = loadReviewConfig(repoRoot, workId, { workers: false });
  if (!options.release) {
    throw new Error(
      `release needs a release: section in ${options.files.join(" or ")} (command, args, timeoutMs, env, like a worker)`,
    );
  }
  const row = runReadback({
    repoRoot,
    workId,
    spec: options.release,
    redact: options.redact,
    runs: runsFor(repoRoot, workId),
    ref: flags.ref ?? "HEAD",
    env: flags.env ?? null,
    note: flags.note ?? null,
  });
  const repoLabel = repoLabelFor(repoRoot, flags.repo);
  const bound = row.run ? `(${row.run})` : `(not reviewed: latest commit of ${workId} in ${row.ref})`;
  console.log(
    `readback ${row.status} (exit ${row.exitCode}) for ${row.ref} at ${row.commit.slice(0, 7)}${row.env ? ` in ${row.env}` : ""}, candidate ${row.candidate.slice(0, 7)} ${bound}${row.note ? ` — ${row.note}` : ""}`,
  );
  if (row.checkout !== row.commit) {
    console.log(
      `  note: the command ran in the main checkout at ${row.checkout.slice(0, 7)}, not at ${row.ref}`,
    );
  }
  console.log(`  log: ${row.log}`);
  console.log(`  recorded: delivery/work/${workId}/releases.jsonl`);
  for (const line of row.tail.slice(-5)) {
    console.log(`  | ${line}`);
  }
  console.log(
    row.status === "passed"
      ? `next: write delivery/work/${workId}/result.md, then buildbeat decide --repo ${repoLabel} --work ${workId} --action close --by <you>`
      : "next: fix the release, then run buildbeat release again; the window cannot close on a failed readback",
  );
  if (row.status !== "passed") {
    process.exitCode = 1;
  }
}

// Reads the run config the way review will and says what it found: the
// workers, the environment the project requires, and, for a work, whether
// its description is accepted. Nothing is run or written.
function commandCheck(flags) {
  if (!flags.repo) {
    throw new Error("check requires --repo");
  }
  const workId = flags.work ? workIdOf(flags, "check") : null;
  const repoRoot = resolve(flags.repo);
  const repoLabel = repoLabelFor(repoRoot, flags.repo);
  const options = loadReviewConfig(repoRoot, workId);
  let problems = 0;
  console.log(`run config: ${options.files.join(" + ")}`);
  for (const [name, spec] of Object.entries(options.adapterConfigs)) {
    const env = Object.keys(spec.env ?? {});
    console.log(
      `  ${name}: ${[spec.command, ...(spec.args ?? [])].join(" ")}${spec.timeoutMs ? ` (timeout ${formatMs(spec.timeoutMs)})` : ""}`,
    );
    console.log(
      `    environment: ${spec.inheritEnv === true ? "the host's (inheritEnv: true)" : "allowlist; host credentials withheld"}${env.length ? `, plus ${env.join(", ")}` : ""}`,
    );
  }
  console.log(
    options.envelope
      ? `  prompts: ${options.envelope.source} (${Object.keys(options.envelope.prompts).join(", ") || "none found"}) ${options.envelope.digest}`
      : "  prompts: none (workers get no BUILDBEAT_PROMPT)",
  );
  console.log(`  merge checks: accepted work.md, verify passed on the commit, no undismissed finding above ${options.deliveryChecks.maxSeverity}${options.deliveryChecks.requireScreenshot ? ", screenshots from verify" : ""}`);
  console.log(`  release readback: ${options.release ? [options.release.command, ...(options.release.args ?? [])].join(" ") : "none"}`);
  if (options.allowedPaths) {
    console.log(`  allowed paths: ${options.allowedPaths.join(", ")} (the work's own folder is always allowed)`);
  }
  if (options.base) {
    console.log(`  base: ${options.base}`);
  }
  if (options.requires.length > 0) {
    console.log("environment contract (requires):");
    const check = checkRequires(options.requires);
    for (const row of check.checked) {
      console.log(`  ${row.command}: OK${row.version ? ` (${row.version})` : ""}`);
    }
    for (const problem of check.problems) {
      console.log(`  PROBLEM ${problem}`);
      problems += 1;
    }
  } else {
    console.log("environment contract: none declared (implicit PATH facts stay unchecked)");
  }
  if (workId) {
    const workDir = join(repoRoot, "delivery", "work", workId);
    const description = descriptionStatus(workDir, readJsonl(join(workDir, "decisions.jsonl")));
    if (!description.exists) {
      console.log(`  PROBLEM delivery/work/${workId}/work.md is missing`);
      problems += 1;
    } else if (!description.accepted) {
      console.log(`  PROBLEM work.md is ${description.stale ? "changed since its acceptance" : "not accepted"}: buildbeat accept --repo ${repoLabel} --work ${workId} --by <you>`);
      problems += 1;
    } else {
      console.log(`work.md: accepted by ${describeActor(description)}`);
    }
    for (const warning of workWarnings(repoRoot, workId, repoLabel, options.base)) {
      console.log(warning);
    }
  }
  if (problems > 0) {
    process.exitCode = 1;
    return;
  }
  console.log(workId ? `ready: commit the change, then buildbeat review --repo ${repoLabel} --work ${workId}` : "ready");
}

function commandDecide(flags) {
  const workId = workIdOf(flags, "decide");
  const repoRoot = resolve(flags.repo);
  const repoLabel = repoLabelFor(repoRoot, flags.repo);
  if (flags.action === "close") {
    if (flags.draft === "true") {
      const closed = readJsonl(join(repoRoot, "delivery", "work", workId, "decisions.jsonl"))
        .some((row) => row.transition === "close-work");
      const draft = writeResultDraft({ repoRoot, workId, closed });
      const close = `buildbeat decide --repo ${repoLabel} --work ${workId} --action close`;
      console.log(
        `wrote delivery/work/${workId}/result.md (a draft from ${draft.commits} commit${draft.commits === 1 ? "" : "s"}); check it against Git and the work, delete its first line, then ${close} --by <you>`,
      );
      return;
    }
    const row = closeWork({
      repoRoot,
      workId,
      result: flags.result,
      note: flags.note,
      runs: runsFor(repoRoot, workId),
      by: flags.by, as: flags.as,
    });
    const parts = [
      `result.md ${row.subject.resultDigest.slice(0, 19)}`,
      `written into the project: ${row.subject.promotions.length}`,
      ...(row.subject.readback
        ? [`readback ${row.subject.readback.slice(0, 19)} at ${row.subject.commit.slice(0, 7)}`]
        : []),
    ];
    console.log(
      `closed ${workId} as ${row.decisionRef} by ${describeActor(row)} (${parts.join(" · ")})`,
    );
    return;
  }
  // The commit a review left waiting.
  if (flags.action === "approve" && !flags.fingerprint) {
    const result = approveReview(repoRoot, workId, {
      by: flags.by, as: flags.as,
      candidate: flags.candidate,
    });
    console.log(`approved ${result.transition} as ${result.decisionRef} by ${describeActor(result)}`);
    console.log(`  candidate: ${result.subject.candidate}`);
    console.log(`  planDigest: ${result.subject.planDigest}`);
    console.log(
      `${result.runId} is terminal: SUCCEEDED (merge itself stays a manual external action)`,
    );
    return;
  }
  if (flags.action === "reject") {
    if (typeof flags.reason !== "string" || !flags.reason.trim()) {
      throw new Error("reject requires --reason <text>");
    }
    const result = rejectReview(repoRoot, workId, {
      by: flags.by, as: flags.as,
      reason: flags.reason,
    });
    console.log(
      `rejected ${result.candidate.slice(0, 7)} as ${result.decisionRef} by ${describeActor(result)}; ${result.runId} cancelled and compacted`,
    );
    return;
  }
  // A ruling on one finding.
  if (["accept", "dismiss"].includes(flags.action) && flags.fingerprint) {
    const result = adjudicateFinding(repoRoot, workId, {
      fingerprint: flags.fingerprint,
      action: flags.action,
      by: flags.by, as: flags.as,
      note: flags.note,
    });
    console.log(JSON.stringify(result));
    return;
  }
  throw new Error(
    "decide requires --action approve|reject, accept|dismiss with --fingerprint, or close",
  );
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
  const commands = {
    accept: commandAccept,
    review: commandReview,
    reader: commandReader,
    decide: commandDecide,
    release: commandRelease,
    status: commandStatus,
    check: commandCheck,
    history: (flags) => {
      if (flags.path) return commandTrace(flags);
      return flags.verify === "true" ? commandReplay(flags) : commandEvents(flags);
    },
    hooks: () => {
      const [action, ...more] = rest;
      if (action !== "install") throw new Error("usage: buildbeat hooks install --repo <path>");
      const flags = parseFlags(more);
      if (!flags.repo) throw new Error("hooks install requires --repo");
      console.log(installCommitHook(resolve(flags.repo)).message);
    },
  };
  if (!Object.hasOwn(commands, command ?? "")) {
    // Anything else, the commands of earlier versions included.
    (command ? process.stderr : process.stdout).write(
      command ? `error: unknown command ${command}\n\n${USAGE}` : USAGE,
    );
    process.exitCode = command ? 2 : 0;
    return;
  }
  try {
    await commands[command](command === "hooks" ? null : parseFlags(rest));
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

await main();
