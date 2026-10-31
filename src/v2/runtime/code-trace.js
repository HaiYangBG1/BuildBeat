// Code trace (WORK-CODE-TRACE): which works wrote these lines. The lines are
// blamed at HEAD and each commit is mapped to a work through three facts
// only: the commit lies in a recorded run's base..candidate range (run
// records in Git, run ledgers on this machine), its message carries a
// "Work: <ID>" trailer, or it changes files under delivery/work/<ID>/. A
// subject that merely names a work does not count, because subjects often
// cite another work. Lines none of these explain are counted, never guessed.
// Real cost behind it: in a pilot workspace, run records alone traced 20% to
// 82% of two months of lines in three code repositories; the largest
// untraced block was a 2,949-line feature commit with no work id anywhere.

import { execFile, execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { availableParallelism } from "node:os";
import { promisify } from "node:util";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { EventLedger } from "../storage/event-ledger.js";
import { describeActor } from "./actor.js";
import { readResult } from "./closeout.js";
import { computeOverview, readJsonl } from "./overview.js";
import { directory, pathLabel } from "./overview-repos.js";

export class TraceError extends Error {
  constructor(message) {
    super(message);
    this.name = "TraceError";
  }
}

function git(cwd, args, input) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
    maxBuffer: 256 * 1024 * 1024,
  });
}

// "<file>[:<line>[-<line>]]"; a path that itself ends in ":<digits>" has to
// be given with a line range.
export function parsePathSpec(spec) {
  const match = /^(.+?):(\d+)(?:-(\d+))?$/.exec(spec);
  if (!match) return { file: spec, from: null, to: null };
  const from = Number(match[2]);
  return { file: match[1], from, to: match[3] === undefined ? from : Number(match[3]) };
}

function checkoutOf(path) {
  try {
    const dir = directory(path) ? path : dirname(path);
    const top = git(dir, ["rev-parse", "--show-toplevel"]).trim();
    return top ? realpathSync(top) : null;
  } catch {
    return null;
  }
}

// Line -> commit at HEAD, from git blame's porcelain output.
function blameLines(root, file, from, to) {
  const range = from === null ? [] : ["-L", `${from},${to}`];
  const lines = [];
  let commit = null;
  let line = null;
  for (const raw of git(root, ["blame", "--line-porcelain", ...range, "HEAD", "--", file]).split("\n")) {
    if (raw.startsWith("\t")) {
      lines.push({ line, commit });
      continue;
    }
    const header = /^([0-9a-f]{40}) \d+ (\d+)/.exec(raw);
    if (header) {
      commit = header[1];
      line = Number(header[2]);
    }
  }
  return lines;
}

// Recorded runs with a base and a candidate: run ledgers on this machine
// first, then run records in Git; a run kept in two places counts once.
function recordedRuns(roots) {
  const runs = new Map();
  for (const root of roots) {
    const runsDir = join(root, ".buildbeat", "runtime", "runs");
    if (directory(runsDir)) {
      for (const entry of readdirSync(runsDir).sort()) {
        const file = join(runsDir, entry, "events.jsonl");
        if (runs.has(entry) || !existsSync(file)) continue;
        try {
          const ledger = EventLedger.open(file);
          const { run, workspaces } = ledger.state;
          const space = run ? workspaces[run.id] : null;
          if (run?.work && space?.base && space?.candidate) {
            runs.set(run.id, { work: run.work, run: run.id, base: space.base, candidate: space.candidate });
          }
        } catch {
          // an unreadable ledger is left out, not guessed
        }
      }
    }
    const workRoot = join(root, "delivery", "work");
    if (!directory(workRoot)) continue;
    for (const work of readdirSync(workRoot).sort()) {
      const runsRoot = join(workRoot, work, "runs");
      if (!directory(runsRoot)) continue;
      for (const entry of readdirSync(runsRoot).sort()) {
        const file = join(runsRoot, entry, "run-record.json");
        if (runs.has(entry) || !existsSync(file)) continue;
        try {
          const space = JSON.parse(readFileSync(file, "utf8")).workspaces?.[entry];
          if (space?.base && space?.candidate) {
            runs.set(entry, { work, run: entry, base: space.base, candidate: space.candidate });
          }
        } catch {
          // an unreadable record is left out, not guessed
        }
      }
    }
  }
  return [...runs.values()];
}

const execFileAsync = promisify(execFile);

