// Work: trailers (WORK-COMMIT-TRAILERS): the shipped commit-msg hook adds
// the trailer when a subject (or the branch name) names exactly one work with
// a folder; `buildbeat hooks install` puts it where Git runs hooks without
// touching a project's own hook; history --path and status read an older
// commit's subject only when nothing else explains the commit; accept and
// check say when recent commits lack the trailer. Real cost behind it: in a
// pilot repository none of about 400 code commits in three weeks carried a
// Work: trailer, while nearly every subject named its work.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { namedWork } from "../src/runtime/work-commits.js";
import { tempDir } from "./support/tmp.js";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "bin", "buildbeat.js");
const HOOK = join(ROOT, "templates", "hooks", "commit-msg");

// hooksPath: null leaves Git's own hooks directory in charge.
function fixtureEnv(hooksPath = "/dev/null") {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const pairs = [["commit.gpgSign", "false"], ...(hooksPath === null ? [] : [["core.hooksPath", hooksPath]])];
  const config = Object.fromEntries(pairs.flatMap(([key, value], index) => [[`GIT_CONFIG_KEY_${index}`, key], [`GIT_CONFIG_VALUE_${index}`, value]]));
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_COUNT: String(pairs.length), ...config };
}
const IDENTITY = ["-c", "user.name=Test", "-c", "user.email=test@example.com"];
const git = (root, args, hooksPath) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: fixtureEnv(hooksPath) }).trim();

function repo() {
  const root = realpathSync(tempDir("bb-trailers-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, [...IDENTITY, "commit", "-q", "--allow-empty", "-m", "fixture"]);
  return root;
}
function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
let serial = 0;
function commit(root, message, { hooksPath, files } = {}) {
  serial += 1;
  const changes = files ?? { [`src/f${serial}.js`]: `${serial}\n` };
  for (const [path, text] of Object.entries(changes)) write(root, path, text);
  git(root, ["add", "--", ...Object.keys(changes)], hooksPath);
  git(root, [...IDENTITY, "commit", "-q", ...[message].flat().flatMap((paragraph) => ["-m", paragraph])], hooksPath);
  return git(root, ["rev-parse", "HEAD"], hooksPath);
}
const trailers = (root, rev = "HEAD") => git(root, ["log", "-1", "--format=%(trailers:key=Work,valueonly,separator=%x2C)", rev]);
function works(root, ...ids) {
  for (const id of ids) write(root, `delivery/work/${id}/work.md`, `# ${id}\n`);
  git(root, ["add", "--", "delivery"]);
  git(root, [...IDENTITY, "commit", "-q", "-m", "docs: works"]);
}
const call = (cwd, args, hooksPath) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: fixtureEnv(hooksPath) });
function cli(cwd, args, hooksPath) {
  const out = call(cwd, args, hooksPath);
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}

test("a subject names a work only when exactly one known work stands on its own", () => {
  const known = new Set(["WORK-ONE", "WORK-TWO.1", "ABC"]);
  assert.equal(namedWork("feat: one (WORK-ONE)", known), "WORK-ONE");
  assert.equal(namedWork("fix: WORK-TWO.1. done", known), "WORK-TWO.1");
  assert.equal(namedWork("中文标题（WORK-ONE）第二步", known), "WORK-ONE");
  assert.equal(namedWork("feat: WORK-ONE with WORK-ONE again", known), "WORK-ONE");
  assert.equal(namedWork("feat: WORK-ONE and WORK-TWO.1", known), null);
  assert.equal(namedWork("feat: WORK-ONE-B is another", known), null);
  assert.equal(namedWork("feat: ABC counts however short", known), "ABC");
  assert.equal(namedWork("feat: ABC and WORK-ONE", known), null);
  assert.equal(namedWork("feat: nothing", known), null);
});

