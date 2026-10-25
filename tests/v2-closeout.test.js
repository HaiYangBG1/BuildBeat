// Close-out (WORK-CONTEXT-CLOSEOUT): every work closes with result.md; a
// work without a release closes on its page alone; "<path> @ <commit>"
// lines are read back from Git before the close is recorded. Real cost
// behind it: in the pilot workspace 15 of 21 release readback scripts only
// checked Git so that works that never ship could close, and the same
// environment facts were rediscovered work after work.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkPromotions, parsePromotions, resultSummary } from "../src/v2/runtime/closeout.js";
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
const IDENTITY = ["-c", "user.name=Test", "-c", "user.email=test@example.com"];

function repo() {
  const root = realpathSync(tempDir("bb-closeout-"));
  git(root, "init", "-q", "-b", "main");
  git(root, ...IDENTITY, "commit", "-q", "--allow-empty", "-m", "fixture");
  return root;
}
function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function commit(root, path, text, message) {
  write(root, path, text);
  git(root, "add", "--", path);
  git(root, ...IDENTITY, "commit", "-q", "-m", message);
  return git(root, "rev-parse", "HEAD");
}
function work(root, id, files = {}) {
  const dir = join(root, "delivery", "work", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "work.md"), `# ${id}\n`);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}
const call = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: fixtureEnv() });
function cli(cwd, ...args) {
  const out = call(cwd, ...args);
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}
const close = (root, id, ...extra) => call(root, "decide", "--repo", ".", "--work", id, "--action", "close", "--by", "owner", ...extra);
const decisions = (dir) => readFileSync(join(dir, "decisions.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const statusRow = (root, id) => JSON.parse(cli(root, "status", "--repo", ".", "--work", id, "--json")).works[0];
const sha256 = (path) => `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
const config = (id, extra = "") => `repo: ../../..\nwork: ${id}\n${extra}`;

test("a work without a release closes on its result page, bound by digest", () => {
  const root = repo();
  const dir = work(root, "PLAIN", { "run-config.yaml": config("PLAIN") });
  const missing = close(root, "PLAIN");
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /closing a work needs delivery\/work\/PLAIN\/result\.md \(template: templates\/v2\/result\.example\.md\)/);

  writeFileSync(join(dir, "result.md"), [
    "# PLAIN result", "", "<!-- guidance kept in a comment -->",
    "Export ships in 1.3.0, merged as ede20b6.", "Second line of the paragraph.", "",
    "## Left over", "- none", "",
  ].join("\n"));
  const closed = close(root, "PLAIN", "--note", "measured by the owner");
  assert.equal(closed.status, 0, closed.stderr);
  assert.match(closed.stdout, /closed PLAIN as C-PLAIN-1 by owner \(person\) \(result\.md sha256:[0-9a-f]{12} · written into the project: 0\)/);
  const row = decisions(dir).at(-1);
  assert.equal(row.transition, "close-work");
  assert.equal(row.subject.result, "Export ships in 1.3.0, merged as ede20b6.");
  assert.equal(row.subject.resultDigest, sha256(join(dir, "result.md")));
  assert.deepEqual(row.subject.promotions, []);
  assert.equal(row.subject.readback, undefined);
  assert.equal(row.note, "measured by the owner");

  const closedRow = statusRow(root, "PLAIN");
  assert.equal(closedRow.stage, "CLOSED");
  assert.match(closedRow.next, /^closed @ .*: Export ships in 1\.3\.0, merged as ede20b6\. · written into the project: 0$/);
  assert.equal(closedRow.result.changedAfterClose, false);
  assert.match(cli(root, "status", "--repo", ".", "--work", "PLAIN"), /close-work closed by owner \(person\) — measured by the owner/);
  assert.match(close(root, "PLAIN").stderr, /PLAIN is already closed/);

  writeFileSync(join(dir, "result.md"), `${readFileSync(join(dir, "result.md"), "utf8")}- one more leftover\n`);
  const changed = statusRow(root, "PLAIN");
  assert.match(changed.next, / · result\.md changed after closing$/);
  assert.equal(changed.result.changedAfterClose, true);
});

test("--result overrides the page's summary, and a page without text needs --result", () => {
  const root = repo();
  const dir = work(root, "BARE", { "result.md": "# BARE result\n\n```text\nnot a summary\n```\n\n## Decided\n" });
  const bare = close(root, "BARE");
  assert.notEqual(bare.status, 0);
  assert.match(bare.stderr, /closing a work needs --result <text>/);
  assert.equal(close(root, "BARE", "--result", "docs only").status, 0);
  assert.equal(decisions(dir).at(-1).subject.result, "docs only");
  assert.equal(resultSummary("# t\n<!--\nmulti-line\nguidance\n-->\n\n## h\nfirst text\n"), "first text");
  // The same reader drops indented code and a comment that opens mid-line.
  assert.equal(resultSummary("# t\n\n    an indented example\n\nSo <!-- not this --> the summary.\n"), "So  the summary.");
  assert.deepEqual(parsePromotions("x\n\n    - AGENTS.md @ abcdef1\n\nnote <!-- hidden\n- AGENTS.md @ abcdef2\n-->\n"), []);
  // A comment marker in inline code or an indented example is text and hides
  // neither the summary nor the promotion lines after it.
  const page = "# r\n\nShipped; `<!--` in text stays text.\n\n    <!-- an example\n\n## Written into the project\n- AGENTS.md @ abcdef1 — fact\n";
  assert.equal(resultSummary(page), "Shipped; `<!--` in text stays text.");
  assert.deepEqual(parsePromotions(page), [{ path: "AGENTS.md", commit: "abcdef1" }]);
});

test("a work with a release, or a run config that cannot be read, still needs a passing readback", () => {
  const root = repo();
  const ship = work(root, "SHIP", {
    "run-config.yaml": config("SHIP", "release:\n  command: true\n"),
    "result.md": "# SHIP result\n\nShipped.\n",
  });
  assert.match(close(root, "SHIP").stderr, /SHIP has no readback; run buildbeat release --config/);
  work(root, "BROKEN", { "run-config.yaml": "repo: [\n", "result.md": "# BROKEN result\n\nShipped.\n" });
  assert.match(close(root, "BROKEN").stderr, /BROKEN has no readback/);
  writeFileSync(join(ship, "releases.jsonl"), `${JSON.stringify({
    ts: "2026-10-25T00:00:00.000Z", status: "failed", exitCode: 3, digest: "sha256:r1",
    commit: git(root, "rev-parse", "HEAD"), candidate: null,
  })}\n`);
  assert.match(close(root, "SHIP").stderr, /the latest readback failed \(exit 3/);
  assert.equal(existsSync(join(ship, "decisions.jsonl")), false);
});

test("a release kept in the main repository governs a work whose records live in a code repository", () => {
  const main = repo();
  // A main repository with its code repository inside, the layout
  // status --all-repos discovers.
  const code = join(main, "code");
  mkdirSync(code);
  git(code, "init", "-q", "-b", "main");
  git(code, ...IDENTITY, "commit", "-q", "--allow-empty", "-m", "fixture");
  const mainConfig = join(work(main, "CROSS", {
    "run-config.yaml": "repo: ../../../code\nwork: CROSS\nrelease:\n  command: true\n",
  }), "run-config.yaml");
  const dir = work(code, "CROSS", { "result.md": "# CROSS result\n\nShipped.\n" });
  const fromMain = () => call(main, "decide", "--repo", "code", "--work", "CROSS", "--action", "close", "--by", "owner");
  assert.match(fromMain().stderr, /CROSS has no readback/);
  // From inside the code repository the enclosing main repository is read too.
  assert.match(close(code, "CROSS").stderr, /CROSS has no readback/);
  assert.equal(existsSync(join(dir, "decisions.jsonl")), false);
  // Without a release in the main repository's config, the page alone closes it.
  writeFileSync(mainConfig, "repo: ../../../code\nwork: CROSS\n");
  assert.equal(fromMain().status, 0);
  assert.equal(decisions(dir).at(-1).transition, "close-work");
});

test("runs recorded here with no run config in reach refuse the close", () => {
  // A code repository on its own: the main repository that holds its
  // config is neither the caller nor around it.
  const code = repo();
  const dir = work(code, "AWAY", { "result.md": "# AWAY result\n\nShipped.\n" });
  const record = join(dir, "runs", "RUN-AWAY-01");
  mkdirSync(record, { recursive: true });
  writeFileSync(join(record, "run-record.json"), JSON.stringify({
    startedAt: "2026-10-25T00:00:00Z",
    terminal: { status: "SUCCEEDED" },
    workspaces: { "RUN-AWAY-01": { candidate: git(code, "rev-parse", "HEAD") } },
  }));
  const refused = close(code, "AWAY");
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /AWAY: its run configs are not in this repository; close it from the repository that holds them/);
});

test("a work cannot be closed underneath its own run in progress", () => {
  const root = repo();
  const dir = work(root, "LIVE", { "result.md": "# LIVE result\n\nNot done yet.\n" });
  const record = join(dir, "runs", "RUN-LIVE-01");
  mkdirSync(record, { recursive: true });
  writeFileSync(join(record, "run-record.json"), JSON.stringify({
    startedAt: "2026-10-25T00:00:00Z",
    terminal: { status: "WAITING_HUMAN" },
    workspaces: { "RUN-LIVE-01": { candidate: git(root, "rev-parse", "HEAD") } },
  }));
  const refused = close(root, "LIVE");
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /LIVE has a run in progress \(RUN-LIVE-01 WAITING_HUMAN\); finish or stop it before closing/);
  assert.equal(existsSync(join(dir, "decisions.jsonl")), false);
});

test("promotion lines are read back from Git before the close is recorded", () => {
  const root = repo();
  const dir = work(root, "PROMO");
  const agents = commit(root, "AGENTS.md", "# Agents\n\n- The package manager needs a terminal for its hooks.\n", "docs: environment fact");
  const other = commit(root, "other.txt", "unrelated\n", "chore: unrelated");
  git(root, "checkout", "-q", "-b", "side");
  const side = commit(root, "docs/side.md", "side\n", "docs: on a side branch");
  git(root, "checkout", "-q", "main");
  writeFileSync(join(dir, "result.md"), [
    "# PROMO result", "", "Delivered.", "", "## Written into the project",
    `- \`AGENTS.md\` @ ${agents.slice(0, 7)} — environment fact`,
    `- docs/side.md @ ${side} — never merged`,
    `- README.md @ ${other.slice(0, 7)} — wrong file`,
    `- delivery/work/PROMO/notes.md @ ${agents.slice(0, 7)} — the work's own folder`,
    "- docs/gone.md @ deadbeef — no such commit",
    "", "```", `- AGENTS.md @ ${other} — an example in code, not a line`, "```", "",
  ].join("\n"));
  const refused = close(root, "PROMO");
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, new RegExp(`docs/side\\.md @ ${side}: commit not on main`));
  assert.match(refused.stderr, new RegExp(`README\\.md @ ${other.slice(0, 7)}: the commit does not change README\\.md`));
  assert.match(refused.stderr, /delivery\/work\/PROMO\/notes\.md: inside the work's own folder, not the project/);
  assert.match(refused.stderr, /docs\/gone\.md @ deadbeef: unknown commit/);
  assert.equal(existsSync(join(dir, "decisions.jsonl")), false);

  // Before closing, the single-work view shows what closing would refuse.
  const draft = cli(root, "status", "--repo", ".", "--work", "PROMO");
  assert.match(draft, new RegExp(`✓ AGENTS\\.md @ ${agents.slice(0, 7)}`));
  assert.match(draft, /✗ docs\/gone\.md @ deadbeef: unknown commit/);
  assert.deepEqual(statusRow(root, "PROMO").result.promotions.map((item) => item.ok), [true, false, false, false, false]);

  writeFileSync(join(dir, "result.md"), `# PROMO result\n\nDelivered.\n\n## Written into the project\n- \`AGENTS.md\` @ ${agents.slice(0, 7)} — environment fact\n`);
  assert.equal(close(root, "PROMO").status, 0);
  assert.deepEqual(decisions(dir).at(-1).subject.promotions, [{ path: "AGENTS.md", commit: agents }]);
  assert.match(statusRow(root, "PROMO").next, / · written into the project: 1$/);
});

