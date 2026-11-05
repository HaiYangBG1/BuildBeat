// Commits and the works they belong to, read from the commits themselves
// (WORK-COMMITTED-WORKS). A commit names a work through a "Work: <ID>"
// trailer or by changing files under delivery/work/<ID>/; recorded run
// ranges, the third fact, are added by callers that hold run records
// (code-trace.js). `history --path` maps blamed lines to works with this,
// and status uses it to see that a work nobody ran has commits behind it.
// Real cost behind it: in a pilot repository 127 of 164 works were done in
// sessions without a run; status showed every one of them as a draft to
// accept, while 110 had code commits that changed the work's own folder.

import { execFileSync } from "node:child_process";

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 256 * 1024 * 1024,
  });
}

// Commit time, subject, Work: trailers and changed paths of each commit, in
// one call. Trailers come from Git's own parser, so a subject or a body line
// that happens to start with "Work:" is not one. A merge commit's paths are
// read against its first parent, which is what a line resolved in the merge
// was written into. A move counts on both sides (--no-renames), so a commit
// that moves files out of delivery/work/<ID>/ still belongs to that work; -z
// keeps paths as they are, and the pinned log settings keep signature text
// out of the path list (WORK-SCOPE-RENAMES).
//
// With -z a path may hold any byte but NUL, so NUL is the only separator:
// each commit opens with an empty field, then its hash, time, subject and
// Work: trailers; its paths follow, the first one after a newline. Paths are
// never empty, so an empty field always opens the next commit.
const COMMIT_FIELDS = 4;
const LOG = [
  "-c", "log.showSignature=false", "-c", "log.follow=false",
  "log", "--name-only", "--no-renames", "-z", "--diff-merges=first-parent",
  "--format=%x00%H%x00%ct%x00%s%x00%(trailers:key=Work,valueonly,separator=%x1d)",
];

function parseLog(out) {
  const facts = new Map();
  const fields = out.split("\0");
  let at = fields.indexOf("");
  while (at !== -1 && at + COMMIT_FIELDS < fields.length) {
    const [commit, time, subject, trailers] = fields.slice(at + 1, at + 1 + COMMIT_FIELDS);
    at += 1 + COMMIT_FIELDS;
    const paths = [];
    for (; at < fields.length && fields[at] !== ""; at += 1) {
      const path = paths.length === 0 ? fields[at].replace(/^\n/, "") : fields[at];
      if (path) paths.push(path);
    }
    facts.set(commit, {
      commit,
      time: Number(time),
      subject,
      trailers: trailers.split("\x1d").map((value) => value.trim().split(/\s+/)[0]).filter(Boolean),
      paths,
    });
  }
  return facts;
}

// The facts of the given commits, in the order given.
export function commitFacts(root, commits) {
  if (commits.length === 0) return new Map();
  return parseLog(git(root, [...LOG, "--no-walk=unsorted", ...commits]));
}

// The works a commit names by itself, each with how: its Work: trailers and
// the delivery/work/<ID>/ folders it changes.
export function commitClues(fact) {
  const clues = [];
  for (const work of fact.trailers) clues.push({ work, kind: "trailer" });
  for (const changed of fact.paths) {
    const match = /^delivery\/work\/([^/]+)\//.exec(changed);
    if (match) clues.push({ work: match[1], kind: "folder" });
  }
  return clues;
}

// A commit that changes something besides work records: at least one path
// outside delivery/.
export function changesCode(fact) {
  return fact.paths.some((path) => !path.startsWith("delivery/"));
}

// The code commits on ref that name each of the given works, newest first:
// work -> [{ commit, time, subject }]. Only commits from the time the first
// work folder entered ref are read, so a long history from before the
// project kept works is not walked on every status call; with no work
// folder in ref's history there are no commits to find. One pathspec for
// all of delivery/work/ rather than one per work: in a pilot repository 127
// pathspecs made this lookup cost more than the log it bounds. Git errors
// yield no commits rather than a guess.
export function codeCommitsOf(root, ref, works) {
  const found = new Map();
  if (works.length === 0) return found;
  const wanted = new Set(works);
  let since = null;
  try {
    const added = git(root, [
      "-c", "log.showSignature=false", "log", "--format=%ct", "--diff-filter=A", "--no-renames", ref, "--", "delivery/work/",
    ]).split("\n").filter(Boolean).map(Number);
    if (added.length === 0) return found;
    since = added.reduce((least, time) => Math.min(least, time));
  } catch {
    return found;
  }
  let facts;
  try {
    facts = parseLog(git(root, [...LOG, `--since=@${since}`, ref, "--"]));
  } catch {
    return found;
  }
  for (const fact of facts.values()) {
    if (!changesCode(fact)) continue;
    const named = new Set(commitClues(fact).map((clue) => clue.work).filter((work) => wanted.has(work)));
    for (const work of named) {
      if (!found.has(work)) found.set(work, []);
      found.get(work).push({ commit: fact.commit, time: fact.time, subject: fact.subject });
    }
  }
  for (const list of found.values()) list.sort((a, b) => b.time - a.time);
  return found;
}

// The name status and the draft show for ref: the branch, or HEAD when
// detached.
export function branchName(root) {
  try {
    return git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim() || "HEAD";
  } catch {
    return "HEAD";
  }
}
