// Code trace (WORK-CODE-TRACE): `history --path` names the works behind
// lines of code through three facts only (a recorded run's base..candidate
// range, a "Work: <ID>" trailer, a change under delivery/work/<ID>/), counts
// the rest as untraced, and accept / check warn when delivery/ is ignored by
// Git. Real cost behind it: in a pilot workspace run records alone traced
// 20% to 82% of two months of lines, and all five code repositories kept
// delivery/ out of Git.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { parsePathSpec } from "../src/v2/runtime/code-trace.js";
import { tempDir } from "./support/tmp.js";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");

function fixtureEnv(extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null",
    GIT_CONFIG_KEY_1: "commit.gpgSign", GIT_CONFIG_VALUE_1: "false", ...extra };
}
const IDENTITY = ["-c", "user.name=Test", "-c", "user.email=test@example.com"];
let clock = 0;
// Every commit a second later than the last, so "most recent first" is
// decided by time, not by name.
const git = (root, ...args) => {
  clock += 1;
  const at = new Date(Date.UTC(2026, 9, 1, 0, 0, clock)).toISOString();
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8", env: fixtureEnv({ GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at }),
  }).trim();
};

function repo(path = realpathSync(tempDir("bb-trace-"))) {
  mkdirSync(path, { recursive: true });
  git(path, "init", "-q", "-b", "main");
  git(path, ...IDENTITY, "commit", "-q", "--allow-empty", "-m", "fixture");
  return path;
}
function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function commit(root, message, files, ...paragraphs) {
  for (const [path, text] of Object.entries(files)) {
    write(root, path, text);
    git(root, "add", "--", path);
  }
  git(root, ...IDENTITY, "commit", "-q", "-m", message, ...paragraphs.flatMap((paragraph) => ["-m", paragraph]));
  return git(root, "rev-parse", "HEAD");
}
function work(root, id, title) {
  write(root, `delivery/work/${id}/work.md`, `# ${title}\n`);
}
function record(root, id, run, base, candidate, status = "SUCCEEDED") {
  write(root, `delivery/work/${id}/runs/${run}/run-record.json`, JSON.stringify({
    startedAt: "2026-10-01T00:00:00Z",
    terminal: { status },
    workspaces: { [run]: { base, candidate } },
  }));
}
const call = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: fixtureEnv() });
function cli(cwd, ...args) {
  const out = call(cwd, ...args);
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}
const traced = (cwd, spec) => JSON.parse(cli(cwd, "history", "--repo", ".", "--path", spec, "--json"));
const lines = (...items) => `${items.join("\n")}\n`;

// One file whose lines come from a run range, a trailer, a work folder, a
// subject that only mentions a work, and a trailer naming no known work.
function traceFixture() {
  const root = repo();
  const start = commit(root, "chore: start, see WORK-RUN", { "src/a.js": lines("one", "two") });
  const first = commit(root, "builder: RUN-A-01 attempt 1", { "src/a.js": lines("one", "two", "three") });
  const second = commit(root, "feat: four", { "src/a.js": lines("one", "two", "three", "four") }, "Work: WORK-TRAILER");
  const third = commit(root, "docs: five with notes", {
    "src/a.js": lines("one", "two", "three", "four", "five"),
    "delivery/work/WORK-FOLDER/notes.md": "notes\n",
  });
  const mention = commit(root, "fix: six, as WORK-TRAILER asked", { "src/a.js": lines("one", "two", "three", "four", "five", "six") });
  const gone = commit(root, "feat: seven", { "src/a.js": lines("one", "two", "three", "four", "five", "six", "seven") }, "Work: WORK-GONE");
  work(root, "WORK-RUN", "Run work");
  record(root, "WORK-RUN", "RUN-A-01", start, first);
  // An earlier, superseded run of the same work that also covered "four".
  record(root, "WORK-RUN", "RUN-A-02", start, second, "SUPERSEDED");
  work(root, "WORK-TRAILER", "Trailer work");
  work(root, "WORK-FOLDER", "Folder work");
  write(root, "delivery/work/WORK-FOLDER/result.md", "# WORK-FOLDER result\n\nFive lines and notes shipped.\n");
  write(root, "delivery/work/WORK-FOLDER/decisions.jsonl", `${JSON.stringify({
    ts: "2026-10-02T00:00:00Z", decision: "closed", transition: "close-work", subject: { result: "five shipped" }, by: "owner",
  })}\n`);
  return { root, start, first, second, third, mention, gone };
}

