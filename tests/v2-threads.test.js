// Work threads (WORK-THREADS): relation lines in work.md or result.md string
// related works into one thread across repositories, reverse directions are
// derived, external ids find works again, and ids merely mentioned in prose
// stay outside the thread. Real cost behind it: in a pilot workspace 53 of
// 113 work descriptions named another work in prose only.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseLinks } from "../src/v2/runtime/threads.js";
import { tempDir } from "./support/tmp.js";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");

function fixtureEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null",
    GIT_CONFIG_KEY_1: "commit.gpgSign", GIT_CONFIG_VALUE_1: "false" };
}
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: fixtureEnv() }).trim();

function repo(path = realpathSync(tempDir("bb-threads-"))) {
  mkdirSync(path, { recursive: true });
  git(path, "init", "-q", "-b", "main");
  git(path, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "--allow-empty", "-m", "fixture");
  return path;
}
function work(root, id, lines = [], result = null) {
  const dir = join(root, "delivery", "work", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "work.md"), [`# ${id}`, "", ...lines, ""].join("\n"));
  if (result !== null) writeFileSync(join(dir, "result.md"), [`# ${id} result`, "", ...result, ""].join("\n"));
}
const call = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: fixtureEnv() });
function cli(cwd, ...args) {
  const out = call(cwd, ...args);
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}
const one = (cwd, ...args) => JSON.parse(cli(cwd, "status", "--repo", ".", ...args, "--json")).works;

test("relation and ref lines are read outside code and comments, in any case", () => {
  const page = [
    "Why now: this continues WORK-OLD, see below.",
    "- follows: WORK-OLD",
    "- Split  From: WORK-BIG",
    "* RELATED: WORK-SIDE",
    "- ref: MR !60",
    "- follows: <work id this one continues>",
    "- ref: <task, decision or merge request id>",
    "```", "- related: WORK-IN-CODE", "```",
    "<!--", "- related: WORK-IN-COMMENT", "-->",
  ].join("\n");
  const { links, refs, prose } = parseLinks(page);
  assert.deepEqual(links, [
    { kind: "follows", to: "WORK-OLD" },
    { kind: "split from", to: "WORK-BIG" },
    { kind: "related", to: "WORK-SIDE" },
  ]);
  assert.deepEqual(refs, ["MR !60"]);
  assert.match(prose, /this continues WORK-OLD/);
  assert.doesNotMatch(prose, /- follows: WORK-OLD/);

  // Indented code, a comment that opens mid-line and spans lines, and an
  // indented line continuing a paragraph are not relation lines; a comment
  // after a real line is dropped and the line still counts.
  const hidden = parseLinks([
    "An example:", "", "    - related: WORK-INDENTED", "    - ref: TASK-INDENTED", "",
    "A note <!-- hidden from readers", "- related: WORK-HIDDEN", "- ref: TASK-HIDDEN", "--> and back to text.",
    "Text that goes on", "    - related: WORK-LAZY",
    "- related: WORK-REAL <!-- kept -->",
  ].join("\n"));
  assert.deepEqual(hidden.links, [{ kind: "related", to: "WORK-REAL" }]);
  assert.deepEqual(hidden.refs, []);
  assert.match(hidden.prose, /and back to text/);
  assert.doesNotMatch(hidden.prose, /hidden from readers/);

  // A comment marker inside code is text: it opens no comment and swallows
  // none of the real lines after it.
  const coded = parseLinks([
    "Example:", "", "    <!-- an indented example opens no comment", "",
    "- related: WORK-AFTER-INDENTED",
    "Use `<!--` and ``<!-- -->`` to hide text.",
    "- related: WORK-AFTER-INLINE",
    "```", "<!-- inside a fence", "```",
    "- ref: TASK-AFTER-FENCE",
  ].join("\n"));
  assert.deepEqual(coded.links.map((link) => link.to), ["WORK-AFTER-INDENTED", "WORK-AFTER-INLINE"]);
  assert.deepEqual(coded.refs, ["TASK-AFTER-FENCE"]);
  assert.match(coded.prose, /Use `<!--` and ``<!-- -->`` to hide text\./);
});

