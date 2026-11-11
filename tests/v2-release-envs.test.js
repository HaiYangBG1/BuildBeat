// Release environments (WORK-RELEASE-ENVS): `release --env` records the
// environment and hands it to the readback command, `status --releases`
// says what runs where from the readbacks recorded, and a work nobody
// reviewed can be read back against its newest code commit. Real cost
// behind it: in a pilot repository 143 of 164 works held per-environment,
// per-step folders, 19 works held 57 release configs copied per environment
// and step, and which version ran where lived only in one person's notes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  PROJECT_CONFIG, ROOT, addWork, approved, cli, commit, fixture, git, jsonl, reviewWith, write, yaml,
} from "./support/review.js";

// The readback prints the environment it was given and fails for "broken".
const READBACK = 'echo "env=${BUILDBEAT_RELEASE_ENV:-unset}"; [ "${BUILDBEAT_RELEASE_ENV:-}" != broken ]';
// A release: section; `extra` lines go under it, `script` is what it runs.
const releaseYaml = (extra = [], script = READBACK) =>
  yaml(["release:", ...extra, "  command: bash", "  args:", "    - -lc", `    - '${script}'`]);
// A project whose run config names the readback every work uses.
const project = () => fixture({ prefix: "bb-release-envs-", work: "WORK-FIRST", projectConfig: PROJECT_CONFIG + releaseYaml() }).root;

const call = (root, args, env) => cli(args, { cwd: root, env });
function ok(root, args) {
  const result = call(root, args);
  assert.equal(result.status, 0, result.all);
  return result.out;
}
const release = (root, work, extra = []) => ["release", "--repo", ".", "--work", work, ...extra];
const releases = (root, work) => jsonl(root, work, "releases.jsonl");
const statusRow = (root, work) => JSON.parse(ok(root, ["status", "--repo", ".", "--work", work, "--json"])).works[0];
const workConfig = (work) => `delivery/work/${work}/run-config.yaml`;

// A work done in a session and never reviewed: its work.md (and its own run
// config, when given), then a code commit that names it.
function sessionWork(root, work, own = null) {
  addWork(root, work, { text: `# ${work}\n`, workConfig: own, accept: false });
  return commit(root, `feat: ${work}\n\nWork: ${work}`, { [`src/${work}.js`]: `${work}\n` });
}

test("release needs a release: section, and check shows the one it will run", () => {
  const { root } = fixture({ prefix: "bb-release-envs-" });
  const none = call(root, release(root, "WORK-A"));
  assert.equal(none.status, 1);
  assert.match(none.err, /^error: release needs a release: section in delivery\/run-config\.yaml \(command, args, timeoutMs, env, like a worker\)$/m);
  assert.match(ok(root, ["check", "--repo", "."]), /^ {2}release readback: none$/m);

  write(root, workConfig("WORK-A"), releaseYaml());
  assert.match(ok(root, ["check", "--repo", ".", "--work", "WORK-A"]), /^ {2}release readback: bash -lc echo /m);
});

test("release --env records the environment and hands it to the readback command", () => {
  const root = project();
  const code = sessionWork(root, "WORK-A");

  const prod = ok(root, release(root, "WORK-A", ["--env", "prod", "--note", "server 2 of 3"]));
  assert.match(prod, new RegExp(`^readback passed \\(exit 0\\) for HEAD at ${code.slice(0, 7)} in prod, candidate ${code.slice(0, 7)} \\(not reviewed: latest commit of WORK-A in HEAD\\) — server 2 of 3$`, "m"));
  assert.match(prod, /^ {2}\| env=prod$/m);
  assert.match(prod, /^ {2}recorded: delivery\/work\/WORK-A\/releases\.jsonl$/m);
  const plain = ok(root, release(root, "WORK-A"));
  assert.match(plain, /^readback passed \(exit 0\) for HEAD at [0-9a-f]{7}, candidate /m);
  assert.match(plain, /^ {2}\| env=unset$/m);

  const [first, second] = releases(root, "WORK-A");
  assert.equal(first.env, "prod");
  assert.equal(first.note, "server 2 of 3");
  assert.equal(first.run, null);
  assert.equal(first.candidate, code);
  assert.equal(first.status, "passed");
  assert.equal(Object.hasOwn(second, "env"), false);

  // Only --env sets the variable: not the config's env:, not the host.
  write(root, workConfig("WORK-A"), releaseYaml(["  env:", "    BUILDBEAT_RELEASE_ENV: prod"]));
  assert.match(ok(root, release(root, "WORK-A")), /^ {2}\| env=unset$/m);
  assert.match(ok(root, release(root, "WORK-A", ["--env", "preprod"])), /^ {2}\| env=preprod$/m);
  write(root, workConfig("WORK-A"), releaseYaml(["  inheritEnv: true"]));
  const inherited = call(root, release(root, "WORK-A"), { BUILDBEAT_RELEASE_ENV: "prod" });
  assert.equal(inherited.status, 0, inherited.all);
  assert.match(inherited.out, /^ {2}\| env=unset$/m);
  assert.deepEqual(releases(root, "WORK-A").slice(2).map((row) => row.env ?? null), [null, "preprod", null]);

  const bad = call(root, release(root, "WORK-A", ["--env", "pre prod"]));
  assert.equal(bad.status, 1);
  assert.match(bad.err, /--env pre prod: an environment name is letters, digits, "\.", "_" and "-", starting with a letter or digit/);
  assert.equal(releases(root, "WORK-A").length, 5);
});