test("each of the three facts traces lines to a work; a subject that only names one does not", () => {
  const { root, start, mention } = traceFixture();
  const trace = traced(root, "src/a.js");
  assert.equal(trace.path, "src/a.js");
  assert.deepEqual(trace.lines, { from: 1, to: 7, total: 7 });
  const byWork = Object.fromEntries(trace.works.map((row) => [row.work, row]));
  assert.deepEqual(byWork["WORK-FOLDER"].via, [{ kind: "folder" }]);
  assert.equal(byWork["WORK-FOLDER"].lines, 1);
  assert.deepEqual(byWork["WORK-TRAILER"].via, [{ kind: "trailer" }]);
  // "three" lies in both runs' ranges, "four" only in the superseded one.
  assert.deepEqual(byWork["WORK-RUN"].via, [{ kind: "run", run: "RUN-A-01" }, { kind: "run", run: "RUN-A-02" }]);
  assert.equal(byWork["WORK-RUN"].lines, 2);
  // Lines one, two (the start) and six (a subject that only mentions a
  // work) are untraced; nothing is guessed.
  assert.equal(trace.untraced.lines, 3);
  assert.deepEqual(trace.untraced.commits.map((item) => item.commit), [start, mention]);
  // A trailer naming a work with no folder in reach is listed, not dropped.
  assert.equal(byWork["WORK-GONE"].stage, null);
  assert.equal(byWork["WORK-GONE"].title, null);
});

test("works are listed most recent first, with stage, title, summary and where to read", () => {
  const { root } = traceFixture();
  const trace = traced(root, "src/a.js");
  // WORK-RUN's superseded run also covers "four", the commit WORK-TRAILER
  // wrote, so the two tie on time and the tie goes by name.
  assert.deepEqual(trace.works.map((row) => row.work), ["WORK-GONE", "WORK-FOLDER", "WORK-RUN", "WORK-TRAILER"]);
  const folder = trace.works.find((row) => row.work === "WORK-FOLDER");
  assert.equal(folder.stage, "CLOSED");
  assert.equal(folder.title, "Folder work");
  assert.equal(folder.summary, "Five lines and notes shipped.");
  assert.deepEqual(folder.read, ["delivery/work/WORK-FOLDER/work.md", "delivery/work/WORK-FOLDER/result.md"]);
  const run = trace.works.find((row) => row.work === "WORK-RUN");
  assert.equal(run.stage, "MERGED");
  assert.equal(run.summary, null);

  const text = cli(root, "history", "--repo", ".", "--path", "src/a.js");
  assert.match(text, /^src\/a\.js:1-7 — 7 lines, 4 works$/m);
  assert.match(text, /^ {2}WORK-FOLDER {2}CLOSED {2}Folder work \(1 line; via work folder\)$/m);
  assert.match(text, /^ {4}result: Five lines and notes shipped\.$/m);
  assert.match(text, /^ {4}read: delivery\/work\/WORK-FOLDER\/work\.md, delivery\/work\/WORK-FOLDER\/result\.md$/m);
  assert.match(text, /^ {2}WORK-RUN {2}MERGED {2}Run work \(2 lines; via run RUN-A-01, RUN-A-02\)$/m);
  assert.match(text, /^ {2}WORK-TRAILER {2}WORK_DRAFT {2}Trailer work \(1 line; via Work trailer\)$/m);
  assert.match(text, /^ {2}WORK-GONE {2}NOT_FOUND {2}\(no records in reach\) \(1 line; via Work trailer\)$/m);
  assert.match(text, /^ {2}not traced to a work: 3 lines in 2 commits$/m);
  assert.match(text, /^ {4}[0-9a-f]{7} chore: start, see WORK-RUN$/m);
});

test("a line or a range narrows the trace; bad ranges and untracked files are refused", () => {
  const { root } = traceFixture();
  const one = traced(root, "src/a.js:4");
  assert.deepEqual(one.lines, { from: 4, to: 4, total: 1 });
  assert.deepEqual(one.works.map((row) => row.work).sort(), ["WORK-RUN", "WORK-TRAILER"]);
  const range = traced(root, "src/a.js:1-2");
  assert.deepEqual(range.works, []);
  assert.equal(range.untraced.lines, 2);
  assert.match(cli(root, "history", "--repo", ".", "--path", "src/a.js:3"), /^src\/a\.js:3 — 1 line, 1 work$/m);

  const out = call(root, "history", "--repo", ".", "--path", "src/a.js:6-9");
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /src\/a\.js has 7 lines at HEAD; 6-9 is out of range/);
  write(root, "src/new.js", "draft\n");
  assert.match(call(root, "history", "--repo", ".", "--path", "src/new.js").stderr, /src\/new\.js is not a file tracked by Git at HEAD/);
  assert.match(call(root, "history", "--repo", ".", "--path", "src/missing.js").stderr, /src\/missing\.js is not a file tracked by Git at HEAD/);
  assert.match(call(root, "history", "--repo", ".", "--path", "src").stderr, /src is not a file tracked by Git at HEAD/);
  assert.deepEqual(parsePathSpec("src/a.js:3-4"), { file: "src/a.js", from: 3, to: 4 });
  assert.deepEqual(parsePathSpec("src/a.js"), { file: "src/a.js", from: null, to: null });
});

test("a rebased commit keeps its trailer though its recorded run range no longer covers it", () => {
  const root = repo();
  const base = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "-q", "-b", "feature");
  const before = commit(root, "builder: RUN-R-01 attempt 1", { "src/r.js": lines("rebased") }, "Work: WORK-R");
  git(root, "checkout", "-q", "main");
  commit(root, "chore: elsewhere", { "other.txt": "x\n" });
  git(root, ...IDENTITY, "rebase", "-q", "main", "feature");
  git(root, "checkout", "-q", "main");
  git(root, "merge", "-q", "--ff-only", "feature");
  work(root, "WORK-R", "Rebased work");
  record(root, "WORK-R", "RUN-R-01", base, before);
  const [row] = traced(root, "src/r.js").works;
  assert.equal(row.work, "WORK-R");
  assert.deepEqual(row.via, [{ kind: "trailer" }]);
  assert.notEqual(row.commits[0], before);
});