test("documents merged through a merge commit or a squash count by what landed on the branch", () => {
  const root = repo();
  git(root, "checkout", "-q", "-b", "doc");
  const written = commit(root, "docs/guide.md", "guide\n", "docs: guide");
  git(root, "checkout", "-q", "main");
  git(root, ...IDENTITY, "merge", "-q", "--no-ff", "-m", "Merge doc", "doc");
  const merge = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "-q", "-b", "sq");
  const before = commit(root, "docs/squashed.md", "squashed\n", "docs: squashed");
  git(root, "checkout", "-q", "main");
  git(root, "merge", "-q", "--squash", "sq");
  git(root, ...IDENTITY, "commit", "-q", "-m", "docs: squashed (#2)");
  const squashed = git(root, "rev-parse", "HEAD");
  const check = (path, sha) => checkPromotions(root, "WORK-M", [{ path, commit: sha }], { ref: "main" })[0];
  assert.equal(check("docs/guide.md", written).ok, true);
  assert.equal(check("docs/guide.md", merge).ok, true);
  assert.equal(check("docs/squashed.md", squashed).ok, true);
  const stale = check("docs/squashed.md", before);
  assert.equal(stale.ok, false);
  assert.equal(stale.problem, `docs/squashed.md @ ${before}: commit not on main`);
});