test("the commit-msg hook adds the trailer from the subject or the branch, and nothing else", () => {
  const root = repo();
  works(root, "WORK-ONE", "WORK-TWO.1", "ABC");
  const hooks = join(root, ".git", "hooks");
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, "commit-msg"), readFileSync(HOOK, "utf8"), { mode: 0o755 });
  const own = { hooksPath: null };

  commit(root, "feat: one (WORK-ONE)", own);
  assert.equal(trailers(root), "WORK-ONE");
  commit(root, "中文标题（WORK-TWO.1）", own);
  assert.equal(trailers(root), "WORK-TWO.1");
  commit(root, "feat: both WORK-ONE and WORK-TWO.1", own);
  assert.equal(trailers(root), "");
  commit(root, "feat: ABC only", own);
  assert.equal(trailers(root), "ABC");
  commit(root, ["feat: names WORK-ONE", "Work: WORK-TWO.1"], own);
  assert.equal(trailers(root), "WORK-TWO.1");
  git(root, [...IDENTITY, "commit", "-q", "--amend", "--no-edit"], null);
  assert.equal(trailers(root), "WORK-TWO.1");
  commit(root, "feat: amend me (WORK-ONE)", own);
  git(root, [...IDENTITY, "commit", "-q", "--amend", "--no-edit"], null);
  assert.equal(trailers(root), "WORK-ONE");
  assert.equal(git(root, ["log", "-1", "--format=%B"]).match(/^Work:/gm).length, 1);

  git(root, ["checkout", "-q", "-b", "topic/WORK-ONE"]);
  commit(root, "feat: the branch names it", own);
  assert.equal(trailers(root), "WORK-ONE");
  // A subject naming two works is ambiguous: the branch does not settle it.
  commit(root, "feat: WORK-TWO.1 and ABC on a named branch", own);
  assert.equal(trailers(root), "");
  git(root, ["checkout", "-q", "-b", "topic/WORK-ONE-and-more"]);
  commit(root, "feat: nothing names it", own);
  assert.equal(trailers(root), "");

  // A linked worktree runs the same hook from the shared hooks directory.
  const linked = join(realpathSync(tempDir("bb-trailers-linked-")), "wt");
  git(root, ["worktree", "add", "-q", linked, "-b", "linked"], null);
  commit(linked, "feat: from the linked worktree (WORK-ONE)", own);
  assert.equal(trailers(linked), "WORK-ONE");
});

test("hooks install writes the hook, keeps a project's own hook, and writes nothing into the working tree", () => {
  const root = repo();
  works(root, "WORK-ONE");
  const hooks = join(root, ".git", "hooks");
  const fresh = cli(root, ["hooks", "install", "--repo", "."], null);
  assert.equal(fresh.trim(), `installed ${hooks}/commit-msg: a commit whose subject (or branch name) names exactly one work under delivery/work/ gets a "Work: <ID>" trailer`);
  assert.equal(readFileSync(join(hooks, "commit-msg"), "utf8"), readFileSync(HOOK, "utf8"));
  assert.ok(statSync(join(hooks, "commit-msg")).mode & 0o100);
  commit(root, "feat: installed (WORK-ONE)", { hooksPath: null });
  assert.equal(trailers(root), "WORK-ONE");
  // Installing again replaces only our own hook.
  assert.match(cli(root, ["hooks", "install", "--repo", "."], null), /^installed /);

  const other = repo();
  const otherHooks = join(other, ".git", "hooks");
  mkdirSync(otherHooks, { recursive: true });
  writeFileSync(join(otherHooks, "commit-msg"), "#!/bin/sh\necho project hook\n", { mode: 0o755 });
  const kept = cli(other, ["hooks", "install", "--repo", "."], null);
  assert.equal(kept.trim(), `${otherHooks}/commit-msg already exists, left as is; saved the BuildBeat hook as ${otherHooks}/buildbeat-commit-msg; add this line to your commit-msg hook: sh "${otherHooks}/buildbeat-commit-msg" "$1"`);
  assert.equal(readFileSync(join(otherHooks, "commit-msg"), "utf8"), "#!/bin/sh\necho project hook\n");
  assert.equal(readFileSync(join(otherHooks, "buildbeat-commit-msg"), "utf8"), readFileSync(HOOK, "utf8"));

  const tracked = repo();
  write(tracked, ".githooks/pre-commit", "#!/bin/sh\n");
  git(tracked, ["add", "--", ".githooks"]);
  git(tracked, [...IDENTITY, "commit", "-q", "-m", "chore: project hooks"]);
  const refused = cli(tracked, ["hooks", "install", "--repo", "."], ".githooks");
  assert.equal(refused.trim(), `${join(tracked, ".githooks")} is tracked by Git, so nothing was written; copy templates/hooks/commit-msg there as commit-msg (or call it from your existing hook) and commit it with the project's own review`);
  assert.equal(existsSync(join(tracked, ".githooks", "commit-msg")), false);

  const wrong = call(root, ["hooks", "--repo", "."]);
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /usage: buildbeat hooks install --repo <path>/);
});