// Commit -> runs whose base..candidate range contains it, for the runs whose
// base and candidate exist in this checkout (records kept elsewhere for this
// checkout's commits count too). One rev-list per run dominates the cost in a
// large repository (124 runs took 11.6 s one after another in a pilot), so
// they run several at a time.
async function runRanges(root, runs) {
  const map = new Map();
  if (runs.length === 0) return map;
  const wanted = [...new Set(runs.flatMap((item) => [item.base, item.candidate]))];
  const present = new Set();
  for (const line of git(root, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], `${wanted.join("\n")}\n`).split("\n")) {
    const [name, type] = line.split(" ");
    if (type === "commit") present.add(name);
  }
  const usable = runs.filter((item) => present.has(item.base) && present.has(item.candidate));
  const ranges = new Array(usable.length);
  let next = 0;
  const worker = async () => {
    while (next < usable.length) {
      const index = next++;
      const { base, candidate } = usable[index];
      const { stdout } = await execFileAsync("git", ["-C", root, "rev-list", `${base}..${candidate}`], {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      });
      ranges[index] = stdout;
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, availableParallelism(), usable.length) }, worker));
  usable.forEach((item, index) => {
    for (const commit of ranges[index].split("\n")) {
      if (!commit) continue;
      if (!map.has(commit)) map.set(commit, []);
      map.get(commit).push(item);
    }
  });
  return map;
}

// Commit time, subject, Work: trailers and changed paths of each commit, in
// one call. Trailers come from Git's own parser, so a subject or a body line
// that happens to start with "Work:" is not one. A merge commit's paths are
// read against its first parent, which is what a line resolved in the merge
// was written into.
function commitFacts(root, commits) {
  const facts = new Map();
  if (commits.length === 0) return facts;
  const out = git(root, [
    "-c", "core.quotePath=false", "log", "--no-walk=unsorted", "--name-only", "--diff-merges=first-parent",
    "--format=%x1e%H%x1f%ct%x1f%s%x1f%(trailers:key=Work,valueonly,separator=%x1d)%x1f", ...commits,
  ]);
  for (const chunk of out.split("\x1e").slice(1)) {
    const [commit, time, subject, trailers, names = ""] = chunk.split("\x1f");
    facts.set(commit, {
      time: Number(time),
      subject,
      trailers: trailers.split("\x1d").map((value) => value.trim().split(/\s+/)[0]).filter(Boolean),
      paths: names.split("\n").map((name) => name.trim()).filter(Boolean),
    });
  }
  return facts;
}