test("acceptance keeps the person's own words", () => {
  const root = repo();
  const dir = work(root, "NOTE");
  cli(root, "accept", "--repo", ".", "--work", "NOTE", "--by", "owner", "--note", "按推荐接受");
  assert.equal(decisions(dir).at(-1).note, "按推荐接受");
  assert.match(cli(root, "status", "--repo", ".", "--work", "NOTE"), /accept-work approved by owner \(person\) — 按推荐接受/);
  assert.equal(statusRow(root, "NOTE").decisions.find((item) => item.transition === "accept-work").note, "按推荐接受");
});

test("the templates carry the documented sections", () => {
  const read = (name) => readFileSync(join(ROOT, "templates", "v2", name), "utf8");
  const heads = (name) => read(name).match(/^## .+$/gm).map((line) => line.slice(3));
  assert.deepEqual(heads("work.example.md"), [
    "Goal", "Why now", "Facts checked (<date>, on <commit>)", "Scope",
    "Decisions before starting", "Acceptance", "Implementation plan", "Stop conditions",
  ]);
  assert.deepEqual(heads("result.example.md"), ["Decided", "Left over", "Written into the project"]);
  assert.notEqual(resultSummary(read("result.example.md")), "");
  // The template's example line names no real commit, so it never passes
  // for a recorded conclusion.
  assert.deepEqual(parsePromotions(read("result.example.md")), []);
});