test("a Work: line counts only inside Git's trailer block", () => {
  const root = repo();
  commit(root, "Work: WORK-SUBJECT", { "src/t.js": lines("one") });
  commit(root, "feat: two", { "src/t.js": lines("one", "two") }, "Work: WORK-BODY", "a closing paragraph, so the line above is body text");
  commit(root, "feat: three", { "src/t.js": lines("one", "two", "three") }, "body", "Work: WORK-A\nCo-Authored-By: someone\nwork: WORK-B");
  const trace = traced(root, "src/t.js");
  assert.deepEqual(trace.works.map((row) => row.work).sort(), ["WORK-A", "WORK-B"]);
  for (const row of trace.works) assert.deepEqual(row.via, [{ kind: "trailer" }]);
  assert.equal(trace.untraced.lines, 2);
  assert.deepEqual(trace.untraced.commits.map((item) => item.subject).sort(), ["Work: WORK-SUBJECT", "feat: two"]);
});

test("a line written in a merge commit traces through what the merge changed", () => {
  const root = repo();
  commit(root, "base", { "src/m.js": lines("start") });
  git(root, "checkout", "-q", "-b", "side");
  commit(root, "side change", { "src/m.js": lines("side") });
  git(root, "checkout", "-q", "main");
  commit(root, "main change", { "src/m.js": lines("main") });
  // The merge conflicts; the person resolves it by hand and records the
  // resolution in the work's notes in the same merge commit.
  assert.throws(() => git(root, ...IDENTITY, "merge", "-q", "side"));
  write(root, "src/m.js", lines("resolved"));
  write(root, "delivery/work/WORK-M/notes.md", "resolved the conflict\n");
  git(root, "add", "--", "src/m.js", "delivery/work/WORK-M/notes.md");
  git(root, ...IDENTITY, "commit", "-q", "--no-edit");
  work(root, "WORK-M", "Merge work");
  const [row] = traced(root, "src/m.js").works;
  assert.equal(row.work, "WORK-M");
  assert.deepEqual(row.via, [{ kind: "folder" }]);
});

test("records kept in the checkout around a code repository still trace its lines", () => {
  const main = repo();
  const code = repo(join(main, "code"));
  const base = git(code, "rev-parse", "HEAD");
  const change = commit(code, "builder: RUN-L-01 attempt 1", { "src/l.js": lines("legacy") });
  work(main, "WORK-L", "Legacy work");
  record(main, "WORK-L", "RUN-L-01", base, change);
  const [row] = traced(code, "src/l.js").works;
  assert.equal(row.work, "WORK-L");
  assert.deepEqual(row.via, [{ kind: "run", run: "RUN-L-01" }]);
  assert.equal(row.title, "Legacy work");
  assert.deepEqual(row.read, ["../delivery/work/WORK-L/work.md"]);
  // From the main repository, a relative path is read in the repository
  // given with --repo, and the files to read are named from the caller.
  const fromMain = JSON.parse(cli(main, "history", "--repo", "code", "--path", "src/l.js", "--json"));
  assert.equal(fromMain.works[0].work, "WORK-L");
  assert.deepEqual(fromMain.works[0].read, ["delivery/work/WORK-L/work.md"]);
});

test("accept and check warn when delivery/ is ignored by Git, and stay quiet otherwise", () => {
  const root = repo();
  work(root, "W", "Ignored work");
  write(root, "delivery/work/W/run-config.yaml", [
    "repo: ../../..", "work: W", "run: RUN-W", "allowedPaths:", "  - src", "workers:", "  verifier:",
    "    command: bash", "    args:", "      - -lc", "      - \"true\"", "",
  ].join("\n"));
  const warning = /^warning: delivery\/work\/W\/ is ignored by Git here \(\.gitignore or \.git\/info\/exclude\); its records will not travel with the code$/m;
  assert.doesNotMatch(cli(root, "check", "--config", "delivery/work/W/run-config.yaml"), warning);
  appendFileSync(join(root, ".git", "info", "exclude"), "/delivery/\n");
  assert.match(cli(root, "accept", "--repo", ".", "--work", "W", "--by", "owner"), warning);
  assert.match(cli(root, "check", "--config", "delivery/work/W/run-config.yaml"), warning);
  writeFileSync(join(root, ".git", "info", "exclude"), "");
  write(root, ".gitignore", "delivery/\n");
  assert.match(cli(root, "check", "--config", "delivery/work/W/run-config.yaml"), warning);
  writeFileSync(join(root, ".gitignore"), "");
  assert.doesNotMatch(cli(root, "check", "--config", "delivery/work/W/run-config.yaml"), warning);
  assert.match(readFileSync(join(root, "delivery/work/W/decisions.jsonl"), "utf8"), /accept-work/);
});
