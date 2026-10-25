// Facts with code pointers (WORK-FACT-POINTERS): the facts section names the
// commit it was checked on in its heading and points at code as `path`,
// `path:line` or `path:line-line`; status --work lists the pointers whose code
// changed since (against HEAD before the first run, the latest run's base
// after), and accept and check warn. Closed works are left alone.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { parseFacts, runBase } from "../src/v2/runtime/facts.js";
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

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function commit(root, message) {
  git(root, "add", "-A");
  git(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", message);
  return git(root, "rev-parse", "HEAD");
}
const numbered = (name, count) => Array.from({ length: count }, (_, index) => `${name} line ${index + 1}`);
const call = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: fixtureEnv() });
function cli(cwd, ...args) {
  const out = call(cwd, ...args);
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}
const row = (cwd, work) => JSON.parse(cli(cwd, "status", "--repo", ".", "--work", work, "--json")).works[0];
const block = (text) => text.split("\n").filter((line) => /^ {2}facts:|^ {4}(changed|not found) /.test(line));
const CONFIG = ["repo: ../../..", "work: W", "run: RUN-W", "allowedPaths:", "  - src", "workers:", "  verifier:",
  "    command: bash", "    args:", "      - -lc", "      - \"true\""];

// Code checked on `pin`, a work whose facts point at it, then a commit that
// moves, edits, inserts into and deletes the code pointed at.
function fixture() {
  const root = realpathSync(tempDir("bb-facts-"));
  git(root, "init", "-q", "-b", "main");
  write(root, ".gitignore", ".buildbeat/runtime/\n.buildbeat/worktrees/\n");
  write(root, "src/app.js", `${numbered("app", 20).join("\n")}\n`);
  write(root, "src/lib/util.js", `${numbered("util", 5).join("\n")}\n`);
  write(root, "src/gone.js", "gone\n");
  write(root, "src/a/config.yml", "a: 1\n");
  write(root, "src/b/config.yml", "b: 1\n");
  write(root, "docs/a.md", "# A\n");
  const pin = commit(root, "code");
  write(root, "delivery/work/W/work.md", [
    "# W", "",
    `## Facts checked (2026-10-25, on ${pin.slice(0, 7)})`,
    "- `src/app.js:5-7` reads the flag; `app.js:15` logs it.",
    "- `src/app.js:10-12` and `src/app.js:12` handle errors; `./src/app.js:5-7` again.",
    "- `src/lib/util.js` formats; `docs/a.md` explains; `src/gone.js` is old.",
    "- `config.yml`, `src/missing.js:3`, `src/lib/`, `session.validate`, `--json` and `https://example.com/x.js`.",
    "```", "- `src/app.js:1`", "```",
    "<!-- `src/app.js:2` -->",
    "", "## Scope", "", "- `src/app.js:1-20`", "",
  ].join("\n"));
  write(root, "delivery/work/W/run-config.yaml", `${CONFIG.join("\n")}\n`);
  commit(root, "work");
  const app = numbered("app", 20);
  app[5] = "app line 6 changed";
  app.splice(12, 0, "inserted after line 12");
  app.splice(10, 0, "inserted after line 10");
  app.unshift("top 1", "top 2");
  write(root, "src/app.js", `${app.join("\n")}\n`);
  write(root, "src/lib/util.js", `${numbered("util", 6).join("\n")}\n`);
  rmSync(join(root, "src/gone.js"));
  const change = commit(root, "change the code");
  return { root, pin, change };
}