function titleOf(dir) {
  for (const name of ["work.md", "intent.md"]) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    const heading = readFileSync(path, "utf8").split(/\r?\n/).find((line) => /^#\s+\S/.test(line));
    if (heading) return heading.replace(/^#\s+/, "").trim();
  }
  return null;
}

// Who decided (WORK-POSITIONING-ALIGN): the merge approval bound to the
// candidate that reached main, since a later fix voids the approval of an
// earlier candidate and a later run may be approved without ever merging,
// and the closing row while the work stays closed or cancelled.
function deciders(dir, stage, mergedCandidate) {
  const rows = readJsonl(join(dir, "decisions.jsonl")).reverse();
  const approval = mergedCandidate
    ? rows.find((row) => row.transition === "enter-wait-merge" && row.decision === "approved" && row.subject?.candidate === mergedCandidate)
    : null;
  const closure = stage === "CLOSED" || stage === "CANCELLED" ? rows.find((row) => row.transition === "close-work") : null;
  return {
    approved: approval
      ? { at: approval.ts ?? null, by: approval.by ?? null, who: describeActor(approval), run: approval.run ?? null, decisionRef: approval.decisionRef ?? null }
      : null,
    closed: closure
      ? { at: closure.ts ?? null, by: closure.by ?? null, who: describeActor(closure), decision: closure.decision ?? null, decisionRef: closure.decisionRef ?? null }
      : null,
  };
}

// Stage, title, summary, who decided and where to read, from the first
// checkout that keeps the work's folder.
function workFacts(roots, work, cwd) {
  for (const root of roots) {
    const dir = join(root, "delivery", "work", work);
    if (!directory(dir)) continue;
    const row = computeOverview(root, { work, followTargets: false })[0] ?? null;
    const stage = row?.stage ?? null;
    const page = readResult(root, work);
    const read = [join(dir, "work.md"), join(dir, "intent.md"), join(dir, "result.md")]
      .filter((path) => existsSync(path))
      .map((path) => pathLabel(cwd, path));
    return {
      stage,
      title: titleOf(dir),
      summary: stage === "CLOSED" && page.exists && page.summary ? page.summary : null,
      ...deciders(dir, stage, row?.mergedCandidate ?? null),
      read,
    };
  }
  return { stage: null, title: null, summary: null, approved: null, closed: null, read: [] };
}

// Traces the lines of a file (all of them at HEAD when no range is given)
// to the works that wrote them. repo and callers name further checkouts
// whose records may cover this one's commits, as for closing a work.
export async function traceLines(spec, { repo = process.cwd(), callers = [], cwd = process.cwd() } = {}) {
  const { file, from, to } = parsePathSpec(spec);
  // A relative path names a file in the repository given as repo.
  const absolute = resolve(cwd, repo, file);
  const untracked = new TraceError(`${file} is not a file tracked by Git at HEAD`);
  const root = checkoutOf(absolute);
  if (!root) throw untracked;
  const path = relative(root, join(realpathSync(dirname(absolute)), basename(absolute))).split(sep).join("/");
  let text;
  try {
    if (git(root, ["cat-file", "-t", `HEAD:${path}`]).trim() !== "blob") throw untracked;
    text = git(root, ["cat-file", "-p", `HEAD:${path}`]);
  } catch {
    throw untracked;
  }
  const total = text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  if (from !== null && (from < 1 || to < from || to > total)) {
    throw new TraceError(`${file} has ${total} lines at HEAD; ${from}-${to} is out of range`);
  }
  const blamed = total === 0 ? [] : blameLines(root, path, from, to);

  const roots = [root];
  for (const place of [repo, ...callers, dirname(root)]) {
    const other = place ? checkoutOf(place) : null;
    if (other && !roots.includes(other)) roots.push(other);
  }
  const ranges = await runRanges(root, recordedRuns(roots));
  const commits = [...new Set(blamed.map((item) => item.commit))];
  const facts = commitFacts(root, commits);

  const works = new Map();
  const untraced = new Map();
  for (const { commit } of blamed) {
    const fact = facts.get(commit) ?? { time: 0, subject: "", trailers: [], paths: [] };
    const found = new Map();
    const add = (work, kind, run) => {
      if (!found.has(work)) found.set(work, []);
      found.get(work).push(run ? { kind, run } : { kind });
    };
    for (const item of ranges.get(commit) ?? []) add(item.work, "run", item.run);
    for (const work of fact.trailers) add(work, "trailer");
    for (const changed of fact.paths) {
      const match = /^delivery\/work\/([^/]+)\//.exec(changed);
      if (match) add(match[1], "folder");
    }
    if (found.size === 0) {
      const entry = untraced.get(commit) ?? { commit, subject: fact.subject, lines: 0 };
      entry.lines += 1;
      untraced.set(commit, entry);
      continue;
    }
    for (const [work, via] of found) {
      const entry = works.get(work) ?? { work, lines: 0, commits: new Set(), via: new Map(), latest: 0 };
      entry.lines += 1;
      entry.commits.add(commit);
      for (const item of via) entry.via.set(item.kind === "run" ? `run ${item.run}` : item.kind, item);
      if (fact.time > entry.latest) entry.latest = fact.time;
      works.set(work, entry);
    }
  }

  const rows = [...works.values()]
    .sort((a, b) => b.latest - a.latest || a.work.localeCompare(b.work))
    .map((entry) => ({
      work: entry.work,
      ...workFacts(roots, entry.work, cwd),
      lines: entry.lines,
      via: [...entry.via.values()],
      commits: [...entry.commits],
    }));
  const missed = [...untraced.values()].sort((a, b) => b.lines - a.lines);
  return {
    path,
    repo: root,
    lines: { from: from ?? (total ? 1 : 0), to: to ?? total, total: blamed.length },
    works: rows,
    untraced: {
      lines: missed.reduce((sum, item) => sum + item.lines, 0),
      commits: missed,
    },
  };
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function renderTrace(trace) {
  const { from, to, total } = trace.lines;
  const span = from === to ? `${from}` : `${from}-${to}`;
  const lines = [`${trace.path}:${span} — ${plural(total, "line")}, ${plural(trace.works.length, "work")}`];
  for (const row of trace.works) {
    const runs = row.via.filter((item) => item.kind === "run").map((item) => item.run);
    const via = [
      ...(runs.length ? [`via run ${runs.join(", ")}`] : []),
      ...(row.via.some((item) => item.kind === "trailer") ? ["via Work trailer"] : []),
      ...(row.via.some((item) => item.kind === "folder") ? ["via work folder"] : []),
    ];
    lines.push(`  ${row.work}  ${row.stage ?? "NOT_FOUND"}  ${row.title ?? "(no records in reach)"} (${plural(row.lines, "line")}; ${via.join("; ")})`);
    if (row.approved) lines.push(`    approved: ${row.approved.at} by ${row.approved.who}${row.approved.run ? ` (${row.approved.run})` : ""}`);
    if (row.closed) lines.push(`    ${row.closed.decision === "cancelled" ? "cancelled" : "closed"}: ${row.closed.at} by ${row.closed.who}`);
    if (row.summary) lines.push(`    result: ${row.summary}`);
    if (row.read.length) lines.push(`    read: ${row.read.join(", ")}`);
  }
  if (trace.untraced.lines > 0) {
    lines.push(`  not traced to a work: ${plural(trace.untraced.lines, "line")} in ${plural(trace.untraced.commits.length, "commit")}`);
    for (const item of trace.untraced.commits) {
      lines.push(`    ${item.commit.slice(0, 7)} ${item.subject}`);
    }
  }
  return lines.join("\n");
}