test("a work with both work.md and a legacy intent.md is read from work.md", () => {
  const root = repo();
  work(root, "WORK-NEW", ["- follows: WORK-BASE"]);
  work(root, "WORK-BASE");
  work(root, "WORK-STALE");
  writeFileSync(join(root, "delivery", "work", "WORK-NEW", "intent.md"), "# Old intent\n\n- related: WORK-STALE\n- ref: TASK-OLD\n");
  const [row] = one(root, "--work", "WORK-NEW");
  assert.deepEqual(row.thread.map((node) => node.work), ["WORK-NEW", "WORK-BASE"]);
  assert.equal(row.refs, undefined);
});

test("one work's view strings every linked work into a thread with derived reverse links", () => {
  const root = repo();
  work(root, "WORK-FIRST", ["The first try."]);
  work(root, "WORK-SECOND", ["- follows: WORK-FIRST", "- ref: TASK-15"]);
  work(root, "WORK-PIECE", ["- split from: WORK-SECOND"]);
  work(root, "WORK-NEAR", [], ["Done.", "", "- related: WORK-PIECE"]);
  work(root, "WORK-ASIDE", ["Unrelated, though it mentions WORK-FIRST in passing."]);
  work(root, "WORK-ALONE", ["Nothing linked."]);

  const [row] = one(root, "--work", "WORK-SECOND");
  assert.deepEqual(row.thread.map((node) => node.work), ["WORK-SECOND", "WORK-FIRST", "WORK-PIECE", "WORK-NEAR"]);
  const links = Object.fromEntries(row.thread.map((node) => [node.work, node.links.map((link) => `${link.kind} ${link.to}`)]));
  assert.deepEqual(links["WORK-SECOND"], ["follows WORK-FIRST", "split into WORK-PIECE"]);
  assert.deepEqual(links["WORK-FIRST"], ["followed by WORK-SECOND"]);
  assert.deepEqual(links["WORK-PIECE"], ["split from WORK-SECOND", "related WORK-NEAR"]);
  assert.deepEqual(links["WORK-NEAR"], ["related WORK-PIECE"]);
  assert.equal(row.thread.find((node) => node.work === "WORK-FIRST").stage, "WORK_DRAFT");
  assert.deepEqual(row.refs, ["TASK-15"]);

  const text = cli(root, "status", "--repo", ".", "--work", "WORK-SECOND");
  assert.match(text, /^ {2}thread: 4 works$/m);
  assert.match(text, /^ {4}WORK-FIRST {2}WORK_DRAFT {2}followed by WORK-SECOND$/m);
  assert.match(text, /^ {4}WORK-PIECE {2}WORK_DRAFT {2}split from WORK-SECOND, related WORK-NEAR$/m);
  assert.match(text, /^ {2}refs: TASK-15$/m);

  // Prose mentions stay outside the thread, listed apart.
  const [first] = one(root, "--work", "WORK-FIRST");
  assert.deepEqual(first.mentionedBy, ["WORK-ASIDE"]);
  const [aside] = one(root, "--work", "WORK-ASIDE");
  assert.equal(aside.thread, undefined);
  assert.deepEqual(aside.mentions, ["WORK-FIRST"]);
  assert.match(cli(root, "status", "--repo", ".", "--work", "WORK-ASIDE"), /^ {2}mentions: WORK-FIRST$/m);

  // A work without relation lines shows no thread block, and its JSON has no
  // thread fields at all.
  const alone = cli(root, "status", "--repo", ".", "--work", "WORK-ALONE");
  assert.doesNotMatch(alone, /thread:/);
  const [quiet] = one(root, "--work", "WORK-ALONE");
  assert.deepEqual(["thread", "refs", "mentions", "mentionedBy"].filter((key) => key in quiet), []);
});