test("a work with an approved commit is read back against that commit", () => {
  const root = project();
  addWork(root, "WORK-R");
  const { sha, runId } = approved(root, "WORK-R");
  assert.equal(runId, "RUN-R-01");
  const out = ok(root, release(root, "WORK-R", ["--env", "preprod"]));
  assert.match(out, new RegExp(`in preprod, candidate ${sha.slice(0, 7)} \\(RUN-R-01\\)$`, "m"));
  assert.match(out, /^next: write delivery\/work\/WORK-R\/result\.md, then buildbeat decide --repo \. --work WORK-R --action close --by <you>$/m);
  const [row] = releases(root, "WORK-R");
  assert.equal(row.run, "RUN-R-01");
  assert.equal(row.candidate, sha);
  assert.equal(row.env, "preprod");
});

test("a work nobody reviewed is bound to its newest code commit, can close on it, and is refused without one", () => {
  const root = project();
  // Its own release: section makes WORK-A a work that closes on a readback.
  sessionWork(root, "WORK-A", releaseYaml());
  const newest = commit(root, "fix: a again\n\nWork: WORK-A", { "src/WORK-A.js": "again\n" });
  addWork(root, "WORK-EMPTY", { text: "# WORK-EMPTY\n", accept: false });

  const before = statusRow(root, "WORK-A");
  assert.equal(before.stage, "COMMITTED");
  assert.equal(before.next,
    "buildbeat review --repo . --work WORK-A; or, if it is done, release it (a human action), then buildbeat release --repo . --work WORK-A --env <name>; then close it out: buildbeat decide --repo . --work WORK-A --action close --draft, edit delivery/work/WORK-A/result.md, then buildbeat decide --repo . --work WORK-A --action close --by <you>");
  const close = ["decide", "--repo", ".", "--work", "WORK-A", "--action", "close", "--by", "owner", "--as", "human"];
  const closeEarly = call(root, close);
  assert.equal(closeEarly.status, 1);
  assert.match(closeEarly.err, /WORK-A has no readback; run buildbeat release --repo <path> --work WORK-A after the release first/);

  ok(root, release(root, "WORK-A", ["--env", "prod"]));
  assert.equal(releases(root, "WORK-A")[0].candidate, newest);
  const after = statusRow(root, "WORK-A");
  assert.equal(after.stage, "COMMITTED");
  assert.match(after.next, /^buildbeat review --repo \. --work WORK-A; or, if it is done, close it out: buildbeat decide /);
  write(root, "delivery/work/WORK-A/result.md", "# WORK-A result\n\nShipped to prod.\n\n## Written into the project\n- none: nothing outlives it\n");
  ok(root, close);
  const closed = jsonl(root, "WORK-A", "decisions.jsonl").at(-1);
  assert.equal(closed.transition, "close-work");
  assert.equal(closed.subject.candidate, newest);
  assert.equal(closed.subject.readback, releases(root, "WORK-A")[0].digest);

  const none = call(root, release(root, "WORK-EMPTY", ["--env", "prod"]));
  assert.equal(none.status, 1);
  assert.match(none.err, /^error: WORK-EMPTY has no approved commit and no commits in HEAD trace to it; nothing to read back$/m);
});

test("a reviewed work is read back only once a commit of it is approved", () => {
  const root = project();
  addWork(root, "WORK-W");
  commit(root, "feat: w\n\nWork: WORK-W", { "src/feature.txt": "hello\n" });
  assert.equal(reviewWith(root, "WORK-W").state.run.status, "WAITING_HUMAN");
  // Its commits do not stand in for the approval.
  const early = call(root, release(root, "WORK-W", ["--env", "prod"]));
  assert.equal(early.status, 1);
  assert.match(early.err, /^error: WORK-W has no approved commit; approve its merge decision first$/m);
  assert.throws(() => releases(root, "WORK-W"), /ENOENT/);
});