test("only the section whose heading names a commit is read, outside code and comments", () => {
  const sections = parseFacts([
    "# Title",
    "## Scope",
    "- `src/scope.js:1`",
    "## 已核实的现状（2026-10-25，main `abc1234`）",
    "**代码已确认**",
    "- `src/a.js:5-7` and `b.js:9`, also `src/c.js`",
    "### A sub-heading stays in the section",
    "- `./src/d.js`",
    "- `https://example.com/x.js`, `<path>`, `--json`, `/etc/app.env`, `~/x.js`, `src/*.js`, ``src/double.js``",
    "```", "- `src/in-code.js:1`", "```",
    "<!-- `src/in-comment.js:1` -->",
    "## Decisions before starting",
    "- `src/after.js:1`",
    "## Facts checked (2026-10-26, on DEADBEEF0)",
    "- `src/e.js:3-1`",
  ].join("\n"));
  assert.deepEqual(sections.map((section) => section.commits), [["abc1234"], ["deadbeef0"]]);
  assert.deepEqual(sections[0].pointers.map((item) => [item.path, item.lines]), [
    ["src/a.js", [5, 7]], ["b.js", [9, 9]], ["src/c.js", null], ["src/d.js", null],
  ]);
  assert.deepEqual(sections[1].pointers, [{ text: "src/e.js:3-1", path: "src/e.js", lines: [3, 3] }]);
});

test("status --work compares the code pointed at with HEAD before the first run, line by line", () => {
  const { root, pin, change } = fixture();
  const facts = row(root, "W").facts;
  assert.equal(facts.checkedOn, pin);
  assert.equal(facts.against, "HEAD");
  assert.deepEqual(facts.pointers.map((item) => [item.text, item.path, item.state]), [
    ["src/app.js:5-7", "src/app.js", "changed"], // line 6 edited
    ["app.js:15", "src/app.js", "elsewhere"], // lines moved by edits above, not edited
    ["src/app.js:10-12", "src/app.js", "changed"], // a line inserted inside the range
    ["src/app.js:12", "src/app.js", "elsewhere"], // a line inserted right after it
    ["src/lib/util.js", "src/lib/util.js", "changed"], // no lines: any change counts
    ["docs/a.md", "docs/a.md", "same"],
    ["src/gone.js", "src/gone.js", "not found"],
    ["config.yml", null, "not found"],
    ["src/missing.js:3", null, "not found"],
  ]);
  assert.deepEqual(facts.pointers[0].lines, [5, 7]);
  assert.equal(facts.pointers[0].commits, 1);
  assert.deepEqual(facts.pointers[0].latest, { commit: change, subject: "change the code" });
  const short = pin.slice(0, 7);
  const latest = `(1 commit, latest ${change.slice(0, 7)} change the code)`;
  assert.deepEqual(block(cli(root, "status", "--repo", ".", "--work", "W")), [
    `  facts: checked on ${short}, compared with HEAD: 9 pointers, 3 changed, 2 changed elsewhere in the file, 3 not found`,
    `    changed  src/app.js:5-7  ${latest}`,
    `    changed  src/app.js:10-12  ${latest}`,
    `    changed  src/lib/util.js  ${latest}`,
    "    not found  src/gone.js  (not in HEAD)",
    `    not found  config.yml  (matches 2 files at ${short})`,
    `    not found  src/missing.js:3  (no file at ${short})`,
  ]);
});

test("accept and check warn when code the facts point at changed; check uses the run config's base", () => {
  const { root, pin } = fixture();
  const warning = `warning: facts in delivery/work/W/work.md were checked on ${pin.slice(0, 7)}; 4 referenced places changed since: ` +
    "src/app.js:5-7, src/app.js:10-12, src/lib/util.js, src/gone.js; re-check them before starting";
  assert.ok(cli(root, "accept", "--repo", ".", "--work", "W", "--by", "owner").split("\n").includes(warning));
  assert.ok(cli(root, "check", "--config", "delivery/work/W/run-config.yaml").split("\n").includes(warning));
  // A run config whose base is the commit the facts were checked on: nothing changed.
  write(root, "delivery/work/W/run-config.yaml", `${[...CONFIG, `base: ${pin}`].join("\n")}\n`);
  assert.doesNotMatch(cli(root, "check", "--config", "delivery/work/W/run-config.yaml"), /^warning: facts/m);
});