test("history --path reads a subject only when nothing else explains the commit", () => {
  const root = repo();
  works(root, "WORK-SUBJ", "WORK-OTHER", "WORK-FOLD");
  commit(root, "feat: first line (WORK-SUBJ)", { files: { "src/a.js": "one\n" } });
  commit(root, "feat: second line for WORK-SUBJ and WORK-OTHER", { files: { "src/a.js": "one\ntwo\n" } });
  commit(root, "feat: third line, says WORK-SUBJ", { files: { "src/a.js": "one\ntwo\nthree\n", "delivery/work/WORK-FOLD/notes.md": "x\n" } });
  commit(root, ["feat: fourth line, says WORK-SUBJ", "Work: WORK-OTHER"], { files: { "src/a.js": "one\ntwo\nthree\nfour\n" } });

  const trace = JSON.parse(cli(root, ["history", "--repo", ".", "--path", "src/a.js", "--json"]));
  const byWork = Object.fromEntries(trace.works.map((row) => [row.work, row]));
  assert.deepEqual(byWork["WORK-SUBJ"].via, [{ kind: "subject" }]);
  assert.equal(byWork["WORK-SUBJ"].lines, 1);
  assert.deepEqual(byWork["WORK-FOLD"].via, [{ kind: "folder" }]);
  assert.deepEqual(byWork["WORK-OTHER"].via, [{ kind: "trailer" }]);
  assert.equal(trace.untraced.lines, 1);

  const text = cli(root, ["history", "--repo", ".", "--path", "src/a.js"]);
  assert.match(text, /^ {2}WORK-SUBJ {2}WORK_DRAFT {2}WORK-SUBJ \(1 line; via subject\)$/m);
  assert.match(text, /^ {4}[0-9a-f]{7} feat: second line for WORK-SUBJ and WORK-OTHER$/m);
});

test("status counts a commit its subject names among a work's commits", () => {
  const root = repo();
  works(root, "WORK-SUBJ");
  const sha = commit(root, "feat: done in a session (WORK-SUBJ)");
  const row = JSON.parse(cli(root, ["status", "--repo", ".", "--work", "WORK-SUBJ", "--json"])).works[0];
  assert.equal(row.stage, "COMMITTED");
  assert.equal(row.committed.latest.commit, sha);
});

test("accept and check say when recent commits name a work but carry no trailer, until the hook is installed", () => {
  const root = repo();
  works(root, "WORK-SUBJ");
  write(root, "delivery/run-config.yaml", [
    "workers:", "  verifier:", "    command: bash", "    args:", "      - -lc", "      - \"true\"",
    "  reviewer:", "    command: bash", "    args:", "      - -lc", "      - \"true\"", "",
  ].join("\n"));
  const check = () => cli(root, ["check", "--repo", ".", "--work", "WORK-SUBJ"], null);
  commit(root, "feat: one (WORK-SUBJ)");
  commit(root, ["feat: two (WORK-SUBJ)", "Work: WORK-SUBJ"]);
  commit(root, "feat: three, no work named");
  const warning = "warning: 1 of the last 50 commits on main name a work in the subject but carry no Work: trailer; buildbeat hooks install --repo . adds the trailer from now on";

  assert.ok(cli(root, ["accept", "--repo", ".", "--work", "WORK-SUBJ", "--by", "owner"], null).split("\n").includes(warning));
  assert.ok(check().split("\n").includes(warning));

  // A project's own commit-msg keeps it; the copy saved beside it counts only
  // once that hook calls it.
  const hooks = join(root, ".git", "hooks");
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, "commit-msg"), "#!/bin/sh\necho project hook\n", { mode: 0o755 });
  cli(root, ["hooks", "install", "--repo", "."], null);
  assert.ok(existsSync(join(hooks, "buildbeat-commit-msg")));
  assert.ok(check().split("\n").includes(warning));
  writeFileSync(join(hooks, "commit-msg"), `#!/bin/sh\necho project hook\nsh "${hooks}/buildbeat-commit-msg" "$1"\n`, { mode: 0o755 });
  assert.ok(!check().includes("carry no Work: trailer"));
  // With commit-msg itself BuildBeat's hook, nothing is said either.
  rmSync(join(hooks, "commit-msg"));
  cli(root, ["hooks", "install", "--repo", "."], null);
  assert.ok(!check().includes("carry no Work: trailer"));
});
