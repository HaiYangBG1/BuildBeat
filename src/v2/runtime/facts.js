// Facts with code pointers (WORK-FACT-POINTERS): a work's facts section says
// what the code looked like when the work was written. Its heading names the
// commit the facts were checked on, and the section points at code as
// `path`, `path:line` or `path:line-line`. The runtime compares the code
// pointed at between that commit and the code the work starts from (HEAD
// before its first run, the latest run's base after), so a person or a new
// session sees which facts may no longer hold instead of rechecking them all
// or trusting stale ones. In the pilot workspace 31 of 114 work descriptions
// had such a section, most pointing at code this way; facts were checked the
// day the first run started, so the check pays off for works that wait or
// change hands. Closed works are left alone: their facts describe the code
// before the work, and result.md says what holds after it.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { textLines } from "./closeout.js";
import { EventLedger } from "../storage/event-ledger.js";

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const COMMIT = /(?<![0-9A-Za-z])[0-9a-fA-F]{7,40}(?![0-9A-Za-z])/g;
const SPAN = /(?<!`)`([^`\s]+)`(?!`)/g;
const POINTER = /^(.+?)(?::(\d+)(?:-(\d+))?)?$/;
// URLs, placeholders, globs, options, absolute paths and directories (a
// trailing slash, whether or not that directory exists) are never files of
// the repository.
const NOT_A_PATH = /[<>*?$=(){}[\]|"',;\\]|:\/\/|^[/~-]|\/$/;

// Sections whose heading names something that looks like a commit, with the
// code spans written inside them. A section runs to the next heading of the
// same or a higher level; code blocks and HTML comments do not count.
export function parseFacts(text) {
  const sections = [];
  let open = null;
  for (const line of textLines(text)) {
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (open && level <= open.level) open = null;
      const commits = [...(heading[2] ?? "").matchAll(COMMIT)].map((match) => match[0].toLowerCase());
      if (!open && commits.length) {
        open = { heading: (heading[2] ?? "").trim(), level, commits, pointers: [] };
        sections.push(open);
      }
      continue;
    }
    if (!open) continue;
    for (const span of line.matchAll(SPAN)) {
      const pointer = POINTER.exec(span[1]);
      const path = pointer[1].replace(/^\.\//, "");
      if (NOT_A_PATH.test(path)) continue;
      const start = pointer[2] ? Number(pointer[2]) : null;
      const end = pointer[3] ? Number(pointer[3]) : start;
      open.pointers.push({ text: span[1], path, lines: start === null ? null : [start, Math.max(start, end)] });
    }
  }
  return sections;
}

// Each Git call costs a process start (about 0.17 s on the pilot's largest
// checkout), so a work's facts take four calls plus one per changed file,
// not one or two per pointer.
function git(repoRoot, args, input = null) {
  return execFileSync("git", ["--literal-pathspecs", "-C", repoRoot, ...args], {
    encoding: "utf8",
    input: input ?? undefined,
    stdio: [input === null ? "ignore" : "pipe", "pipe", "ignore"],
    maxBuffer: 256 * 1024 * 1024,
  });
}

// Names resolved to commits in one call; a name that is no commit here maps
// to null.
function commitsOf(repoRoot, names) {
  if (!names.length) return [];
  let out = "";
  try {
    out = git(repoRoot, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], names.map((name) => `${name}^{commit}`).join("\n") + "\n");
  } catch {
    return names.map(() => null);
  }
  const lines = out.split("\n");
  return names.map((_, index) => {
    const [object, type] = (lines[index] ?? "").split(" ");
    return type === "commit" ? object : null;
  });
}

// The base the latest run started from, from its ledger here or its record.
export function runBase(repoRoot, workId, runId) {
  try {
    const ledger = join(repoRoot, ".buildbeat", "runtime", "runs", runId, "events.jsonl");
    if (existsSync(ledger)) return EventLedger.open(ledger).state.workspaces?.[runId]?.base ?? null;
    const record = JSON.parse(readFileSync(join(repoRoot, "delivery", "work", workId, "runs", runId, "run-record.json"), "utf8"));
    return record.workspaces?.[runId]?.base ?? null;
  } catch {
    return null;
  }
}

// A pointer names one file at the commit the facts were checked on: the
// whole path, or its tail when only one file ends that way. A directory (the
// whole path, before any tail is tried, or a tail no file has), or a name
// with neither a slash nor a line that is no file at all (a method, a
// configuration key), is not a pointer.
function locate(pointer, files, dirs) {
  const { path } = pointer;
  if (files.has(path)) return { path };
  if (dirs.has(path)) return null;
  const tail = `/${path}`;
  const matches = [...files].filter((file) => file.endsWith(tail));
  if (matches.length === 1) return { path: matches[0] };
  if (matches.length > 1) return { reason: `matches ${matches.length} files` };
  if ([...dirs].some((dir) => dir.endsWith(tail))) return null;
  return path.includes("/") || pointer.lines ? { reason: "no file" } : null;
}

// The hunks of a -U0 patch for each file in it. The call fixes the a/ and
// b/ prefixes (diff.noprefix and diff.mnemonicPrefix would change them) and
// turns renames off, so the header names the same path on both sides
// ("diff --git a/<p> b/<p>").
function patchFiles(patch) {
  const files = new Map();
  let current = null;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git a/")) {
      const names = line.slice("diff --git a/".length);
      const half = (names.length - 3) / 2;
      const path = Number.isInteger(half) && names.slice(half) === ` b/${names.slice(0, half)}` ? names.slice(0, half) : null;
      current = path === null ? null : { hunks: [], binary: false };
      if (path !== null) files.set(path, current);
      continue;
    }
    if (!current) continue;
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      current.hunks.push({
        at: Number(hunk[1]), count: hunk[2] === undefined ? 1 : Number(hunk[2]),
        to: Number(hunk[3]), size: hunk[4] === undefined ? 1 : Number(hunk[4]),
      });
    } else if (line.startsWith("Binary files ")) {
      current.binary = true;
    }
  }
  return files;
}

// Whether a file's change touches lines start..end of the old side. A hunk
// replaces old lines at..at+count-1; a pure insertion (count 0) after line
// `at` lands inside the range when start <= at < end. Lines moving because of
// edits above them are not a change. A binary change has no hunks to compare
// lines with and counts; a change of mode alone leaves the lines as they were.
function touches(file, [start, end]) {
  if (file.binary) return true;
  return file.hunks.some(({ at, count }) => (count === 0 ? start <= at && at < end : at <= end && at + count - 1 >= start));
}

// The facts of one work compared with `against`: null when its description
// has no section whose heading names a commit; checkedOn null when none of
// the named commits is in this repository.
export function checkFacts(repoRoot, workId, { against = "HEAD", label = "HEAD" } = {}) {
  const dir = join(repoRoot, "delivery", "work", workId);
  const file = existsSync(join(dir, "work.md")) ? "work.md" : existsSync(join(dir, "intent.md")) ? "intent.md" : null;
  if (!file) return null;
  const sections = parseFacts(readFileSync(join(dir, file), "utf8"));
  if (!sections.length) return null;
  const names = sections.flatMap((item) => item.commits);
  const resolved = commitsOf(repoRoot, [...names, against]);
  const target = resolved.pop();
  let pin = null;
  let section = null;
  for (const item of sections) {
    pin = item.commits.map((name) => resolved[names.indexOf(name)]).find(Boolean) ?? null;
    if (pin) {
      section = item;
      break;
    }
  }
  if (!pin) {
    return sections.some((item) => item.pointers.length) ? { file, checkedOn: null, against: null, pointers: [] } : null;
  }
  if (!target) return null;
  const files = new Set(git(repoRoot, ["ls-tree", "-r", "--name-only", "-z", pin]).split("\0").filter(Boolean));
  const dirs = new Set();
  for (const path of files) {
    for (let at = path.lastIndexOf("/"); at > 0; at = path.lastIndexOf("/", at - 1)) dirs.add(path.slice(0, at));
  }
  const pointers = [];
  const seen = new Set();
  for (const pointer of section.pointers) {
    const found = locate(pointer, files, dirs);
    if (!found) continue;
    // The same place written twice (whole path and tail) is one pointer.
    const key = `${found.path ?? pointer.text}\0${pointer.lines ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pointers.push({ text: pointer.text, path: found.path ?? null, lines: pointer.lines, ...(found.reason ? { state: "not found", reason: `${found.reason} at ${pin.slice(0, 7)}` } : {}) });
  }
  const paths = [...new Set(pointers.filter((item) => !item.state).map((item) => item.path))];
  const status = new Map();
  if (paths.length && pin !== target) {
    const fields = git(repoRoot, ["diff", "--name-status", "--no-renames", "-z", pin, target, "--", ...paths]).split("\0");
    for (let at = 0; at + 1 < fields.length; at += 2) status.set(fields[at + 1], fields[at]);
  }
  // Lines pointed at are compared on the diff between the two commits.
  const lined = [...new Set(pointers.filter((item) => !item.state && item.lines && status.has(item.path) && status.get(item.path) !== "D").map((item) => item.path))];
  const diff = lined.length
    ? patchFiles(git(repoRoot, [
      "-c", "core.quotePath=false", "diff", "-U0", "--no-color", "--no-ext-diff", "--no-renames",
      "--src-prefix=a/", "--dst-prefix=b/", pin, target, "--", ...lined,
    ]))
    : new Map();
  for (const item of pointers) {
    if (item.state) continue;
    const kind = status.get(item.path);
    if (!kind) item.state = "same";
    else if (kind === "D") Object.assign(item, { state: "not found", reason: `not in ${label}` });
    else if (!item.lines) item.state = "changed";
    // A path Git still quotes in the header (a tab, a quote) is not parsed:
    // counted as changed rather than missed.
    else item.state = !diff.has(item.path) || touches(diff.get(item.path), item.lines) ? "changed" : "elsewhere";
  }
  // Where to look next: the commits that changed the file in between, as
  // Git's own log lists them for that path (merges that changed it
  // included). They are the file's commits, not only those that touched the
  // lines pointed at; whether those lines changed is the comparison above.
  const history = new Map();
  for (const item of pointers) {
    if (item.state !== "changed") continue;
    if (!history.has(item.path)) {
      history.set(item.path, git(repoRoot, [
        "-c", "log.follow=false", "-c", "log.showSignature=false",
        "log", "--no-color", "--format=%H%x1f%s", `${pin}..${target}`, "--", item.path,
      ]).split("\n").filter(Boolean));
    }
    const commits = history.get(item.path);
    const [commit, subject] = commits.length ? commits[0].split("\x1f") : [];
    item.file = { commits: commits.length, ...(commit ? { latest: { commit, subject } } : {}) };
  }
  return { file, checkedOn: pin, against: label, pointers };
}

// Adds facts to the status rows of works that are not closed: compared with
// the latest run's base once the work has run, with HEAD before.
export function attachFacts(rows) {
  for (const row of rows) {
    if (!row.repo || row.stage === "CLOSED" || row.stage === "CANCELLED") continue;
    const base = row.latest?.id ? runBase(row.repo, row.work, row.latest.id) : null;
    const facts = checkFacts(row.repo, row.work, base ? { against: base, label: `base of ${row.latest.id}` } : {});
    if (!facts) continue;
    const { file, ...shown } = facts;
    row.facts = shown;
  }
  return rows;
}

const where = (item) =>
  item.lines ? `${item.path}:${item.lines[0]}${item.lines[1] !== item.lines[0] ? `-${item.lines[1]}` : ""}` : item.path;

// The facts block under one status row.
export function renderFacts(row) {
  const facts = row.facts;
  if (!facts) return [];
  if (!facts.checkedOn) return ["  facts: no commit of this repository in the heading; nothing compared"];
  const count = (state) => facts.pointers.filter((item) => item.state === state).length;
  let head = `  facts: checked on ${facts.checkedOn.slice(0, 7)}, compared with ${facts.against}: ${facts.pointers.length} pointers, ${count("changed")} changed`;
  if (count("elsewhere")) head += `, ${count("elsewhere")} changed elsewhere in the file`;
  if (count("not found")) head += `, ${count("not found")} not found`;
  const lines = [head];
  for (const item of facts.pointers) {
    if (item.state === "changed") {
      const latest = item.file?.latest;
      const by = latest ? `  (${item.file.commits} commit${item.file.commits === 1 ? "" : "s"} to the file, latest ${latest.commit.slice(0, 7)} ${latest.subject})` : "";
      lines.push(`    changed  ${where(item)}${by}`);
    } else if (item.state === "not found") {
      lines.push(`    not found  ${item.text}  (${item.reason})`);
    }
  }
  return lines;
}

// One line for accept and check when code the facts point at has changed
// (or is gone) since they were checked; null otherwise.
export function factsWarning(repoRoot, workId, options = {}) {
  const facts = checkFacts(repoRoot, workId, options);
  if (!facts?.checkedOn) return null;
  const moved = facts.pointers.filter((item) => item.state === "changed" || (item.state === "not found" && item.path));
  if (!moved.length) return null;
  return `warning: facts in delivery/work/${workId}/${facts.file} were checked on ${facts.checkedOn.slice(0, 7)}; ${moved.length} referenced places changed since: ${moved.map(where).join(", ")}; re-check them before starting`;
}