test("after a run the facts are compared with its base; a closed work has no facts block", () => {
  const { root, pin } = fixture();
  cli(root, "accept", "--repo", ".", "--work", "W", "--by", "owner");
  assert.match(cli(root, "run", "--config", "delivery/work/W/run-config.yaml"), /waiting on human: enter-build/);
  const base = git(root, "rev-parse", "HEAD");
  assert.equal(runBase(root, "W", "RUN-W-01"), base);
  write(root, "docs/a.md", "# A changed after the run started\n");
  commit(root, "docs after the run started");
  const facts = row(root, "W").facts;
  assert.equal(facts.against, "base of RUN-W-01");
  assert.equal(facts.pointers.find((item) => item.path === "docs/a.md").state, "same");
  assert.match(cli(root, "status", "--repo", ".", "--work", "W"),
    new RegExp(`^ {2}facts: checked on ${pin.slice(0, 7)}, compared with base of RUN-W-01: 9 pointers, 3 changed,`, "m"));

  cli(root, "decide", "--repo", ".", "--run", "RUN-W-01", "--action", "reject", "--reason", "done elsewhere", "--by", "owner");
  appendFileSync(join(root, "delivery/work/W/decisions.jsonl"),
    `${JSON.stringify({ ts: "2026-10-26T00:00:00.000Z", transition: "close-work", decision: "closed", subject: { result: "done" } })}\n`);
  const closed = row(root, "W");
  assert.equal(closed.stage, "CLOSED");
  assert.equal("facts" in closed, false);
  assert.doesNotMatch(cli(root, "status", "--repo", ".", "--work", "W"), /^ {2}facts:/m);
});

test("a run record's base is read when the ledger is not on this machine", () => {
  const root = realpathSync(tempDir("bb-facts-record-"));
  write(root, "delivery/work/W/runs/RUN-W-01/run-record.json",
    JSON.stringify({ run: "RUN-W-01", work: "W", workspaces: { "RUN-W-01": { base: "a".repeat(40), candidate: null } } }));
  assert.equal(runBase(root, "W", "RUN-W-01"), "a".repeat(40));
  assert.equal(runBase(root, "W", "RUN-W-02"), null);
});

test("without a commit of this repository in the heading nothing is compared; without one at all, nothing is shown", () => {
  const root = realpathSync(tempDir("bb-facts-none-"));
  git(root, "init", "-q", "-b", "main");
  write(root, "src/app.js", "app\n");
  const pin = commit(root, "code");
  const page = (heading) => ["# W", "", heading, "- `src/app.js:1` is the entry.", ""].join("\n");
  // Two commits named: the one of this repository is used.
  write(root, "delivery/work/W/work.md", page(`## 已核实的现状（other repo \`fedcba98\`，this repo \`${pin.slice(0, 8)}\`）`));
  write(root, "delivery/work/X/work.md", page("## Facts checked (2026-10-25, on `fedcba98`)"));
  write(root, "delivery/work/Y/work.md", page("## Facts checked (2026-10-25)"));
  write(root, "delivery/work/Z/work.md", "# Z\n\nNo facts here.\n");
  commit(root, "works");
  assert.equal(row(root, "W").facts.checkedOn, pin);
  assert.deepEqual(row(root, "W").facts.pointers.map((item) => item.state), ["same"]);
  assert.deepEqual(row(root, "X").facts, { checkedOn: null, against: null, pointers: [] });
  assert.match(cli(root, "status", "--repo", ".", "--work", "X"),
    /^ {2}facts: no commit of this repository in the heading; nothing compared$/m);
  assert.equal("facts" in row(root, "Y"), false);
  assert.equal("facts" in row(root, "Z"), false);
  assert.doesNotMatch(cli(root, "accept", "--repo", ".", "--work", "X", "--by", "owner"), /warning: facts/);
});