test("status --releases lists the latest passing readback per environment, across works and repositories", () => {
  const root = project();
  assert.match(ok(root, ["status", "--repo", ".", "--releases"]), /^releases: none recorded /);
  const a = sessionWork(root, "WORK-A");
  const b = sessionWork(root, "WORK-B");
  ok(root, release(root, "WORK-A", ["--env", "prod", "--note", "server 1 of 2"]));
  ok(root, release(root, "WORK-B", ["--env", "preprod"]));
  ok(root, release(root, "WORK-B", ["--env", "prod", "--note", "server 2 of 2"]));
  ok(root, release(root, "WORK-A"));
  const broken = call(root, release(root, "WORK-A", ["--env", "broken"]));
  assert.equal(broken.status, 1);
  assert.match(broken.out, /^readback failed \(exit 1\)/m);
  assert.match(broken.out, /^next: fix the release, then run buildbeat release again; the window cannot close on a failed readback$/m);
  // A failing readback in prod after the passing one is marked on prod's line.
  write(root, workConfig("WORK-B"), releaseYaml([], "exit 4"));
  assert.equal(call(root, release(root, "WORK-B", ["--env", "prod"])).status, 1);

  const text = ok(root, ["status", "--repo", ".", "--releases"]).trimEnd().split("\n");
  assert.equal(text[0], "releases (latest passing readback per environment):");
  assert.match(text[1], /^ {2}broken {3}no passing readback · latest readback failed @ \S+ \(WORK-A, exit 1\)$/);
  assert.match(text[2], new RegExp(`^ {2}preprod {2}WORK-B {2}${b.slice(0, 7)} @ \\S+$`));
  assert.match(text[3], new RegExp(`^ {2}prod {5}WORK-B {2}${b.slice(0, 7)} @ \\S+ — server 2 of 2 · later readback failed @ \\S+ \\(WORK-B, exit 4\\)$`));
  // The commit is what the release ref held when it was read back.
  assert.match(text[4], new RegExp(`^ {2}- {8}WORK-A {2}${b.slice(0, 7)} @ \\S+ {3}\\(recorded without --env\\)$`));
  assert.equal(releases(root, "WORK-A")[0].candidate, a);
  assert.equal(text.length, 5);

  const json = JSON.parse(ok(root, ["status", "--repo", ".", "--releases", "--json"])).releases;
  assert.deepEqual(json.map((item) => item.env), ["broken", "preprod", "prod", null]);
  const prod = json[2];
  assert.equal(prod.work, "WORK-B");
  assert.equal(prod.commit, b);
  assert.equal(prod.candidate, b);
  assert.equal(prod.run, null);
  assert.equal(prod.note, "server 2 of 2");
  assert.equal(prod.repo, realpathSync(root));
  assert.equal(prod.laterFailure.work, "WORK-B");
  assert.equal(prod.laterFailure.exitCode, 4);
  assert.equal(json[0].work, null);

  // A code repository one level down is summarised with --all-repos.
  const code = join(root, "api");
  mkdirSync(code);
  execFileSync("git", ["init", "-q", "-b", "main", code]);
  git(code, ["config", "user.email", "pilot@example.com"]);
  git(code, ["config", "user.name", "Pilot"]);
  commit(code, "baseline", { ".gitignore": ".buildbeat/\n", "delivery/run-config.yaml": PROJECT_CONFIG + releaseYaml() });
  const api = sessionWork(code, "WORK-API");
  ok(code, release(code, "WORK-API", ["--env", "staging"]));
  assert.ok(!ok(root, ["status", "--repo", ".", "--releases"]).includes("staging"));
  const all = JSON.parse(ok(root, ["status", "--repo", ".", "--releases", "--all-repos", "--json"])).releases;
  const staging = all.find((item) => item.env === "staging");
  assert.equal(staging.work, "WORK-API");
  assert.equal(staging.commit, api);
  assert.equal(staging.repo, realpathSync(code));

  const mixed = call(root, ["status", "--repo", ".", "--releases", "--work", "WORK-A"]);
  assert.equal(mixed.status, 1);
  assert.match(mixed.err, /status: --releases cannot be combined with --work or --run/);
});

test("with no readback recorded, status --releases names the command that records one", () => {
  const root = project();
  assert.equal(
    ok(root, ["status", "--repo", ".", "--releases"]).trim(),
    "releases: none recorded (buildbeat release --repo <path> --work <WORK-ID> --env <name>)",
  );
});

test("the operations template says where deployed versions come from", () => {
  const read = (name) => readFileSync(join(ROOT, "templates", "v2", name), "utf8");
  const page = read("operations.example.md");
  assert.match(page, /^# Operations\n\nHow to release, roll back and run this project, and the traps that have bitten before\. Rules and steps only: what is deployed right now comes from buildbeat status --releases, not from this page\.\n/);
  assert.deepEqual(page.match(/^## .+$/gm), ["## Environments", "## Release", "## Roll back", "## Traps"]);
  assert.match(read("result.example.md"), /^If the project has no place for an operating rule or a trap, write it into docs\/operations\.md \(template: templates\/v2\/operations\.example\.md\)\.$/m);
});

test("a repository that only records readbacks needs no verifier or reviewer", () => {
  const root = fixture({ prefix: "bb-release-only-", work: "WORK-FIRST", projectConfig: releaseYaml(), accept: false }).root;
  commit(root, "feat: first\n\nWork: WORK-FIRST", { "src/first.js": "first\n" });
  assert.match(ok(root, release(root, "WORK-FIRST", ["--env", "prod"])), /^readback passed \(exit 0\) for HEAD at \w{7} in prod/m);
  assert.equal(releases(root, "WORK-FIRST").length, 1);
  // Reviewing still needs both workers.
  const review = call(root, ["review", "--repo", ".", "--work", "WORK-FIRST"]);
  assert.notEqual(review.status, 0);
  assert.match(review.err, /workers\.verifier: required and missing/);
});