test("an id found nowhere is NOT_FOUND, and a cycle ends", () => {
  const root = repo();
  work(root, "WORK-A", ["- follows: WORK-B", "- related: WORK-NOWHERE"]);
  work(root, "WORK-B", ["- follows: WORK-A"]);
  const [row] = one(root, "--work", "WORK-A");
  assert.deepEqual(row.thread.map((node) => node.work).sort(), ["WORK-A", "WORK-B", "WORK-NOWHERE"]);
  assert.equal(row.thread.find((node) => node.work === "WORK-NOWHERE").repo, null);
  assert.match(
    cli(root, "status", "--repo", ".", "--work", "WORK-A"),
    /^ {4}WORK-NOWHERE {2}NOT_FOUND {2}\(not in reach; run status --all-repos from the workspace root\)$/m,
  );
});

// A main repository with two code repositories inside, the layout
// status --all-repos discovers.
function workspace() {
  const main = repo();
  const backend = repo(join(main, "backend"));
  const cli_ = repo(join(main, "cli"));
  work(cli_, "WORK-LOGIN", ["- ref: TASK-15"]);
  work(backend, "WORK-TOKEN", ["- split from: WORK-LOGIN", "- ref: task-15"]);
  work(cli_, "WORK-DUP", ["One of two works with this id."]);
  work(backend, "WORK-DUP", ["The other one."]);
  work(main, "WORK-PLAN", ["- related: WORK-DUP"]);
  // A closed work is still shown when asked for by name.
  writeFileSync(join(cli_, "delivery", "work", "WORK-LOGIN", "decisions.jsonl"), `${JSON.stringify({
    ts: "2026-10-25T00:00:00Z", decision: "closed", transition: "close-work", subject: { result: "login fixed" }, by: "owner",
  })}\n`);
  return { main, backend, cli: cli_ };
}

test("across repositories the thread names each work's repository; alone, other repositories are out of reach", () => {
  const { main, backend } = workspace();
  const alone = one(backend, "--work", "WORK-TOKEN")[0];
  assert.equal(alone.thread.find((node) => node.work === "WORK-LOGIN").repo, null);

  const text = cli(main, "status", "--repo", ".", "--all-repos", "--work", "WORK-LOGIN");
  assert.match(text, /^WORK-LOGIN {2}CLOSED$/m);
  assert.match(text, /^ {4}WORK-LOGIN {2}CLOSED {2}split into WORK-TOKEN$/m);
  assert.match(text, /^ {4}WORK-TOKEN {2}WORK_DRAFT {2}split from WORK-LOGIN \(repo backend\)$/m);

  // An id in two repositories (and not in the linking one) is listed for each.
  const plan = JSON.parse(cli(main, "status", "--repo", ".", "--all-repos", "--work", "WORK-PLAN", "--json"))
    .repos.flatMap((group) => group.works).find((row) => row.work === "WORK-PLAN");
  assert.deepEqual(plan.thread.filter((node) => node.work === "WORK-DUP").map((node) => node.repoLabel).sort(), ["backend", "cli"]);
});

test("--ref finds every work that carries an external id, in any case, and prints nothing when none does", () => {
  const { main } = workspace();
  const found = JSON.parse(cli(main, "status", "--repo", ".", "--all-repos", "--ref", "Task-15", "--json")).works;
  assert.deepEqual(found.map((row) => row.work).sort(), ["WORK-LOGIN", "WORK-TOKEN"]);
  assert.ok(found.every((row) => row.thread.length === 2));
  const text = cli(main, "status", "--repo", ".", "--all-repos", "--ref", "TASK-15");
  assert.match(text, /^WORK-LOGIN {2}CLOSED$/m);
  assert.match(text, /^ {2}refs: TASK-15$/m);
  assert.equal(cli(main, "status", "--repo", ".", "--all-repos", "--ref", "TASK-99"), "");
  assert.deepEqual(JSON.parse(cli(main, "status", "--repo", ".", "--ref", "TASK-15", "--json")).works, []);
  assert.match(call(main, "status", "--repo", ".", "--ref", "TASK-15", "--work", "WORK-PLAN").stderr, /choose --ref, --work or --run/);
});
