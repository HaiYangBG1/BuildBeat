// Close-out (WORK-CONTEXT-CLOSEOUT): every work closes with a result page,
// delivery/work/<ID>/result.md, saying what was delivered, what was decided,
// what is left and which conclusions were written into the project's own
// documents. The runtime never writes the page. It binds the page's digest
// to the close decision and reads each "<path> @ <commit>" line back from
// Git, so "it is in AGENTS.md now" is a fact, not the session's word.
// Real cost behind it: in the pilot workspace 15 of 21 release readback
// scripts only checked Git, written so that works that never ship could
// close; close conclusions were one-line strings carrying the delivery, the
// leftovers and the lessons; the same environment facts were rediscovered
// work after work.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

// A line in result.md that records a conclusion written into the project:
// "- <path> @ <commit> — <what>". The path may be in backticks (and then
// may contain spaces); the commit is 7 to 40 hex digits.
const PROMOTION =
  /^\s*[-*+]\s+(?:`([^`]+)`|([^\s`]+))\s+@\s+`?([0-9a-fA-F]{7,40})`?(?=\s|$)/;

// Text lines of a Markdown page outside fenced code and HTML comments, so a
// template's guidance kept in comments or an example in a code block is
// neither the summary nor a promotion.
function textLines(text) {
  const lines = [];
  let fence = null;
  let comment = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (fence) {
      if (line.startsWith(fence)) fence = null;
      continue;
    }
    if (comment) {
      if (line.includes("-->")) comment = false;
      continue;
    }
    const opening = /^(`{3,}|~{3,})/.exec(line);
    if (opening) {
      fence = opening[1];
      continue;
    }
    if (line.startsWith("<!--")) {
      comment = !line.includes("-->");
      continue;
    }
    lines.push(raw);
  }
  return lines;
}

// The first line that is neither empty nor a heading: what status shows
// for a closed work when the close decision gives no --result.
export function resultSummary(text) {
  for (const raw of textLines(text)) {
    const line = raw.trim();
    if (line !== "" && !line.startsWith("#")) return line;
  }
  return "";
}

export function parsePromotions(text) {
  const promotions = [];
  for (const raw of textLines(text)) {
    const match = PROMOTION.exec(raw);
    if (match) {
      promotions.push({ path: match[1] ?? match[2], commit: match[3].toLowerCase() });
    }
  }
  return promotions;
}

export function resultPath(repoRoot, workId) {
  return join(repoRoot, "delivery", "work", workId, "result.md");
}

export function readResult(repoRoot, workId) {
  const path = resultPath(repoRoot, workId);
  if (!existsSync(path)) {
    return { exists: false };
  }
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  return {
    exists: true,
    // Same bytes as `shasum -a 256 result.md`, so a hand-written close
    // line can carry the digest too.
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    summary: resultSummary(text),
    promotions: parsePromotions(text),
  };
}

function git(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

// The branch the main checkout is on: the same ref status uses to decide
// that a candidate was merged.
export function currentRef(repoRoot) {
  try {
    return git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]).trim() || "HEAD";
  } catch {
    return "HEAD";
  }
}

function resolveCommit(repoRoot, commit) {
  try {
    return git(repoRoot, ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`]).trim() || null;
  } catch {
    return null;
  }
}

function onRef(repoRoot, commit, ref) {
  try {
    git(repoRoot, ["merge-base", "--is-ancestor", commit, ref]);
    return true;
  } catch {
    return false;
  }
}

// Files the commit changes. A merge commit is read against its first
// parent: a document merged in through a merge commit counts for the merge
// as well as for the commit that wrote it. Renames list both paths.
function changedPaths(repoRoot, commit) {
  const parents = git(repoRoot, ["rev-list", "--parents", "-n", "1", commit]).trim().split(/\s+/).slice(1);
  const args = parents.length === 0
    ? ["diff-tree", "-r", "--root", "--no-commit-id", "--name-only", "--no-renames", "-z", commit]
    : ["diff-tree", "-r", "--name-only", "--no-renames", "-z", parents[0], commit];
  return git(repoRoot, args).split("\0").filter(Boolean);
}

// Checks every promotion line against Git and returns each with ok and,
// when it fails, the problem in the words the close refusal uses.
export function checkPromotions(repoRoot, workId, promotions, { ref = currentRef(repoRoot) } = {}) {
  const workFolder = `delivery/work/${workId}`;
  return promotions.map((item) => {
    const shown = `${item.path} @ ${item.commit}`;
    const path = posix.normalize(item.path.replace(/^\.\//, ""));
    if (path === workFolder || path.startsWith(`${workFolder}/`)) {
      return { path, commit: item.commit, ok: false, problem: `${item.path}: inside the work's own folder, not the project` };
    }
    const full = resolveCommit(repoRoot, item.commit);
    if (!full) {
      return { path, commit: item.commit, ok: false, problem: `${shown}: unknown commit` };
    }
    if (!onRef(repoRoot, full, ref)) {
      return { path, commit: full, ok: false, problem: `${shown}: commit not on ${ref}` };
    }
    if (!changedPaths(repoRoot, full).includes(path)) {
      return { path, commit: full, ok: false, problem: `${shown}: the commit does not change ${item.path}` };
    }
    return { path, commit: full, ok: true };
  });
}
